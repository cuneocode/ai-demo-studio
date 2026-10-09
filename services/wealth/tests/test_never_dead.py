"""Never-dead research and advisory: fixtures when Yahoo and FRED are down, households, and run events."""
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import cache
import nim
import runlog
import security
import server
import studio_models
from fixtures import affected_households, household
from tools.suitability import household_findings

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from warm_cache import chip_tickers, household_tickers  # noqa: E402


def _omitted_note(*_args, **_kwargs):
    async def run():
        return (
            {"status": "omitted", "reason": "skip", "summary": None, "bullets": [], "citations": []},
            {"status": "omitted", "reason": "skip", "action": None, "thesis": None, "disclaimer": "x"},
        )
    return run()


async def _omitted_brief(*_args, **_kwargs):
    return {"status": "omitted", "reason": "skip", "opening": None, "agenda": [], "discussion_points": [], "suitability_callouts": [], "citations": []}


@pytest.fixture
def offline(monkeypatch, tmp_path):
    """Yahoo and FRED raise; the cache is empty. Returns the tickers Yahoo was asked for."""
    asked = []

    def yahoo(ticker):
        asked.append(ticker)
        raise ConnectionError("network disabled")

    def fred():
        raise ConnectionError("network disabled")

    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path / "cache"))
    monkeypatch.setattr(cache, "fetch_snapshot", yahoo)
    monkeypatch.setattr(cache, "fetch_macro", fred)
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(server, "_agent_importable", lambda: True)
    monkeypatch.setattr(runlog.store, "cache_dir", None)
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    return asked


def test_every_example_ticker_analyzes_from_fixtures_with_the_network_down(offline, monkeypatch):
    monkeypatch.setattr(server, "draft_note", _omitted_note)
    client = TestClient(server.app)
    tickers = chip_tickers()
    assert "HCYN" in tickers and len(tickers) >= 5
    for ticker in tickers:
        response = client.post("/api/wealth/research/analyze", json={"ticker": ticker})
        assert response.status_code == 200, (ticker, response.text)
        source = response.json()["source"]
        assert source["kind"] in {"fixture", "fictional"}, ticker
        assert source["asOf"]
        assert response.json()["macro"]["status"] == "absent"
    assert "HCYN" not in offline, "a fictional issuer must never be fetched from Yahoo"


def test_halcyon_is_labelled_fictional_and_carries_research_context(offline, monkeypatch):
    monkeypatch.setattr(server, "draft_note", _omitted_note)
    body = TestClient(server.app).post("/api/wealth/research/analyze", json={"ticker": "HCYN"}).json()
    assert body["source"] == {**body["source"], "kind": "fictional", "label": "Fictional · synthetic data", "fictional": True, "asOf": "2026-10-08"}
    assert body["company"]["name"] == "Halcyon Interconnect, Inc."
    assert body["context"]["house_view"]["rating"] == "Constructive"
    assert body["context"]["house_view"]["owner"] == "CIO Office · US Equity Strategy"
    assert body["context"]["event"]["source"] == "Synthetic"
    assert body["context"]["affected_households"] == {**body["context"]["affected_households"], "count": 214, "concentrated": 31, "executives": 6}
    assert body["returns"]["asOf"] == "2026-10-08"


def test_stale_cache_beats_the_fixture_when_yahoo_is_down(offline, tmp_path):
    stale = json.loads((Path(cache.__file__).parent / "data" / "snapshots" / "JPM.json").read_text())
    stale["fetchedAt"] = "2026-01-02T00:00:00+00:00"
    cache.store_snapshot(stale)
    snapshot, kind = cache.get_snapshot("JPM")
    assert kind == "cache" and snapshot["fetchedAt"].startswith("2026-01-02")


def test_unknown_ticker_still_fails_closed(offline):
    response = TestClient(server.app).post("/api/wealth/research/analyze", json={"ticker": "ZZZZ"})
    assert response.status_code == 502


def test_restricted_issuer_is_blocked_before_any_model_call(offline, monkeypatch):
    def never(*_args, **_kwargs):
        raise AssertionError("the model must not be called for a restricted issuer")

    monkeypatch.setattr(server, "draft_note", never)
    client = TestClient(server.app)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "KSTL", "run_id": "wealth-research-kstl-test"}).json()
    assert body["note"]["status"] == "blocked" and "restricted list" in body["note"]["reason"]
    events = client.get("/api/wealth/runs/wealth-research-kstl-test").json()
    assert events["run"]["status"] == "blocked"
    assert any(e["kind"] == "control" and e["status"] == "denied" for e in events["events"])


