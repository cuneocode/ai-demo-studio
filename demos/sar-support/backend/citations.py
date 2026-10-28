"""Citation verifier for SAR narratives: every sentence cites evidence, every figure is in it.

Checks per sentence:
  * at least one citation, and every cited id exists in the ledger and is not withheld;
  * each amount, percentage, count, and date in the sentence appears in the cited evidence
    (dates may fall inside a cited aggregate's window);
  * each masked account or card reference ("ending 6620", "****1188") is a case fact.
An agent sentence that fails is dropped and listed; an investigator's edit that fails is
returned for correction (the narrative policy denies release until it passes).
"""
from __future__ import annotations

import re

from casefile import Ledger
from facts import close, extract

SECTIONS = ("who", "what", "when", "where", "why", "how")
_INLINE_CITE = re.compile(r"\s*\[((?:[A-Z][A-Z0-9_]*(?:[-.][A-Z0-9_]+)+)(?:\s*,\s*[A-Z][A-Z0-9_]*(?:[-.][A-Z0-9_]+)+)*)\]")


def split_inline(text: str, cites: list[str]) -> tuple[str, list[str]]:
    """Moves "[AGG-IN, TXN-05]" written into the text into the cites list."""
    found = list(cites or [])
    for match in _INLINE_CITE.finditer(text or ""):
        found.extend(part.strip() for part in match.group(1).split(","))
    clean = _INLINE_CITE.sub("", text or "").strip()
    return clean, list(dict.fromkeys(c.strip() for c in found if c and c.strip()))


def _known_refs(ledger: Ledger) -> set[str]:
    refs = set()
    for item in ledger.items.values():
        refs.update(extract(item.text).refs)
        refs.update(re.findall(r"\*{2,}(\d{4})", item.text))
    return refs


def check_sentence(text: str, cites: list[str], ledger: Ledger, year: int, refs: set[str] | None = None) -> dict:
    clean, cites = split_inline(text, cites)
    valid = [c for c in cites if (item := ledger.get(c)) and not item.withheld]
    withheld = [c for c in cites if (item := ledger.get(c)) and item.withheld]
    unknown = [c for c in cites if not ledger.get(c)]
    problems = []
    if not clean:
        problems.append("empty sentence")
    if not cites:
        problems.append("no citation")
    elif not valid:
        problems.append("no valid citation")
    if unknown:
        problems.append(f"unknown evidence {', '.join(unknown)}")
    if withheld:
        problems.append(f"cites withheld text {', '.join(withheld)}")

    claim = extract(clean, year)
    pool_money, pool_pct, pool_dates, windows = [], [], set(), []
    for c in valid:
        item = ledger.get(c)
        found = item.facts(year)
        pool_money.extend(found.all_numbers())
        pool_pct.extend(found.percents)
        pool_dates.update(found.dates)
        if item.kind in {"aggregate", "alert", "prior_alert", "referral"} and found.dates:
            windows.append((min(found.dates), max(found.dates)))
    unverified = []
    for value in claim.money:
        if not any(close(value, known) for known in pool_money):
            unverified.append(f"${value:,.2f}")
    for value in claim.percents:
        if not any(close(value, known, percent=True) for known in pool_pct):
            unverified.append(f"{value:g}%")
    for value in claim.numbers:
        if not any(close(value, known) for known in pool_money + pool_pct):
            unverified.append(f"{value:g}")
    for value in claim.dates:
        if value not in pool_dates and not any(low <= value <= high for low, high in windows):
            unverified.append(value)
    known_refs = refs if refs is not None else _known_refs(ledger)
    for ref in claim.refs:
        if ref not in known_refs:
            unverified.append(f"ending {ref}")
    if unverified and valid:
        problems.append("not in the cited evidence: " + ", ".join(dict.fromkeys(unverified)))
    return {"text": clean, "cites": cites, "valid_cites": valid, "unverified": list(dict.fromkeys(unverified)),
            "problems": problems, "ok": not problems}


def verify(sections: list[dict], ledger: Ledger, year: int, *, drop: bool) -> dict:
    """Verifies a narrative given as [{section, sentences: [{text, cites}]}].

    drop=True (agent draft): failing sentences are removed and listed.
    drop=False (investigator edit): failing sentences stay, marked, and `ok` is False.
    """
    refs = _known_refs(ledger)
    kept_sections, dropped, total, counter = [], [], 0, 0
    by_name = {}
    for section in sections or []:
        name = str(section.get("section", "")).lower().strip()
        if name not in SECTIONS:
            name = "what"
        by_name.setdefault(name, []).extend(section.get("sentences") or [])
    for name in SECTIONS:
        kept = []
        for sentence in by_name.get(name, []):
            if isinstance(sentence, str):
                sentence = {"text": sentence, "cites": []}
            total += 1
            counter += 1
            result = check_sentence(str(sentence.get("text", "")), list(sentence.get("cites") or []), ledger, year, refs)
            result["id"] = sentence.get("id") or f"S{counter}"
            result["section"] = name
            if result["ok"] or not drop:
                kept.append(result)
            else:
                dropped.append(result)
        if kept:
            kept_sections.append({"section": name, "sentences": kept})
    kept_count = sum(len(s["sentences"]) for s in kept_sections)
    failing = sum(1 for s in kept_sections for item in s["sentences"] if not item["ok"])
    present = [s["section"] for s in kept_sections]
    return {
        "sections": kept_sections,
        "dropped": dropped,
        "total": total,
        "kept": kept_count,
        "failing": failing,
        "cited_share": round((kept_count - failing) / total, 3) if total else 0.0,
        "missing_sections": [name for name in SECTIONS if name not in present],
        "every_sentence_cited": kept_count > 0 and failing == 0 and all(item["valid_cites"] for s in kept_sections for item in s["sentences"]),
        "every_fact_verified": kept_count > 0 and not any(item["unverified"] for s in kept_sections for item in s["sentences"]),
        "ok": kept_count > 0 and failing == 0,
    }


def check_rationale(text: str, cites: list[str], ledger: Ledger, year: int) -> dict:
    result = check_sentence(text, cites, ledger, year)
    result["id"] = "R"
    result["section"] = "rationale"
    return result
