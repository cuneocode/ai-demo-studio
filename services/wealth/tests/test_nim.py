import asyncio
import json
from types import SimpleNamespace

import httpx
import pytest

import nim


def test_defaults_point_at_local_nim(monkeypatch):
    monkeypatch.delenv("NIM_BASE_URL", raising=False)
    monkeypatch.delenv("NIM_MODEL", raising=False)
    monkeypatch.delenv("NEMOTRON_MODEL", raising=False)
    monkeypatch.delenv("OPENAI_API_KEY", raising=False)
    assert nim.nim_base_url() == "http://127.0.0.1:8003/v1"
    assert nim.nim_model() == "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"
    assert nim.nim_api_key() == "not-needed"
    assert nim.models_url() == "http://127.0.0.1:8003/v1/models"


def test_nim_reachable_false_on_error(monkeypatch):
    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def get(self, url):
            raise httpx.ConnectError("down")

    monkeypatch.setattr(nim, "httpx", SimpleNamespace(AsyncClient=Client))
    assert asyncio.run(nim.nim_reachable()) is False


def _registry(tmp_path, monkeypatch, **use_cases):
    path = tmp_path / "models.json"
    path.write_text(json.dumps({
        "version": 1,
        "default": "openai",
        "useCases": use_cases,
        "providers": {
            "openai": {"label": "OpenAI API", "kind": "openai", "baseUrl": "https://api.openai.com/v1",
                       "model": "gpt-5.6-luna", "apiKeyEnv": "OPENAI_API_KEY", "responsesApi": True},
            "sparky": {"label": "Sparky vLLM", "kind": "vllm", "baseUrl": "http://127.0.0.1:8003/v1/",
                       "model": "nemotron", "apiKeyEnv": "VLLM_API_KEY", "responsesApi": False},
        },
    }))
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(path))


def test_studio_registry_selects_backend_per_use_case(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch, **{"client-advisory": "sparky"})
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.delenv("VLLM_API_KEY", raising=False)
    research = nim.chat_model(nim.RESEARCH)
    assert research.model_name == "gpt-5.6-luna"
    assert research.reasoning_effort == "none"
    assert not (research.extra_body or {}).get("chat_template_kwargs")
    advisory = nim.chat_model(nim.ADVISORY)
    assert advisory.model_name == "nemotron"
    assert advisory.extra_body["chat_template_kwargs"]["enable_thinking"] is False
    assert nim.nim_base_url(nim.ADVISORY) == "http://127.0.0.1:8003/v1"
    assert nim.nim_api_key(nim.ADVISORY) == "not-needed"
    assert nim.nim_health(True, nim.ADVISORY)["provider"] == "sparky"


def test_registry_never_reads_unlisted_key_variables(tmp_path, monkeypatch):
    _registry(tmp_path, monkeypatch)
    path = tmp_path / "models.json"
    data = json.loads(path.read_text())
    data["providers"]["openai"]["apiKeyEnv"] = "AIDEFENSE_API_KEY"
    path.write_text(json.dumps(data))
    monkeypatch.setenv("AIDEFENSE_API_KEY", "must-not-leave")
    assert nim.nim_api_key(nim.RESEARCH) == "not-needed"


def test_unreadable_registry_keeps_env_settings(tmp_path, monkeypatch):
    path = tmp_path / "models.json"
    path.write_text("{not json")
    monkeypatch.setenv("STUDIO_MODELS_FILE", str(path))
    monkeypatch.setenv("NIM_MODEL", "from-env")
    assert nim.nim_model() == "from-env"


def test_chat_model_uses_nim(monkeypatch):
    monkeypatch.setenv("NIM_BASE_URL", "http://127.0.0.1:8003/v1")
    monkeypatch.setenv("NIM_MODEL", "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4")
    model = nim.chat_model()
    assert model.temperature == 0
    assert model.disable_streaming is True
    assert model.extra_body["chat_template_kwargs"]["enable_thinking"] is False
    with pytest.raises(RuntimeError):
        model._generate([])
