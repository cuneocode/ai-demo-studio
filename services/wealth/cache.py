"""Write-through snapshot cache. Fresh within the same UTC day or WEALTH_CACHE_TTL_SECONDS."""
from __future__ import annotations

import json
import os
from datetime import datetime, timezone
from pathlib import Path

from fixtures import fictional_snapshot, fixture_snapshot
from providers.fred import fetch_macro
from providers.yahoo import ProviderError, fetch_snapshot


def cache_root() -> Path:
    override = os.getenv("WEALTH_CACHE")
    if override:
        return Path(override)
    return Path(__file__).resolve().parent / ".cache"


def snapshot_path(ticker: str) -> Path:
    return cache_root() / "snapshots" / f"{ticker.upper()}.json"


def fred_path() -> Path:
    return cache_root() / "fred" / "macro.json"


def _parse_stamp(value: str | None) -> datetime | None:
    if not value:
        return None
    try:
        stamp = datetime.fromisoformat(value.replace("Z", "+00:00"))
    except ValueError:
        return None
    if stamp.tzinfo is None:
        stamp = stamp.replace(tzinfo=timezone.utc)
    return stamp.astimezone(timezone.utc)


def _ttl_seconds() -> int | None:
    raw = os.getenv("WEALTH_CACHE_TTL_SECONDS")
    if not raw:
        return None
    try:
        value = int(raw)
    except ValueError:
        return None
    return value if value > 0 else None


def is_fresh(payload: dict | None, now: datetime | None = None) -> bool:
    if not payload:
        return False
    fetched = _parse_stamp(payload.get("fetchedAt"))
    if not fetched:
        return False
    current = now or datetime.now(timezone.utc)
    ttl = _ttl_seconds()
    if ttl is not None:
        return (current - fetched).total_seconds() <= ttl
    return fetched.date() == current.date()


def _read(path: Path) -> dict | None:
    if not path.is_file():
        return None
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError):
        return None
    return payload if isinstance(payload, dict) else None


def _write(path: Path, payload: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def load_snapshot(ticker: str) -> dict | None:
    return _read(snapshot_path(ticker))


def store_snapshot(payload: dict) -> None:
    ticker = payload.get("ticker")
    if not ticker:
        raise ProviderError("Snapshot is missing a ticker.")
    _write(snapshot_path(str(ticker)), payload)


def load_macro() -> dict | None:
    return _read(fred_path())


def store_macro(payload: dict) -> None:
    _write(fred_path(), payload)


def get_snapshot(ticker: str, refresh: bool = False) -> tuple[dict, str]:
    """Fictional fixture → fresh cache → Yahoo → stale cache → committed fixture snapshot.

    Kinds: "fictional" (synthetic issuer; Yahoo is never asked), "cache", "live", "fixture".
    """
    fictional = fictional_snapshot(ticker)
    if fictional:
        return fictional, "fictional"
    cached = load_snapshot(ticker)
    if not refresh and is_fresh(cached):
        return cached, "cache"
    try:
        payload = fetch_snapshot(ticker)
    except Exception as exc:
        if cached:
            return cached, "cache"
        fixture = fixture_snapshot(ticker)
        if fixture:
            return fixture, "fixture"
        if isinstance(exc, ProviderError):
            raise
        raise ProviderError("Market data for that ticker was empty.") from exc
    store_snapshot(payload)
    return payload, "live"


def get_macro(refresh: bool = False) -> tuple[dict, str | None]:
    cached = load_macro()
    if not refresh and is_fresh(cached) and cached.get("status") == "ready":
        return cached, "cache"
    try:
        payload = fetch_macro()
    except Exception:
        payload = {"status": "absent", "reason": "FRED did not answer, so macro series are omitted.", "series": {}}
    if payload.get("status") == "ready":
        store_macro(payload)
        return payload, "live"
    if cached and cached.get("status") == "ready":
        return cached, "cache"
    return payload, None
