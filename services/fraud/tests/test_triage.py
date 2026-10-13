import asyncio
import json
import time

import pytest
from fastapi.testclient import TestClient

import agent
import cases
import controls
import runlog
import scorer
import security
import server
import tools
import triage
from neighborhood import get_neighborhood
from reasons import reasons_for
from rules import rules_score
from telemetry import AgentTrace

FIXTURE_IDS = {"cpp-orbit", "card-testing", "ato-illustrative", "clean-grocery", "cnp-verify"}


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("FRAUD_BACKEND", "fixture")
    monkeypatch.setenv("FRAUD_AGENT", "off")
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    monkeypatch.setattr(runlog.store, "cache_dir", None)
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(scorer.scorer, "requested", "fixture")
    monkeypatch.setattr(scorer.scorer, "backend", "fixture")
    monkeypatch.setattr(scorer.scorer, "ready", True)
    with TestClient(server.app) as test_client:  # one event loop for the whole test, so started runs keep running
        yield test_client


def case(case_id: str) -> dict:
    return cases.get_case(case_id, live=False)


def wait_for(client, run_id: str, kind: str, request_id: str | None = None, timeout: float = 20) -> list[dict]:
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        page = client.get(f"/api/fraud/runs/{run_id}").json()
        events = page["events"]
        if any(e["kind"] == kind and (request_id is None or e["data"].get("request_id") == request_id) for e in events):
            return events
        if page["run"]["status"] != "running" and kind != "result":
            break
        time.sleep(0.05)
    raise AssertionError(f"no {kind} event; got {[e['title'] for e in events]}")


# ------------------------------------------------------------------ rules, graph, reasons ----

def test_rules_miss_cpp_and_catch_ato():
    expected = {"cpp-orbit": (120, "approve"), "card-testing": (540, "review"), "ato-illustrative": (740, "decline"),
                "clean-grocery": (10, "approve"), "cnp-verify": (120, "approve")}
    for case_id, (points, decision) in expected.items():
        result = rules_score(case(case_id))
        assert (result["score"], result["decision"]) == (points, decision), case_id
        assert result["sees_network"] is False


def test_neighborhood_is_point_in_time_and_deterministic():
    cpp = case("cpp-orbit")
    graph = get_neighborhood(cpp)
    assert graph == get_neighborhood(cpp)
    assert (graph["cards_seen"], graph["cards_confirmed_fraud"]) == (412, 37)
    paid_at = cpp["at"].replace("Z", "+00:00")
    fraud = [node for node in graph["nodes"] if node["kind"] == "fraud"]
    assert fraud and all(node["confirmed_at"] < paid_at for node in fraud)
    assert graph["temporal_filter"] is True and graph["source"] == "Synthetic neighborhood"
    assert graph["layout"] == "illustrative" and "generated" in graph["layout_note"]


def test_reasons_are_plain_english_and_sorted():
    fixture = scorer.normalize_score(scorer.load_fixture()["cpp-orbit"])
    reasons = reasons_for(fixture["shap"], case("cpp-orbit"))
    assert reasons[0]["text"] == "Merchant linked to 37 cards with confirmed fraud in the last 21 days"
    assert reasons[0]["network"] is True
    values = [abs(item["value"]) for item in reasons]
    assert values == sorted(values, reverse=True)


# ------------------------------------------------------------------------ scorer passthrough ----

def test_scorer_passes_treeshap_explain_and_timing_through():
    score = scorer.normalize_score({"probability": 0.8, "shap": [{"feature": "merchant_neighborhood", "value": 1.2}],
                                    "explain": {"method": "xgboost_treeshap", "units": "log_odds", "base_value": -2.1},
                                    "timing_ms": {"gnn_ms": 3.1, "xgb_ms": 0.4, "total_ms": 4.2}, "device": "cuda"})
    assert score["explain"] == {"method": "xgboost_treeshap", "units": "log_odds", "base_value": -2.1}
    assert score["timing_ms"]["total_ms"] == 4.2 and score["device"] == "cuda"
    assert scorer.backend_label("cache", "2026-10-02T21:00:00+00:00") == "Recorded run · Oct 2, 2026"
    assert scorer.backend_label("fixture") == "Sample scores"


