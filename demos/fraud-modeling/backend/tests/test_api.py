from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import runlog
import scorer
import security
import server


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("FRAUD_BACKEND", "fixture")
    monkeypatch.setenv("FRAUD_ENABLE_NARRATIVE", "false")
    monkeypatch.setattr(runlog.store, "cache_dir", None)
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(scorer.scorer, "requested", "fixture")
    monkeypatch.setattr(scorer.scorer, "backend", "fixture")
    monkeypatch.setattr(scorer.scorer, "ready", True)
    monkeypatch.setattr(scorer.scorer, "detail", "fixture")
    return TestClient(server.app)


def test_health_and_cases(client):
    health = client.get("/api/fraud/health").json()
    assert health["ready"] is True
    assert health["backend"] == "fixture"
    assert health["cases"] == 5
    cases = client.get("/api/fraud/cases").json()["cases"]
    assert {item["id"] for item in cases} == {
        "cpp-orbit", "card-testing", "ato-illustrative", "clean-grocery", "cnp-verify",
    }


def test_fixture_scores_and_unknown_case(client):
    clean = client.post("/api/fraud/score", json={"case_id": "clean-grocery"}).json()
    assert clean["decision"] == "clear"
    assert clean["probability"] == 0.06
    assert clean["narrative"]["status"] == "disabled"
    assert clean["shap"][0]["feature"]
    hold = client.post("/api/fraud/score", json={"case_id": "cpp-orbit"}).json()
    assert hold["decision"] == "hold"
    review = client.post("/api/fraud/score", json={"case_id": "cnp-verify"}).json()
    assert review["decision"] == "review"
    missing = client.post("/api/fraud/score", json={"case_id": "nope"})
    assert missing.status_code == 404


def test_score_reports_band_action_and_backend(client):
    body = client.post("/api/fraud/score", json={"case_id": "cpp-orbit"}).json()
    assert (body["risk_band"], body["risk_label"]) == ("high", "High risk")
    assert body["suggested_action"] == "Contact customer, then block and reissue"
    assert (body["backend"], body["backend_label"], body["synthetic"]) == ("fixture", "Sample scores", True)
    assert body["shap"][0]["label"] == "Merchant's network of linked cards"
    assert client.post("/api/fraud/score", json={"case_id": "cnp-verify"}).json()["risk_band"] == "elevated"
    assert client.post("/api/fraud/score", json={"case_id": "clean-grocery"}).json()["risk_band"] == "low"


def test_presenter_hints_never_reach_the_browser(client):
    cases = client.get("/api/fraud/cases").json()["cases"]
    assert all("hint" not in item for item in cases)
    body = client.post("/api/fraud/score", json={"case_id": "clean-grocery"}).json()
    assert "hint" not in body["case"]


def test_score_emits_a_run_under_the_client_run_id(client):
    body = client.post("/api/fraud/score", json={"case_id": "cpp-orbit", "run_id": "fraud-test-run-001"}).json()
    assert body["run_id"] == "fraud-test-run-001"
    page = client.get("/api/fraud/runs/fraud-test-run-001").json()
    assert page["run"]["status"] == "completed"
    assert page["run"]["result"]["risk_band"] == "high"
    events = page["events"]
    assert [event["kind"] for event in events] == ["run", "agent.tool_call", "tool.result", "agent.tool_call", "tool.result", "result"]
    assert all(event["component"] == "fraud-triage" for event in events)
    scored = events[4]
    assert scored["title"].startswith("Sample scores · probability 0.74")
    assert scored["data"]["backend"] == "fixture" and scored["data"]["synthetic"] is True
    assert events[-1]["title"] == "High risk · Contact customer, then block and reissue"
    assert client.get("/api/fraud/runs/fraud-test-run-001?after=5").json()["events"][0]["kind"] == "result"
    assert client.get("/api/fraud/runs/fraud-unknown-999").status_code == 404
    again = client.post("/api/fraud/score", json={"case_id": "clean-grocery", "run_id": "fraud-test-run-001"}).json()
    assert again["run_id"] != "fraud-test-run-001"


def test_recordings_are_listed_and_synthetic(client):
    listed = client.get("/api/fraud/recordings").json()["recordings"]
    assert listed and all(item["synthetic"] for item in listed)
    doc = client.get(f"/api/fraud/recordings/{listed[0]['name']}").json()
    assert doc["events"][0]["kind"] == "run" and doc["events"][-1]["kind"] == "result"


