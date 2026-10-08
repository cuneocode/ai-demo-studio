"""Cite-or-abstain against the cached snapshot, FRED payload, and posted briefing excerpts."""
from __future__ import annotations

import json
import re

NUMBER = re.compile(r"[-+]?\d[\d,]*(?:\.\d+)?%?")


def normalize(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def excerpt_in_text(excerpt: str | None, corpus: str) -> bool:
    needle = normalize(excerpt)
    return bool(needle) and needle in normalize(corpus)


def _json_corpus(value) -> str:
    return json.dumps(value, default=str, sort_keys=True)


def snapshot_corpus(snapshot: dict | None, macro: dict | None = None) -> str:
    chunks = [_json_corpus(snapshot or {})]
    if macro:
        chunks.append(_json_corpus(macro))
    info = (snapshot or {}).get("info") or {}
    for key in ("name", "ticker", "sector", "industry"):
        if snapshot and snapshot.get(key):
            chunks.append(str(snapshot[key]))
        if info.get(key):
            chunks.append(str(info[key]))
    return "\n".join(chunks)


def briefing_corpus(briefing: dict | None) -> str:
    if not briefing:
        return ""
    chunks = []
    for key in ("objectives", "risks", "regulatory", "ai_initiatives", "aiInitiatives"):
        theme = briefing.get(key) or {}
        facts = theme.get("facts") if isinstance(theme, dict) else theme
        for fact in facts or []:
            if isinstance(fact, str):
                chunks.append(fact)
                continue
            if not isinstance(fact, dict):
                continue
            for field in ("excerpt", "text", "claim"):
                if fact.get(field):
                    chunks.append(str(fact[field]))
    for metric in briefing.get("metrics") or []:
        if isinstance(metric, dict):
            chunks.append(_json_corpus(metric))
    return "\n".join(chunks)


def research_corpus(research: dict | None) -> str:
    if not research:
        return ""
    return _json_corpus(research)


def _number_in_corpus(token: str, corpus: str) -> bool:
    compact = token.replace(",", "").replace("%", "")
    haystack = normalize(corpus).replace(",", "")
    if token in haystack or compact in haystack:
        return True
    try:
        number = float(compact)
    except ValueError:
        return False
    as_pct = f"{number:.1f}"
    as_raw = f"{number:.4f}".rstrip("0").rstrip(".")
    return as_pct in haystack or as_raw in haystack


def _fragment_in_corpus(value: str, corpus: str, min_len: int = 12) -> bool:
    hay = normalize(corpus)
    compact = normalize(value)
    if not compact:
        return False
    if compact in hay:
        return True
    if len(compact) < min_len:
        return False
    for size in range(min(len(compact), 48), min_len - 1, -1):
        for index in range(0, len(compact) - size + 1):
            if compact[index:index + size] in hay:
                return True
    return False


def claim_grounded(text: str | None, corpus: str) -> bool:
    value = normalize(text)
    if not value:
        return False
    if excerpt_in_text(value, corpus) or _fragment_in_corpus(value, corpus):
        return True
    numbers = NUMBER.findall(value)
    return bool(numbers) and all(_number_in_corpus(token, corpus) for token in numbers)


def ground_citations(citations: list[dict], corpus: str) -> tuple[list[dict], int]:
    kept = []
    dropped = 0
    for item in citations or []:
        excerpt = item.get("excerpt") or item.get("value") or item.get("text")
        if excerpt and (excerpt_in_text(excerpt, corpus) or claim_grounded(excerpt, corpus)):
            kept.append(item)
        else:
            dropped += 1
    return kept, dropped


def ground_note(note: dict | None, snapshot: dict, macro: dict | None = None, extras: dict | None = None) -> dict:
    if not note:
        return {"status": "omitted", "reason": "No note was produced.", "dropped_claims": 0}
    corpus = snapshot_corpus(snapshot, macro)
    if extras:
        corpus += "\n" + _json_corpus(extras)
    dropped = 0
    bullets = []
    for bullet in note.get("bullets") or []:
        if claim_grounded(bullet, corpus):
            bullets.append(bullet)
        else:
            dropped += 1
    citations, lost = ground_citations(note.get("citations") or [], corpus)
    dropped += lost
    summary = note.get("summary") or ""
    if summary and not claim_grounded(summary, corpus):
        dropped += 1
        summary = bullets[0] if bullets else ""
    if not bullets and not citations and not summary:
        return {"status": "omitted", "reason": "Ungrounded-only claims were dropped.", "dropped_claims": dropped}
    return {
        **note,
        "status": "ready",
        "summary": summary,
        "bullets": bullets,
        "citations": citations,
        "dropped_claims": dropped,
    }


def ground_recommendation(recommendation: dict | None, snapshot: dict, conflicts: list[dict], macro: dict | None = None) -> dict:
    if not recommendation:
        return {"status": "omitted", "reason": "No recommendation was produced."}
    corpus = snapshot_corpus(snapshot, macro) + "\n" + _json_corpus(conflicts)
    thesis = recommendation.get("thesis") or ""
    if thesis and not claim_grounded(thesis, corpus):
        return {"status": "omitted", "reason": "Recommendation thesis was ungrounded.", "action": recommendation.get("action")}
    action = str(recommendation.get("action") or "watch").lower()
    if action in {"buy", "sell", "overweight", "underweight", "strong_buy", "strong buy"}:
        action = "review"
    if action not in {"watch", "hold", "review", "trim_watch"}:
        action = "watch"
    return {
        "status": "ready",
        "action": action,
        "thesis": thesis,
    }


def ground_brief(brief: dict | None, snapshot: dict, briefing: dict | None, research: dict | None, holdings: list[dict], suitability: list[dict]) -> dict:
    if not brief:
        return {"status": "omitted", "reason": "No meeting brief was produced.", "dropped_claims": 0}
    corpus = "\n".join([
        snapshot_corpus(snapshot),
        briefing_corpus(briefing),
        research_corpus(research),
        _json_corpus(holdings),
        _json_corpus(suitability),
    ])
    dropped = 0
    points = []
    for point in brief.get("discussion_points") or brief.get("talking_points") or []:
        if claim_grounded(point, corpus):
            points.append(point)
        else:
            dropped += 1
    agenda = []
    for item in brief.get("agenda") or []:
        if claim_grounded(item, corpus):
            agenda.append(item)
        else:
            dropped += 1
    citations, lost = ground_citations(brief.get("citations") or [], corpus)
    dropped += lost
    opening = brief.get("opening") or ""
    if opening and not claim_grounded(opening, corpus):
        dropped += 1
        opening = points[0] if points else ""
    if not points and not agenda and not citations and not opening:
        return {"status": "omitted", "reason": "Ungrounded-only claims were dropped.", "dropped_claims": dropped}
    return {
        **brief,
        "status": "ready",
        "opening": opening,
        "agenda": agenda,
        "discussion_points": points,
        "citations": citations,
        "dropped_claims": dropped,
    }
