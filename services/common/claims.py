"""Structured, unit-aware claim verification (docs/plans/fsi-demo-redesign.md, G-1).

A model states each claim as data, not prose to be searched:

    numeric      {"text", "evidence_id", "field_path", "value", "unit"}
    qualitative  {"text", "evidence_id", "quote"}

Code checks every claim against the evidence the tools produced; the model never grades itself.
Evidence items carry pre-formatted fields, so a model never has to do arithmetic:

    {"id": "event", "title": "Q3 FY2026 earnings", "source": "Synthetic",
     "fields": {"eps_actual": {"value": 1.79, "unit": "usd", "display": "$1.79"}},
     "text": "free text a qualitative claim may quote"}

A claim is verified only when the cited field exists, the stated value matches it in the same
dimension (fraction vs percent, $ vs $M/$B, bps), the sentence states that value, and every other
number in the sentence is found in the cited evidence. A qualitative claim needs a verbatim quote of
at least eight words from the cited item that actually covers what the sentence says. Anything else
is unverified with a reason: struck through in the UI, never silently dropped.
"""
from __future__ import annotations

import re
from dataclasses import dataclass
from typing import Any, Iterable

MONEY_SCALE = {"usd": 1.0, "usd_k": 1e3, "usd_m": 1e6, "usd_b": 1e9, "usd_t": 1e12}
RATE_SCALE = {"fraction": 1.0, "pct": 0.01, "percent": 0.01, "pts": 0.01, "bps": 0.0001}
MULTIPLE = {"x", "multiple"}
COUNT = {"count", "shares", "quarters", "households"}
YEARS = {"years"}
MIN_QUOTE_WORDS = 8
COVERAGE = 0.5
MAX_NOVEL_WORDS = 2  # content words a quoted sentence may add that no cited evidence contains

NUMBER_WORDS = {
    "zero": 0, "one": 1, "two": 2, "three": 3, "four": 4, "five": 5, "six": 6, "seven": 7, "eight": 8,
    "nine": 9, "ten": 10, "eleven": 11, "twelve": 12, "twenty": 20, "thirty": 30, "forty": 40, "fifty": 50,
}
STOPWORDS = frozenset("""
a an the and or but of to in on for from by with at as is are was were be been being it its this that these those
than then so such into over under about after before above below up down out not no nor very more most less least
has have had do does did will would can could should may might must our we us their they them his her he she you your
per vs versus via each every any all both either neither also just only own same other some what which who whom whose
""".split())
NEGATIONS = frozenset({"not", "no", "never", "none", "without", "nor", "cannot", "isn't", "aren't", "wasn't", "won't", "doesn't", "didn't"})

# Terms whose digits are names, not quantities ("10b5-1", "401(k)", "Q3", "FY2026", "Item 1A").
_NAMES = re.compile(
    r"10b5-1|401\(k\)|\b529\b|\brule\s+\d+\b|\bsection\s+\d+\b|\bform\s+\d+\b|\bs&p\s*500\b|\bq[1-4]\b|\bfy\s?\d{2,4}\b"
    r"|\bitem\s+\d+[a-c]?\b|\b\d+(?:\.\d+)?\s?[tg]\b|\b\d{3,4}g\b",
    re.I,
)
_IDENT = re.compile(r"\b\d{3,4}-\d{2,4}-\d{4}\b|\b\d{4}(?:[ -]\d{4}){3}\b|\b\d{9,19}\b")
_QTY = re.compile(
    r"(?<![\w.])(?P<sign>[-+\u2212])?(?P<cur>\$)?(?P<num>\d{1,3}(?:,\d{3})+(?:\.\d+)?|\d+(?:\.\d+)?)"
    r"(?:\s?(?P<suf>%|percent(?:age points?)?\b|pct\b|pts?\b|points?\b|bps\b|basis points?\b|x\b|times\b"
    r"|[kmbt]\b|thousand\b|million\b|billion\b|trillion\b))?(?![\w$])",
    re.I,
)
_SCALE_WORD = {"k": 1e3, "thousand": 1e3, "m": 1e6, "million": 1e6, "b": 1e9, "billion": 1e9, "t": 1e12, "trillion": 1e12}


