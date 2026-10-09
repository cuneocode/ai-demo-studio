"""FRED series allowlist. Missing key leaves macro absent. No arbitrary series."""
from __future__ import annotations

import os
from datetime import datetime, timezone

import httpx

FRED_SERIES = {
    "FEDFUNDS": {"label": "Federal funds rate", "unit": "percent"},
    "CPIAUCSL": {"label": "Consumer price index", "unit": "index"},
    "DGS10": {"label": "10-year Treasury yield", "unit": "percent"},
    "UNRATE": {"label": "Unemployment rate", "unit": "percent"},
}
FRED_URL = "https://api.stlouisfed.org/fred/series/observations"


class FredError(Exception):
    status = 502


def fred_configured() -> bool:
    return bool((os.getenv("FRED_API_KEY") or "").strip())


def fred_health() -> dict:
    return {
        "status": "configured" if fred_configured() else "absent",
        "series": list(FRED_SERIES),
    }


def _observations(payload: dict) -> list[dict]:
    rows = []
    for item in payload.get("observations") or []:
        try:
            value = float(item["value"])
        except (KeyError, TypeError, ValueError):
            continue
        date = item.get("date")
        if not date:
            continue
        rows.append({"date": date, "value": value})
    rows.sort(key=lambda row: row["date"])
    return rows


def fetch_series(series_id: str) -> dict:
    key = (os.getenv("FRED_API_KEY") or "").strip()
    if not key:
        raise FredError("FRED is not configured.")
    if series_id not in FRED_SERIES:
        raise FredError("That FRED series is not allowlisted.")
    try:
        response = httpx.get(
            FRED_URL,
            params={
                "series_id": series_id,
                "api_key": key,
                "file_type": "json",
                "sort_order": "desc",
                "limit": 24,
            },
            timeout=20.0,
            follow_redirects=False,
        )
        response.raise_for_status()
        payload = response.json()
    except FredError:
        raise
    except Exception as exc:
        raise FredError("FRED did not return a usable series.") from exc
    rows = _observations(payload if isinstance(payload, dict) else {})
    if not rows:
        raise FredError("FRED did not return a usable series.")
    meta = FRED_SERIES[series_id]
    return {
        "series": series_id,
        "label": meta["label"],
        "unit": meta["unit"],
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "observations": rows,
    }


def fetch_macro() -> dict:
    if not fred_configured():
        return {"status": "absent", "reason": "Live macro series are off: add a FRED API key in Studio settings.", "series": {}}
    series = {}
    for series_id in FRED_SERIES:
        series[series_id] = fetch_series(series_id)
    return {"status": "ready", "series": series, "fetchedAt": datetime.now(timezone.utc).isoformat()}
