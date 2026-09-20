from pathlib import Path

import pytest
from fastapi.testclient import TestClient

import scorer
import security
import server


@pytest.fixture
def client(monkeypatch):
    monkeypatch.setenv("FRAUD_BACKEND", "fixture")
    monkeypatch.setenv("FRAUD_ENABLE_NARRATIVE", "false")
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
        "txn-clean-pos", "txn-compromised-merchant", "txn-mule-ach", "txn-cnp-review", "txn-subscription",
    }


def test_fixture_scores_and_unknown_case(client):
    clean = client.post("/api/fraud/score", json={"case_id": "txn-clean-pos"}).json()
    assert clean["decision"] == "clear"
    assert clean["probability"] == 0.08
    assert clean["narrative"]["status"] == "disabled"
    assert clean["shap"][0]["feature"]
    hold = client.post("/api/fraud/score", json={"case_id": "txn-compromised-merchant"}).json()
    assert hold["decision"] == "hold"
    review = client.post("/api/fraud/score", json={"case_id": "txn-cnp-review"}).json()
    assert review["decision"] == "review"
    missing = client.post("/api/fraud/score", json={"case_id": "nope"})
    assert missing.status_code == 404


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
    response = client.post("/api/fraud/score", json={"case_id": "txn-mule-ach", "include_narrative": True})
    assert response.status_code == 200
    body = response.json()
    assert body["probability"] == 0.67
    assert body["decision"] == "hold"
    assert body["narrative"]["status"] == "blocked"
    assert body["narrative"]["text"] is None
    assert body["security"]["status"] == "blocked"


def test_forced_backend_unavailable(client, monkeypatch):
    monkeypatch.setattr(scorer.scorer, "ready", False)
    monkeypatch.setattr(scorer.scorer, "detail", "Triton /v2/health/ready is not reachable.")
    response = client.post("/api/fraud/score", json={"case_id": "txn-clean-pos"})
    assert response.status_code == 503


def test_cache_backend_reads_export(tmp_path, monkeypatch):
    cache = tmp_path / "scores.json"
    cache.write_text('{"txn-clean-pos": {"probability": 0.22, "shap": [{"feature": "amount", "value": 0.1}]}}')
    monkeypatch.setattr(scorer, "CACHE_PATH", cache)
    assert scorer.load_cache()["txn-clean-pos"]["probability"] == 0.22
    assert Path(cache).is_file()
