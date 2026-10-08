"""FRED series as a named tool. Absent when the key or series is missing."""
from __future__ import annotations


def _direction(latest: float | None, prior: float | None) -> str | None:
    if latest is None or prior is None:
        return None
    if latest > prior:
        return "up"
    if latest < prior:
        return "down"
    return "flat"


def macro_from_payload(payload: dict | None) -> dict:
    if not payload or payload.get("status") != "ready":
        return {
            "status": "absent",
            "reason": (payload or {}).get("reason") or "FRED macro is not available.",
            "series": {},
        }
    series = {}
    for series_id, item in (payload.get("series") or {}).items():
        observations = item.get("observations") or []
        latest = observations[-1] if observations else None
        prior = observations[-2] if len(observations) >= 2 else None
        year_ago = observations[0] if observations else None
        latest_value = latest.get("value") if latest else None
        prior_value = prior.get("value") if prior else None
        series[series_id] = {
            "series": series_id,
            "label": item.get("label") or series_id,
            "unit": item.get("unit"),
            "latest": latest_value,
            "asOf": latest.get("date") if latest else None,
            "prior": prior_value,
            "direction": _direction(latest_value, prior_value),
            "change": None if latest_value is None or prior_value is None else latest_value - prior_value,
            "yearAgo": year_ago.get("value") if year_ago else None,
        }
    return {
        "status": "ready" if series else "absent",
        "fetchedAt": payload.get("fetchedAt"),
        "series": series,
    }
