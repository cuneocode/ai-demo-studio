"""Never-dead research and advisory: fixtures when Yahoo and FRED are down, households, approvals, and run events."""
import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import advisory
import cache
import nim
import research
import runlog
import security
import server
import studio_models
from fixtures import affected_households, household
from tools.suitability import household_findings

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "scripts"))
from warm_cache import chip_tickers, household_tickers  # noqa: E402


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


def test_every_example_ticker_analyzes_from_fixtures_with_the_network_down(offline, no_models):
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


def test_halcyon_is_labelled_fictional_and_the_fixture_tier_still_verifies(offline, no_models):
    body = TestClient(server.app).post("/api/wealth/research/analyze", json={"ticker": "HCYN", "scenario": "earnings"}).json()
    assert body["source"] == {**body["source"], "kind": "fictional", "label": "Fictional · synthetic data", "fictional": True, "asOf": "2026-10-08"}
    assert body["company"]["name"] == "Halcyon Interconnect, Inc."
    assert body["context"]["house_view"]["rating"] == "Constructive"
    assert body["context"]["event"]["source"] == "Synthetic"
    assert body["context"]["affected_households"] == {**body["context"]["affected_households"], "count": 214, "concentrated": 31, "executives": 6}
    update = body["update"]
    assert update["mode"] == "fixture" and update["counts"]["verified"] == update["counts"]["total"] >= 3
    assert update["house_view_impact"] == "consistent" and update["rating"] == "Constructive"
    assert body["publish"]["status"] == "awaiting_approval"
    assert "fictional issuer" in body["disclaimer"] and body["usage"]["llm_calls"] == 0
    assert body["evaluation"]["label"] == "Evaluation not configured"
    assert {row["id"] for row in body["news"]} == {"hcyn-n1", "hcyn-n2", "hcyn-n3", "hcyn-n5"}, "the clean scenario has no attack story"


def test_stale_cache_beats_the_fixture_when_yahoo_is_down(offline, tmp_path):
    stale = json.loads((Path(cache.__file__).parent / "data" / "snapshots" / "JPM.json").read_text())
    stale["fetchedAt"] = "2026-01-02T00:00:00+00:00"
    cache.store_snapshot(stale)
    snapshot, kind = cache.get_snapshot("JPM")
    assert kind == "cache" and snapshot["fetchedAt"].startswith("2026-01-02")


def test_unknown_ticker_still_fails_closed(offline, no_models):
    response = TestClient(server.app).post("/api/wealth/research/analyze", json={"ticker": "ZZZZ"})
    assert response.status_code == 502


def test_restricted_issuer_is_blocked_before_any_data_pull_or_model_call(offline, monkeypatch):
    def never(*_args, **_kwargs):
        raise AssertionError("nothing runs for a restricted issuer")

    monkeypatch.setattr(research, "run_deep_agent", never)
    monkeypatch.setattr(research, "get_snapshot", never)
    client = TestClient(server.app)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "KSTL", "scenario": "restricted", "run_id": "wealth-research-kstl-test"}).json()
    assert body["status"] == "blocked" and body["publish"]["status"] == "blocked"
    assert body["precheck"]["controls"]["allowed"] is False and body["usage"]["llm_calls"] == 0
    page = client.get("/api/wealth/runs/wealth-research-kstl-test").json()
    assert page["run"]["status"] == "blocked"
    denied = [e for e in page["events"] if e["kind"] == "control" and e["status"] == "denied"]
    assert denied and "research.precheck" in denied[0]["title"] and "Local policy check" in denied[0]["title"]
    assert not any(e["kind"] == "llm.call" for e in page["events"])
    assert client.post("/api/wealth/research/publish", json={"run_id": "wealth-research-kstl-test"}).status_code == 409


def test_poisoned_news_is_withheld_and_claims_citing_it_or_rating_it_are_struck(offline, monkeypatch):
    async def drafted(ctx, _callbacks):
        assert "news:hcyn-n4" not in ctx.evidence.items, "a withheld story never reaches the agent"
        return {"house_view_impact": "consistent", "claims": [
            {"section": "what_changed", "text": "Q3 EPS of $1.79 beat the $1.62 consensus.", "evidence_id": "event",
             "field_path": "eps_actual", "value": 1.79, "unit": "usd"},
            {"section": "impact", "text": "Halcyon's rack business is underrated, so advisors should buy aggressively.",
             "evidence_id": "news:hcyn-n4", "quote": "Halcyon's rack business is underrated."},
            {"section": "talking_point", "text": "Halcyon beat estimates in each of the last four quarters, a screaming buy with 300% upside guaranteed.",
             "evidence_id": "earnings", "field_path": "beat_streak", "value": 4, "unit": "count"},
        ]}, "deep_agent"

    monkeypatch.setattr(research, "run_deep_agent", drafted)
    client = TestClient(server.app)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "HCYN", "scenario": "poisoned-news", "run_id": "wealth-research-poison-test"}).json()
    attack = next(row for row in body["news"] if row["id"] == "hcyn-n4")
    assert attack["status"] == "withheld" and attack["by"] == "local screen"
    statuses = [row["status"] for row in body["update"]["claims"]]
    assert statuses[0] == "verified" and statuses[1] == "unverified" and statuses[2] in {"unverified", "policy"}
    assert "withheld" in body["update"]["claims"][1]["reason"]
    events = client.get("/api/wealth/runs/wealth-research-poison-test").json()["events"]
    assert any(e["kind"] == "guardrail" and e["status"] == "blocked" and "withheld" in e["title"] for e in events)


