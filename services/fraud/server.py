"""Local studio adapter for NVIDIA financial fraud scoring.

The request path returns a probability and Shapley groups. It does not flag fraud.
Optional narratives are inspected separately and may be omitted without dropping the score.
"""
import os
import time
from contextvars import Token
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

load_dotenv(Path(os.getenv("FRAUD_ENV_FILE", Path(__file__).resolve().parents[2] / ".env")))

from cases import get_case, load_cases, public_case
from narrative import explain, health as narrative_health
from scorer import ScoreError, decision_for, scorer, threshold
from security import security_run, SecurityRun, defense
from telemetry import telemetry

app = FastAPI(docs_url=None, redoc_url=None)


class ScoreRequest(BaseModel):
    case_id: str = Field(min_length=1, max_length=80)
    include_narrative: bool = False


@app.on_event("startup")
async def startup():
    await scorer.resolve()


@app.get("/api/fraud/health")
async def health():
    await scorer.resolve()
    scoring = scorer.health()
    return {
        "ready": scoring["ready"],
        "backend": scoring["backend"],
        "model": scoring["model"],
        "detail": scoring["detail"],
        "threshold": scoring["threshold"],
        "cases": len(load_cases()),
        "triton": scoring["triton"],
        "cache_cases": scoring["cache_cases"],
        "narrative": narrative_health(),
        "security": defense.health(),
        "splunk": telemetry.health(),
    }


@app.get("/api/fraud/cases")
async def cases():
    return {"cases": [public_case(case) for case in load_cases()], "threshold": threshold()}


@app.post("/api/fraud/score")
async def score(request: ScoreRequest):
    case = get_case(request.case_id)
    if not case:
        raise HTTPException(404, "Unknown case.")
    if scorer.requested != "fixture":
        await scorer.resolve()
    if not scorer.ready:
        raise HTTPException(503, scorer.detail)
    started = time.monotonic()
    run = SecurityRun()
    token: Token = security_run.set(run)
    try:
        try:
            result = await scorer.score(case)
        except ScoreError as exc:
            raise HTTPException(502, str(exc)) from None
        cut = threshold()
        narrative = {"status": "disabled", "text": None, "security": run.summary()}
        if request.include_narrative:
            narrative = await explain(case, result)
        return {
            "case": public_case(case),
            "probability": result["probability"],
            "threshold": cut,
            "decision": decision_for(result["probability"], cut),
            "shap": result["shap"],
            "backend": scorer.backend,
            "narrative": narrative,
            "security": narrative["security"],
            "telemetry": {"splunk": telemetry.delivery(case["id"])},
            "duration_ms": round((time.monotonic() - started) * 1000),
        }
    finally:
        security_run.reset(token)
