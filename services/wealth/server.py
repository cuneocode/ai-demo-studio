"""Local studio adapter for live wealth research and client advisory.

Localhost only. No CORS. Fetch, cache, tools, and grounding never enter Inspection.
Note and brief may be omitted; indicator rows still release.

Both POST endpoints accept an optional client-chosen run_id and emit the shared run timeline
(services/common/runs.py) while they work; GET /api/wealth/runs/{id}?after=n streams it and
GET /api/wealth/recordings serves the recorded golden runs in data/recorded/.
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

from advise import ADVISORY_DISCLAIMER, draft_brief
from advise import omitted as omitted_brief
from cache import cache_root, get_macro, get_snapshot, is_fresh, load_snapshot
from fixtures import household, households, research_context, source_meta
from nim import ADVISORY, models_url, nim_health, nim_model, nim_reachable, served
from observability_status import stream_status, summarize
from providers.fred import FredError, fred_health
from providers.yahoo import ProviderError
from runlog import emit_current, runs_router, store
from security import SecurityRun, defense, security_run
from synthesize import RESEARCH_DISCLAIMER, draft_note
from synthesize import omitted as omitted_note
from telemetry import wealth_telemetry
from usage import ModelUsage, model_usage
from tools.conflicts import detect_conflicts, vs_spy
from tools.earnings import earnings_from_snapshot
from tools.macro import macro_from_payload
from tools.peers import peers_from_snapshot
from tools.returns import returns_from_snapshot
from tools.suitability import household_findings, suitability_findings

app = FastAPI(docs_url=None, redoc_url=None)
app.include_router(runs_router(store, "/api/wealth"))
logger = logging.getLogger("wealth")
startup_error = None
ANALYZE_TIMEOUT = 160
TICKER = re.compile(r"^[A-Za-z]{1,5}(?:[.-][A-Za-z])?$")
PERIMETER = "Yahoo + FRED allowlist only"
CASH = "CASH"


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
    run_id: str | None = Field(default=None, max_length=90)


class HoldingIn(BaseModel):
    ticker: str = Field(min_length=1, max_length=10)
    weight: float


class AdvisoryRequest(BaseModel):
    holdings: list[HoldingIn] = Field(min_length=1, max_length=12)
    clientNotes: str | None = Field(default=None, max_length=4000)
    briefing: dict | None = None
    research: dict | None = None
    refresh: bool = False
    household_id: str | None = Field(default=None, max_length=64)
    weights_unit: Literal["percent", "fraction"] | None = None
    run_id: str | None = Field(default=None, max_length=90)


def _tools(snapshot: dict, macro_payload: dict | None) -> tuple[dict, dict, dict, dict, list[dict]]:
    earnings = earnings_from_snapshot(snapshot)
    peers = peers_from_snapshot(snapshot)
    returns = returns_from_snapshot(snapshot)
    macro = macro_from_payload(macro_payload)
    conflicts = detect_conflicts(snapshot, earnings, peers, returns, macro)
    return earnings, peers, returns, macro, conflicts


def _source(snapshot: dict, kind: str) -> dict:
    return {"kind": kind, "fetchedAt": snapshot.get("fetchedAt"), **source_meta(snapshot, kind)}


def _holding_metrics(snapshot: dict, weight: float, source_kind: str, known: dict | None = None) -> dict:
    returns = returns_from_snapshot(snapshot)
    info = snapshot.get("info") or {}
    window = (returns.get("windows") or {}).get("1Y") or {}
    return {
        "ticker": snapshot.get("ticker"),
        "name": (known or {}).get("name") or snapshot.get("name") or info.get("name"),
        "weight": weight,
        "sector": info.get("sector"),
        "industry": info.get("industry"),
        "trailingPE": info.get("trailingPE"),
        "marketCap": info.get("marketCap"),
        "return_1y": window.get("ticker"),
        "return_1y_spy": window.get("spy"),
        "return_1y_vs_spy": window.get("excess"),
        "asset_class": (known or {}).get("asset_class"),
        "value": (known or {}).get("value"),
        "source": _source(snapshot, source_kind),
        "status": "ready" if returns.get("status") == "ready" or info else "absent",
    }


def _cash_metric(weight: float, known: dict | None) -> dict:
    return {
        "ticker": CASH, "name": (known or {}).get("name") or "Cash", "weight": weight, "asset_class": "cash",
        "value": (known or {}).get("value"), "note": (known or {}).get("note"),
        "source": {"kind": "household" if known else "entered", "label": "Household record · Synthetic" if known else "Entered by the advisor"},
        "status": "ready",
    }


def _household_profile(record: dict) -> dict:
    """What the model sees of a synthetic household: no account numbers."""
    keep = ("id", "name", "age", "ages", "employer", "employer_ticker", "title", "affiliate", "affiliate_note", "risk_profile",
            "horizon_years", "goals", "total_value", "as_of", "ips", "dependents", "estate", "rmd_note", "cd_ladder", "service_events")
    profile = {key: record[key] for key in keep if record.get(key) is not None}
    fields = ("ticker", "name", "weight_pct", "asset_class", "vehicle", "value", "shares", "price", "cost_basis_per_share", "note")
    profile["holdings"] = [{key: row[key] for key in fields if key in row} for row in record.get("holdings") or []]
    profile["accounts"] = [{"type": row.get("type"), "value": row.get("value"), "beneficiary_on_file": bool(row.get("beneficiary"))}
                           for row in record.get("accounts") or []]
    profile["synthetic"] = True
    return profile


def _galileo_configured() -> str:
    return "configured" if os.getenv("GALILEO_API_KEY") else "disabled"


def _money(value: float | None) -> str:
    if not value:
        return "$0"
    return f"${value / 1_000_000:.1f}M" if value >= 1_000_000 else f"${value / 1000:,.0f}k"


def _finish_status(ai_status: str | None, failed: bool) -> str:
    if failed:
        return "failed"
    return "blocked" if ai_status in {"blocked", "refused"} else "completed"


def _grounding_event(dropped: int, status: str | None) -> None:
    if status != "ready" and not dropped:
        return
    if dropped:
        emit_current("claim.verdict", f"Grounding · {dropped} unsupported claim{'s' if dropped != 1 else ''} dropped", status="flagged",
                     body="Claims that did not match the market data or the attached context were removed, not shown.")
    else:
        emit_current("claim.verdict", "Grounding · every kept claim matched the data", status="ok")


@app.get("/api/wealth/health")
async def health():
    reachable = await nim_reachable()
    advisory_reachable = await nim_reachable(ADVISORY)
    agent_ok = _agent_importable()
    root = cache_root()
    return {
        "ready": bool(reachable and agent_ok),
        "model": nim_model(),
        "agent": "langchain",
        "nim": nim_health(reachable),
        "advisory_model": nim_health(advisory_reachable, ADVISORY),
        "advisory_hosted_fallback": "allowed with AI Defense enforce" if defense.can_enforce() else "refused: AI Defense is not configured",
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


@app.get("/api/wealth/households")
async def list_households():
    return {"households": households(), "synthetic": True}


@app.get("/api/wealth/households/{household_id}")
async def get_household(household_id: str):
    record = household(household_id)
    if not record:
        raise HTTPException(404, "Unknown household.")
    return record


@app.post("/api/wealth/research/analyze")
async def analyze(request: AnalyzeRequest):
    ticker = normalize_ticker(request.ticker)
    timeline = store.open(request.run_id, label=f"{ticker} research", scenario="research", meta={"ticker": ticker}, prefix="wealth-research")
    with store.bind(timeline.id):
        try:
            return await _analyze(ticker, request, timeline.id)
        except Exception:
            store.finish(timeline.id, "failed")
            raise


async def _analyze(ticker: str, request: AnalyzeRequest, run_id: str):
    started = time.monotonic()
    run = SecurityRun()
    token: Token = security_run.set(run)
    served_token: Token = served.set({})
    usage = ModelUsage()
    usage_token: Token = model_usage.set(usage)
    galileo_logger, callbacks, galileo = attach_galileo("Wealth research · synthesize", ticker)
    output = ""
    code = 200
    failure = None
    body = None
    splunk = {"status": "not_configured"}
    emit_current("run", f"Research · {ticker}", status="started",
                 body="Market data, indicators, and a compliance pre-check, then a cited draft note.")
    try:
        with wealth_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            try:
                emit_current("agent.tool_call", f"market_snapshot({ticker})", data={"tool": "market_snapshot", "arguments": {"ticker": ticker, "refresh": request.refresh}})
                snapshot, source_kind = get_snapshot(ticker, refresh=request.refresh)
                source = _source(snapshot, source_kind)
                emit_current("tool.result", f"Market data · {source['label']}", status="ok",
                             data={"tool": "market_snapshot", "source_kind": source_kind, "as_of": source.get("asOf"), "fictional": source.get("fictional")})
                emit_current("agent.tool_call", "fred_macro()", data={"tool": "fred_macro"})
                macro_payload, macro_kind = get_macro(refresh=request.refresh)
            except ProviderError as exc:
                failure = (exc.status, str(exc))
                emit_current("tool.result", f"Market data · {exc}", status="error", data={"tool": "market_snapshot"})
            except FredError as exc:
                failure = (exc.status, str(exc))
                emit_current("tool.result", f"Macro · {exc}", status="error", data={"tool": "fred_macro"})
            else:
                earnings, peers, returns, macro, conflicts = _tools(snapshot, macro_payload)
                emit_current("tool.result", f"Macro · {'FRED ' + macro_kind if macro_kind else 'not available'}",
                             status="ok" if macro.get("status") == "ready" else "info",
                             body=None if macro.get("status") == "ready" else macro.get("reason"), data={"tool": "fred_macro", "source_kind": macro_kind})
                one_year = (returns.get("windows") or {}).get("1Y") or {}
                emit_current("tool.result", "Indicators · earnings, peers, returns", status="ok", body=" · ".join(part for part in [
                    f"Beat rate {earnings['beatRate'] * 100:.1f}%" if earnings.get("beatRate") is not None else "",
                    f"1-year {vs_spy(one_year.get('ticker'), one_year.get('spy'))}" if one_year.get("ticker") is not None else "",
                    f"P/E {peers['subjectPe']:.1f} vs peer median {peers['medianPe']:.1f}" if peers.get("subjectPe") and peers.get("medianPe") else "",
                ] if part), data={"tool": "indicators"})
                emit_current("tool.result", f"Signal divergences · {len(conflicts) or 'none'}", status="flagged" if conflicts else "ok",
                             body="; ".join(row["title"] for row in conflicts) or None, data={"tool": "signal_divergences"})
                context = research_context(ticker)
                if context["house_view"]:
                    view = context["house_view"]
                    emit_current("tool.result", f"House view · {view.get('rating')} · {view.get('owner')}", status="ok",
                                 body="Owned by the CIO Office. The AI cannot change the rating.", data={"tool": "house_view", "synthetic": view.get("synthetic")})
                if context["event"]:
                    event = context["event"]
                    emit_current("tool.result", f"Earnings event · {event.get('period')} · EPS ${event.get('eps_actual')} vs ${event.get('eps_estimate')} est.",
                                 status="ok", body=event.get("guidance_change"), data={"tool": "earnings_event", "source": event.get("source")})
                if context["affected_households"]:
                    book = context["affected_households"]
                    emit_current("tool.result", f"Affected households · {book['count']} hold it, {book['concentrated']} above 10%, {book['executives']} executives",
                                 status="ok", data={"tool": "affected_households", "synthetic": True})
                restricted = context["restricted"]
                if restricted:
                    emit_current("control", f"Compliance pre-check · restricted list · {ticker} denied", status="denied",
                                 body=f"{restricted.get('reason')} since {restricted.get('since')}. Nothing is drafted or published, and no model is called.",
                                 data={"policy": "research.publish", "restricted": restricted})
                    note, recommendation = omitted_note(
                        f"Compliance pre-check: {ticker} is on the restricted list ({restricted.get('reason')}). No research is drafted or published.", "blocked")
                else:
                    emit_current("control", "Compliance pre-check · restricted list · clear", status="allowed", data={"policy": "research.publish"})
                    tools = {"earnings": earnings, "peers": peers, "returns": returns, "macro": macro}
                    if context["house_view"]:
                        tools["house_view"] = {key: context["house_view"].get(key) for key in ("rating", "owner", "as_of", "thesis_points", "key_risks")}
                    if context["event"]:
                        tools["event"] = context["event"]
                    try:
                        note, recommendation = await asyncio.wait_for(
                            draft_note(ticker, tools, conflicts, snapshot, macro, callbacks=callbacks),
                            ANALYZE_TIMEOUT,
                        )
                    except asyncio.TimeoutError:
                        note, recommendation = omitted_note("The model timed out.", "unavailable")
                        emit_current("llm.call", "Model timed out", status="error")
                    _grounding_event(note.get("dropped_claims") or 0, note.get("status"))
                output = note.get("summary") or note.get("reason") or recommendation.get("status") or ""
                body = {
                    "ticker": ticker,
                    "company": {
                        "name": snapshot.get("name"),
                        "ticker": ticker,
                        "sector": (snapshot.get("info") or {}).get("sector"),
                        "industry": (snapshot.get("info") or {}).get("industry"),
                    },
                    "source": {**source, "macro": macro_kind, "fresh": is_fresh(snapshot)},
                    "earnings": earnings,
                    "peers": peers,
                    "returns": returns,
                    "macro": macro,
                    "conflicts": conflicts,
                    "context": context,
                    "note": note,
                    "recommendation": recommendation,
                    "grounding": {
                        "dropped_claims": (note.get("dropped_claims") or 0),
                    },
                    "security": run.summary(),
                    "usage": usage.summary(),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "perimeter": PERIMETER,
                    "disclaimer": RESEARCH_DISCLAIMER,
                }
            if failure:
                code, output = failure
        splunk = wealth_telemetry.delivery(trace_id)
    finally:
        galileo = await finish_galileo(galileo_logger, galileo, output, code)
        model_usage.reset(usage_token)
        security_run.reset(token)
        served_by = served.get() or None
        served.reset(served_token)
    telemetry = {"splunk": splunk, "galileo": galileo}
    if failure:
        emit_current("result", "Research failed", status="error", body=failure[1])
        store.finish(run_id, "failed")
        return JSONResponse(status_code=failure[0], content={"detail": failure[1], "security": run.summary(), "usage": usage.summary(),
                                                             "served_by": served_by, "telemetry": telemetry, "run_id": run_id})
    body["telemetry"] = telemetry
    body["served_by"] = served_by
    body["run_id"] = run_id
    status = body["note"].get("status")
    emit_current("result", "Draft note ready for review" if status == "ready" else f"Draft note {status} · indicators released",
                 status="ok" if status == "ready" else "blocked" if status in {"blocked", "refused"} else "info",
                 body=body["note"].get("summary") or body["note"].get("reason"))
    store.finish(run_id, _finish_status(status, False), body)
    return body


@app.post("/api/wealth/advisory/brief")
async def brief(request: AdvisoryRequest):
    record = None
    if request.household_id:
        record = household(request.household_id)
        if not record:
            raise HTTPException(404, "Unknown household.")
    label = f"Meeting prep · {record['name']}" if record else "Meeting prep · custom holdings"
    timeline = store.open(request.run_id, label=label, scenario=f"advisory-{record['id']}" if record else "advisory-custom",
                          meta={"household_id": record["id"] if record else None}, prefix="wealth-advisory")
    with store.bind(timeline.id):
        try:
            return await _brief(request, record, timeline.id)
        except Exception:
            store.finish(timeline.id, "failed")
            raise


async def _brief(request: AdvisoryRequest, record: dict | None, run_id: str):
    started = time.monotonic()
    run = SecurityRun()
    token: Token = security_run.set(run)
    served_token: Token = served.set({})
    usage = ModelUsage()
    usage_token: Token = model_usage.set(usage)
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
            if request.weights_unit == "percent":
                weight = item.weight / 100.0
            elif request.weights_unit == "fraction":
                weight = item.weight
            else:
                weight = item.weight / 100.0 if item.weight > 1.5 else item.weight
            if weight <= 0 or weight > 1.5:
                raise HTTPException(422, "Holding weights must be positive percents.")
            holdings_in.append({"ticker": ticker, "weight": weight})
        if not holdings_in:
            raise HTTPException(422, "Enter at least one holding.")
        emit_current("run", "Meeting prep · " + (record["name"] if record else "custom holdings"), status="started",
                     body="Household, market data, suitability rules, then a meeting brief drafted from that record only.")
        known = {str(row.get("ticker", "")).upper(): row for row in (record or {}).get("holdings") or []}
        profile = _household_profile(record) if record else None
        if record:
            emit_current("agent.tool_call", f"get_household({record['id']})", data={"tool": "get_household", "arguments": {"id": record["id"]}})
            emit_current("tool.result", f"Household · Synthetic · {_money(record.get('total_value'))} · {record.get('risk_profile')} profile",
                         status="ok", body=record.get("headline"), data={"tool": "get_household", "synthetic": True})
        galileo_logger, callbacks, galileo = attach_galileo("Wealth advisory · meeting brief", "client advisory brief")

        with wealth_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            metrics = []
            snapshots = []
            failed = 0
            securities = [item for item in holdings_in if item["ticker"] != CASH]
            if securities:
                emit_current("agent.tool_call", f"market_snapshot({', '.join(item['ticker'] for item in securities)})",
                             data={"tool": "market_snapshot", "arguments": {"tickers": [item["ticker"] for item in securities]}})
            for item in holdings_in:
                if item["ticker"] == CASH:
                    metrics.append(_cash_metric(item["weight"], known.get(CASH)))
                    continue
                try:
                    snapshot, source_kind = get_snapshot(item["ticker"], refresh=request.refresh)
                except ProviderError:
                    failed += 1
                    emit_current("tool.result", f"{item['ticker']} · market data unavailable", status="error", data={"tool": "market_snapshot"})
                    metrics.append({
                        "ticker": item["ticker"],
                        "weight": item["weight"],
                        "status": "absent",
                        "reason": "Market data for that ticker was empty.",
                    })
                    continue
                snapshots.append(snapshot)
                metric = _holding_metrics(snapshot, item["weight"], source_kind, known.get(item["ticker"]))
                emit_current("tool.result", f"{item['ticker']} · {metric['source']['label']}", status="ok",
                             data={"tool": "market_snapshot", "ticker": item["ticker"], "source_kind": source_kind})
                metrics.append(metric)
            if securities and failed == len(securities):
                failure = (502, "Market data for those holdings was empty.")
            else:
                emit_current("agent.tool_call", "suitability_check", data={"tool": "suitability_check", "rules": "household policy" if record else "concentration and notes"})
                suitability = household_findings(record, holdings_in) if record else suitability_findings(holdings_in, request.clientNotes)
                for finding in suitability:
                    emit_current("claim.verdict", f"Suitability · {finding.get('rule') or 'check'} · {finding.get('title') or finding['severity']}",
                                 status="flagged", body=finding["detail"], data={"rule": finding.get("rule"), "severity": finding["severity"]})
                if not suitability:
                    emit_current("claim.verdict", "Suitability · no findings", status="ok")
                attached = [name for name, present in (("research note", request.research), ("company briefing", request.briefing)) if present]
                if attached:
                    emit_current("tool.result", f"Attached context · {' and '.join(attached)}", status="ok", data={"tool": "attached_context"})
                primary = snapshots[0] if snapshots else {}
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
                            household=profile,
                        ),
                        ANALYZE_TIMEOUT,
                    )
                except asyncio.TimeoutError:
                    meeting = omitted_brief("The model timed out.", "unavailable")
                    emit_current("llm.call", "Model timed out", status="error")
                _grounding_event(meeting.get("dropped_claims") or 0, meeting.get("status"))
                output = meeting.get("opening") or meeting.get("reason") or meeting.get("status") or ""
                body = {
                    "household": {"id": record["id"], "name": record.get("name"), "synthetic": True} if record else None,
                    "holdings": metrics,
                    "suitability": suitability,
                    "brief": meeting,
                    "entitled": {
                        "briefing": bool(request.briefing),
                        "research": bool(request.research),
                    },
                    "grounding": {"dropped_claims": meeting.get("dropped_claims") or 0},
                    "security": run.summary(),
                    "usage": usage.summary(),
                    "duration_ms": round((time.monotonic() - started) * 1000),
                    "perimeter": PERIMETER,
                    "disclaimer": ADVISORY_DISCLAIMER,
                }
            if failure:
                code, output = failure
        splunk = wealth_telemetry.delivery(trace_id)
    finally:
        galileo = await finish_galileo(galileo_logger, galileo, output, code)
        model_usage.reset(usage_token)
        security_run.reset(token)
        served_by = served.get() or None
        served.reset(served_token)
    telemetry = {"splunk": splunk, "galileo": galileo}
    if failure:
        emit_current("result", "Meeting prep failed", status="error", body=failure[1])
        store.finish(run_id, "failed")
        return JSONResponse(status_code=failure[0], content={"detail": failure[1], "security": run.summary(), "usage": usage.summary(),
                                                             "served_by": served_by, "telemetry": telemetry, "run_id": run_id})
    body["telemetry"] = telemetry
    body["served_by"] = served_by
    body["run_id"] = run_id
    status = body["brief"].get("status")
    titles = {"ready": "Meeting brief ready for advisor review", "refused": "Brief not drafted · client data stayed in the bank",
              "blocked": "Brief not drafted · AI Defense blocked it"}
    emit_current("result", titles.get(status, f"Brief {status} · holdings and suitability released"),
                 status="ok" if status == "ready" else "blocked" if status in {"blocked", "refused"} else "info",
                 body=body["brief"].get("opening") or body["brief"].get("reason"))
    store.finish(run_id, _finish_status(status, False), body)
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