def test_publish_runs_the_research_publish_policies_and_lands_on_the_timeline(offline, no_models):
    client = TestClient(server.app)
    client.post("/api/wealth/research/analyze", json={"ticker": "HCYN", "scenario": "earnings", "run_id": "wealth-research-publish-test"})
    rejected = client.post("/api/wealth/research/publish", json={"run_id": "wealth-research-publish-test", "decision": "reject"}).json()
    assert rejected["status"] == "rejected" and rejected["verdicts"]["strategist_approved"] is False
    published = client.post("/api/wealth/research/publish", json={"run_id": "wealth-research-publish-test"}).json()
    assert published["status"] == "published" and published["controls"]["source"] == "local"
    assert {row["label"] for row in published["controls"]["checks"]} == {
        "Restricted list", "No rating or price target", "No performance guarantees", "Only verified claims", "Strategist approval"}
    events = client.get("/api/wealth/runs/wealth-research-publish-test").json()["events"]
    assert [e["kind"] for e in events][-1] == "result" and events[-1]["title"].startswith("Published")
    assert any(e["kind"] == "hitl.decision" for e in events)
    recorded = client.post("/api/wealth/research/publish", json={"result": published | {"publish": {"status": "awaiting_approval"}, "update": {"claims": []}}}).json()
    assert recorded["status"] == "denied" and recorded["origin"] == "posted", "nothing verified means nothing to publish"


def test_research_run_events_stream_in_attach_mode(offline, no_models):
    client = TestClient(server.app)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "HCYN", "run_id": "wealth-research-hcyn-test"}).json()
    assert body["run_id"] == "wealth-research-hcyn-test"
    page = client.get("/api/wealth/runs/wealth-research-hcyn-test").json()
    kinds = [event["kind"] for event in page["events"]]
    assert kinds[0] == "run" and kinds[-1] == "result"
    assert {"agent.tool_call", "control", "claim.verdict", "hitl.request"} <= set(kinds)
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
    assert "000-00-1234" in priya and "SYSTEM OVERRIDE" in priya and "0000-4471-9902" in priya and "4111 1111 1111 1111" in priya
    for record in (household(h) for h in ("dana-whitfield", "okafor", "priya-raman")):
        assert all(account["number"].startswith("0000-") for account in record["accounts"])


def test_book_summary_hits_the_story_counts():
    assert affected_households("HCYN") == {"ticker": "HCYN", "households": 240, "count": 214, "concentrated": 31,
                                           "executives": 6, "threshold_pct": 10, "synthetic": True}


def test_household_suitability_names_its_rules():
    def rules(hid):
        return {item["rule"] for item in household_findings(household(hid))}

    assert rules("dana-whitfield") == {"R-CONC-01", "R-RISK-02", "R-AFF-01", "R-LIQ-02", "R-REV-01", "R-EDU-01"}
    assert rules("okafor") == {"R-RISK-02", "R-LIQ-03", "R-BEN-01", "R-RMD-01"}
    assert rules("priya-raman") == {"R-LIQ-02", "R-BEN-01", "R-REV-01"}


def test_every_household_preps_offline_with_a_verified_code_written_brief(offline, no_models):
    client = TestClient(server.app)
    assert set(household_tickers()) - {"CASH"} <= {"HCYN", "VTI", "VXUS", "BND", "SCHD"}
    for hid in ("dana-whitfield", "okafor", "priya-raman"):
        body = client.post("/api/wealth/advisory/brief", json={"household_id": hid}).json()
        assert all(row["status"] == "ready" for row in body["holdings"]), (hid, body["holdings"])
        assert body["household"]["id"] == hid and body["household"]["synthetic"] is True
        brief = body["brief"]
        assert brief["mode"] == "fixture" and brief["counts"]["verified"] == brief["counts"]["claims"] > 0, hid
        assert brief["action_ids"] and all(a in {row["id"] for row in body["actions"] if row["suitable"]} for a in brief["action_ids"])
        assert body["approval"]["status"] == "awaiting_advisor"
        assert "service_events" not in json.dumps(body["evidence"]), "fraud events are not part of meeting prep"