def test_fixture_log_odds_add_up_to_the_probability():
    import math
    for case_id, entry in scorer.load_fixture().items():
        if case_id.startswith("_"):
            continue
        logit = entry["explain"]["base_value"] + sum(item["value"] for item in entry["shap"])
        assert abs(1 / (1 + math.exp(-logit)) - entry["probability"]) < 0.01, case_id


# --------------------------------------------------------------------------------- cases ----

def test_ground_truth_never_reaches_the_browser(tmp_path, monkeypatch):
    live = [{"id": "tabformer-0000001", "label": "Online · $180.34", "account": "****0017-0", "merchant": "Merchant 7912081",
             "amount": 180.34, "raw_channel": "Online Transaction", "scenario": "cpp", "tabformer_label": "fraud",
             "hint": "presenter only", "history": {"merchant_prior_cards": 66, "merchant_prior_fraud_cards": 48}}]
    path = tmp_path / "studio_cases.json"
    path.write_text(json.dumps(live))
    monkeypatch.setenv("FRAUD_CASES", str(path))
    loaded = cases.load_cases(True)[0]
    public = cases.public_case(loaded)
    assert "tabformer_label" not in public and "hint" not in public
    assert public["scenario"] == "cpp" and public["history"]["merchant_prior_fraud_cards"] == 48
    assert loaded["channel"] == "cnp" and loaded["playbook"] == "cpp"
    assert cases.label_reveal(loaded) == "fraud"
    scenario, mapped = cases.scenario_for("cpp-orbit", True)
    assert mapped["id"] == "tabformer-0000001"
    _, ato = cases.scenario_for("ato-illustrative", True)
    assert ato["id"] == "ato-illustrative" and ato["scoreable_by_model"] is False


def test_fixture_cases_are_synthetic_and_scenarios_cover_the_story():
    raw = json.loads(cases.CASES_PATH.read_text())
    assert {item["id"] for item in raw} == FIXTURE_IDS and all(item["synthetic"] for item in raw)
    scenarios = {item["id"]: item for item in cases.load_scenarios()["scenarios"]}
    assert {"cpp-orbit", "card-testing", "ato-illustrative", "clean-grocery", "attack-dispute-injection", "attack-note-pii"} <= set(scenarios)
    assert all(item["case_id"] in FIXTURE_IDS for item in scenarios.values())


# ------------------------------------------------------------------------------ policies ----

def test_take_action_requires_an_analyst_for_irreversible_actions():
    assert controls.take_action("block_and_reissue")["decision"] == "deny"
    assert controls.take_action("block_and_reissue", approved_by="agent", role="agent")["decision"] == "deny"
    allowed = controls.take_action("block_and_reissue", approved_by="Maya (analyst)", role="analyst")
    assert allowed["decision"] == "allow" and allowed["source"] == "local"
    assert controls.take_action("contact_customer")["decision"] == "allow"
    assert controls.take_action("wire_money")["decision"] == "deny"


def test_hosted_controls_are_declared_and_fall_back_to_local_honestly():
    specs = controls.definitions()
    assert set(specs) == set(controls.POLICIES)
    assert all(spec["action"]["decision"] == "deny" and spec["execution"] == "server" for spec in specs.values())
    verdict = asyncio.run(controls.enforce_action("block_and_reissue"))
    assert (verdict["decision"], verdict["source"], verdict["engine_label"]) == ("deny", "local", "Local policy check")
    assert "FRAUD_AGENT_CONTROL=off" in verdict["detail"]
    assert controls.health()["status"] == "local"


def test_a_hosted_deny_wins_even_when_the_local_verdict_allows(monkeypatch):
    class Item:
        def __init__(self, name):
            self.control_name, self.control_execution_id = name, "exec-1"

    class Result:
        errors = None
        matches = [Item("fsi-fraud-take-action-approval-v1")]
        non_matches = []

    async def evaluate(*_args, **_kwargs):
        return Result()

    import types
    fake = types.SimpleNamespace(evaluate_controls=evaluate)
    monkeypatch.setitem(__import__("sys").modules, "agent_control", fake)
    hosted = controls.FraudControls()
    hosted.ready = True
    monkeypatch.setattr(controls, "controls", hosted)
    verdict = asyncio.run(controls.enforce_action("contact_customer"))
    assert (verdict["decision"], verdict["source"], verdict["engine_label"]) == ("deny", "agent_control", "Agent Control")