def test_research_run_events_stream_in_attach_mode(offline, monkeypatch):
    monkeypatch.setattr(server, "draft_note", _omitted_note)
    client = TestClient(server.app)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "HCYN", "run_id": "wealth-research-hcyn-test"}).json()
    assert body["run_id"] == "wealth-research-hcyn-test"
    page = client.get("/api/wealth/runs/wealth-research-hcyn-test").json()
    kinds = [event["kind"] for event in page["events"]]
    assert kinds[0] == "run" and kinds[-1] == "result"
    assert "agent.tool_call" in kinds and "control" in kinds
    snapshot = next(e for e in page["events"] if e["kind"] == "tool.result" and e["data"].get("tool") == "market_snapshot")
    assert snapshot["data"]["source_kind"] == "fictional" and "Fictional" in snapshot["title"]
    assert page["run"]["status"] == "completed" and page["run"]["result"]["ticker"] == "HCYN"
    assert client.get("/api/wealth/runs/wealth-research-hcyn-test?after=3").json()["events"] == page["events"][3:]


def test_households_are_served_and_labelled_synthetic(offline):
    client = TestClient(server.app)
    cards = client.get("/api/wealth/households").json()
    assert [card["id"] for card in cards["households"]] == ["dana-whitfield", "okafor", "priya-raman"]
    assert all(card["synthetic"] for card in cards["households"])
    dana = client.get("/api/wealth/households/dana-whitfield").json()
    hcyn = next(row for row in dana["holdings"] if row["ticker"] == "HCYN")
    assert hcyn["weight_pct"] == 46.0 and hcyn["shares"] == 74740 and hcyn["cost_basis_per_share"] == 11.0
    assert abs(hcyn["shares"] * hcyn["price"] / dana["total_value"] - 0.46) < 0.001
    assert client.get("/api/wealth/households/nobody").status_code == 404
    assert client.get("/api/wealth/households/..%2Fsecrets").status_code == 404


def test_synthetic_pii_is_obviously_fake():
    priya = json.dumps(household("priya-raman"))
    assert "000-00-1234" in priya and "SYSTEM OVERRIDE" in priya and "0000-4471-9902" in priya
    for record in (household(h) for h in ("dana-whitfield", "okafor", "priya-raman")):
        assert all(account["number"].startswith("0000-") for account in record["accounts"])


def test_book_summary_hits_the_story_counts():
    assert affected_households("HCYN") == {"ticker": "HCYN", "households": 240, "count": 214, "concentrated": 31,
                                           "executives": 6, "threshold_pct": 10, "synthetic": True}


def test_household_suitability_names_its_rules():
    def rules(hid):
        record = household(hid)
        rows = [{"ticker": row["ticker"], "weight": row["weight_pct"] / 100} for row in record["holdings"]]
        return {item["rule"] for item in household_findings(record, rows)}

    assert rules("dana-whitfield") == {"R-CONC-01", "R-RISK-02", "R-AFF-01", "R-REV-01"}
    assert rules("okafor") == {"R-RISK-02", "R-LIQ-01", "R-BEN-01", "R-RMD-01"}
    assert rules("priya-raman") == {"R-LIQ-01", "R-BEN-01", "R-REV-01"}


def test_every_household_holding_has_an_offline_snapshot(offline, monkeypatch):
    monkeypatch.setattr(server, "draft_brief", _omitted_brief)
    client = TestClient(server.app)
    assert set(household_tickers()) - {"CASH"} <= {"HCYN", "VTI", "VXUS", "BND", "SCHD"}
    for hid in ("dana-whitfield", "okafor", "priya-raman"):
        record = household(hid)
        body = client.post("/api/wealth/advisory/brief", json={
            "household_id": hid, "weights_unit": "percent",
            "holdings": [{"ticker": row["ticker"], "weight": row["weight_pct"]} for row in record["holdings"]],
        }).json()
        assert all(row["status"] == "ready" for row in body["holdings"]), (hid, body["holdings"])
        assert body["household"] == {"id": hid, "name": record["name"], "synthetic": True}