# ---------------------------------------------------------------- formatting ----

def _trim(text: str) -> str:
    return text.rstrip("0").rstrip(".") if "." in text else text


def money(value: float) -> str:
    """$1.51B, $6.53M, $620k, $87.40."""
    sign = "-" if value < 0 else ""
    amount = abs(value)
    if amount >= 1e9:
        return f"{sign}${_trim(f'{amount / 1e9:.2f}')}B"
    if amount >= 1e6:
        return f"{sign}${_trim(f'{amount / 1e6:.2f}')}M"
    if amount >= 1e4:
        return f"{sign}${amount / 1e3:,.0f}k"
    return f"{sign}${amount:,.2f}"


def pct(fraction: float, digits: int = 1, signed: bool = False) -> str:
    """0.426 → 42.6%; signed: 0.025 → +2.5%."""
    text = f"{fraction * 100:+.{digits}f}%" if signed else f"{fraction * 100:.{digits}f}%"
    return text.replace("+0.0%", "0.0%")


def multiple(value: float, digits: int = 1) -> str:
    return f"{value:.{digits}f}x"


def count(value: float) -> str:
    return f"{int(value):,}" if float(value).is_integer() else f"{value:,}"


def field(value: Any, unit: str, display: str | None = None, label: str | None = None) -> dict:
    """An evidence field with its display string computed once, by code."""
    if display is None:
        if unit in MONEY_SCALE and isinstance(value, (int, float)):
            display = money(value * MONEY_SCALE[unit])
        elif unit == "fraction" and isinstance(value, (int, float)):
            display = pct(value)
        elif unit in {"pct", "percent"} and isinstance(value, (int, float)):
            display = f"{value:.1f}%"
        elif unit == "bps" and isinstance(value, (int, float)):
            display = f"{value:.0f} bps"
        elif unit in MULTIPLE and isinstance(value, (int, float)):
            display = multiple(value)
        elif isinstance(value, (int, float)) and not isinstance(value, bool):
            display = count(value)
        else:
            display = str(value)
    out = {"value": value, "unit": unit, "display": display}
    if label:
        out["label"] = label
    return out


# ------------------------------------------------------------------ parsing ----

@dataclass(frozen=True)
class Quantity:
    raw: str
    dim: str  # money | rate | multiple | plain | identifier
    value: float  # canonical: dollars, fraction, multiple, or the bare number
    shown: float  # the number as written, before scaling
    decimals: int
    start: int
    end: int
    scale: float = 1.0  # value = shown * scale


def normalize_text(text: str) -> str:
    text = (text or "").replace("\u2013", "-").replace("\u2014", "-").replace("\u2212", "-").replace("\u00a0", " ")
    text = text.replace("\u2019", "'").replace("\u2018", "'").replace("\u201c", '"').replace("\u201d", '"')
    return re.sub(r"\s+", " ", text).strip()


def quantities(text: str) -> list[Quantity]:
    """Every number in a sentence with its dimension: '$5.75-5.85B' is two dollar amounts in billions."""
    clean = normalize_text(text)
    found: list[Quantity] = []
    masked = _NAMES.sub(lambda m: " " * len(m.group(0)), clean)
    for match in _IDENT.finditer(masked):
        found.append(Quantity(match.group(0), "identifier", 0.0, 0.0, 0, match.start(), match.end()))
    masked = _IDENT.sub(lambda m: " " * len(m.group(0)), masked)
    for match in _QTY.finditer(masked):
        number = float(match.group("num").replace(",", ""))
        decimals = len(match.group("num").split(".")[1]) if "." in match.group("num") else 0
        if match.group("sign") in {"-", "\u2212"}:
            number = -number
        suffix = (match.group("suf") or "").lower().strip()
        cur = bool(match.group("cur"))
        if suffix in {"%", "percent", "pct", "pt", "pts", "point", "points"} or suffix.startswith("percentage"):
            dim, scale = "rate", 0.01
        elif suffix in {"bps", "basis point", "basis points"}:
            dim, scale = "rate", 0.0001
        elif suffix in {"x", "times"}:
            dim, scale = "multiple", 1.0
        elif suffix in _SCALE_WORD:
            dim, scale = "money", _SCALE_WORD[suffix]
        elif cur:
            dim, scale = "money", 1.0
        else:
            dim, scale = "plain", 1.0
        found.append(Quantity(match.group(0).strip(), dim, number * scale, number, decimals, match.start(), match.end(), scale))
    found.sort(key=lambda q: q.start)
    # "$5.75-5.85B" and "10-12%": the first number takes the unit of the second.
    for index in range(len(found) - 1):
        left, right = found[index], found[index + 1]
        if not re.fullmatch(r"\s*(-|to)\s*", masked[left.end:right.start]):
            continue
        if (left.dim == "money" and left.scale == 1.0 and right.dim == "money" and right.scale > 1.0) or \
                (left.dim == "plain" and right.dim in {"rate", "multiple"}):
            found[index] = Quantity(left.raw, right.dim, left.shown * right.scale, left.shown, left.decimals,
                                    left.start, left.end, right.scale)
    return found


