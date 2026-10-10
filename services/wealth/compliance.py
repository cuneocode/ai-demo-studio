"""Deterministic compliance checks. Code, not a model, decides these; Agent Control enforces the verdicts.

* Research: restricted list (before any data pull or model call), rating or price-target language
  (only the CIO Office rates), guarantees, and material non-public information terms.
* Advisory: guarantees, trade or wire instructions (the brief prepares a conversation; it never moves
  money), a recommendation that does not fit the client's profile, and any reference to a confidential
  investigation (a SAR, its referral, or law enforcement interest must never reach the advisor: tipping off).
* Untrusted text (news items, CRM notes): an instruction-like-text screen that runs next to AI Defense
  as defense in depth. Its verdicts are labelled "local screen", never as AI Defense.
"""
from __future__ import annotations

import re

from fixtures import restricted

RATING = re.compile(
    r"\b(?:strong\s+)?(?:buy|sell)\b(?![-\u2010]side)(?!\s*-?\s*off)|\b(?:accumulate|outperform|underperform|overweight|underweight)\b"
    r"|\bprice\s+target\b|\btarget\s+price\b|\bupgrade[sd]?\b|\bdowngrade[sd]?\b|\b\d+(?:\.\d+)?%\s+upside\b|\bupside\s+(?:of|to)\s+\$?\d",
    re.I,
)
GUARANTEE = re.compile(
    r"\bguarantee[sd]?\b|\brisk[-\s]free\b|\bcan(?:'|no)t\s+lose\b|\bcannot\s+lose\b|\bno[-\s]risk\b|\bsure\s+thing\b"
    r"|\bcertain\s+to\s+(?:rise|gain|return|double)\b|\bscreaming\s+buy\b|\bwill\s+(?:definitely|certainly)\b",
    re.I,
)
MNPI = re.compile(
    r"\bmaterial\s+non[-\s]?public\b|\bnot\s+yet\s+(?:public|announced)\b|\binside\s+information\b|\bembargoed\b"
    r"|\bbefore\s+(?:it\s+is|it's)\s+announced\b|\bconfidential\s+(?:deal|merger|acquisition)\b",
    re.I,
)
INSTRUCTION = re.compile(
    r"\bwire\b|\btransfer\s+(?:the\s+|all\s+)?(?:funds|proceeds|money|cash)\b|\bplace\s+(?:an?|the)\s+(?:order|trade)\b"
    r"|\bexecute\s+(?:an?|the)\s+(?:trade|sale|order)\b|\b(?:sell|buy)\s+[\d,]+\s+shares\b|\bliquidate\b|\bmove\s+(?:the\s+)?money\b",
    re.I,
)
CONFIDENTIAL_INVESTIGATION = re.compile(
    r"\bSARs?\b|\bsuspicious\s+activity\b|\bFinCEN\b|\bFIU\b|\bfinancial\s+intelligence\b|\bmoney[-\s]mul(?:e|ing)\b"
    r"|\bmoney\s+laundering\b|\bAML\s+(?:alert|case|investigation|review)\b|\blaw\s+enforcement\b|\bsubpoena\b"
    r"|\b(?:escalated|referred)\s+to\s+(?:investigations?|financial\s+crimes)\b|\b(?:fraud|financial[-\s]crimes?|criminal)\s+investigation\b"
    r"|\bunder\s+investigation\b",
    re.I,
)
INJECTION = re.compile(
    r"\bignore\s+(?:all\s+)?(?:previous|prior|above)\s+instructions\b|\bsystem\s+override\b|\byou\s+are\s+now\s+(?:the|an?)\b"
    r"|\bdisregard\s+(?:your|the)\s+(?:rules|instructions|policy)\b|\bdo\s+not\s+tell\s+the\s+(?:advisor|user|client)\b",
    re.I,
)

PROFILE_FIT = {
    # Which action types fit which risk profile (Reg BI care obligation: reasonable basis given the profile).
    "exchange-fund": {"Moderate", "Growth", "Aggressive"},
    "collar": {"Moderate", "Growth", "Aggressive"},
    "angel-allocation": {"Aggressive"},
}


def _hits(pattern: re.Pattern, text: str) -> list[str]:
    return sorted({match.group(0).strip() for match in pattern.finditer(text or "")})


def restricted_check(ticker: str) -> dict:
    entry = restricted(ticker)
    if entry:
        return {"status": "denied", "ticker": ticker, "reason": entry.get("reason"), "since": entry.get("since"),
                "issuer": entry.get("issuer"), "verdicts": {"issuer_not_restricted": False}}
    return {"status": "clear", "ticker": ticker, "verdicts": {"issuer_not_restricted": True}}


def scan_research(texts: list[str]) -> dict:
    joined = "\n".join(texts)
    rating, guarantee, mnpi = _hits(RATING, joined), _hits(GUARANTEE, joined), _hits(MNPI, joined)
    return {
        "findings": [
            *({"policy": "No rating or price target", "match": hit} for hit in rating),
            *({"policy": "No performance guarantees", "match": hit} for hit in guarantee),
            *({"policy": "No material non-public information", "match": hit} for hit in mnpi),
        ],
        "verdicts": {"no_rating_or_price_target": not rating, "no_guarantee": not guarantee, "no_mnpi": not mnpi},
    }


def research_sentence_flags(text: str) -> list[str]:
    flags = []
    if RATING.search(text or ""):
        flags.append("rating or price-target language")
    if GUARANTEE.search(text or ""):
        flags.append("a performance guarantee")
    if MNPI.search(text or ""):
        flags.append("material non-public information terms")
    return flags


def advisory_sentence_flags(text: str) -> list[str]:
    flags = []
    if GUARANTEE.search(text or ""):
        flags.append("a performance guarantee")
    if INSTRUCTION.search(text or ""):
        flags.append("a trade or wire instruction")
    if CONFIDENTIAL_INVESTIGATION.search(text or ""):
        flags.append("a reference to a confidential investigation")
    return flags


def scan_advisory(texts: list[str], actions: list[dict], profile: str | None) -> dict:
    joined = "\n".join(texts)
    guarantee, instruction = _hits(GUARANTEE, joined), _hits(INSTRUCTION, joined)
    unsuitable = [row for row in actions if not row.get("suitable", True)]
    if profile:
        unsuitable += [row for row in actions if row.get("type") in PROFILE_FIT and profile not in PROFILE_FIT[row["type"]]
                       and row not in unsuitable]
    return {
        "findings": [
            *({"policy": "No performance guarantees", "match": hit} for hit in guarantee),
            *({"policy": "No trade or wire instructions", "match": hit} for hit in instruction),
            *({"policy": "Suitable for the client's profile", "match": row.get("title") or row.get("id")} for row in unsuitable),
        ],
        "verdicts": {"no_guarantee": not guarantee, "no_trade_or_wire_instruction": not instruction, "suitable_for_profile": not unsuitable},
    }


def instruction_screen(text: str) -> list[str]:
    """Instruction-like phrases in untrusted data (defense in depth next to AI Defense)."""
    return _hits(INJECTION, text) + [hit for hit in _hits(INSTRUCTION, text) if INJECTION.search(text or "")]


__all__ = ["advisory_sentence_flags", "instruction_screen", "research_sentence_flags", "restricted_check", "scan_advisory",
           "scan_research"]
