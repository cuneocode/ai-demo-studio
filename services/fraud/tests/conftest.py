import pytest


@pytest.fixture(autouse=True)
def no_studio_models(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(tmp_path / "models.json"))