def test_note_pii_denies_full_card_numbers_and_ssns_and_masks_them():
    verdict = controls.note_pii("Verified card 4111 1111 1111 1111 and SSN 000-12-3456. Customer is fine.")
    assert verdict["decision"] == "deny" and verdict["entities"] == ["card number", "SSN"]
    assert verdict["masked"] == "Verified card ending 1111 and SSN ending 3456. Customer is fine."
    assert controls.note_pii(verdict["masked"])["decision"] == "allow"
    assert controls.note_pii("Order number 1234 5678 9012 3456 is not a card")["decision"] == "allow"


# ---------------------------------------------------------------------------- agent tools ----

def test_agent_tool_wrappers_match_the_deterministic_tools():
    ctx = tools.TriageContext(run_id="fraud-test-tools-1", case=case("cpp-orbit"), scenario={}, trace=AgentTrace("t", "t"))
    names = {tool.name for tool in agent.build_tools(ctx)}
    assert names | {"write_todos"} == agent.TOOL_NAMES


def test_tools_build_cited_evidence_and_policy_denies_agent_actions(monkeypatch):
    monkeypatch.setattr(scorer.scorer, "requested", "fixture")
    monkeypatch.setattr(scorer.scorer, "backend", "fixture")
    monkeypatch.setattr(scorer.scorer, "ready", True)
    run = runlog.store.open("fraud-test-tools-2")
    ctx = tools.TriageContext(run_id=run.id, case=case("cpp-orbit"), scenario={}, trace=AgentTrace("t", "t"))

    async def go():
        await tools.score_payment(ctx)
        await tools.rules_score(ctx)
        await tools.get_neighborhood(ctx)
        await tools.explain(ctx)
        await tools.similar_cases(ctx)
        await tools.fraud_playbook(ctx)
        await tools.draft_disposition(ctx)
        return await tools.propose_action(ctx, "block_and_reissue"), await tools.propose_action(ctx, "flag_merchant")

    blocked, flagged = asyncio.run(go())
    assert {"score", "rules", "neighborhood", "reasons", "similar", "playbook#response", "draft"} <= set(ctx.evidence)
    assert ctx.evidence["draft"]["action"] == "block_and_reissue" and ctx.tool_calls == 9
    assert blocked["decision"] == "deny" and flagged["decision"] == "allow"
    assert ctx.proposals == [{"action": "block_and_reissue", "scope": "this card", "label": "Block and reissue", "policy": "deny"}]
    assert ctx.done == ["flag_merchant"]
    assert "We will never ask for your full card number" in ctx.evidence["draft"]["outreach_script"]


def test_citation_check_counts_points_that_cite_known_evidence():
    evidence = {"score": {}, "rules": {}, "playbook#response": {}}
    result = agent.citation_check("- Rules approve, graph high. [rules] [score]\n- Follow the playbook. [playbook#response]\n- Made up. [web]", evidence)
    assert (result["cited"], result["total"]) == (2, 3)


def test_citation_check_fails_a_figure_the_cited_evidence_does_not_state():
    evidence = {"rules": {"score": 120, "max": 999, "decision": "approve"}, "score": {"probability": 0.74},
                "neighborhood": {"cards_seen": 412, "cards_confirmed_fraud": 37, "window_days": 21}}
    summary = ("- Rules say approve (120/999); the graph says 0.74. [rules] [score]\n"
               "- Graph probability 0.74. [rules]\n"
               "- 37 of 412 cards had fraud in 21 days. [neighborhood]\n"
               "- 58 cards had fraud. [neighborhood]\n"
               "- $286.40 on card ****1188 on 2026-10-02. [score]")
    result = agent.citation_check(summary, evidence, {"amount": 286.4, "account": "****1188", "at": "2026-10-02T21:14:00Z"})
    assert [item["ok"] for item in result["items"]] == [True, False, True, False, True]
    assert result["items"][1]["unsupported"] == ["0.74"] and result["items"][3]["unsupported"] == ["58"]


# -------------------------------------------------------------------------- triage runs ----

