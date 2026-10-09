"""Numbers, dates, and account references in a sentence: what the citation verifier checks.

The same extractor runs on evidence text and on narrative sentences, so a figure the
narrative states must be a figure some cited evidence states.
"""
from __future__ import annotations

import re
from dataclasses import dataclass, field
from datetime import date

MONTHS = {name: index for index, name in enumerate(
    ["january", "february", "march", "april", "may", "june", "july", "august", "september", "october", "november", "december"], 1)}
MONTHS.update({name[:3]: index for name, index in list(MONTHS.items())})
MONTHS["sept"] = 9

_ID = re.compile(r"\b[A-Z][A-Z0-9_]*(?:-[A-Z0-9_]+)+\b")
_ISO = re.compile(r"\b(\d{4})-(\d{2})-(\d{2})(?:T[\d:.]+(?:[+-]\d{2}:\d{2}|Z)?)?")
_MONTH_DAY = re.compile(r"\b(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?\s+(\d{1,2})(?:st|nd|rd|th)?(?:,?\s+(\d{4}))?\b", re.IGNORECASE)
_DAY_MONTH = re.compile(r"\b(\d{1,2})\s+(" + "|".join(sorted(MONTHS, key=len, reverse=True)) + r")\.?(?:,?\s+(\d{4}))?\b", re.IGNORECASE)
_TIME = re.compile(r"\b\d{1,2}:\d{2}(?::\d{2})?\b")
_MASKED = re.compile(r"(?:\*{2,}|\bending(?: in)?\s+|\bx{2,})(\d{4})\b", re.IGNORECASE)
_MONEY = re.compile(r"\$\s?(\d[\d,]*(?:\.\d+)?)(?:\s?(k|K|thousand|million|m|M)\b)?")
_PERCENT = re.compile(r"(\d+(?:\.\d+)?)\s?(?:%|percent\b)")
_NUMBER = re.compile(r"(?<![\w.])(\d[\d,]*(?:\.\d+)?)(?![\w%])")


@dataclass
class Facts:
    money: list[float] = field(default_factory=list)
    percents: list[float] = field(default_factory=list)
    numbers: list[float] = field(default_factory=list)
    dates: list[str] = field(default_factory=list)
    refs: list[str] = field(default_factory=list)

    def all_numbers(self) -> list[float]:
        return self.money + self.numbers


def _to_float(raw: str) -> float | None:
    try:
        return float(raw.replace(",", ""))
    except ValueError:
        return None


def extract(text: str, year: int = 2026) -> Facts:
    facts = Facts()
    work = text or ""

    def take_iso(match):
        facts.dates.append(f"{match.group(1)}-{match.group(2)}-{match.group(3)}")
        return " "

    work = _ISO.sub(take_iso, work)

    def take_month_day(match, month_first=True):
        month_name, day_raw, year_raw = (match.group(1), match.group(2), match.group(3)) if month_first else (match.group(2), match.group(1), match.group(3))
        month = MONTHS.get(month_name.lower().rstrip("."))
        try:
            value = date(int(year_raw) if year_raw else year, month, int(day_raw))
        except (TypeError, ValueError):
            return match.group(0)
        facts.dates.append(value.isoformat())
        return " "

    work = _MONTH_DAY.sub(lambda m: take_month_day(m, True), work)
    work = _DAY_MONTH.sub(lambda m: take_month_day(m, False), work)
    work = _ID.sub(" ", work)
    work = _TIME.sub(" ", work)

    def take_ref(match):
        facts.refs.append(match.group(1))
        return " "

    work = _MASKED.sub(take_ref, work)

    def take_money(match):
        value = _to_float(match.group(1))
        if value is not None:
            scale = (match.group(2) or "").lower()
            value *= 1000 if scale in {"k", "thousand"} else 1_000_000 if scale in {"m", "million"} else 1
            facts.money.append(round(value, 2))
        return " "

    work = _MONEY.sub(take_money, work)

    def take_percent(match):
        value = _to_float(match.group(1))
        if value is not None:
            facts.percents.append(value)
        return " "

    work = _PERCENT.sub(take_percent, work)
    for match in _NUMBER.finditer(work):
        value = _to_float(match.group(1))
        if value is None:
            continue
        if value.is_integer() and 1900 <= value <= 2100 and "," not in match.group(1):
            continue  # a bare year
        facts.numbers.append(value)
    return facts


def close(claim: float, known: float, *, percent: bool = False) -> bool:
    if percent:
        return abs(claim - known) <= 0.6
    if abs(claim - known) < 0.005:
        return True
    return claim >= 100 and known > 0 and abs(claim - known) / known <= 0.005
