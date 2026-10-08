"""LangChain chain over entitled briefing, accepted research, holdings, and suitability. Advisor-owned."""
from __future__ import annotations

import json

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, model_validator

from grounding import ground_brief
from nim import chat_model
from security import DefenseBlocked, DefenseUnavailable

ADVISORY_DISCLAIMER = "Demo brief — not advice"

SYSTEM = """You draft an advisor meeting brief for a demo studio.
Use only the entitled briefing excerpts, accepted research note, live holding metrics, and suitability findings.
Do not invent holdings, weights, or figures.
Do not write legal disclaimers.
Do not recommend an automatic trade, wire, or rebalance.
The advisor owns every recommendation. Cite briefing excerpts or snapshot fields that already appear in the payload.
Return JSON with exactly these keys:
{"opening": string, "agenda": [string], "discussion_points": [string], "suitability_callouts": [string], "citations": [{"field": string, "excerpt": string|null, "value": string|null}]}."""


class Citation(BaseModel):
    field: str = ""
    excerpt: str | None = None
    value: str | None = None


class MeetingDraft(BaseModel):
    opening: str = ""
    agenda: list[str] = Field(default_factory=list)
    discussion_points: list[str] = Field(default_factory=list)
    suitability_callouts: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)

    @model_validator(mode="before")
    @classmethod
    def coerce(cls, data):
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        if not payload.get("opening"):
            payload["opening"] = payload.get("summary") or payload.get("thesis") or ""
        citations = payload.get("citations")
        if isinstance(citations, dict):
            payload["citations"] = [{"field": str(key), "value": None if value is None else str(value)} for key, value in citations.items()]
        for key in ("agenda", "discussion_points", "suitability_callouts"):
            value = payload.get(key)
            if isinstance(value, str):
                payload[key] = [value]
        return payload


def omitted(reason: str, status: str = "omitted") -> dict:
    return {
        "status": status,
        "reason": reason,
        "opening": None,
        "agenda": [],
        "discussion_points": [],
        "suitability_callouts": [],
        "citations": [],
        "disclaimer": ADVISORY_DISCLAIMER,
    }


async def draft_brief(
    holdings: list[dict],
    suitability: list[dict],
    briefing: dict | None,
    research: dict | None,
    snapshot: dict,
    client_notes: str | None,
    callbacks=None,
) -> dict:
    payload = json.dumps({
        "holdings": holdings,
        "suitability": suitability,
        "briefing": briefing,
        "research": research,
        "clientNotes": client_notes,
    }, default=str)
    try:
        model = chat_model().with_structured_output(MeetingDraft, method="json_mode")
        result = await model.ainvoke([
            SystemMessage(content=SYSTEM),
            HumanMessage(content=payload),
        ], config={"callbacks": callbacks or [], "metadata": {"workflow_name": "wealth-advisory"}})
    except DefenseBlocked:
        return omitted("AI Defense blocked this synthesis.", "blocked")
    except DefenseUnavailable:
        return omitted("AI Defense inspection is unavailable.", "unavailable")
    except Exception:
        return omitted("The local NIM did not return a usable brief.", "unavailable")

    raw = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    brief = ground_brief({
        "opening": raw.get("opening"),
        "agenda": raw.get("agenda") or [],
        "discussion_points": raw.get("discussion_points") or [],
        "suitability_callouts": raw.get("suitability_callouts") or [],
        "citations": [item if isinstance(item, dict) else item.model_dump() for item in raw.get("citations") or []],
    }, snapshot, briefing, research, holdings, suitability)
    brief["disclaimer"] = ADVISORY_DISCLAIMER
    if brief.get("status") != "ready":
        brief.setdefault("reason", "Ungrounded-only claims were dropped.")
        brief["disclaimer"] = ADVISORY_DISCLAIMER
    return brief
