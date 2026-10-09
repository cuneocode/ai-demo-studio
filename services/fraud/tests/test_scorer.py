import asyncio
import json

import pytest

import scorer as scorer_module
from scorer import (ScoreError, Scorer, decision_for, normalize_score, risk_band, suggested_action, threshold)

CASE = {"id": "cpp-orbit"}


def offline(monkeypatch, tmp_path, cache: dict | None = None):
    """No sidecar, no Triton, and a cache file only when given."""
    async def down(_self):
        return False

    monkeypatch.delenv("FRAUD_BACKEND", raising=False)
    monkeypatch.setattr(Scorer, "_production_ready", down)
    monkeypatch.setattr(Scorer, "_triton_ready", down)
    cache_path = tmp_path / "scores.json"
    if cache is not None:
        cache_path.write_text(json.dumps(cache))
    monkeypatch.setattr(scorer_module, "CACHE_PATH", cache_path)
    monkeypatch.setattr(scorer_module, "RECORDED_PATH", tmp_path / "recorded_scores.json")
    scorer = Scorer()
    asyncio.run(scorer.resolve(force=True))
    return scorer


def test_decision_bands(monkeypatch):
    monkeypatch.setenv("FRAUD_THRESHOLD", "0.5")
    assert decision_for(0.08, 0.5) == "clear"
    assert decision_for(0.41, 0.5) == "review"
    assert decision_for(0.74, 0.5) == "hold"


def test_risk_bands_and_actions():
    assert [risk_band(p, 0.5) for p in (0.08, 0.41, 0.74)] == ["low", "elevated", "high"]
    assert suggested_action("high") == "Contact customer, then block and reissue"
    assert all("hold" not in suggested_action(band).lower() for band in ("high", "elevated", "low"))


def test_threshold_clamps(monkeypatch):
    monkeypatch.setenv("FRAUD_THRESHOLD", "9")
    assert threshold() == 0.95
    monkeypatch.setenv("FRAUD_THRESHOLD", "bad")
    assert threshold() == 0.5


def test_normalize_rejects_bad_probability():
    with pytest.raises(ScoreError):
        normalize_score({"probability": 1.4, "shap": []})


def test_normalize_adds_plain_english_labels():
    shap = normalize_score({"probability": 0.5, "shap": [
        {"feature": "merchant_neighborhood", "value": 0.4}, {"feature": "Some_new_group", "value": -0.1}]})["shap"]
    assert [item["label"] for item in shap] == ["Merchant's network of linked cards", "Some new group"]
    assert [item["direction"] for item in shap] == ["risk", "protective"]


def test_fixture_scores_live_in_data_file():
    fixtures = scorer_module.load_fixture()
    assert {key for key in fixtures if not key.startswith("_")} == {"cpp-orbit", "card-testing", "ato-illustrative", "clean-grocery", "cnp-verify"}
    assert fixtures["cpp-orbit"]["probability"] == 0.74


def test_auto_without_sidecar_or_cache_falls_back_to_fixture(monkeypatch, tmp_path):
    scorer = offline(monkeypatch, tmp_path)
    assert scorer.backend == "fixture"
    assert scorer.ready is True
    health = scorer.health()
    assert health["sidecar"]["status"] == "down" and health["backend_label"] == "Sample scores"
    result = asyncio.run(scorer.score(CASE))
    assert result["backend"] == "fixture" and result["probability"] == 0.74 and result["recorded_at"] is None


def test_auto_with_scores_cache_uses_cache(monkeypatch, tmp_path):
    scorer = offline(monkeypatch, tmp_path, {CASE["id"]: {
        "probability": 0.81, "shap": [{"feature": "merchant_neighborhood", "value": 0.5}], "recorded_at": "2026-10-02T21:00:00+00:00"}})
    assert scorer.backend == "cache" and scorer.ready is True
    assert scorer.health()["recorded_at"] == "2026-10-02T21:00:00+00:00"
    result = asyncio.run(scorer.score(CASE))
    assert (result["backend"], result["probability"], result["recorded_at"]) == ("cache", 0.81, "2026-10-02T21:00:00+00:00")


def test_cache_missing_a_case_falls_through_to_fixture(monkeypatch, tmp_path):
    scorer = offline(monkeypatch, tmp_path, {"some-other-case": {"probability": 0.2, "shap": []}})
    result = asyncio.run(scorer.score(CASE))
    assert result["backend"] == "fixture"
    assert [item["backend"] for item in result["fallback"]] == ["cache"]


def test_live_failure_mid_request_falls_through(monkeypatch, tmp_path):
    scorer = offline(monkeypatch, tmp_path)
    scorer.live_ready = True

    async def broken(_url, _payload):
        raise ScoreError("The live GNN sidecar did not return a usable result.")

    monkeypatch.setattr(scorer, "_score_http", broken)
    result = asyncio.run(scorer.score(CASE))
    assert result["backend"] == "fixture"
    assert [item["backend"] for item in result["fallback"]] == ["live"]


def test_live_sidecar_answers_first(monkeypatch, tmp_path):
    async def up(_self):
        return True

    offline(monkeypatch, tmp_path)
    monkeypatch.setattr(Scorer, "_production_ready", up)
    scorer = Scorer()
    asyncio.run(scorer.resolve(force=True))
    assert (scorer.backend, scorer.engine) == ("live", "sidecar")

    async def live(_url, _payload):
        return normalize_score({"probability": 0.9, "shap": []})

    monkeypatch.setattr(scorer, "_score_http", live)
    result = asyncio.run(scorer.score(CASE))
    assert (result["backend"], result["backend_label"], result["engine"]) == ("live", "GNN on Sparky (live)", "sidecar")


def test_forced_backend_does_not_fall_back(monkeypatch, tmp_path):
    offline(monkeypatch, tmp_path)
    monkeypatch.setenv("FRAUD_BACKEND", "production")
    scorer = Scorer()
    asyncio.run(scorer.resolve(force=True))
    assert scorer.ready is False and scorer.chain() == []