def _number_words(text: str) -> list[float]:
    return [float(NUMBER_WORDS[word]) for word in re.findall(r"[a-z]+", text.lower()) if word in NUMBER_WORDS]


def canonical(value: Any, unit: str | None) -> tuple[float, str] | None:
    """(canonical value, dimension) for a field or a claimed value."""
    if isinstance(value, bool) or not isinstance(value, (int, float)):
        try:
            value = float(str(value).replace(",", "").replace("$", "").replace("%", ""))
        except (TypeError, ValueError):
            return None
    unit = (unit or "").lower()
    if unit in MONEY_SCALE:
        return float(value) * MONEY_SCALE[unit], "money"
    if unit in RATE_SCALE:
        return float(value) * RATE_SCALE[unit], "rate"
    if unit in MULTIPLE:
        return float(value), "multiple"
    if unit in YEARS:
        return float(value), "years"
    return float(value), "plain"


def _tolerance(evidence: float, decimals: int, scale: float) -> float:
    """±0.5% relative, or display rounding of the number as written (but never looser than 5%)."""
    half_unit = 0.5 * (10 ** -decimals) * scale
    return max(0.005 * abs(evidence), min(half_unit, 0.05 * abs(evidence)), 1e-12)


def _decimals(value: Any) -> int:
    text = f"{value}"
    return len(text.split(".")[1]) if "." in text and "e" not in text.lower() else 0


def _display_numbers(value: float, dim: str) -> list[float]:
    """How a field value may appear as a bare number: 0.426 → 42.6; $1.512B → 1.512, 1512."""
    if dim == "money":
        return [value / scale for scale in (1e9, 1e6, 1e3, 1.0) if abs(value / scale) >= 0.1]
    if dim == "rate":
        return [value * 100]
    return [value]


def matches(quantity: Quantity, value: float, dim: str) -> bool:
    """Whether a number as written states this field value, within display rounding. Sign-insensitive."""
    if quantity.dim == "identifier":
        return False
    if quantity.dim == "plain":
        return any(abs(abs(quantity.shown) - abs(shown)) <= _tolerance(shown, quantity.decimals, 1.0)
                   for shown in _display_numbers(value, dim))
    if quantity.dim != dim:
        return False
    return abs(abs(quantity.value) - abs(value)) <= _tolerance(value, quantity.decimals, quantity.scale)


# ----------------------------------------------------------------- verifying ----

def _words(text: str) -> list[str]:
    return re.findall(r"[a-z][a-z'\-]*", normalize_text(text).lower())


def _stem(word: str) -> str:
    for suffix in ("ing", "ed", "es", "s", "ly"):
        if len(word) > len(suffix) + 3 and word.endswith(suffix):
            return word[: -len(suffix)]
    return word


def _content(text: str) -> set[str]:
    return {_stem(word) for word in _words(text) if word not in STOPWORDS and word not in NUMBER_WORDS and len(word) > 2}


def _numeric_fields(item: dict) -> list[tuple[str, float, str]]:
    out = []
    for path, spec in (item.get("fields") or {}).items():
        if not isinstance(spec, dict):
            continue
        pair = canonical(spec.get("value"), spec.get("unit"))
        if pair is not None and not isinstance(spec.get("value"), bool):
            out.append((path, pair[0], pair[1]))
    return out