def test_percent_weights_are_never_mistaken_for_fractions(offline, monkeypatch):
    monkeypatch.setattr(server, "draft_brief", _omitted_brief)
    body = TestClient(server.app).post("/api/wealth/advisory/brief", json={
        "weights_unit": "percent", "holdings": [{"ticker": "VTI", "weight": 99}, {"ticker": "BND", "weight": 1}],
    }).json()
    assert [row["weight"] for row in body["holdings"]] == [0.99, 0.01]


def test_advisory_refusal_is_a_blocked_run_with_the_reason(offline, monkeypatch, tmp_path):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({"version": 2, "chain": ["sparky", "openai"], "useCases": {}, "providers": {
        "openai": {"label": "OpenAI API", "kind": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-test", "apiKeyEnv": "OPENAI_API_KEY"},
        "sparky": {"label": "Sparky vLLM", "kind": "vllm", "baseUrl": "http://127.0.0.1:8003/v1", "model": "nemotron", "apiKeyEnv": "VLLM_API_KEY"},
    }}))
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    studio_models.reset_health()
    monkeypatch.setattr(studio_models, "_probe", lambda backend: (backend.provider == "openai", "answering"))
    monkeypatch.setattr(security.defense, "key", "")
    monkeypatch.setattr(nim, "chat_model", lambda *_a, **_k: (_ for _ in ()).throw(AssertionError("no model call")))
    client = TestClient(server.app)
    record = household("dana-whitfield")
    body = client.post("/api/wealth/advisory/brief", json={
        "household_id": "dana-whitfield", "weights_unit": "percent", "run_id": "wealth-advisory-refused-test",
        "holdings": [{"ticker": row["ticker"], "weight": row["weight_pct"]} for row in record["holdings"]],
    }).json()
    studio_models.reset_health()
    assert body["brief"]["status"] == "refused" and "AI Defense" in body["brief"]["reason"]
    assert body["served_by"]["provider"] == "openai" and body["served_by"]["fallback"] is True
    assert body["usage"]["llm_calls"] == 0
    page = client.get("/api/wealth/runs/wealth-advisory-refused-test").json()
    assert page["run"]["status"] == "blocked"
    kinds = [(e["kind"], e["status"]) for e in page["events"]]
    assert ("model.failover", "flagged") in kinds and ("guardrail", "blocked") in kinds
    assert sum(1 for kind, _ in kinds if kind == "claim.verdict") == 4
    assert not any(kind == "llm.call" for kind, _ in kinds)


def test_hosted_advisory_emits_forced_enforce_then_the_model_call(offline, monkeypatch, tmp_path):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({"version": 2, "chain": ["openai"], "useCases": {}, "providers": {
        "openai": {"label": "OpenAI API", "kind": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-test", "apiKeyEnv": "OPENAI_API_KEY"},
    }}))
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    studio_models.reset_health()
    monkeypatch.setattr(studio_models, "_probe", lambda backend: (True, "answering"))
    monkeypatch.setattr(security.defense, "key", "k" * 32)

    class Fake:
        def with_structured_output(self, *_a, **_k):
            return self

        async def ainvoke(self, *_a, **_k):
            return {"opening": "Dana Whitfield holds HCYN.", "agenda": [], "discussion_points": [], "suitability_callouts": [], "citations": []}

    monkeypatch.setattr(nim, "chat_model", lambda _u, _s, enforce=False: Fake() if enforce else None)
    client = TestClient(server.app)
    body = client.post("/api/wealth/advisory/brief", json={
        "household_id": "dana-whitfield", "weights_unit": "percent", "run_id": "wealth-advisory-forced-test",
        "holdings": [{"ticker": "HCYN", "weight": 46}, {"ticker": "VTI", "weight": 54}],
    }).json()
    studio_models.reset_health()
    assert body["brief"]["status"] == "ready"
    assert body["served_by"]["ai_defense"].startswith("enforce")
    events = client.get("/api/wealth/runs/wealth-advisory-forced-test").json()["events"]
    forced = next(i for i, e in enumerate(events) if e["kind"] == "guardrail" and "forced to enforce" in e["title"])
    call = next(i for i, e in enumerate(events) if e["kind"] == "llm.call")
    assert forced < call and events[call]["data"]["served_by"]["provider"] == "openai"


def test_recordings_are_served_when_present():
    recordings = TestClient(server.app).get("/api/wealth/recordings").json()["recordings"]
    for item in recordings:
        assert item["synthetic"] is True and item["served_by"]
