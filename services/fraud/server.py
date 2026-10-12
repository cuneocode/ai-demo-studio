"""Card fraud triage: the studio adapter for NVIDIA GraphSAGE + XGBoost fraud scoring.

POST /api/fraud/runs starts a triage run (triage.py): queue scoring, the triage agent's investigation,
and the analyst's policy-gated disposition, all on the shared timeline. POST /api/fraud/score is the
original single-score endpoint. The score is evidence; it never flags fraud on its own.
"""
import asyncio
import json
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

import controls
import triage
from cases import get_case, load_cases, load_scenarios, public_case
from narrative import explain, health as narrative_health
from runlog import router as runs_router, store
from scorer import FIXTURE, ScoreError, decision_for, risk_band, risk_label, scorer, suggested_action, threshold
from security import security_run, SecurityRun, defense
from telemetry import telemetry

ROOT = Path(__file__).resolve().parent
MODEL_CARDS = (ROOT / ".cache" / "model_card.json", ROOT / "data" / "model_card.json")

app = FastAPI(docs_url=None, redoc_url=None)
app.include_router(runs_router(store, "/api/fraud", start=triage.start))

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
    asyncio.get_running_loop().create_task(controls.controls.ensure())


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
        "agent": await asyncio.to_thread(triage.agent_health),
        "controls": controls.health(),
        "security": defense.health(),
        "splunk": telemetry.health(),
        "model_card": _model_card()["status"],
    }


@app.get("/api/fraud/cases")
async def cases():
    return {"cases": [public_case(case) for case in load_cases(live_cases())], "threshold": threshold()}


@app.get("/api/fraud/scenarios")
async def scenarios():
    doc = load_scenarios()
    return {"scenarios": doc["scenarios"], "illustrative": doc.get("illustrative", {}), "synthetic": True}


def _model_card() -> dict:
    """The measured card from a Sparky run (build_model_card.py), else not_measured. Never filled in by hand."""
    for path, source in zip(MODEL_CARDS, ("cache", "recorded")):
        try:
            card = json.loads(path.read_text())
        except (OSError, ValueError):
            continue
        if isinstance(card, dict) and card.get("schema_version") == 1:
            model = card.get("model") or {}
            return {"status": card.get("status") or "partial", "source": source, "tag": card.get("tag"),
                    "generated_at": card.get("generated_at"), "headline": card.get("headline") or {},
                    "model": {key: model.get(key) for key in ("id", "name", "image", "gnn_trained", "explain", "neighbourhood")},
                    "dataset": {key: (card.get("dataset") or {}).get(key) for key in ("name", "synthetic", "train", "test")},
                    "hardware": card.get("hardware") or {},
                    "host_label": (card.get("provenance") or {}).get("host_label"), "missing": card.get("missing") or []}
    return {"status": "not_measured", "source": None, "tag": "Not measured yet — run on Sparky", "headline": {}, "missing": []}


@app.get("/api/fraud/model-card")
async def model_card():
    return _model_card()


class NoteRequest(BaseModel):
    note: str = Field(min_length=1, max_length=2000)
    case_id: str = Field(min_length=1, max_length=80)
    run_id: str | None = Field(default=None, max_length=90)


@app.post("/api/fraud/notes")
async def save_note(request: NoteRequest):
    """An analyst case note: AI Defense inspects it, then the local fraud.note_pii policy. Saved only if both pass."""
    run = store.get(request.run_id) if request.run_id else None
    if run is None:
        run = store.open(None, label=f"Case note · {request.case_id}", scenario="case-note", prefix="fraud",
                         meta={"case_id": request.case_id, "synthetic": True})
    security = triage.RUN_SECURITY.get(run.id) or SecurityRun()
    token: Token = security_run.set(security)
    try:
        with store.bind(run.id):
            store.emit(run.id, "agent.tool_call", "Save case note", lane="human", data={"tool": "add_note", "case_id": request.case_id})
            inspection = await defense.check([{"role": "user", "content": request.note}], "analyst_note")
            policy = await controls.enforce_note(request.note)
            store.emit(run.id, "control", f"{policy['engine_label']} · fraud.note_pii · {policy['decision']}" + (f" · {', '.join(policy['entities'])}" if policy.get("entities") else ""),
                       status="allowed" if policy["decision"] == "allow" else "denied", body=policy.get("detail") or policy["reason"],
                       data={key: value for key, value in policy.items() if key != "masked"})
            saved = policy["decision"] == "allow" and not inspection["withhold"]
            store.emit(run.id, "tool.result", "Case note saved" if saved else "Case note not saved", status="ok" if saved else "blocked",
                       body=request.note if saved else None, data={"tool": "add_note", "saved": saved})
            if run.scenario == "case-note":
                store.finish(run.id, "completed" if saved else "blocked")
    finally:
        security_run.reset(token)
    return {"saved": saved, "run_id": run.id, "ai_defense": inspection, "policy": policy,
            "masked": policy.get("masked") if not saved else None}


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
