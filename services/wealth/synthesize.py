"""LangChain chain: tool JSON + conflict rows → cited research note. Server attaches the disclaimer."""
from __future__ import annotations

import json
from typing import Literal

from langchain_core.messages import HumanMessage, SystemMessage
from pydantic import BaseModel, Field, model_validator

from grounding import ground_note, ground_recommendation
from nim import RESEARCH, ChainUnavailable, EgressRefused, structured
from security import DefenseBlocked, DefenseUnavailable

RESEARCH_DISCLAIMER = "Demo research — not financial advice"

SYSTEM = """You draft a cited wealth research note for a demo studio.
Use only the provided tool JSON and signal-divergence rows. Do not invent numbers, peers, or macro prints.
Do not write legal disclaimers or compliance language.
Do not output BUY, SELL, a target price, or an overweight/underweight rating.
If a house_view is present, it is owned by the CIO Office: describe whether the data is consistent with it; never propose a different rating.
If an event is present, lead with what changed in that event.
Recommendation action must be one of: watch, hold, review, trim_watch.
If divergence rows exist, the thesis must name at least one divergence by its title.
Only the rows in "conflicts" are signal divergences. When "conflicts" is empty, never use the words "signal divergence"; describe weak relative performance plainly.
Write returns as signed percentages with one decimal (for example +19.4%).
Every citation field or excerpt must repeat a value that already appears in the tools.
Return JSON with exactly these keys:
{"summary": string, "bullets": [string], "citations": [{"field": string, "excerpt": string|null, "value": string|null}], "action": "watch"|"hold"|"review"|"trim_watch", "thesis": string}."""


class Citation(BaseModel):
    field: str = ""
    excerpt: str | None = None
    value: str | None = None


class ResearchDraft(BaseModel):
    summary: str = ""
    bullets: list[str] = Field(default_factory=list)
    citations: list[Citation] = Field(default_factory=list)
    action: Literal["watch", "hold", "review", "trim_watch"] = "watch"
    thesis: str = ""

    @model_validator(mode="before")
    @classmethod
    def coerce(cls, data):
        if not isinstance(data, dict):
            return data
        payload = dict(data)
        if not payload.get("summary") and payload.get("thesis"):
            payload["summary"] = payload["thesis"]
        if not payload.get("thesis") and payload.get("summary"):
            payload["thesis"] = payload["summary"]
        citations = payload.get("citations")
        if isinstance(citations, dict):
            payload["citations"] = [{"field": str(key), "value": None if value is None else str(value)} for key, value in citations.items()]
        bullets = payload.get("bullets")
        if isinstance(bullets, str):
            payload["bullets"] = [bullets]
        action = str(payload.get("action") or "watch").lower()
        payload["action"] = action if action in {"watch", "hold", "review", "trim_watch"} else "watch"
        return payload


def omitted(reason: str, status: str = "omitted") -> tuple[dict, dict]:
    return (
        {"status": status, "reason": reason, "summary": None, "bullets": [], "citations": []},
        {"status": status, "reason": reason, "action": None, "thesis": None, "disclaimer": RESEARCH_DISCLAIMER},
    )


async def draft_note(ticker: str, tools: dict, conflicts: list[dict], snapshot: dict, macro: dict | None, callbacks=None) -> tuple[dict, dict]:
    payload = json.dumps({"ticker": ticker, "tools": tools, "conflicts": conflicts}, default=str)
    try:
        result = await structured(RESEARCH, ResearchDraft, [
            SystemMessage(content=SYSTEM),
            HumanMessage(content=payload),
        ], {"callbacks": callbacks or [], "metadata": {"workflow_name": "wealth-research"}})
    except EgressRefused as exc:
        return omitted(str(exc), "refused")
    except DefenseBlocked:
        return omitted("AI Defense blocked this synthesis.", "blocked")
    except DefenseUnavailable:
        return omitted("AI Defense inspection is unavailable.", "unavailable")
    except ChainUnavailable:
        return omitted("No model backend in the Studio settings chain is reachable.", "unavailable")
    except Exception:
        return omitted("The model did not return a usable note.", "unavailable")

    raw = result.model_dump() if hasattr(result, "model_dump") else dict(result)
    note = ground_note({
        "summary": raw.get("summary"),
        "bullets": raw.get("bullets") or [],
        "citations": [item if isinstance(item, dict) else item.model_dump() for item in raw.get("citations") or []],
    }, snapshot, macro, {"tools": tools, "conflicts": conflicts})
    recommendation = ground_recommendation({
        "action": raw.get("action"),
        "thesis": raw.get("thesis"),
    }, snapshot, conflicts, macro)
    recommendation["disclaimer"] = RESEARCH_DISCLAIMER
    if note.get("status") != "ready":
        note.setdefault("reason", "Ungrounded-only claims were dropped.")
    if recommendation.get("status") != "ready":
        recommendation.setdefault("disclaimer", RESEARCH_DISCLAIMER)
    return note, recommendation
