import asyncio
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


def test_chat_model_uses_nim(monkeypatch):
    monkeypatch.setenv("NIM_BASE_URL", "http://127.0.0.1:8003/v1")
    monkeypatch.setenv("NIM_MODEL", "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4")
    model = nim.chat_model()
    assert model.temperature == 0
    assert model.disable_streaming is True
    assert model.extra_body["chat_template_kwargs"]["enable_thinking"] is False
    with pytest.raises(RuntimeError):
        model._generate([])
