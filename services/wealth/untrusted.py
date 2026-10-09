"""Screening untrusted items before any model sees them: news stories and CRM notes.

Each item goes to AI Defense as a tool result (security.Defense.inspect_untrusted) and through the local
instruction screen (compliance.instruction_screen). A prompt-injection verdict withholds the item; PII is
masked using the spans AI Defense returned, plus a local rule for SSN- and account-shaped values that the
tenant's PII rule does not catch (000-prefixed test SSNs are not valid SSNs). Every verdict says who made it.
"""
from __future__ import annotations

import asyncio
import re

from agentkit import record_tool
from compliance import instruction_screen
from evidence import Evidence, add_news
from runlog import emit_current
from security import defense

LOCAL_MASKS = (
    (re.compile(r"\b\d{3}-\d{2}-\d{4}\b"), "SSN"),
    (re.compile(r"\b(?:\d{4}[ -]?){3}\d{4}\b"), "Card number"),
    (re.compile(r"\b\d{4}-\d{4}-\d{4}\b"), "Account number"),
    (re.compile(r"\+?\d?\s?\(?\b\d{3}\)?[ .-]\d{3}-\d{4}\b"), "Phone number"),
)
INJECTION_RULES = {"Prompt Injection", "Jailbreak", "Tool Exploitation"}
INJECTION_CLASSES = {"SECURITY_VIOLATION"}


def _injection(verdict: dict) -> bool:
    return verdict.get("status") == "flagged" and (
        bool(set(verdict.get("rules") or []) & INJECTION_RULES) or bool(set(verdict.get("classifications") or []) & INJECTION_CLASSES))


def mask(text: str, spans: list[dict]) -> tuple[str, list[dict]]:
    """Masks AI Defense spans first, then local patterns; returns the text and what was masked by whom."""
    masked: list[dict] = []
    out = text
    for span in sorted(spans, key=lambda row: -row["start"]):
        out = out[:span["start"]] + f"[{span['entity'].lower()} masked]" + out[span["end"]:]
        masked.append({"entity": span["entity"], "by": "AI Defense"})
    for pattern, entity in LOCAL_MASKS:
        def replace(match, entity=entity):
            masked.append({"entity": entity, "by": "local rule"})
            return f"[{entity.lower()} masked]"
        out = pattern.sub(replace, out)
    return out, masked[::-1]


async def _screen(text: str, label: str) -> tuple[dict, list[str]]:
    verdict, local = await asyncio.gather(defense.inspect_untrusted(text, label), asyncio.to_thread(instruction_screen, text))
    return verdict, local


async def screen_news(ev: Evidence, items: list[dict], *, agent: str = "news_feed") -> list[dict]:
    rows = []
    results = await asyncio.gather(*(_screen(f"{item.get('headline')}. {item.get('body')}", f"news:{item['id']}") for item in items))
    for item, (verdict, local) in zip(items, results):
        item_id = f"news:{item['id']}"
        by_aid = _injection(verdict)
        row = {"id": item["id"], "evidence_id": item_id, "headline": item.get("headline"), "publisher": item.get("publisher"),
               "date": item.get("date"), "body": item.get("body"), "ai_defense": verdict.get("status"),
               "ai_defense_rules": verdict.get("rules") or [], "local": local}
        if by_aid or local:
            who = " and ".join(part for part in ("AI Defense" if by_aid else "", "local screen" if local else "") if part)
            reason = (f"AI Defense flagged {', '.join(verdict.get('rules') or verdict.get('classifications') or ['it'])}"
                      if by_aid else f"instruction-like text ({'; '.join(local[:2])})")
            row.update(status="withheld", reason=reason, by=who)
            ev.withhold(item_id, item.get("headline") or item["id"], reason)
            emit_current("guardrail", f"{who} · news item withheld · {item.get('publisher')}", status="blocked",
                         body=f"\"{item.get('headline')}\" carried {reason}. It never reaches the research agent.",
                         data={"stage": "tool_result", "item": item["id"], "by": who, "ai_defense": verdict.get("status"),
                               "rules": verdict.get("rules"), "local": local, "event_id": verdict.get("event_id")})
        else:
            row.update(status="kept", reason=None, by="AI Defense" if verdict.get("status") == "allowed" else "local screen")
            add_news(ev, item)
        rows.append(row)
    kept = sum(1 for row in rows if row["status"] == "kept")
    inspected = sum(1 for row in rows if row["ai_defense"] in {"allowed", "flagged"})
    note = f"AI Defense inspected {inspected} of {len(rows)} as tool results" if inspected else (
        "AI Defense not configured · local instruction screen only")
    record_tool("news_feed", {"allowlist": "wire-a, trade-b, blog-c"}, f"News feed · {kept} kept, {len(rows) - kept} withheld",
                agent=agent, status="flagged" if kept < len(rows) else "ok", body=note,
                output=[{k: row[k] for k in ("id", "headline", "status", "by")} for row in rows])
    return rows


async def screen_notes(notes: list[dict]) -> list[dict]:
    rows = []
    results = await asyncio.gather(*(_screen(note.get("text") or "", f"crm:{index}") for index, note in enumerate(notes)))
    for index, (note, (verdict, local)) in enumerate(zip(notes, results)):
        text = note.get("text") or ""
        masked_text, masked = mask(text, verdict.get("spans") or [])
        injected = _injection(verdict) or bool(local)
        pii_by_aid = verdict.get("status") == "flagged" and bool(set(verdict.get("rules") or []) & {"PII", "PCI", "PHI"})
        row = {"index": index, "date": note.get("date"), "author": note.get("author"), "text": masked_text, "masked": masked,
               "status": "withheld" if injected else "masked" if masked else "kept", "ai_defense": verdict.get("status"),
               "ai_defense_rules": verdict.get("rules") or [], "local": local, "event_id": verdict.get("event_id")}
        if injected:
            who = " and ".join(part for part in ("AI Defense" if _injection(verdict) else "", "local screen" if local else "") if part)
            row["reason"] = (f"{who} flagged an injected instruction" + (f" ({', '.join(verdict.get('rules') or [])})" if verdict.get("rules") else ""))
            emit_current("guardrail", f"{who} · CRM note withheld · injected instruction", status="blocked",
                         body=f"Note from {note.get('author')} ({note.get('date')}) told the assistant to act on its own. "
                              "It is withheld from the model and flagged for the advisor.",
                         data={"stage": "tool_result", "note": index, "by": who, "rules": verdict.get("rules"), "local": local,
                               "event_id": verdict.get("event_id")})
        if masked:
            by_aid = [row_["entity"] for row_ in masked if row_["by"] == "AI Defense"]
            by_local = [row_["entity"] for row_ in masked if row_["by"] == "local rule"]
            parts = []
            if by_aid:
                parts.append(f"AI Defense detected {', '.join(sorted(set(by_aid)))}")
            if by_local:
                parts.append(f"local rule masked {', '.join(sorted(set(by_local)))}")
            emit_current("guardrail", f"PII masked in a CRM note · {'; '.join(parts)}", status="flagged" if pii_by_aid or by_local else "ok",
                         body="Masked before any model call, using the character spans AI Defense returned." if by_aid else
                         "AI Defense did not flag these values; the local rule masked them.",
                         data={"stage": "tool_result", "note": index, "masked": masked, "event_id": verdict.get("event_id")})
        rows.append(row)
    return rows


__all__ = ["mask", "screen_news", "screen_notes"]
