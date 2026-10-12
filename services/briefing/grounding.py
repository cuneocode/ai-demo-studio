"""Deterministic cite-or-abstain verifier. Not an LLM."""
from __future__ import annotations

import math
import re
from pathlib import Path

from navigator import node_body

THEMES = ("objectives", "risks", "regulatory", "ai_initiatives")


def normalize(text: str | None) -> str:
    return re.sub(r"\s+", " ", text or "").strip()


def excerpt_in_text(excerpt: str | None, corpus: str) -> bool:
    needle = normalize(excerpt)
    return bool(needle) and needle in normalize(corpus)


def _values_equal(left, right) -> bool:
    if left is None or right is None:
        return False
    try:
        # Half a cent absolute, so a per-share figure cannot round to a different value and still pass.
        return math.isclose(float(left), float(right), rel_tol=1e-6, abs_tol=0.005)
    except (TypeError, ValueError):
        return str(left) == str(right)


def value_in_excerpt(value, excerpt: str | None) -> bool:
    """A table metric's value must be one of the numbers on the line it cites."""
    numbers = re.findall(r"\d[\d,]*(?:\.\d+)?", excerpt or "")
    return any(_values_equal(value, number.replace(",", "")) for number in numbers)


def _node_text(run_dir: Path, node_id: str | None) -> str:
    if not node_id:
        return ""
    try:
        return node_body(run_dir, node_id)
    except FileNotFoundError:
        return ""


def _source_corpus(run_dir: Path) -> str:
    chunks = []
    nodes = run_dir / "nodes"
    if nodes.is_dir():
        for path in sorted(nodes.glob("*.md")):
            chunks.append(path.read_text(encoding="utf-8", errors="replace"))
    for name in ("source.txt", "source.html", "source.htm"):
        path = run_dir / name
        if path.is_file():
            chunks.append(path.read_text(encoding="utf-8", errors="replace"))
            break
    return "\n".join(chunks)


def _xbrl_match(metric: dict, facts: list[dict]) -> bool:
    for fact in facts:
        concept_hit = metric.get("concept") and metric.get("concept") == fact.get("concept")
        label_hit = metric.get("label") and metric.get("label") == fact.get("label")
        if (concept_hit or label_hit) and _values_equal(metric.get("value"), fact.get("value")):
            return True
    return False


def ground_briefing(briefing: dict, run_dir: Path, xbrl_facts: list[dict] | None = None) -> dict:
    dropped_facts = 0
    dropped_metrics = 0
    xbrl_facts = xbrl_facts or []
    corpus = _source_corpus(run_dir)

    for theme in THEMES:
        section = briefing.get(theme) or {"status": "abstain", "facts": []}
        kept = []
        for fact in section.get("facts") or []:
            excerpt = fact.get("excerpt") or ""
            node_id = fact.get("node_id")
            haystack = _node_text(run_dir, node_id) or corpus
            if excerpt_in_text(excerpt, haystack):
                kept.append(fact)
            else:
                dropped_facts += 1
        section["facts"] = kept
        if kept:
            section["status"] = "extracted"
            section.pop("reason", None)
        else:
            section["status"] = "abstain"
            section.setdefault("reason", "No grounded excerpt remained for this theme.")
        briefing[theme] = section

    metrics = []
    for metric in briefing.get("metrics") or []:
        origin = metric.get("origin") or "absent"
        if origin == "xbrl":
            if xbrl_facts and _xbrl_match(metric, xbrl_facts):
                metrics.append(metric)
            elif not xbrl_facts:
                dropped_metrics += 1
            else:
                dropped_metrics += 1
            continue
        if origin == "verbatim-table":
            excerpt = metric.get("excerpt") or ""
            haystack = _node_text(run_dir, metric.get("node_id")) or corpus
            if excerpt_in_text(excerpt, haystack) and value_in_excerpt(metric.get("value"), excerpt):
                metrics.append(metric)
            else:
                dropped_metrics += 1
            continue
        metrics.append({**metric, "origin": "absent", "value": None})
    if xbrl_facts and not any(item.get("origin") == "xbrl" for item in metrics):
        metrics = [{**fact, "origin": "xbrl"} for fact in xbrl_facts]
    briefing["metrics"] = metrics
    briefing["grounding"] = {"dropped_facts": dropped_facts, "dropped_metrics": dropped_metrics}
    return briefing
