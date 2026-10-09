import asyncio
import json

import httpx
import pytest

import nim
import security
import studio_models


@pytest.fixture(autouse=True)
def isolated(tmp_path, monkeypatch):
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(tmp_path / "absent.json"))
    for name in ("SPARKY_VLLM_BASE_URL", "NIM_BASE_URL", "SPARKY_VLLM_MODEL", "NIM_MODEL", "MODEL_NAME", "VLLM_API_KEY"):
        monkeypatch.delenv(name, raising=False)
    studio_models.reset_health()
    yield
    studio_models.reset_health()


def _registry(tmp_path, monkeypatch, chain=("sparky", "openai"), **use_cases):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({
        "version": 2,
        "chain": list(chain),
        "useCases": use_cases,
        "providers": {
            "openai": {"label": "OpenAI API", "kind": "openai", "baseUrl": "https://api.openai.com/v1",
                       "model": "gpt-5.6-luna", "apiKeyEnv": "OPENAI_API_KEY", "responsesApi": True},
            "sparky": {"label": "Sparky vLLM", "kind": "vllm", "baseUrl": "http://127.0.0.1:8003/v1/",
                       "model": "nemotron", "apiKeyEnv": "VLLM_API_KEY", "responsesApi": False},
        },
    }))
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(path))


def _health(monkeypatch, **up):
    monkeypatch.setattr(studio_models, "_probe", lambda backend: (up.get(backend.provider, False), "answering" if up.get(backend.provider) else "unreachable"))


def test_without_saved_settings_defaults_are_openai_when_sparky_is_not_in_env(monkeypatch):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    assert nim.nim_base_url() == "https://api.openai.com/v1"
    monkeypatch.setenv("SPARKY_VLLM_BASE_URL", "http://10.0.0.5:8000/v1")
    assert nim.nim_base_url() == "http://10.0.0.5:8000/v1"
    assert nim.models_url() == "http://10.0.0.5:8000/v1/models"


def test_reachable_false_when_no_backend_answers(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _health(monkeypatch)
    assert asyncio.run(nim.nim_reachable()) is False
    assert nim.nim_health(False)["status"] == "down"


def test_chain_falls_back_to_openai_when_sparky_is_down(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _health(monkeypatch, openai=True)
    assert asyncio.run(nim.nim_reachable()) is True
    health = nim.nim_health(True)
    assert health["provider"] == "openai" and health["fallback"] is True
    model = nim.chat_model(nim.RESEARCH)
    assert model.model_name == "gpt-5.6-luna"
    assert model.reasoning_effort == "none"


def test_sparky_answers_first_with_thinking_disabled(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    _health(monkeypatch, sparky=True, openai=True)
    model = nim.chat_model(nim.ADVISORY)
    assert model.model_name == "nemotron"
    assert model.extra_body["chat_template_kwargs"]["enable_thinking"] is False
    assert model.temperature == 0 and model.disable_streaming is True
    with pytest.raises(RuntimeError):
        model._generate([])


def test_registry_never_reads_unlisted_key_variables(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch, chain=("openai",))
    path = tmp_path / "models.json"
    data = json.loads(path.read_text())
    data["providers"]["openai"]["apiKeyEnv"] = "AIDEFENSE_API_KEY"
    path.write_text(json.dumps(data))
    monkeypatch.setenv("AIDEFENSE_API_KEY", "must-not-leave")
    backend = studio_models.resolve_chain(nim.RESEARCH)[0]
    assert backend.api_key == ""


def _run_structured(use_case, monkeypatch, outcomes):
    calls = []

    class Fake:
        def __init__(self, model_name, enforce):
            self.model_name, self.enforce = model_name, enforce

        def with_structured_output(self, _schema, **_kwargs):
            return self

        async def ainvoke(self, _messages, config=None):
            calls.append((self.model_name, self.enforce))
            outcome = outcomes.pop(0)
            if isinstance(outcome, Exception):
                raise outcome
            return outcome

    monkeypatch.setattr(nim, "chat_model", lambda _use_case, selection, enforce=False: Fake(selection.backend.model, enforce))
    holder = {}
    token = nim.served.set(holder)
    try:
        result = asyncio.run(nim.structured(use_case, object, [], {}))
    finally:
        nim.served.reset(token)
    return result, holder, calls


def test_structured_retries_once_on_the_next_backend_after_a_connect_error(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _health(monkeypatch, sparky=True, openai=True)
    result, holder, calls = _run_structured(nim.RESEARCH, monkeypatch, [httpx.ConnectError("down"), "ok"])
    assert result == "ok"
    assert calls == [("nemotron", False), ("gpt-5.6-luna", False)]
    assert holder["provider"] == "openai" and holder["fallback"] is True
    assert "Sparky vLLM failed during the call" in holder["reason"]


def test_advisory_refuses_a_hosted_model_without_ai_defense(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _health(monkeypatch, openai=True)
    monkeypatch.setattr(security.defense, "key", "")
    with pytest.raises(nim.EgressRefused) as refused:
        _run_structured(nim.ADVISORY, monkeypatch, ["never"])
    assert "Cisco AI Defense is not configured" in str(refused.value)


def test_advisory_forces_enforce_for_a_hosted_model(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _health(monkeypatch, openai=True)
    monkeypatch.setattr(security.defense, "key", "k" * 32)
    result, holder, calls = _run_structured(nim.ADVISORY, monkeypatch, ["brief"])
    assert result == "brief"
    assert calls == [("gpt-5.6-luna", True)]
    assert holder["egress"] == "require_ai_defense" and holder["ai_defense"].startswith("enforce")


def test_research_uses_a_hosted_model_without_forcing_inspection(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    _health(monkeypatch, openai=True)
    monkeypatch.setattr(security.defense, "key", "")
    _, holder, calls = _run_structured(nim.RESEARCH, monkeypatch, ["note"])
    assert calls == [("gpt-5.6-luna", False)]
    assert holder["ai_defense"] is None
