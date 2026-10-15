"""Local studio adapter for the SAR investigation demo. Localhost only; no CORS.

POST /api/sar/runs starts an investigation (the shared runs router, services/common/runs.py);
GET /api/sar/runs/{id}?after=n streams it. The investigator and QA answer through
/runs/{id}/review and /runs/{id}/qa. Recorded golden runs: GET /api/sar/recordings.
All case data is synthetic (fixtures/sar/). Nothing is filed anywhere.
"""
from __future__ import annotations

import asyncio
import os
from pathlib import Path
from typing import Literal

import truststore

truststore.inject_into_ssl()

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from pydantic import BaseModel, Field

load_dotenv(Path(os.getenv("SAR_ENV_FILE", Path(__file__).resolve().parents[2] / ".env")))

from casefile import CaseFile, TYPE_LABEL, card, media, scenario, scenarios  # noqa: E402
from controls import controls  # noqa: E402
from investigation import SIMULATED, start  # noqa: E402
from model import health as model_health, reachable  # noqa: E402
from observe import galileo_configured, summarize  # noqa: E402
from runlog import runs_router, store  # noqa: E402
from security import defense  # noqa: E402
from telemetry import sar_telemetry  # noqa: E402

app = FastAPI(docs_url=None, redoc_url=None)
app.include_router(runs_router(store, "/api/sar", start=start))
PERIMETER = "Synthetic case files + FinCrime Wire (fictional) allowlist only"
startup_error = None


def _agent_importable() -> bool:
    try:
        import deepagents  # noqa: F401
        import langchain_openai  # noqa: F401
        return True
    except Exception:
        return False


@app.on_event("startup")
async def startup():
    global startup_error
    try:
        sar_telemetry.start()
    except Exception as exc:
        startup_error = type(exc).__name__
    asyncio.get_running_loop().run_in_executor(None, controls.start)


@app.on_event("shutdown")
async def shutdown():
    await asyncio.to_thread(sar_telemetry.shutdown)


@app.get("/api/sar/health")
async def health():
    is_reachable = await reachable()
    agent_ok = _agent_importable()
    model = model_health(is_reachable)
    control_health = controls.health()
    return {
        "ready": bool(is_reachable and agent_ok),
        "agent": "deepagents" if agent_ok else "unavailable",
        "model": model,
        "nim": model,
        "hosted_fallback": "allowed with AI Defense enforce" if defense.can_enforce() else "refused: AI Defense is not configured",
        "security": defense.health(),
        "controls": control_health,
        "galileo": galileo_configured(),
        "splunk": sar_telemetry.health(),
        "observability": summarize(control_health),
        "recordings": len(store.recordings()),
        "sample": "available",
        "filing": SIMULATED,
        "perimeter": PERIMETER,
        "error": "SAR dependencies are unavailable." if startup_error and not agent_ok else None,
        "detail": None if is_reachable else "No model is reachable; the sample narrative and recorded runs still work.",
    }


@app.get("/api/sar/scenarios")
async def list_scenarios():
    return {"scenarios": [card(item) for item in scenarios()], "media_source": media()["source"]}


@app.get("/api/sar/scenarios/{scenario_id}/inputs")
async def case_inputs(scenario_id: str):
    """Expose the same minimized source records the investigation loads, before any run."""
    item = scenario(scenario_id)
    if not item:
        raise HTTPException(404, "Case not found")
    cf = CaseFile(item)
    counterparties = {row["id"]: row["name"] for row in cf.case.get("counterparties", [])}
    raw_kinds = {"alert", "referral", "kyc", "account", "counterparty", "prior_alert", "teller_note", "document"}
    return {
        "scenario": scenario_id, "synthetic": True, "as_of": cf.case.get("as_of"),
        "transactions": [{
            "id": row["id"], "at": row["at"], "direction": row["direction"],
            "type": TYPE_LABEL.get(row["type"], row["type"]), "amount": row["amount"],
            "counterparty": counterparties.get(row.get("counterparty"), row.get("merchant") or "—"),
            "status": row.get("status", "posted"), "memo": cf.memos.get(row["id"], row.get("memo", "")),
        } for row in sorted(cf.case.get("transactions", []), key=lambda row: row["at"])],
        "records": [row for row in cf.ledger.public() if row["kind"] in raw_kinds],
    }


class SentenceIn(BaseModel):
    id: str | None = Field(default=None, max_length=12)
    text: str = Field(max_length=800)
    cites: list[str] = Field(default_factory=list, max_length=12)


class SectionIn(BaseModel):
    section: str = Field(max_length=12)
    sentences: list[SentenceIn] = Field(default_factory=list, max_length=16)


class ReviewIn(BaseModel):
    request_id: str = Field(min_length=1, max_length=80)
    decision: Literal["file", "no_file"]
    by: str = Field(min_length=1, max_length=80)
    rationale: str = Field(default="", max_length=2000)
    narrative: list[SectionIn] | None = Field(default=None, max_length=8)


class QaIn(BaseModel):
    request_id: str = Field(min_length=1, max_length=80)
    decision: Literal["approve", "return"]
    by: str = Field(min_length=1, max_length=80)
    note: str = Field(default="", max_length=2000)


class ContactIn(BaseModel):
    message: str = Field(default="", max_length=600)
    by: str = Field(default="Investigator", max_length=80)


def _decide(run_id: str, request_id: str, payload: dict) -> dict:
    if not store.decide(run_id, request_id, payload):
        raise HTTPException(409, "Nothing is waiting for that decision.")
    return store.page(run_id, 0)["run"]


@app.post("/api/sar/runs/{run_id}/review")
async def review(run_id: str, request: ReviewIn):
    payload = request.model_dump(exclude_none=True)
    payload["note"] = payload.get("rationale", "")[:300]
    return _decide(run_id, request.request_id, payload)


@app.post("/api/sar/runs/{run_id}/qa")
async def qa(run_id: str, request: QaIn):
    return _decide(run_id, request.request_id, request.model_dump(exclude_none=True))


@app.post("/api/sar/runs/{run_id}/contact")
async def contact(run_id: str, request: ContactIn):
    """A person asks to message the subject from the case. The no-tipping-off policy answers."""
    run = store.get(run_id)
    if run is None:
        raise HTTPException(404, "Unknown run.")
    with store.bind(run_id):
        store.emit(run_id, "agent.tool_call", "contact_customer (requested by the investigator)", lane="human",
                   data={"tool": "contact_customer", "by": request.by})
        verdict = await controls.check("sar-no-tipping-off-v1", {"no_subject_contact": False},
                                       deny_note="contacting the subject is tipping-off risk")
    return {"allowed": verdict["allowed"], "policy": verdict["policy"], "engine": verdict["engine"],
            "reason": "The investigation may not contact the subject or reveal that a review or SAR exists. Nothing was sent."}
