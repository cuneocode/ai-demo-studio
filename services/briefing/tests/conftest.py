from pathlib import Path

import pytest

FIXTURES = Path(__file__).resolve().parent / "fixtures"


@pytest.fixture
def fixtures() -> Path:
    return FIXTURES


@pytest.fixture(autouse=True)
def no_studio_models(monkeypatch, tmp_path):
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(tmp_path / "models.json"))


@pytest.fixture(autouse=True)
def no_git_contact(monkeypatch):
    import edgar

    monkeypatch.setattr(edgar, "git_contact", lambda: "")
