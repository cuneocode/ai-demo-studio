"""Committed data the demo can always run on: public market snapshots and the fictional Halcyon story.

* services/wealth/data/snapshots/<T>.json: public Yahoo snapshots for the example tickers,
  served when Yahoo is unavailable (source kind "fixture", with the as-of date).
* fixtures/halcyon/market/<T>.json: fictional issuers (HCYN and its restricted-list peer).
  These are served from the fixture only; Yahoo is never asked for them (source kind "fictional").
* fixtures/halcyon/{house-view,restricted-list,earnings-event,news}.json: research context.
* fixtures/households/*.json: synthetic advisory clients and the book summary.
"""
from __future__ import annotations

import json
import os
import re
from pathlib import Path

SERVICE = Path(__file__).resolve().parent
SNAPSHOTS = SERVICE / "data" / "snapshots"
HOUSEHOLD_ID = re.compile(r"^[a-z][a-z0-9-]{1,60}$")


def fixtures_root() -> Path:
    override = os.getenv("STUDIO_FIXTURES")
    return Path(override) if override else SERVICE.parents[1] / "fixtures"


def _read(path: Path):
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None


def _dict(path: Path) -> dict | None:
    data = _read(path)
    return data if isinstance(data, dict) else None


# ------------------------------------------------------------------ market ----

def fictional_tickers() -> set[str]:
    folder = fixtures_root() / "halcyon" / "market"
    return {path.stem.upper() for path in folder.glob("*.json")} if folder.is_dir() else set()


def fictional_snapshot(ticker: str) -> dict | None:
    symbol = ticker.upper()
    if not re.fullmatch(r"[A-Z]{1,5}", symbol):
        return None
    snapshot = _dict(fixtures_root() / "halcyon" / "market" / f"{symbol}.json")
    return snapshot if snapshot and snapshot.get("ticker") == symbol else None


def fixture_snapshot(ticker: str) -> dict | None:
    symbol = ticker.upper()
    if not re.fullmatch(r"[A-Z]{1,5}", symbol):
        return None
    snapshot = _dict(SNAPSHOTS / f"{symbol}.json")
    return snapshot if snapshot and snapshot.get("ticker") == symbol else None


def fixture_tickers() -> set[str]:
    return {path.stem.upper() for path in SNAPSHOTS.glob("*.json")} if SNAPSHOTS.is_dir() else set()


def source_meta(snapshot: dict, kind: str) -> dict:
    """The audience-facing label for where a snapshot came from."""
    fixture = snapshot.get("fixture") or {}
    as_of = fixture.get("asOf") or (snapshot.get("history") or [{}])[-1].get("date")
    if kind == "fictional":
        return {"label": "Fictional · synthetic data", "asOf": as_of, "fictional": True}
    if kind == "fixture":
        return {"label": f"Committed snapshot · Yahoo Finance as of {as_of}", "asOf": as_of, "fictional": False}
    if kind == "cache":
        return {"label": f"Yahoo Finance · cached, as of {as_of}", "asOf": as_of, "fictional": False}
    return {"label": "Yahoo Finance", "asOf": as_of, "fictional": False}


# --------------------------------------------------------- research context ----

def _halcyon(name: str):
    return _read(fixtures_root() / "halcyon" / name)


def house_view(ticker: str) -> dict | None:
    data = _halcyon("house-view.json")
    rows = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
    return next((row for row in rows if isinstance(row, dict) and str(row.get("ticker", "")).upper() == ticker.upper()), None)


def restricted(ticker: str) -> dict | None:
    data = _halcyon("restricted-list.json")
    rows = data.get("entries") if isinstance(data, dict) else data
    return next((row for row in rows or [] if isinstance(row, dict) and str(row.get("ticker", "")).upper() == ticker.upper()), None)


def earnings_event(ticker: str) -> dict | None:
    data = _halcyon("earnings-event.json")
    rows = data if isinstance(data, list) else [data] if isinstance(data, dict) else []
    return next((row for row in rows if isinstance(row, dict) and str(row.get("ticker", "")).upper() == ticker.upper()), None)


def affected_households(ticker: str) -> dict | None:
    book = _dict(fixtures_root() / "households" / "book-summary.json")
    if not book:
        return None
    symbol = ticker.upper()
    holders = [row for row in book.get("households") or [] if (row.get("holdings") or {}).get(symbol)]
    if not holders:
        return None
    return {
        "ticker": symbol,
        "households": len(book.get("households") or []),
        "count": len(holders),
        "concentrated": sum(1 for row in holders if row["holdings"][symbol] > 10),
        "executives": sum(1 for row in holders if row.get("affiliate")),
        "threshold_pct": 10,
        "synthetic": True,
    }


def research_context(ticker: str) -> dict:
    """House view, restricted-list status, the latest event, and the affected book, where fixtures exist."""
    return {
        "house_view": house_view(ticker),
        "restricted": restricted(ticker),
        "event": earnings_event(ticker),
        "affected_households": affected_households(ticker),
    }


# -------------------------------------------------------------- households ----

def _household_paths() -> list[Path]:
    folder = fixtures_root() / "households"
    if not folder.is_dir():
        return []
    return [path for path in sorted(folder.glob("*.json")) if path.stem != "book-summary"]


def household(household_id: str) -> dict | None:
    if not HOUSEHOLD_ID.fullmatch(household_id or ""):
        return None
    for path in _household_paths():
        record = _dict(path)
        if record and record.get("id") == household_id:
            return record
    return None


def households() -> list[dict]:
    """One card per synthetic client, in the fixture's display order."""
    cards = []
    for path in _household_paths():
        record = _dict(path)
        if not record or not record.get("id"):
            continue
        cards.append({
            "id": record["id"],
            "name": record.get("name"),
            "headline": record.get("headline"),
            "age": record.get("age"),
            "risk_profile": record.get("risk_profile"),
            "total_value": record.get("total_value"),
            "scenario": record.get("scenario"),
            "service_event": next((row.get("summary") for row in record.get("service_events") or [] if row.get("kind") == "fraud_case"), None),
            "order": record.get("order", 99),
            "synthetic": True,
        })
    return sorted(cards, key=lambda card: card["order"])
