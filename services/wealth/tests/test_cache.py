from datetime import datetime, timedelta, timezone

import cache
from providers.yahoo import ProviderError


def test_same_utc_day_is_fresh(monkeypatch, tmp_path):
    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path))
    monkeypatch.delenv("WEALTH_CACHE_TTL_SECONDS", raising=False)
    now = datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc)
    payload = {"ticker": "JPM", "fetchedAt": "2026-09-20T01:00:00+00:00"}
    cache.store_snapshot(payload)
    assert cache.is_fresh(cache.load_snapshot("JPM"), now) is True
    assert cache.is_fresh(payload, now + timedelta(days=1)) is False


def test_ttl_seconds(monkeypatch):
    monkeypatch.setenv("WEALTH_CACHE_TTL_SECONDS", "60")
    now = datetime(2026, 9, 20, 18, 0, tzinfo=timezone.utc)
    payload = {"fetchedAt": (now - timedelta(seconds=30)).isoformat()}
    assert cache.is_fresh(payload, now) is True
    payload["fetchedAt"] = (now - timedelta(seconds=90)).isoformat()
    assert cache.is_fresh(payload, now) is False


def test_get_snapshot_skips_network_when_fresh(monkeypatch, tmp_path):
    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path))
    monkeypatch.delenv("WEALTH_CACHE_TTL_SECONDS", raising=False)
    payload = {"ticker": "JPM", "fetchedAt": datetime.now(timezone.utc).isoformat(), "history": [{"date": "2026-01-01", "close": 1}]}
    cache.store_snapshot(payload)

    def boom(*_args, **_kwargs):
        raise ProviderError("should not fetch")

    monkeypatch.setattr(cache, "fetch_snapshot", boom)
    loaded, kind = cache.get_snapshot("JPM")
    assert kind == "cache"
    assert loaded["ticker"] == "JPM"


def test_refresh_forces_live(monkeypatch, tmp_path):
    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path))
    cache.store_snapshot({"ticker": "JPM", "fetchedAt": datetime.now(timezone.utc).isoformat()})
    monkeypatch.setattr(cache, "fetch_snapshot", lambda ticker: {"ticker": ticker, "fetchedAt": datetime.now(timezone.utc).isoformat(), "live": True})
    loaded, kind = cache.get_snapshot("JPM", refresh=True)
    assert kind == "live"
    assert loaded["live"] is True
