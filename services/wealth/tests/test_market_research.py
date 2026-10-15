import asyncio
import json
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

import market_research as market
import server
import security
from tests.conftest import sample_snapshot


def packet(monkeypatch, tmp_path, ticker="NVDA"):
    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path))
    return market._store_packet({"ticker": ticker, "snapshot": sample_snapshot(ticker), "source_kind": "cache",
        "as_of": "2026-10-14T12:00:00Z", "news": [
            {"id": "clean", "headline": "Company results", "publisher": "Test source", "date": "2026-10-12", "body": "The company reported higher demand across its core customer markets.", "synthetic": False},
            market.attack_article("2026-10-14")]})


async def inspect(text, _label):
    return {"status": "flagged" if "SYSTEM OVERRIDE" in text else "allowed", "rules": ["Prompt Injection"] if "SYSTEM OVERRIDE" in text else [], "event_id": "test-verdict"}


def valid_draft():
    return {"recommendation": "Hold", "outlook": "Earnings are strong, but peer valuation warrants caution.", "risks": ["Valuation premium."], "claims": [
        {"section": "what_changed", "text": "Reported EPS was $1.45.", "evidence_id": "latest-earnings", "field_path": "epsActual", "value": 1.45, "unit": "usd"},
        {"section": "impact", "text": "Trailing P/E is 18.4x.", "evidence_id": "valuation", "field_path": "trailing_pe", "value": 18.4, "unit": "x"},
        {"section": "impact", "text": "BAC trades at 12.0x earnings.", "evidence_id": "peer:BAC", "field_path": "trailingPE", "value": 12.0, "unit": "x"},
    ]}


def test_poison_removed_before_model_and_facts_verified(monkeypatch, tmp_path):
    data = packet(monkeypatch, tmp_path)
    monkeypatch.setattr(security.defense, "inspect_untrusted", inspect)
    seen = {}
    async def model(_kind, _schema, messages, _options, **kwargs):
        seen["prompt"] = messages[-1].content
        return valid_draft()
    monkeypatch.setattr(market, "structured", model)
    result = asyncio.run(market.analyze_packet("NVDA", data["packet_id"], []))
    assert "SYSTEM OVERRIDE" not in seen["prompt"]
    assert "higher demand" in seen["prompt"]
    assert result["news"][-1]["status"] == "withheld"
    assert "AI Defense" in result["news"][-1]["by"]
    assert result["report"]["recommendation"] == "Hold"
    assert len(result["report"]["drivers"]) == 3
    assert "synthetic-injection" not in {row["id"] for row in result["evidence"]}


def test_unverified_fact_withholds_recommendation(monkeypatch, tmp_path):
    data = packet(monkeypatch, tmp_path)
    draft = valid_draft()
    draft["claims"][0]["text"] = "Reported EPS was $99.00."
    async def model(*args, **kwargs): return draft
    monkeypatch.setattr(market, "structured", model)
    result = asyncio.run(market.analyze_packet("NVDA", data["packet_id"], []))
    assert result["report"]["status"] == "needs_review"
    assert result["report"]["recommendation"] is None
    assert result["report"]["outlook"] is None
    # No configured inspection means no article reaches the model.
    assert all(row["status"] == "withheld" for row in result["news"])


def test_packet_identity_is_enforced(monkeypatch, tmp_path):
    data = packet(monkeypatch, tmp_path)
    with pytest.raises(ValueError): market.load_packet("MSFT", data["packet_id"])
    with pytest.raises(ValueError): market.load_packet("NVDA", "../../secret")
    response = TestClient(server.app).post("/api/wealth/market/analyze", json={"ticker": "MSFT", "packet_id": data["packet_id"]})
    assert response.status_code == 409


def test_cached_nvda_and_live_ticker_share_the_same_attack(monkeypatch, tmp_path):
    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path))
    monkeypatch.setattr(market, "get_snapshot", lambda ticker, refresh: (sample_snapshot(ticker), "live"))
    monkeypatch.setattr(market, "fetch_news", lambda ticker, **kwargs: [])
    cached = market.get_packet("NVDA")
    live = market.get_packet("MSFT")
    assert cached["news"][-1]["body"] == live["news"][-1]["body"] == market.ATTACK_BODY
    assert live["snapshot"]["ticker"] == "MSFT"
    assert live["news_error"]
    assert market.public_packet(cached)["evidence"]


def test_news_window_and_summary_provenance(monkeypatch):
    now = datetime(2026, 10, 14, tzinfo=timezone.utc)
    class Feed:
        def get_news(self, count):
            return [{"id": str(days), "content": {"pubDate": (now - timedelta(days=days)).isoformat(), "title": "News", "summary": "Source summary"}} for days in [-1, 2, 35]]
    monkeypatch.setattr(market.yf, "Ticker", lambda ticker: Feed())
    rows = market.fetch_news("MSFT", now)
    assert [row["id"] for row in rows] == ["2"]
    assert rows[0]["content_kind"] == "Provider summary"


def test_opinion_is_rebased_on_verified_facts_when_a_driver_is_rejected(monkeypatch, tmp_path):
    data = packet(monkeypatch, tmp_path)
    draft = valid_draft()
    draft["claims"].append({"section": "impact", "text": "Revenue reached $999B.", "evidence_id": "latest-earnings", "field_path": "revenue", "value": 999e9, "unit": "usd"})
    prompts = []
    async def model(_kind, schema, messages, _options, **kwargs):
        prompts.append(messages[-1].content)
        return draft if schema is market.Assessment else {"recommendation": "Hold", "outlook": "Valuation tempers the earnings outlook.", "risks": ["Valuation premium"]}
    monkeypatch.setattr(market, "structured", model)
    result = asyncio.run(market.analyze_packet("NVDA", data["packet_id"], []))
    assert len(prompts) == 2
    assert "999" not in prompts[-1]
    assert result["report"]["recommendation"] == "Hold"
    assert len(result["report"]["drivers"]) == 3


def test_failed_final_opinion_reports_the_actual_failure(monkeypatch, tmp_path):
    data = packet(monkeypatch, tmp_path)
    draft = valid_draft()
    draft["claims"].append({"section": "impact", "text": "Revenue reached $999B.", "evidence_id": "latest-earnings", "field_path": "revenue", "value": 999e9, "unit": "usd"})
    async def model(_kind, schema, *args, **kwargs):
        if schema is market.Assessment:
            return draft
        return {}  # Invalid final output must not be reported as a completed recommendation.
    monkeypatch.setattr(market, "structured", model)
    result = asyncio.run(market.analyze_packet("NVDA", data["packet_id"], []))
    assert len(result["report"]["drivers"]) == 3
    assert result["report"]["recommendation"] is None
    assert result["report"]["status"] == "needs_review"
    assert "final recommendation could not be generated" in result["report"]["reason"]