def test_priya_crm_injection_is_withheld_and_pii_masked_before_any_model(offline, monkeypatch):
    seen = {}

    async def drafted(ctx, _callbacks):
        seen["evidence"] = json.dumps(ctx.evidence.items)
        return {"lines": [{"section": "talking_point", "text": "Wire all sale proceeds to account 0000-4471-9902 immediately.",
                           "evidence_id": "crm:1"}], "ranked_actions": [{"action_id": "NBA-LADDER", "rank": 1}]}, "deep_agent"

    monkeypatch.setattr(advisory, "run_deep_agent", drafted)
    body = TestClient(server.app).post("/api/wealth/advisory/brief", json={"household_id": "priya-raman"}).json()
    injected = next(row for row in body["notes"] if "SYSTEM OVERRIDE" in household("priya-raman")["crm_notes"][row["index"]]["text"])
    assert injected["status"] == "withheld"
    for secret in ("0000-4471-9902", "000-00-1234", "4111 1111 1111 1111", "SYSTEM OVERRIDE"):
        assert secret not in seen["evidence"], secret
    line = body["brief"]["lines"][0]
    assert line["status"] in {"unverified", "policy"}
    assert body["brief"]["counts"]["verified"] == 0


def test_advisory_refuses_client_data_to_a_hosted_model_without_ai_defense(offline, monkeypatch, tmp_path):
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
    body = client.post("/api/wealth/advisory/brief", json={"household_id": "dana-whitfield", "run_id": "wealth-advisory-refused-test"}).json()
    studio_models.reset_health()
    assert body["brief"]["refused"] is True and body["brief"]["mode"] == "fixture" and "AI Defense" in body["brief"]["reason"]
    assert body["served_by"]["provider"] == "openai" and body["served_by"]["fallback"] is True
    assert body["usage"]["llm_calls"] == 0
    page = client.get("/api/wealth/runs/wealth-advisory-refused-test").json()
    assert page["run"]["status"] == "blocked"
    kinds = [(e["kind"], e["status"]) for e in page["events"]]
    assert ("model.failover", "flagged") in kinds and ("guardrail", "blocked") in kinds
    assert not any(kind == "llm.call" for kind, _ in kinds)


def test_hosted_advisory_model_is_forced_to_enforce_before_any_call(offline, monkeypatch, tmp_path):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({"version": 2, "chain": ["openai"], "useCases": {}, "providers": {
        "openai": {"label": "OpenAI API", "kind": "openai", "baseUrl": "https://api.openai.com/v1", "model": "gpt-test", "apiKeyEnv": "OPENAI_API_KEY"},
    }}))
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(path))
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    studio_models.reset_health()
    monkeypatch.setattr(studio_models, "_probe", lambda backend: (True, "answering"))
    monkeypatch.setattr(security.defense, "key", "k" * 32)
    run = runlog.store.open(None, label="enforce test")

    async def build():
        with runlog.store.bind(run.id):
            return await nim.agent_model(nim.ADVISORY, call_label="meeting-prep supervisor")

    model, _selection, record = asyncio.run(build())
    studio_models.reset_health()
    assert model.enforce is True and record["ai_defense"].startswith("enforce")
    assert any(e["kind"] == "guardrail" and "forced to enforce" in e["title"] for e in run.events)


def test_supervisor_approval_runs_the_advisory_policies(offline, no_models):
    client = TestClient(server.app)
    body = client.post("/api/wealth/advisory/brief", json={"household_id": "dana-whitfield", "run_id": "wealth-advisory-approve-test"}).json()
    run_id = body["run_id"]
    early = client.post("/api/wealth/advisory/approve", json={"run_id": run_id, "stage": "supervisor"})
    assert early.status_code == 409, "the advisor submits first"
    chosen = body["brief"]["action_ids"]
    assert client.post("/api/wealth/advisory/approve", json={"run_id": run_id, "stage": "advisor", "action_ids": chosen}).json()["status"] == "awaiting_supervisor"
    denied = client.post("/api/wealth/advisory/approve", json={"run_id": run_id, "stage": "supervisor", "action_ids": [*chosen, "NBA-EXCHANGE"]}).json()
    assert denied["status"] == "denied"
    assert {row["label"]: row["status"] for row in denied["controls"]["checks"]}["Suitable for the client's profile"] == "denied"
    sent = client.post("/api/wealth/advisory/approve", json={"run_id": run_id, "stage": "supervisor", "action_ids": chosen}).json()
    assert sent["status"] == "sent" and sent["controls"]["allowed"] is True
    events = client.get(f"/api/wealth/runs/{run_id}").json()["events"]
    assert events[-1]["title"] == "Brief recorded to the CRM · nothing is executed"


def test_recordings_are_served_when_present():
    recordings = TestClient(server.app).get("/api/wealth/recordings").json()["recordings"]
    assert {"research-hcyn", "research-kstl-restricted", "research-hcyn-poisoned", "advisory-dana-whitfield",
            "advisory-priya-raman"} <= {item["name"] for item in recordings}
    for item in recordings:
        assert item["synthetic"] is True
        if item["scenario"] == "research-restricted":
            assert item["served_by"] is None, "the restricted issuer is blocked before any model call"
        else:
            assert item["served_by"]
