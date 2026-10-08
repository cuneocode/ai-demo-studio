"""Horizon returns versus SPY over cached daily closes."""
from __future__ import annotations

from datetime import datetime, timedelta

WINDOWS = (("1M", 31), ("3M", 93), ("6M", 186), ("1Y", 366))


def _parse(date: str) -> datetime | None:
    try:
        return datetime.fromisoformat(date[:10])
    except ValueError:
        return None


def _close_on_or_before(rows: list[dict], target: datetime) -> dict | None:
    chosen = None
    for row in rows:
        stamp = _parse(row.get("date") or "")
        if not stamp or stamp > target:
            continue
        chosen = row
    return chosen


def window_return(rows: list[dict], days: int) -> float | None:
    if not rows:
        return None
    last = rows[-1]
    end = _parse(last.get("date") or "")
    if not end or last.get("close") in (None, 0):
        return None
    start = _close_on_or_before(rows, end - timedelta(days=days))
    if not start or not start.get("close"):
        return None
    return (last["close"] / start["close"]) - 1


def returns_from_snapshot(snapshot: dict) -> dict:
    history = snapshot.get("history") or []
    spy = (snapshot.get("benchmark") or {}).get("history") or []
    windows = {}
    for name, days in WINDOWS:
        ticker_return = window_return(history, days)
        spy_return = window_return(spy, days)
        windows[name] = {
            "ticker": ticker_return,
            "spy": spy_return,
            "excess": None if ticker_return is None or spy_return is None else ticker_return - spy_return,
        }
    status = "ready" if any(item["ticker"] is not None for item in windows.values()) else "absent"
    return {
        "status": status,
        "asOf": history[-1]["date"] if history else None,
        "windows": windows,
    }
