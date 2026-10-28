import json
from pathlib import Path

import httpx
import pytest

import edgar

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def catalog(monkeypatch, tmp_path):
    monkeypatch.setenv("SEC_USER_AGENT", "FSI-Test test@example.com")
    monkeypatch.setenv("BRIEFING_CACHE", str(tmp_path))
    rows = json.loads((FIXTURES / "tickers.json").read_text())
    monkeypatch.setattr(edgar, "load_tickers", lambda refresh=False: rows)
    return rows


def test_resolve_ticker_and_unknown(catalog):
    assert edgar.resolve_company("jpm")["cik"] == "0000019617"
    assert edgar.resolve_company("JPM")["ticker"] == "JPM"
    with pytest.raises(edgar.UnknownIssuer):
        edgar.resolve_company("ZZZZNOTAREALISSUER")


def test_ambiguous_name_does_not_pick_silently(catalog):
    with pytest.raises(edgar.AmbiguousIssuer) as exc:
        edgar.resolve_company("INC")
    assert exc.value.status == 409
    assert len(exc.value.candidates) >= 2


def test_search_limits_candidates(catalog):
    results = edgar.search_companies("INC", limit=2)
    assert len(results) == 2
    assert {row["ticker"] for row in results} <= {"GS", "V", "BLK"}


def test_latest_annual_skips_amendment_when_10k_exists(monkeypatch, tmp_path):
    monkeypatch.setenv("SEC_USER_AGENT", "FSI-Test test@example.com")
    monkeypatch.setenv("BRIEFING_CACHE", str(tmp_path))
    payload = json.loads((FIXTURES / "submissions.json").read_text())
    monkeypatch.setattr(edgar, "load_submissions", lambda cik, refresh=False: payload)
    filing = edgar.latest_annual_report("19617")
    assert filing["form"] == "10-K"
    assert filing["accession"] == "0000019617-25-000270"
    assert "jpm-20241231.htm" in filing["url"]
    assert filing["cik"] == "0000019617"


def test_http_get_requires_user_agent_and_sec_host(monkeypatch, tmp_path):
    monkeypatch.setenv("BRIEFING_CACHE", str(tmp_path))
    monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    with pytest.raises(edgar.EdgarError) as exc:
        edgar.http_get("https://www.sec.gov/files/company_tickers.json")
    assert exc.value.status == 503
    monkeypatch.setenv("SEC_USER_AGENT", "FSI-Test test@example.com")
    with pytest.raises(edgar.EdgarError):
        edgar.http_get("https://example.com/secret")


def test_git_identity_is_the_fallback_sec_contact(monkeypatch):
    monkeypatch.delenv("SEC_USER_AGENT", raising=False)
    monkeypatch.setattr(edgar, "git_contact", lambda: "Dev Person dev@example.com")
    assert edgar.user_agent() == "Dev Person dev@example.com"
    assert edgar.sec_health()["contact"] == "git"
    monkeypatch.setenv("SEC_USER_AGENT", "Studio Contact studio@example.com")
    assert edgar.user_agent() == "Studio Contact studio@example.com"
    assert edgar.sec_health()["contact"] == "env"


def test_http_get_maps_sec_http_errors(monkeypatch, tmp_path):
    monkeypatch.setenv("SEC_USER_AGENT", "FSI-Test test@example.com")
    monkeypatch.setenv("BRIEFING_CACHE", str(tmp_path))

    class Client:
        def __init__(self, *_args, **_kwargs):
            pass

        def __enter__(self):
            return self

        def __exit__(self, *_args):
            return False

        def get(self, url):
            request = httpx.Request("GET", url)
            response = httpx.Response(403, request=request)
            raise httpx.HTTPStatusError("forbidden", request=request, response=response)

    monkeypatch.setattr(edgar.httpx, "Client", Client)
    with pytest.raises(edgar.EdgarError) as refused:
        edgar.http_get("https://www.sec.gov/files/company_tickers.json")
    assert refused.value.status == 403
    assert "SEC_USER_AGENT" in str(refused.value)