def test_score_survives_blocked_narrative(client, monkeypatch):
    async def blocked(*_args, **_kwargs):
        run = security.security_run.get()
        if run:
            run.checks += 1
            run.blocked += 1
        raise security.DefenseBlocked("AI Defense blocked the narrative. Score was still released.")

    monkeypatch.setenv("FRAUD_ENABLE_NARRATIVE", "true")
    monkeypatch.setenv("FRAUD_NARRATIVE_API_KEY", "not-needed")
    monkeypatch.setenv("FRAUD_NARRATIVE_BASE_URL", "http://127.0.0.1:8003/v1")
    monkeypatch.setenv("FRAUD_NARRATIVE_MODEL", "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4")
    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "inspect", blocked)
    response = client.post("/api/fraud/score", json={"case_id": "card-testing", "include_narrative": True, "run_id": "fraud-test-block-1"})
    assert response.status_code == 200
    events = client.get("/api/fraud/runs/fraud-test-block-1").json()["events"]
    assert any(event["kind"] == "run" and event["status"] == "flagged" and "omitted" in event["title"] for event in events)
    body = response.json()
    assert body["probability"] == 0.91
    assert body["decision"] == "hold"
    assert body["narrative"]["status"] == "blocked"
    assert body["narrative"]["text"] is None
    assert body["security"]["status"] == "blocked"


def test_forced_backend_unavailable(client, monkeypatch):
    monkeypatch.setattr(scorer.scorer, "ready", False)
    monkeypatch.setattr(scorer.scorer, "detail", "Triton /v2/health/ready is not reachable.")
    response = client.post("/api/fraud/score", json={"case_id": "clean-grocery"})
    assert response.status_code == 503


def test_cache_backend_reads_export(tmp_path, monkeypatch):
    cache = tmp_path / "scores.json"
    cache.write_text('{"clean-grocery": {"probability": 0.22, "shap": [{"feature": "amount", "value": 0.1}]}}')
    monkeypatch.setattr(scorer, "CACHE_PATH", cache)
    assert scorer.load_cache()["clean-grocery"]["probability"] == 0.22
    assert Path(cache).is_file()


def test_generated_narrative_reports_provider_usage(client, monkeypatch):
    class Response:
        def raise_for_status(self):
            return None

        def json(self):
            return {"choices": [{"message": {"content": "Shared merchant risk dominates."}}],
                    "usage": {"prompt_tokens": 120, "completion_tokens": 18}}

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, *args, **kwargs):
            return Response()

    import narrative
    monkeypatch.setenv("FRAUD_ENABLE_NARRATIVE", "true")
    monkeypatch.setenv("FRAUD_NARRATIVE_API_KEY", "not-needed")
    monkeypatch.setenv("FRAUD_NARRATIVE_BASE_URL", "http://127.0.0.1:8003/v1")
    monkeypatch.setattr(narrative.httpx, "AsyncClient", Client)
    body = client.post("/api/fraud/score", json={"case_id": "card-testing", "include_narrative": True, "run_id": "fraud-test-narr-01"}).json()
    assert body["narrative"]["status"] == "generated"
    assert body["narrative"]["usage"] == {"llm_calls": 1, "input_tokens": 120, "output_tokens": 18}
    events = client.get("/api/fraud/runs/fraud-test-narr-01").json()["events"]
    call = next(event for event in events if event["kind"] == "llm.call")
    assert call["data"]["served_by"]["model"] and call["data"]["input_tokens"] == 120 and call["status"] == "ok"
    off = client.post("/api/fraud/score", json={"case_id": "card-testing"}).json()
    assert "usage" not in off["narrative"]


def test_ai_defense_verdicts_land_on_the_timeline(client, monkeypatch):
    class Response:
        def __init__(self, body):
            self.body = body

        def raise_for_status(self):
            return None

        def json(self):
            return self.body

    class Client:
        def __init__(self, *args, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            return None

        async def post(self, url, **kwargs):
            if "aidefense" in url:
                return Response({"is_safe": True, "event_id": "evt-test-1", "classifications": []})
            return Response({"choices": [{"message": {"content": "Merchant network risk dominates."}}]})

    import narrative
    monkeypatch.setenv("FRAUD_ENABLE_NARRATIVE", "true")
    monkeypatch.setenv("FRAUD_NARRATIVE_API_KEY", "not-needed")
    monkeypatch.setenv("FRAUD_NARRATIVE_BASE_URL", "http://127.0.0.1:8003/v1")
    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-only-placeholder")
    monkeypatch.setattr(security.defense, "valid", True)
    monkeypatch.setattr(narrative.httpx, "AsyncClient", Client)
    body = client.post("/api/fraud/score", json={"case_id": "cpp-orbit", "include_narrative": True,
                                                 "run_id": "fraud-test-guard-1"}).json()
    assert body["narrative"]["status"] == "generated" and body["security"]["checks"] == 2
    events = client.get("/api/fraud/runs/fraud-test-guard-1").json()["events"]
    guards = [event for event in events if event["kind"] == "guardrail"]
    assert [event["status"] for event in guards] == ["allowed", "allowed"]
    assert guards[0]["title"] == "AI Defense · analyst-summary prompt · clean"
    assert guards[0]["data"]["event_id"] == "evt-test-1"
    kinds = [event["kind"] for event in events]
    assert kinds.index("guardrail") < kinds.index("llm.call") < kinds.index("agent.message") < kinds.index("result")
