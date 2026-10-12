"""Local studio adapter for the company-briefing Deep Agent.

Localhost only. No CORS. Filing bytes never enter Inspection. Errors are redacted.
"""
from __future__ import annotations

import asyncio
import hashlib
import json
import logging
import os
import sys
import time
import uuid
from contextvars import Token
from datetime import UTC, datetime
from pathlib import Path

import truststore

truststore.inject_into_ssl()

from dotenv import load_dotenv
from fastapi import FastAPI, File, Form, HTTPException, UploadFile
from fastapi.responses import JSONResponse

load_dotenv(Path(os.getenv("BRIEFING_ENV_FILE", Path(__file__).resolve().parents[2] / ".env")))
os.environ.setdefault("MODEL_NAME", "gpt-4o-mini")

from agent import AgentIncomplete
import model_backend
from cover import cover_identity, synthetic_document
from documents import UploadError, validate_upload, write_source
from edgar import (
    AmbiguousIssuer,
    EdgarError,
    NoAnnualReport,
    UnknownIssuer,
    cache_root,
    latest_annual_report,
    resolve_company,
    search_companies,
    sec_health,
)
from security import DefenseBlocked, DefenseUnavailable, SecurityRun, defense, security_run
from telemetry import telemetry
from tools import BriefingSession, apply_identity, write_meta
from usage import ModelUsage, model_usage

sys.path.append(str(Path(__file__).resolve().parents[1] / "common"))
from runs import RunStore  # noqa: E402

# Recorded extracts (scripts/record_golden.py); served read-only for replay.
recordings = RunStore("briefing", component="company-briefing", recordings_dir=Path(__file__).resolve().parent / "data" / "recorded")
app = FastAPI(docs_url=None, redoc_url=None)
logger = logging.getLogger("briefing")
startup_error = None
ANALYZE_TIMEOUT = 200


def _agent_importable() -> bool:
    try:
        import deepagents  # noqa: F401
        return True
    except Exception:
        return False


@app.on_event("startup")
async def startup():
    global startup_error
    try:
        if not _agent_importable():
            startup_error = "DeepAgentUnavailable"
    except Exception as exc:
        startup_error = type(exc).__name__


@app.get("/api/briefing/health")
async def health():
    backend = model_backend.describe()
    key = model_backend.configured()
    agent_ok = _agent_importable()
    defense_ok = defense.configured()
    ready = bool(key and agent_ok and defense_ok)
    root = cache_root()
    return {
        "ready": ready,
        # The model that would answer now; the first configured one may be down.
        "model": (backend.get("answering") or {}).get("model"),
        "backend": backend,
        "agent": "deep-agent",
        "sec": sec_health(),
        "cache": {
            "root": str(root),
            "tickers": (root / "tickers.json").is_file(),
        },
        "security": defense.health(),
        "splunk": telemetry.health(),
        "error": "Briefing dependencies are unavailable." if startup_error and not agent_ok else None,
        "perimeter": "EDGAR + upload only",
    }


@app.get("/api/briefing/search")
async def search(q: str = ""):
    query = (q or "").strip()
    if not query:
        raise HTTPException(422, "Enter a company name or ticker.")
    try:
        candidates = search_companies(query, limit=8)
    except EdgarError as exc:
        raise HTTPException(exc.status, str(exc)) from None
    except Exception:
        raise HTTPException(502, "The ticker catalog could not be searched.") from None
    return {"query": query, "candidates": candidates}


@app.get("/api/briefing/recordings")
async def list_recordings():
    return {"recordings": recordings.recordings()}


@app.get("/api/briefing/recordings/{name}")
async def get_recording(name: str):
    doc = recordings.recording(name)
    if doc is None:
        raise HTTPException(404, "Unknown recording.")
    return doc


def _briefing_cache_path(key: str) -> Path:
    digest = hashlib.sha256(key.encode("utf-8")).hexdigest()
    return cache_root() / "briefings" / f"{digest}.json"


def _load_cached(key: str):
    path = _briefing_cache_path(key)
    if not path.is_file():
        return None
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return None


def _store_cached(key: str, payload: dict) -> None:
    path = _briefing_cache_path(key)
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def _replay_cached(key: str, started: float):
    cached = _load_cached(key)
    if not cached:
        return None
    original = cached.get("security") if isinstance(cached.get("security"), dict) else {}
    cached["cached"] = True
    cached["recorded_at"] = cached.get("recorded_at") or datetime.fromtimestamp(
        _briefing_cache_path(key).stat().st_mtime, UTC).isoformat()
    cached["security"] = {
        **original,
        "replay": True,
        "status": original.get("status") or "cached_replay",
    }
    cached["telemetry"] = {"splunk": {"status": "not_reexported", "reason": "cached replay"}}
    cached["usage"] = {"llm_calls": 0, "input_tokens": 0, "output_tokens": 0}
    cached["duration_ms"] = round((time.monotonic() - started) * 1000)
    return cached


async def execute_briefing(session: BriefingSession, message: str) -> dict:
    from agent import run_briefing

    return await asyncio.wait_for(run_briefing(session, message), ANALYZE_TIMEOUT)