def _text_of(item: dict) -> str:
    parts = [item.get("title") or "", item.get("text") or ""]
    parts.extend(str(spec.get("display")) for spec in (item.get("fields") or {}).values() if isinstance(spec, dict))
    return normalize_text(" ".join(parts))


def _supported(quantity: Quantity, items: Iterable[dict]) -> bool:
    for item in items:
        if quantity.dim == "identifier":
            if quantity.raw in _text_of(item):
                return True
            continue
        for _path, value, dim in _numeric_fields(item):
            if matches(quantity, value, dim):
                return True
        for written in quantities(item.get("text") or ""):
            if written.dim == quantity.dim and abs(abs(written.value) - abs(quantity.value)) <= _tolerance(written.value, quantity.decimals, quantity.scale):
                return True
            if quantity.dim == "plain" and abs(abs(written.shown) - abs(quantity.shown)) < 1e-9:
                return True
    return False


def _ignorable(quantity: Quantity) -> bool:
    return quantity.dim == "plain" and float(quantity.shown).is_integer() and 1900 <= quantity.shown <= 2100


def verdict(claim: dict, status: str, reason: str, check: str, **extra) -> dict:
    return {**claim, "status": status, "reason": reason, "check": check, **extra}


def verify(claim: dict, evidence: dict[str, dict]) -> dict:
    """One claim against the run's evidence store. Returns the claim with status/reason/check."""
    text = normalize_text(str(claim.get("text") or ""))
    if not text:
        return verdict(claim, "unverified", "The claim is empty.", "none")
    evidence_id = str(claim.get("evidence_id") or "").strip()
    item = evidence.get(evidence_id)
    if not item:
        reason = "Cites no evidence." if not evidence_id else f"Cites evidence '{evidence_id}' that this run did not retrieve or withheld."
        return verdict(claim, "unverified", reason, "none")
    also = [evidence[eid] for eid in claim.get("also") or [] if isinstance(eid, str) and eid in evidence]
    cited = [item, *also]
    written = quantities(text)
    path = str(claim.get("field_path") or "").strip()

    if path:
        spec = (item.get("fields") or {}).get(path)
        if not isinstance(spec, dict):
            return verdict(claim, "unverified", f"'{evidence_id}' has no field '{path}'.", "numeric")
        target = canonical(spec.get("value"), spec.get("unit"))
        display = spec.get("display")
        if target is None:
            if str(spec.get("value")).lower() not in text.lower() and str(display or "").lower() not in text.lower():
                return verdict(claim, "unverified", f"The sentence does not state {display or spec.get('value')}.", "numeric", display=display)
        else:
            value, dim = target
            if claim.get("value") is not None:
                stated = canonical(claim.get("value"), claim.get("unit") or spec.get("unit"))
                if stated is None:
                    return verdict(claim, "unverified", "The claimed value is not a number.", "numeric", display=display)
                if claim.get("unit") and stated[1] != dim:
                    return verdict(claim, "unverified", f"Unit mismatch: the claim is in {claim.get('unit')}, the evidence is {display}.", "numeric", display=display)
                unit = str(claim.get("unit") or spec.get("unit") or "").lower()
                scale = MONEY_SCALE.get(unit) or RATE_SCALE.get(unit) or 1.0
                if abs(abs(stated[0]) - abs(value)) > _tolerance(value, _decimals(claim.get("value")), scale):
                    shown = _render(stated[0], dim)
                    return verdict(claim, "unverified", f"Value mismatch: the claim says {shown}, the evidence says {display}.", "numeric", display=display)
            states_it = any(matches(q, value, dim) for q in written)
            if not states_it and dim == "plain":
                states_it = any(abs(word - value) < 1e-9 for word in _number_words(text))
            if not states_it:
                return verdict(claim, "unverified", f"The sentence does not state the cited value {display}.", "numeric", display=display)
        for q in written:
            if _ignorable(q) or (target and matches(q, target[0], target[1])):
                continue
            if not _supported(q, cited):
                return verdict(claim, "unverified", f"States {q.raw}, which is not in the cited evidence.", "numeric", display=display)
        return verdict(claim, "verified", f"Matches {item.get('title') or evidence_id} · {spec.get('label') or path} = {display}.", "numeric", display=display)

    quote = normalize_text(str(claim.get("quote") or ""))
    found = False
    if not quote:
        quote = _find_quote(text, cited)
        found = bool(quote)
    if not quote:
        return verdict(claim, "unverified", "A qualitative claim needs a verbatim quote from the cited evidence.", "quote")
    if found:
        if len(text.split()) - len(quote.split()) > 3:
            return verdict(claim, "unverified", "Only part of the sentence appears in the cited evidence.", "quote")
    if len(quote.split()) < MIN_QUOTE_WORDS and not any(
            normalize_text(part.get("text") or "").strip().rstrip(".") == quote.rstrip(".") for part in cited):
        return verdict(claim, "unverified", f"The quote is shorter than {MIN_QUOTE_WORDS} words.", "quote")
    source = normalize_text(" ".join(str(part.get("text") or "") for part in cited)).lower()
    if quote.lower().rstrip(".") not in source:
        return verdict(claim, "unverified", f"The quote does not appear in {item.get('title') or evidence_id}.", "quote")
    claim_words = _content(text)
    quote_words = _content(quote) | _content(item.get("title") or "")
    if claim_words:
        coverage = len(claim_words & quote_words) / len(claim_words)
        if coverage < COVERAGE:
            missing = sorted(claim_words - quote_words)[:4]
            return verdict(claim, "unverified", f"The quote does not support '{', '.join(missing)}'.", "quote", coverage=round(coverage, 2))
    novel = claim_words - _content(" ".join(_text_of(part) for part in cited))
    if len(novel) > MAX_NOVEL_WORDS:
        return verdict(claim, "unverified", f"The sentence adds what the cited evidence never says: '{', '.join(sorted(novel)[:4])}'.", "quote")
    if bool(set(_words(quote)) & NEGATIONS) != bool(set(_words(text)) & NEGATIONS):
        return verdict(claim, "unverified", "The quote and the sentence disagree on a negation.", "quote")
    for q in written:
        if _ignorable(q):
            continue
        if not _supported(q, cited):
            return verdict(claim, "unverified", f"States {q.raw}, which is not in the cited evidence.", "quote")
    return verdict(claim, "verified", f"Quoted from {item.get('title') or evidence_id}.", "quote", **({"quote": quote} if found else {}))