def test_triage_run_waits_for_the_analyst_then_acts_under_policy(client):
    run_id = client.post("/api/fraud/runs", json={"scenario": "cpp-orbit", "input": {"score_queue": True}}).json()["run_id"]
    events = wait_for(client, run_id, "hitl.request")
    rows = [e["data"]["queue_row"] for e in events if "queue_row" in e["data"]]
    assert {row["case"]["id"] for row in rows} == FIXTURE_IDS
    assert all("tabformer_label" not in row["case"] for row in rows)
    denied = [e for e in events if e["kind"] == "control" and e["status"] == "denied"]
    assert denied and "requires analyst approval" in denied[0]["title"]
    request = next(e for e in events if e["kind"] == "hitl.request")
    assert [o["id"] for o in request["data"]["options"]] == list(triage.DISPOSITIONS)
    file = request["data"]["case_file"]
    assert file["mode"] == "scripted" and file["served_by"] is None
    assert file["evidence"]["rules"]["decision"] == "approve" and file["evidence"]["score"]["risk_band"] == "high"
    assert client.get(f"/api/fraud/runs/{run_id}").json()["run"]["status"] == "running"

    assert client.post(f"/api/fraud/runs/{run_id}/decision",
                       json={"request_id": "disposition", "decision": "block_and_reissue", "by": "Maya (analyst)"}).status_code == 200
    wait_for(client, run_id, "hitl.request", "bulk_reissue")
    client.post(f"/api/fraud/runs/{run_id}/decision", json={"request_id": "bulk_reissue", "decision": "skip", "by": "Maya (analyst)"})
    events = wait_for(client, run_id, "result")
    allowed = [e["title"] for e in events if e["kind"] == "control" and e["status"] == "allowed"]
    assert "Local policy check · fraud.take_action · Block and reissue · allow · approved by Maya (analyst)" in allowed
    result = client.get(f"/api/fraud/runs/{run_id}").json()["run"]["result"]
    assert result["disposition"] == "block_and_reissue" and result["handoff"] is None
    assert [a["action"] for a in result["actions"]] == ["contact_customer", "block_and_reissue", "flag_merchant"]
    verdict = next(e for e in events if e["kind"] == "claim.verdict")
    assert verdict["status"] == "ok", verdict["body"]
    summary = next(e for e in events if e["kind"] == "agent.message")
    assert summary["title"] == "Analyst summary · scripted (no model)" and summary["data"]["served_by"] is None


def test_a_case_note_checked_during_a_run_counts_in_its_security_summary(client, monkeypatch):
    async def clean(self, messages, stage):
        return {"is_safe": True, "event_id": "", "classifications": []}

    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-only-placeholder")
    monkeypatch.setattr(security.defense, "valid", True)
    monkeypatch.setattr(security.Defense, "_call", clean)

    def checks(note: str | None) -> int:
        run_id = client.post("/api/fraud/runs", json={"scenario": "cpp-orbit", "input": {}}).json()["run_id"]
        wait_for(client, run_id, "hitl.request")
        if note:
            assert client.post("/api/fraud/notes", json={"case_id": "cpp-orbit", "run_id": run_id, "note": note}).json()["saved"] is True
        client.post(f"/api/fraud/runs/{run_id}/decision", json={"request_id": "disposition", "decision": "contact_customer", "by": "Maya (analyst)"})
        wait_for(client, run_id, "result")
        return client.get(f"/api/fraud/runs/{run_id}").json()["run"]["result"]["security"]["checks"]

    assert checks("Customer confirms the purchase.") == checks(None) + 1


def test_escalation_builds_the_sar_handoff(client):
    run_id = client.post("/api/fraud/runs", json={"scenario": "cpp-orbit", "input": {}}).json()["run_id"]
    wait_for(client, run_id, "hitl.request")
    client.post(f"/api/fraud/runs/{run_id}/decision",
                json={"request_id": "disposition", "decision": "escalate", "by": "Maya (analyst)", "note": "Customer denies the charge."})
    wait_for(client, run_id, "result")
    result = client.get(f"/api/fraud/runs/{run_id}").json()["run"]["result"]
    assert [a["action"] for a in result["actions"]] == ["contact_customer", "block_and_reissue", "escalate"]
    handoff = result["handoff"]
    assert handoff["kind"] == "fraud-case" and handoff["customerId"] == "chuck-robbins" and handoff["caseId"] == "cpp-orbit"
    assert handoff["disposition"] == "escalate" and handoff["runId"] == run_id and handoff["score"] == 0.74
    assert {"id", "createdAt", "title", "summary", "evidence", "transactions"} <= set(handoff)
    assert all(set(item) == {"label", "value", "source"} for item in handoff["evidence"])
    assert any(item["label"] == "Analyst note" for item in handoff["evidence"])
    payment = handoff["transactions"][-1]
    assert (payment["amount"], payment["merchant"], payment["channel"]) == (286.4, "Orbit Digital Goods", "card_not_present")
    assert payment["at"].startswith("2026-10-02")
    customer = json.loads((cases.DATA.parents[2] / "fixtures" / "customers" / "lifecycle-customer.json").read_text())
    assert customer["id"] == handoff["customerId"]


