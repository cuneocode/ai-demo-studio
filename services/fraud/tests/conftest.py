import pytest


@pytest.fixture(autouse=True)
def no_studio_models(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(tmp_path / "models.json"))


@pytest.fixture(autouse=True)
def no_hosted_services(monkeypatch):
    """server.py loads the repo .env; tests never send traces or reach Agent Control."""
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    monkeypatch.setenv("FRAUD_AGENT_CONTROL", "off")
    import controls
    monkeypatch.setattr(controls, "controls", controls.FraudControls())
