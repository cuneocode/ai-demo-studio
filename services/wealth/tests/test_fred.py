import httpx
import pytest

from providers import fred


def test_missing_key_leaves_macro_absent(monkeypatch):
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    assert fred.fred_configured() is False
    assert fred.fred_health()["status"] == "absent"
    payload = fred.fetch_macro()
    assert payload["status"] == "absent"


def test_unknown_series_rejected(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "test-key")
    with pytest.raises(fred.FredError):
        fred.fetch_series("NOT_A_SERIES")


def test_fetch_series_parses_observations(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "test-key")

    def get(url, **kwargs):
        assert url == fred.FRED_URL
        assert kwargs["params"]["series_id"] == "FEDFUNDS"
        request = httpx.Request("GET", url)
        return httpx.Response(200, json={
            "observations": [
                {"date": "2026-08-01", "value": "4.50"},
                {"date": "2026-07-01", "value": "."},
                {"date": "2026-06-01", "value": "4.33"},
            ]
        }, request=request)

    monkeypatch.setattr(fred.httpx, "get", get)
    payload = fred.fetch_series("FEDFUNDS")
    assert payload["series"] == "FEDFUNDS"
    assert [row["value"] for row in payload["observations"]] == [4.33, 4.5]


def test_empty_fred_fails_closed(monkeypatch):
    monkeypatch.setenv("FRED_API_KEY", "test-key")

    def get(url, **kwargs):
        request = httpx.Request("GET", url)
        return httpx.Response(200, json={"observations": []}, request=request)

    monkeypatch.setattr(fred.httpx, "get", get)
    with pytest.raises(fred.FredError):
        fred.fetch_series("CPIAUCSL")
    def down(*_args, **_kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(fred.httpx, "get", down)
    with pytest.raises(fred.FredError):
        fred.fetch_macro()
