"""Local studio adapter for the wealth demos: market event → house-view update, and advisor meeting prep.

Localhost only. No CORS. Every POST accepts an optional client-chosen run_id and emits the shared run
timeline (services/common/runs.py) while it works; GET /api/wealth/runs/{id}?after=n streams it and
GET /api/wealth/recordings serves the recorded golden runs in data/recorded/.

Publishing a house-view update and approving a meeting brief are separate requests: each one re-checks
the stored run (or, for a recorded run, the posted result, labelled as such) through Agent Control and
appends the decision to the run's timeline.
"""
from __future__ import annotations

import asyncio
import logging
import os
import re
import time
from contextvars import Token
from pathlib import Path
from typing import Literal

import truststore

truststore.inject_into_ssl()

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

load_dotenv(Path(os.getenv("WEALTH_ENV_FILE", Path(__file__).resolve().parents[2] / ".env")))

import advisory
import research
from agentkit import galileo_current
from cache import cache_root, get_snapshot, is_fresh, load_snapshot
from compliance import scan_research
from controls import controls
from fixtures import household, households
from nim import ADVISORY, nim_health, nim_model, nim_reachable, served
from observability_status import stream_status, summarize
from providers.fred import fred_health
from providers.yahoo import ProviderError
from runlog import emit_current, runs_router, store
from security import SecurityRun, defense, security_run
from telemetry import wealth_telemetry
from tools.returns import returns_from_snapshot
from tools.suitability import suitability_findings
from usage import ModelUsage, model_usage

app = FastAPI(docs_url=None, redoc_url=None)
app.include_router(runs_router(store, "/api/wealth"))
logger = logging.getLogger("wealth")
startup_error = None
RUN_TIMEOUT = 240
TICKER = re.compile(r"^[A-Za-z]{1,5}(?:[.-][A-Za-z])?$")
PERIMETER = "Yahoo + FRED allowlist only"
CASH = "CASH"


def _agent_importable() -> bool:
    try:
        import deepagents  # noqa: F401
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
    scenario: str | None = Field(default=None, max_length=32)
    refresh: bool = False
    run_id: str | None = Field(default=None, max_length=90)


class PublishRequest(BaseModel):
    run_id: str | None = Field(default=None, max_length=90)
    decision: Literal["approve", "reject"] = "approve"
    result: dict | None = None
    by: str = Field(default="Sam Ortiz · CIO Office strategist", max_length=80)


