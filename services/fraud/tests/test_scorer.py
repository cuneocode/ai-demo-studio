import pytest

from scorer import ScoreError, decision_for, normalize_score, threshold


def test_decision_bands(monkeypatch):
    monkeypatch.setenv("FRAUD_THRESHOLD", "0.5")
    assert decision_for(0.08, 0.5) == "clear"
    assert decision_for(0.41, 0.5) == "review"
    assert decision_for(0.74, 0.5) == "hold"


def test_threshold_clamps(monkeypatch):
    monkeypatch.setenv("FRAUD_THRESHOLD", "9")
    assert threshold() == 0.95
    monkeypatch.setenv("FRAUD_THRESHOLD", "bad")
    assert threshold() == 0.5


def test_normalize_rejects_bad_probability():
    with pytest.raises(ScoreError):
        normalize_score({"probability": 1.4, "shap": []})