def _session(run_id: str, path: str, query: str | None, cik: str | None, filename: str | None) -> BriefingSession:
    run_dir = cache_root() / "runs" / run_id
    run_dir.mkdir(parents=True, exist_ok=True)
    return BriefingSession(
        run_id=run_id,
        run_dir=run_dir,
        path=path,
        query=query,
        cik=cik,
        filename=filename,
    )


@app.post("/api/briefing/analyze")
async def analyze(
    query: str | None = Form(None),
    cik: str | None = Form(None),
    refresh: bool = Form(False),
    file: UploadFile | None = File(None),
):
    q = (query or "").strip() or None
    pinned = (cik or "").strip() or None
    upload = file is not None and bool(file.filename)
    if not q and not pinned and not upload:
        raise HTTPException(422, "Provide a company query, CIK, or an uploaded annual report.")
    if not model_backend.configured():
        raise HTTPException(503, "The briefing model is not configured.")
    if not defense.configured():
        raise HTTPException(503, "AI Defense inspection is unavailable. No briefing was released.")
    if not _agent_importable():
        raise HTTPException(503, "Briefing dependencies are unavailable. Check local service configuration.")

    started = time.monotonic()
    run = SecurityRun()
    token: Token = security_run.set(run)
    usage = ModelUsage()
    usage_token: Token = model_usage.set(usage)
    run_id = str(uuid.uuid4())
    try:
        if upload:
            data = await file.read()
            try:
                suffix = validate_upload(file.filename, file.content_type, data)
            except UploadError as exc:
                raise HTTPException(exc.status, str(exc)) from None
            file_sha = hashlib.sha256(data).hexdigest()
            cache_key = f"upload:{file_sha}"
            if not refresh:
                cached = _replay_cached(cache_key, started)
                if cached:
                    if suffix != ".pdf" and isinstance(cached.get("source"), dict):
                        cached["source"]["synthetic"] = synthetic_document(data.decode("utf-8", errors="replace"))
                    return cached
            session = _session(run_id, "upload", q, pinned, file.filename)
            try:
                write_source(session.run_dir, data, suffix, file.filename)
            except UploadError as exc:
                raise HTTPException(exc.status, str(exc)) from None
            for key, value in cover_identity(session.run_dir).items():
                setattr(session, key, getattr(session, key, None) or value)
            if pinned or q:
                try:
                    company = resolve_company(query=q, cik=pinned)
                    apply_identity(session, company)
                except (UnknownIssuer, AmbiguousIssuer, EdgarError):
                    write_meta(session)
            else:
                write_meta(session)
        else:
            try:
                company = resolve_company(query=q, cik=pinned)
                filing = latest_annual_report(company["cik"])
            except AmbiguousIssuer as exc:
                return JSONResponse(
                    status_code=409,
                    content={"detail": str(exc), "candidates": exc.candidates},
                )
            except (UnknownIssuer, NoAnnualReport, EdgarError) as exc:
                raise HTTPException(exc.status, str(exc)) from None
            cache_key = f"edgar:{company['cik']}:{filing['accession']}"
            if not refresh:
                cached = _replay_cached(cache_key, started)
                if cached:
                    return cached
            session = _session(run_id, "edgar", q, company["cik"], None)
            apply_identity(session, company, filing)

        from agent import user_message

        failure = None
        try:
            briefing = await execute_briefing(session, user_message(session))
        except DefenseBlocked:
            failure = (403, "AI Defense blocked this briefing. No briefing was released.")
        except DefenseUnavailable:
            failure = (503, "AI Defense inspection is unavailable. No briefing was released.")
        except UploadError as exc:
            failure = (exc.status, str(exc))
        except EdgarError as exc:
            failure = (exc.status, str(exc))
        except asyncio.TimeoutError:
            failure = (504, "The briefing agent timed out. Please try again.")
        except AgentIncomplete as exc:
            logger.exception("Briefing agent incomplete")
            failure = (502, str(exc) or "The briefing agent could not complete this request.")
        except Exception as exc:
            model_backend.mark_failed(exc)
            logger.exception("Briefing agent failed: %s", type(exc).__name__)
            failure = (502, "The briefing agent could not complete this request.")
        if failure:
            return JSONResponse(
                status_code=failure[0],
                content={"detail": failure[1], "security": run.summary(), "usage": usage.summary(), "served_by": model_backend.served_by()},
            )
        payload = {
            **briefing,
            "security": run.summary(),
            "usage": usage.summary(),
            "served_by": model_backend.served_by(),
            "telemetry": {"splunk": telemetry.delivery(run_id, [
                {"name": f"briefing.tool.{name}", "attrs": {"run_id": run_id, "tool": name}}
                for name in (briefing.get("trail") or {}).get("tools") or []
            ] or None)},
            "cached": False,
            "recorded_at": datetime.now(UTC).isoformat(),
            "duration_ms": round((time.monotonic() - started) * 1000),
            "perimeter": "EDGAR + upload only",
        }
        _store_cached(cache_key, payload)
        return payload
    finally:
        model_usage.reset(usage_token)
        security_run.reset(token)