class HoldingIn(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    weight: float


class AdvisoryRequest(BaseModel):
    household_id: str | None = Field(default=None, max_length=64)
    holdings: list[HoldingIn] | None = Field(default=None, max_length=12)
    clientNotes: str | None = Field(default=None, max_length=4000)
    briefing: dict | None = None
    research: dict | None = None
    refresh: bool = False
    weights_unit: Literal["percent", "fraction"] | None = None
    run_id: str | None = Field(default=None, max_length=90)


class ApproveRequest(BaseModel):
    run_id: str | None = Field(default=None, max_length=90)
    stage: Literal["advisor", "supervisor"]
    decision: Literal["approve", "reject"] = "approve"
    action_ids: list[str] = Field(default_factory=list, max_length=12)
    result: dict | None = None
    by: str | None = Field(default=None, max_length=80)


def _galileo_configured() -> str:
    return "configured" if os.getenv("GALILEO_API_KEY") else "disabled"


def _evaluation() -> dict:
    """Galileo Luna groundedness runs only with a working endpoint; none is configured here."""
    configured = all(os.getenv(name) for name in ("GALILEO_LUNA_INVOKE_URL", "GALILEO_LUNA_SCORER_ID", "GALILEO_API_SECRET_KEY"))
    return {"status": "configured" if configured else "not_configured",
            "label": "Galileo Luna groundedness" if configured else "Evaluation not configured",
            "verifier": "Structured claim verifier (code) checks every claim"}


async def _instrumented(run_id: str, trace: tuple[str, str], work):
    """Security run, served-by, usage, Galileo, and the Splunk span around one run. Returns (body|failure, extras)."""
    run = SecurityRun()
    token: Token = security_run.set(run)
    served_token: Token = served.set({})
    usage = ModelUsage()
    usage_token: Token = model_usage.set(usage)
    galileo_logger, callbacks, galileo = attach_galileo(*trace)
    galileo_token: Token = galileo_current.set(galileo_logger)
    body, failure, output, code, splunk = None, None, "", 200, {"status": "not_configured"}
    try:
        with wealth_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            try:
                body = await asyncio.wait_for(work(callbacks), RUN_TIMEOUT)
                output = str(((body.get("update") or body.get("brief") or {}).get("status")) or body.get("status") or "")
            except research.ResearchFailed as exc:
                failure = (exc.status, str(exc))
            except asyncio.TimeoutError:
                failure = (504, "The run did not finish in time.")
            if failure:
                code, output = failure
        splunk = wealth_telemetry.delivery(trace_id)
    finally:
        galileo = await finish_galileo(galileo_logger, galileo, output, code)
        galileo_current.reset(galileo_token)
        model_usage.reset(usage_token)
        security_run.reset(token)
        served_by = served.get() or None
        served.reset(served_token)
    extras = {"security": run.summary(), "usage": usage.summary(), "served_by": served_by,
              "telemetry": {"splunk": splunk, "galileo": galileo}, "evaluation": _evaluation(), "run_id": run_id}
    if failure:
        emit_current("result", "Run failed", status="error", body=failure[1])
        store.finish(run_id, "failed")
        return JSONResponse(status_code=failure[0], content={"detail": failure[1], **extras})
    body = {**body, **extras, "perimeter": PERIMETER}
    return body


@app.get("/api/wealth/health")
async def health():
    reachable = await nim_reachable()
    advisory_reachable = await nim_reachable(ADVISORY)
    agent_ok = _agent_importable()
    return {
        "ready": bool(reachable and agent_ok),
        "model": nim_model(),
        "agent": "deepagents",
        "nim": nim_health(reachable),
        "advisory_model": nim_health(advisory_reachable, ADVISORY),
        "advisory_hosted_fallback": "allowed with AI Defense enforce" if defense.can_enforce() else "refused: AI Defense is not configured",
        "yahoo": {"status": "not_asserted"},
        "fred": fred_health(),
        "cache": {"root": str(cache_root()), "ttl": "same UTC day or WEALTH_CACHE_TTL_SECONDS"},
        "security": defense.health(),
        "untrusted_inspection": "AI Defense inspects news items and CRM notes" if defense.can_enforce() else "local screen only",
        "controls": controls.health(),
        "evaluation": _evaluation(),
        "galileo": _galileo_configured(),
        "splunk": wealth_telemetry.health(),
        "observability": summarize(),
        "error": "Wealth dependencies are unavailable." if startup_error and not agent_ok else None,
        "perimeter": PERIMETER,
        "disclaimer": research.DISCLAIMER,
    }


@app.get("/api/wealth/observability")
async def observability():
    return await stream_status()


@app.get("/api/wealth/households")
async def list_households():
    return {"households": households(), "synthetic": True}


@app.get("/api/wealth/households/{household_id}")
async def get_household(household_id: str):
    record = household(household_id)
    if not record:
        raise HTTPException(404, "Unknown household.")
    return record


# ------------------------------------------------------------------ research ----
@app.post("/api/wealth/research/analyze")
async def analyze(request: AnalyzeRequest):
    ticker = normalize_ticker(request.ticker)
    scenario = request.scenario or "ticker"
    if scenario not in research.SCENARIOS:
        raise HTTPException(422, "Unknown scenario.")
    timeline = store.open(request.run_id, label=f"House-view update · {ticker}", scenario=f"research-{scenario}",
                          meta={"ticker": ticker, "scenario": scenario}, prefix="wealth-research")
    with store.bind(timeline.id):
        try:
            body = await _instrumented(timeline.id, ("Wealth research · house-view update", ticker),
                                       lambda callbacks: research.run_research(ticker, scenario, refresh=request.refresh, callbacks=callbacks))
        except Exception:
            store.finish(timeline.id, "failed")
            raise
        if isinstance(body, dict):
            store.finish(timeline.id, "blocked" if body.get("status") == "blocked" else "completed", body)
        return body


def _stored(run_id: str | None, posted: dict | None, service: str) -> tuple[dict, str, str | None]:
    """The run's own stored result, or a posted one (a recorded run replayed in the browser)."""
    run = store.get(run_id) if run_id else None
    if run and run.result:
        return run.result, "run", run.id
    if isinstance(posted, dict):
        return posted, "posted", None
    raise HTTPException(409, f"Nothing to {service}: run the scenario first.")


@app.post("/api/wealth/research/publish")
async def publish(request: PublishRequest):
    result, origin, run_id = _stored(request.run_id, request.result, "publish")
    update = result.get("update") or {}
    if (result.get("publish") or {}).get("status") not in {"awaiting_approval", "published", "rejected"}:
        raise HTTPException(409, (result.get("publish") or {}).get("reason") or "This update cannot be published.")
    verified = [row for row in update.get("claims") or [] if row.get("status") == "verified"]
    scan = scan_research([row.get("text") or "" for row in verified])
    verdicts = {
        "issuer_not_restricted": bool(((result.get("precheck") or {}).get("verdicts") or {}).get("issuer_not_restricted", True)),
        "no_rating_or_price_target": scan["verdicts"]["no_rating_or_price_target"],
        "no_guarantee": scan["verdicts"]["no_guarantee"],
        "claims_verified": bool(verified),
        "strategist_approved": request.decision == "approve",
    }

    async def gate():
        emit_current("hitl.decision", f"{request.by} · {'approved' if request.decision == 'approve' else 'rejected'} the update",
                     status="ok" if request.decision == "approve" else "denied", lane="human",
                     data={"request_id": "publish", "decision": request.decision, "origin": origin})
        return await controls.evaluate("research_publish", verdicts)

    if run_id:
        with store.bind(run_id):
            outcome = await gate()
            published = outcome["allowed"]
            emit_current("result", "Published to the advisor desk" if published else "Not published · a research.publish policy denied it",
                         status="ok" if published else "denied",
                         body=f"{len(verified)} verified claims; the house view stays {((result.get('context') or {}).get('house_view') or {}).get('rating')}."
                         if published else "; ".join(f"{c['label']}: {c['status']}" for c in outcome["checks"] if c["status"] == "denied"))
    else:
        outcome = await controls.evaluate("research_publish", verdicts, emit=False)
        published = outcome["allowed"]
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    status = "published" if published else "rejected" if request.decision == "reject" else "denied"
    record = {"status": status, "by": request.by, "at": stamp, "controls": outcome, "verdicts": verdicts, "origin": origin,
              "origin_label": "Checked on this run" if origin == "run" else "Checked on the recorded run's result"}
    if run_id and store.get(run_id).result is not None:
        store.get(run_id).result = {**store.get(run_id).result, "publish": {**(result.get("publish") or {}), **record}}
    return record


# ------------------------------------------------------------------ advisory ----
def _custom_holdings(request: AdvisoryRequest) -> list[dict]:
    rows = []
    for item in request.holdings or []:
        ticker = normalize_ticker(item.ticker)
        if request.weights_unit == "percent":
            weight = item.weight / 100.0
        elif request.weights_unit == "fraction":
            weight = item.weight
        else:
            weight = item.weight / 100.0 if item.weight > 1.5 else item.weight
        if weight <= 0 or weight > 1.5:
            raise HTTPException(422, "Holding weights must be positive percents.")
        rows.append({"ticker": ticker, "weight": weight})
    if not rows:
        raise HTTPException(422, "Choose a household or enter at least one holding.")
    return rows


async def _custom_prep(rows: list[dict], notes: str | None, refresh: bool) -> dict:
    """Entered holdings: market data and concentration rules only. A brief needs a household record."""
    emit_current("run", "Holdings check · entered holdings", status="started", body="Market data and concentration rules for entered holdings.")
    metrics, failed = [], 0
    for row in rows:
        if row["ticker"] == CASH:
            metrics.append({**row, "asset_class": "cash", "status": "ready", "source": {"kind": "entered", "label": "Entered by the advisor"}})
            continue
        try:
            snapshot, kind = get_snapshot(row["ticker"], refresh=refresh)
        except ProviderError:
            failed += 1
            metrics.append({**row, "status": "absent", "reason": "Market data for that ticker was empty."})
            continue
        window = (returns_from_snapshot(snapshot).get("windows") or {}).get("1Y") or {}
        metrics.append({**row, "name": snapshot.get("name"), "return_1y": window.get("ticker"), "return_1y_spy": window.get("spy"),
                        "status": "ready", "source": {"kind": kind}})
    securities = [row for row in rows if row["ticker"] != CASH]
    if securities and failed == len(securities):
        raise research.ResearchFailed(502, "Market data for those holdings was empty.")
    findings = suitability_findings(rows, notes)
    emit_current("result", f"Holdings checked · {len(findings)} findings", status="ok")
    return {"household": None, "holdings": metrics, "suitability": findings, "actions": [],
            "brief": {"status": "unavailable", "lines": [], "mode": "none", "mode_label": advisory.MODES["none"],
                      "reason": "Choose a household for a full meeting brief: the rules need a profile, horizon, and goals."},
            "approval": {"status": "unavailable"}, "disclaimer": advisory.DISCLAIMER}


@app.post("/api/wealth/advisory/brief")
async def brief(request: AdvisoryRequest):
    record = household(request.household_id) if request.household_id else None
    if request.household_id and not record:
        raise HTTPException(404, "Unknown household.")
    rows = None if record else _custom_holdings(request)
    label = f"Meeting prep · {record['name']}" if record else "Holdings check · entered holdings"
    timeline = store.open(request.run_id, label=label, scenario=f"advisory-{record['id']}" if record else "advisory-custom",
                          meta={"household_id": record["id"] if record else None}, prefix="wealth-advisory")

    def work(callbacks):
        if record:
            return advisory.run_meeting_prep(record, research=request.research, briefing=request.briefing, callbacks=callbacks)
        return _custom_prep(rows, request.clientNotes, request.refresh)

    with store.bind(timeline.id):
        try:
            body = await _instrumented(timeline.id, ("Wealth advisory · meeting prep", label), work)
        except Exception:
            store.finish(timeline.id, "failed")
            raise
        if isinstance(body, dict):
            refused = (body.get("brief") or {}).get("refused")
            store.finish(timeline.id, "blocked" if refused else "completed", body)
        return body


@app.post("/api/wealth/advisory/approve")
async def approve(request: ApproveRequest):
    result, origin, run_id = _stored(request.run_id, request.result, "approve")
    if (result.get("brief") or {}).get("status") != "ready":
        raise HTTPException(409, "There is no brief to approve.")
    approval = dict(result.get("approval") or {})
    stamp = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
    if request.stage == "advisor":
        by = request.by or "Jordan Lee · advisor"
        approval.update({"status": "awaiting_supervisor" if request.decision == "approve" else "returned", "advisor": {"by": by, "at": stamp},
                         "action_ids": request.action_ids})
        if run_id:
            with store.bind(run_id):
                emit_current("hitl.decision", f"{by} · {'submitted the brief for supervision' if request.decision == 'approve' else 'returned the brief'}",
                             status="ok" if request.decision == "approve" else "denied", lane="human",
                             data={"request_id": "advisor", "actions": request.action_ids})
                if request.decision == "approve":
                    emit_current("hitl.request", "Supervisor approval", status="info", lane="human",
                                 body="Approval runs the advisory.recommendation policies on the brief and the chosen actions.",
                                 data={"request_id": "supervisor", "policy": "advisory.recommendation"})
    else:
        if approval.get("status") not in {"awaiting_supervisor", "sent", "denied"} and origin == "run":
            raise HTTPException(409, "The advisor submits the brief first.")
        by = request.by or "Morgan Patel · supervising principal"
        action_ids = request.action_ids or approval.get("action_ids") or (result.get("brief") or {}).get("action_ids") or []
        if run_id:
            with store.bind(run_id):
                emit_current("hitl.decision", f"{by} · {'approved' if request.decision == 'approve' else 'rejected'} the brief",
                             status="ok" if request.decision == "approve" else "denied", lane="human",
                             data={"request_id": "supervisor", "actions": action_ids})
                outcome = await advisory.supervise(result, action_ids, request.decision)
                sent = outcome["controls"]["allowed"]
                emit_current("result", "Brief recorded to the CRM · nothing is executed" if sent else "Brief not recorded · an advisory.recommendation policy denied it",
                             status="ok" if sent else "denied",
                             body=None if sent else "; ".join(f"{c['label']}: {c['status']}" for c in outcome["controls"]["checks"] if c["status"] == "denied"))
        else:
            outcome = await advisory.supervise(result, action_ids, request.decision)
            sent = outcome["controls"]["allowed"]
        approval.update({"status": "sent" if sent else "rejected" if request.decision == "reject" else "denied",
                         "supervisor": {"by": by, "at": stamp}, "action_ids": outcome["actions"], **outcome})
    approval["origin"] = origin
    approval["origin_label"] = "Checked on this run" if origin == "run" else "Checked on the recorded run's result"
    if run_id and store.get(run_id).result is not None:
        store.get(run_id).result = {**store.get(run_id).result, "approval": approval}
    return approval


@app.get("/api/wealth/cache/{ticker}")
async def cache_status(ticker: str):
    symbol = normalize_ticker(ticker)
    payload = load_snapshot(symbol)
    return {"ticker": symbol, "present": bool(payload), "fresh": is_fresh(payload), "fetchedAt": (payload or {}).get("fetchedAt")}