def _find_quote(text: str, cited: list[dict]) -> str:
    """The longest run of the sentence's own words that appears verbatim in the cited text (8+ words, or a whole short text)."""
    sources = [normalize_text(str(part.get("text") or "")) for part in cited]
    joined = " ".join(sources).lower()
    for source in sources:
        whole = source.strip().rstrip(".")
        if whole and len(whole.split()) < MIN_QUOTE_WORDS and whole.lower() in text.lower():
            return whole
    words = text.split()
    best = ""
    for start in range(len(words)):
        for end in range(len(words), start + MIN_QUOTE_WORDS - 1, -1):
            if end - start <= len(best.split()):
                break
            segment = " ".join(words[start:end]).strip(" .,;:")
            if segment.lower() in joined:
                best = segment
                break
    return best if len(best.split()) >= MIN_QUOTE_WORDS else ""


def _render(value: float, dim: str) -> str:
    if dim == "money":
        return money(value)
    if dim == "rate":
        return pct(value, 3 if abs(value) < 0.01 else 1)
    if dim == "multiple":
        return multiple(value)
    return count(value)


def unsupported_numbers(text: str, items: Iterable[dict]) -> list[str]:
    """Numbers in a sentence that none of these evidence items contain (for agenda lines and questions)."""
    pool = list(items)
    return [q.raw for q in quantities(text) if not _ignorable(q) and not _supported(q, pool)]


def verify_all(claims: Iterable[dict], evidence: dict[str, dict]) -> dict:
    results = [verify(dict(claim), evidence) for claim in claims]
    verified = sum(1 for row in results if row["status"] == "verified")
    return {"claims": results, "verified": verified, "unverified": len(results) - verified, "total": len(results)}


__all__ = ["Quantity", "canonical", "count", "field", "matches", "money", "multiple", "normalize_text", "pct",
           "quantities", "unsupported_numbers", "verify", "verify_all"]
