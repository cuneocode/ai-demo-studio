"""Local studio adapter for live wealth research and client advisory.

Localhost only. No CORS. Fetch, cache, tools, and grounding never enter Inspection.
Note and brief may be omitted; indicator rows still release.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from contextvars import Token
from pathlib import Path

import truststore

truststore.inject_into_ssl()

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

load_dotenv(Path(os.getenv("WEALTH_ENV_FILE", Path(__file__).resolve().parents[2] / ".env")))

from advise import ADVISORY_DISCLAIMER, draft_brief
from advise import omitted as omitted_brief
from cache import cache_root, get_macro, get_snapshot, is_fresh, load_snapshot
from nim import nim_health, nim_model, nim_reachable
from observability_status import stream_status, summarize
from providers.fred import FredError, fred_health
from providers.yahoo import ProviderError
from security import SecurityRun, defense, security_run
from synthesize import RESEARCH_DISCLAIMER, draft_note
from synthesize import omitted as omitted_note
from telemetry import wealth_telemetry
from tools.conflicts import detect_conflicts
from tools.earnings import earnings_from_snapshot
from tools.macro import macro_from_payload
from tools.peers import peers_from_snapshot
from tools.returns import returns_from_snapshot
from tools.suitability import suitability_findings

app = FastAPI(docs_url=None, redoc_url=None)
logger = logging.getLogger("wealth")
startup_error = None
ANALYZE_TIMEOUT = 160
TICKER = re.compile(r"^[A-Za-z]{1,5}(?:[.-][A-Za-z])?$")
PERIMETER = "Yahoo + FRED allowlist only"


def _agent_importable() -> bool:
    try:
        import langchain_openai  # noqa: F401
        from langchain_core.messages import SystemMessage  # noqa: F401
        return True
    except Exception:
        return False


def attach_galileo(name: str, input_text: str):
    """Official Galileo / Splunk Agent Observability callback. Config is not delivery."""
    if not os.getenv("GALILEO_API_KEY"):
        return None, [], "disabled"
    try:
        from galileo import GalileoLogger
        from galileo.handlers.langchain import GalileoAsyncCallback
        galileo_logger = GalileoLogger()
        galileo_logger.start_trace(input=input_text, name=name)
        return galileo_logger, [GalileoAsyncCallback(galileo_logger=galileo_logger, start_new_trace=False, flush_on_chain_end=False)], "enabled"
    except Exception:
        return None, [], "unavailable"


async def finish_galileo(galileo_logger, status: str, output: str, code: int = 200) -> str:
    if not galileo_logger:
        return status
    try:
        galileo_logger.conclude(output=output, status_code=code)
        uploaded = await asyncio.wait_for(galileo_logger.async_flush(), 8)
        return "recorded" if uploaded else "no trace recorded"
    except Exception:
        return "delivery unavailable"
    finally:
        galileo_logger.disable_agent_control()


@app.on_event("startup")
async def startup():
    global startup_error
    try:
        wealth_telemetry.start()
        if not _agent_importable():
            startup_error = "AgentUnavailable"
    except Exception as exc:
        startup_error = type(exc).__name__


@app.on_event("shutdown")
async def shutdown():
    await asyncio.to_thread(wealth_telemetry.shutdown)


def normalize_ticker(value: str | None) -> str:
    ticker = (value or "").strip().upper()
    if not TICKER.fullmatch(ticker):
        raise HTTPException(422, "Enter a US ticker (1–5 letters).")
    return ticker


class AnalyzeRequest(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    refresh: bool = False


class HoldingIn(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    weight: float


class AdvisoryRequest(BaseModel):
    holdings: list[HoldingIn] = Field(min_length=1, max_length=12)
    clientNotes: str | None = Field(default=None, max_length=4000)
    briefing: dict | None = None
    research: dict | None = None
    refresh: bool = False


def _tools(snapshot: dict, macro_payload: dict | None) -> tuple[dict, dict, dict, dict, list[dict]]:
    earnings = earnings_from_snapshot(snapshot)
    peers = peers_from_snapshot(snapshot)
    returns = returns_from_snapshot(snapshot)
    macro = macro_from_payload(macro_payload)
    conflicts = detect_conflicts(snapshot, earnings, peers, returns, macro)
    return earnings, peers, returns, macro, conflicts


def _holding_metrics(snapshot: dict, weight: float, source_kind: str) -> dict:
    returns = returns_from_snapshot(snapshot)
    info = snapshot.get("info") or {}
    window = (returns.get("windows") or {}).get("1Y") or {}
    return {
        "ticker": snapshot.get("ticker"),
        "name": snapshot.get("name") or info.get("name"),
        "weight": weight,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "trailingPE": info.get("trailingPE"),
        "marketCap": info.get("marketCap"),
        "return_1y": window.get("ticker"),
        "return_1y_vs_spy": window.get("excess"),
        "source": {"kind": source_kind, "fetchedAt": snapshot.get("fetchedAt")},
        "status": "ready" if returns.get("status") == "ready" or info else "absent",
    }


def _galileo_configured() -> str:
    return "configured" if os.getenv("GALILEO_API_KEY") else "disabled"


@app.get("/api/wealth/health")
async def health():
    reachable = await nim_reachable()
    agent_ok = _agent_importable()
    root = cache_root()
    return {
        "ready": bool(reachable and agent_ok),
        "model": nim_model(),
        "agent": "langchain",
        "nim": nim_health(reachable),
        "yahoo": {"status": "not_asserted"},
        "fred": fred_health(),
        "cache": {
            "root": str(root),
            "ttl": "same UTC day or WEALTH_CACHE_TTL_SECONDS",
        },
        "security": defense.health(),
        "galileo": _galileo_configured(),
        "splunk": wealth_telemetry.health(),
        "observability": summarize(),
        "error": "Wealth dependencies are unavailable." if startup_error and not agent_ok else None,
        "perimeter": PERIMETER,
        "disclaimer": RESEARCH_DISCLAIMER,
    }


@app.get("/api/wealth/observability")
async def observability():
    return await stream_status()


@app.post("/api/wealth/research/analyze")
async def analyze(request: AnalyzeRequest):
    ticker = normalize_ticker(request.ticker)
    started = time.monotonic()
    run = SecurityRun()
    token: Token = security_run.set(run)
    galileo_logger, callbacks, galileo = attach_galileo("Wealth research · synthesize", ticker)
    output = ""
    code = 200
    failure = None
    body = None
    splunk = {"status": "not_configured"}
    try:
        with wealth_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            try:
                snapshot, source_kind = get_snapshot(ticker, refresh=request.refresh)
                macro_payload, macro_kind = get_macro(refresh=request.refresh)
            except ProviderError as exc:
                failure = (exc.status, str(exc))
            except FredError as exc:
                failure = (exc.status, str(exc))
            else:
                earnings, peers, returns, macro, conflicts = _tools(snapshot, macro_payload)
                try:
                    note, recommendation = await asyncio.wait_for(
                        draft_note(ticker, {
                            "earnings": earnings,
                            "peers": peers,
                            "returns": returns,
                            "macro": macro,
                        }, conflicts, snapshot, macro, callbacks=callbacks),
                        ANALYZE_TIMEOUT,
                    )
                except asyncio.TimeoutError:
                    note, recommendation = omitted_note("The local NIM timed out.", "unavailable")
                output = note.get("summary") or note.get("reason") or recommendation.get("status") or ""
                body = {
                    "ticker": ticker,
                    "company": {
                        "name": snapshot.get("name"),
                        "ticker": ticker,
                        "sector": (snapshot.get("info") or {}).get("sector"),
                        "industry": (snapshot.get("info") or {}).get("industry"),
                    },
                    "source": {
                        "kind": source_kind,
                        "fetchedAt": snapshot.get("fetchedAt"),
                        "label": "Yahoo Finance",
                        "macro": macro_kind,
                        "fresh": is_fresh(snapshot),
                    },
                    "earnings": earnings,
                    "peers": peers,
                    "returns": returns,
                    "macro": macro,
                    "conflicts": conflicts,
                    "note": note,
                    "recommendation": recommendation,
                    "grounding": {
                        "dropped_claims": (note.get("dropped_claims") or 0),
                    },
                    "security": run.summary(),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "perimeter": PERIMETER,
                    "disclaimer": RESEARCH_DISCLAIMER,
                }
            if failure:
                code, output = failure
        splunk = wealth_telemetry.delivery(trace_id)
    finally:
        galileo = await finish_galileo(galileo_logger, galileo, output, code)
        security_run.reset(token)
    telemetry = {"splunk": splunk, "galileo": galileo}
    if failure:
        return JSONResponse(status_code=failure[0], content={"detail": failure[1], "security": run.summary(), "telemetry": telemetry})
    body["telemetry"] = telemetry
    return body


@app.post("/api/wealth/advisory/brief")
async def brief(request: AdvisoryRequest):
    started = time.monotonic()
    run = SecurityRun()
    token: Token = security_run.set(run)
    output = ""
    code = 200
    failure = None
    body = None
    splunk = {"status": "not_configured"}
    galileo_logger, callbacks, galileo = None, [], "disabled"
    try:
        holdings_in = []
        for item in request.holdings:
            ticker = normalize_ticker(item.ticker)
            weight = item.weight / 100.0 if item.weight > 1.5 else item.weight
            if weight <= 0 or weight > 1.5:
                raise HTTPException(422, "Holding weights must be positive fractions or percents.")
            holdings_in.append({"ticker": ticker, "weight": weight})
        if not holdings_in:
            raise HTTPException(422, "Enter at least one holding.")
        galileo_logger, callbacks, galileo = attach_galileo("Wealth advisory · meeting brief", "client advisory brief")

        with wealth_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            metrics = []
            snapshots = []
            failed = 0
            for item in holdings_in:
                try:
                    snapshot, source_kind = get_snapshot(item["ticker"], refresh=request.refresh)
                except ProviderError:
                    failed += 1
                    metrics.append({
                        "ticker": item["ticker"],
                        "weight": item["weight"],
                        "status": "absent",
                        "reason": "Market data for that ticker was empty.",
                    })
                    continue
                snapshots.append(snapshot)
                metrics.append(_holding_metrics(snapshot, item["weight"], source_kind))
            if failed == len(holdings_in):
                failure = (502, "Market data for those holdings was empty.")
            else:
                suitability = suitability_findings(holdings_in, request.clientNotes)
                primary = snapshots[0]
                try:
                    meeting = await asyncio.wait_for(
                        draft_brief(
                            metrics,
                            suitability,
                            request.briefing,
                            request.research,
                            primary,
                            request.clientNotes,
                            callbacks=callbacks,
                        ),
                        ANALYZE_TIMEOUT,
                    )
                except asyncio.TimeoutError:
                    meeting = omitted_brief("The local NIM timed out.", "unavailable")
                output = meeting.get("opening") or meeting.get("reason") or meeting.get("status") or ""
                body = {
                    "holdings": metrics,
                    "suitability": suitability,
                    "brief": meeting,
                    "entitled": {
                        "briefing": bool(request.briefing),
                        "research": bool(request.research),
                    },
                    "grounding": {"dropped_claims": meeting.get("dropped_claims") or 0},
                    "security": run.summary(),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "perimeter": PERIMETER,
                    "disclaimer": ADVISORY_DISCLAIMER,
                }
            if failure:
                code, output = failure
        splunk = wealth_telemetry.delivery(trace_id)
    finally:
        galileo = await finish_galileo(galileo_logger, galileo, output, code)
        security_run.reset(token)
    telemetry = {"splunk": splunk, "galileo": galileo}
    if failure:
        return JSONResponse(status_code=failure[0], content={"detail": failure[1], "security": run.summary(), "telemetry": telemetry})
    body["telemetry"] = telemetry
    return body


@app.get("/api/wealth/cache/{ticker}")
async def cache_status(ticker: str):
    symbol = normalize_ticker(ticker)
    payload = load_snapshot(symbol)
    return {
        "ticker": symbol,
        "present": bool(payload),
        "fresh": is_fresh(payload),
        "fetchedAt": (payload or {}).get("fetchedAt"),
    }