def test_injected_dispute_note_is_withheld_when_ai_defense_blocks(client, monkeypatch):
    async def blocked(self, messages, stage):
        if stage == "dispute_text":
            return {"is_safe": False, "event_id": "evt-test-inj", "classifications": ["SECURITY_VIOLATION"],
                    "rules": [{"rule_name": "Prompt Injection"}]}
        return {"is_safe": True, "event_id": "evt-test-ok", "classifications": []}

    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-only-placeholder")
    monkeypatch.setattr(security.defense, "valid", True)
    monkeypatch.setattr(security.Defense, "_call", blocked)
    run_id = client.post("/api/fraud/runs", json={"scenario": "attack-dispute-injection", "input": {}}).json()["run_id"]
    events = wait_for(client, run_id, "hitl.request")
    guard = next(e for e in events if e["kind"] == "guardrail")
    assert guard["status"] == "blocked" and guard["title"] == "AI Defense · cardholder dispute note · Prompt Injection · blocked"
    file = next(e for e in events if e["kind"] == "hitl.request")["data"]["case_file"]
    assert file["dispute"]["withheld"] is True
    assert all(p["action"] != "close_case" for p in file["proposals"])
    client.post(f"/api/fraud/runs/{run_id}/decision", json={"request_id": "disposition", "decision": "contact_customer", "by": "Maya (analyst)"})
    wait_for(client, run_id, "result")


def test_notes_with_pii_are_refused_and_the_masked_note_saves(client):
    refused = client.post("/api/fraud/notes", json={"case_id": "cpp-orbit", "note": "Card 4111 1111 1111 1111, SSN 000-12-3456"}).json()
    assert refused["saved"] is False and refused["policy"]["decision"] == "deny"
    assert refused["masked"] == "Card ending 1111, SSN ending 3456"
    saved = client.post("/api/fraud/notes", json={"case_id": "cpp-orbit", "note": refused["masked"]}).json()
    assert saved["saved"] is True and saved["masked"] is None


def test_model_card_is_never_invented(client, monkeypatch, tmp_path):
    monkeypatch.setattr(server, "MODEL_CARDS", (tmp_path / "missing.json", tmp_path / "also-missing.json"))
    card = client.get("/api/fraud/model-card").json()
    assert card["status"] == "not_measured" and card["tag"] == "Not measured yet — run on Sparky" and card["headline"] == {}
    measured = tmp_path / "model_card.json"
    measured.write_text(json.dumps({"schema_version": 1, "status": "partial", "tag": "Measured · TabFormer test window · synthetic data",
                                    "headline": {"alert_rate": 0.005, "score_p50_ms": {"cuda": 4.1, "cpu": None}},
                                    "missing": ["bench.json"], "model": {"id": "gnn-xgb-tabformer", "config_yaml": "x"}}))
    monkeypatch.setattr(server, "MODEL_CARDS", (measured, tmp_path / "x.json"))
    card = client.get("/api/fraud/model-card").json()
    assert card["status"] == "partial" and card["headline"]["score_p50_ms"]["cpu"] is None
    assert "config_yaml" not in card["model"] and card["missing"] == ["bench.json"]


def test_health_reports_agent_controls_and_model_card(client):
    health = client.get("/api/fraud/health").json()
    assert health["agent"]["status"] == "disabled"
    assert health["controls"]["status"] == "local"
    assert health["model_card"] in {"not_measured", "partial", "measured"}
    assert health["galileo"] == health["splunk"]["galileo"]
    scenarios = client.get("/api/fraud/scenarios").json()
    assert scenarios["synthetic"] is True and len(scenarios["scenarios"]) >= 6
