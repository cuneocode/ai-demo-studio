"""Local studio adapter for NVIDIA financial fraud scoring.

The request path returns a probability and Shapley groups. It does not flag fraud.
Optional narratives are inspected separately and may be omitted without dropping the score.
Each score is also a run on the shared timeline (GET /api/fraud/runs/{id}).
"""
import os
import time
from contextvars import Token
from pathlib import Path

import truststore
from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

truststore.inject_into_ssl()
load_dotenv(Path(os.getenv("FRAUD_ENV_FILE", Path(__file__).resolve().parents[2] / ".env")))

from cases import get_case, load_cases, public_case
from narrative import explain, health as narrative_health
from runlog import router as runs_router, store
from scorer import FIXTURE, ScoreError, decision_for, risk_band, risk_label, scorer, suggested_action, threshold
from security import security_run, SecurityRun, defense
from telemetry import telemetry

app = FastAPI(docs_url=None, redoc_url=None)
app.include_router(runs_router(store, "/api/fraud"))

CHANNEL = {"pos": "card present", "cnp": "card not present", "ach": "ACH transfer", "recurring": "recurring"}


class ScoreRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=80)
    include_narrative: bool = False
    run_id: str | None = Field(default=None, max_length=90)


def live_cases() -> bool:
    """Sample scores are keyed by the fixture cases; live and recorded scores by the TabFormer cases."""
    return scorer.backend != FIXTURE


@app.on_event("startup")
async def startup():
    await scorer.resolve(force=True)


@app.get("/api/fraud/health")
async def health():
    await scorer.resolve()
    scoring = scorer.health()
    return {
        "ready": scoring["ready"],
        "backend": scoring["backend"],
        "backend_label": scoring["backend_label"],
        "engine": scoring["engine"],
        "model": scoring["model"],
        "detail": scoring["detail"],
        "threshold": scoring["threshold"],
        "cases": len(load_cases(live_cases())),
        "sidecar": scoring["sidecar"],
        "triton": scoring["triton"],
        "cache_cases": scoring["cache_cases"],
        "recorded_at": scoring["recorded_at"],
        "narrative": narrative_health(),
        "security": defense.health(),
        "splunk": telemetry.health(),
    }


@app.get("/api/fraud/cases")
async def cases():
    return {"cases": [public_case(case) for case in load_cases(live_cases())], "threshold": threshold()}


@app.post("/api/fraud/score")
async def score(request: ScoreRequest):
    if scorer.requested != FIXTURE:
        await scorer.resolve()
    case = get_case(request.case_id, live_cases())
    if not case:
        raise HTTPException(404, "Unknown case.")
    if not scorer.ready:
        raise HTTPException(503, scorer.detail)
    started = time.monotonic()
    run = store.open(request.run_id, label=f"Score · {case['label']}", scenario=case["id"], prefix="fraud",
                     meta={"case_id": case["id"], "include_narrative": request.include_narrative, "synthetic": True})
    security = SecurityRun()
    token: Token = security_run.set(security)
    try:
        with store.bind(run.id):
            return await _score(run.id, case, request.include_narrative, security, started)
    finally:
        security_run.reset(token)


async def _score(run_id: str, case: dict, include_narrative: bool, security: SecurityRun, started: float) -> dict:
    channel = CHANNEL.get(case["channel"], case["channel"])
    store.emit(run_id, "run", f"Scoring {case['label']}", status="started",
               body=f"Synthetic payment · {case['merchant']} · ${case['amount']:,.2f} · {channel}")
    store.emit(run_id, "agent.tool_call", "Look up the payment", data={"tool": "get_case", "arguments": {"case_id": case["id"]}})
    store.emit(run_id, "tool.result", f"Payment found · {case['account']} at {case['merchant']}", status="ok",
               body=case.get("neighborhood"), data={"tool": "get_case"})

    store.emit(run_id, "agent.tool_call", "Score the payment's graph neighborhood",
               data={"tool": "score_payment", "arguments": {"case_id": case["id"]}, "chain": scorer.chain()})
    try:
        result = await scorer.score(case)
    except ScoreError as exc:
        store.emit(run_id, "tool.result", "No scoring backend returned a score", status="error", body=str(exc))
        store.finish(run_id, "failed")
        raise HTTPException(502, str(exc)) from None
    for skipped in result["fallback"]:
        store.emit(run_id, "model.failover", f"Scorer fallback · {skipped['label']} could not answer", status="flagged",
                   body=skipped["reason"], data={"backend": skipped["backend"]})
    cut = threshold()
    band = risk_band(result["probability"], cut)
    top = max(result["shap"], key=lambda item: abs(item["value"]), default=None)
    store.emit(run_id, "tool.result",
               f"{result['backend_label']} · probability {result['probability']:.2f} · {risk_label(band)}",
               status="flagged" if band == "high" else "ok",
               body=f"Strongest signal: {top['label']} ({top['value']:+.2f})" if top else None,
               data={"tool": "score_payment", "backend": result["backend"], "label": result["backend_label"],
                     "engine": result["engine"], "probability": result["probability"], "risk_band": band,
                     "latency_ms": result["latency_ms"], "recorded_at": result["recorded_at"], "synthetic": result["backend"] == FIXTURE})

    narrative = {"status": "disabled", "text": None, "security": security.summary()}
    if include_narrative:
        narrative = await explain(case, result)
        if narrative["status"] == "disabled":
            store.emit(run_id, "run", "AI analyst summary skipped · no summary model is configured")
        elif narrative["status"] == "generated":
            store.emit(run_id, "agent.message", "AI analyst summary", body=narrative["text"],
                       data={"served_by": narrative.get("served_by")})
        else:
            store.emit(run_id, "run", f"AI analyst summary omitted · {narrative['status']}", status="flagged",
                       body="The score is released without it.")

    action = suggested_action(band)
    duration = round((time.monotonic() - started) * 1000)
    summary = {"case_id": case["id"], "probability": result["probability"], "risk_band": band, "suggested_action": action,
               "backend": result["backend"], "backend_label": result["backend_label"], "duration_ms": duration}
    store.emit(run_id, "result", f"{risk_label(band)} · {action}", status="flagged" if band == "high" else "ok",
               body=f"Probability {result['probability']:.2f} against an alert threshold of {cut:.2f}, scored by "
                    f"{result['backend_label']}. The score is evidence; the analyst decides.",
               data=summary)
    store.finish(run_id, "completed", summary)
    return {
        "case": public_case(case),
        "probability": result["probability"],
        "threshold": cut,
        "risk_band": band,
        "risk_label": risk_label(band),
        "suggested_action": action,
        "decision": decision_for(result["probability"], cut),
        "shap": result["shap"],
        "backend": result["backend"],
        "backend_label": result["backend_label"],
        "engine": result["engine"],
        "recorded_at": result["recorded_at"],
        "fallback": result["fallback"],
        "synthetic": True,
        "narrative": narrative,
        "security": narrative["security"],
        "telemetry": {"splunk": telemetry.delivery(case["id"])},
        "duration_ms": duration,
        "run_id": run_id,
    }
