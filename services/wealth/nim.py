"""LangChain ChatOpenAI for the wealth use cases. ainvoke only. Temperature 0.

The endpoint is the studio's Model backends choice for each use case; without one,
the local NIM from .env.
"""
from __future__ import annotations

import os
import sys
from pathlib import Path
from urllib.parse import urlparse

import httpx
from langchain_openai import ChatOpenAI

from security import defense, inspection_messages

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "llm"))
from studio_models import resolve  # noqa: E402

DEFAULT_NIM_BASE = "http://127.0.0.1:8003/v1"
DEFAULT_NIM_MODEL = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"
RESEARCH = "market-research"
ADVISORY = "client-advisory"


def nim_base_url(use_case: str = RESEARCH) -> str:
    backend = resolve(use_case)
    return backend.base_url if backend else (os.getenv("NIM_BASE_URL") or DEFAULT_NIM_BASE).rstrip("/")


def nim_model(use_case: str = RESEARCH) -> str:
    backend = resolve(use_case)
    return backend.model if backend else os.getenv("NIM_MODEL") or os.getenv("NEMOTRON_MODEL") or DEFAULT_NIM_MODEL


def nim_api_key(use_case: str = RESEARCH) -> str:
    backend = resolve(use_case)
    if backend:
        return backend.api_key or "not-needed"
    # The OpenAI key goes only to OpenAI, never to a local or third-party endpoint.
    openai_key = os.getenv("OPENAI_API_KEY") if urlparse(nim_base_url(use_case)).hostname == "api.openai.com" else None
    return os.getenv("NIM_API_KEY") or openai_key or "not-needed"


def models_url(use_case: str = RESEARCH) -> str:
    base = nim_base_url(use_case)
    return f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"


async def nim_reachable(use_case: str = RESEARCH) -> bool:
    key = nim_api_key(use_case)
    headers = {} if key == "not-needed" else {"Authorization": f"Bearer {key}"}
    try:
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=False) as client:
            response = await client.get(models_url(use_case), headers=headers)
            response.raise_for_status()
            body = response.json()
            return isinstance(body, dict) and ("data" in body or "models" in body or body)
    except Exception:
        return False


def nim_health(reachable: bool, use_case: str = RESEARCH) -> dict:
    backend = resolve(use_case)
    return {
        "status": "reachable" if reachable else "down",
        "provider": backend.provider if backend else "env",
        "base_url": nim_base_url(use_case),
        "model": nim_model(use_case),
        "models_url": models_url(use_case),
    }


class ProtectedChatOpenAI(ChatOpenAI):
    disable_streaming: bool = True
    streaming: bool = False

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        await defense.inspect(inspection_messages(messages), "model_input")
        result = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
        for generation in result.generations:
            await defense.inspect(inspection_messages([generation.message]), "model_output")
        return result

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("Use async model invocation for the protected wealth runtime.")


def chat_model(use_case: str = RESEARCH) -> ProtectedChatOpenAI:
    backend = resolve(use_case)
    if backend is None:
        settings = {
            "model": nim_model(use_case),
            "api_key": nim_api_key(use_case),
            "base_url": nim_base_url(use_case),
            "extra_body": {"chat_template_kwargs": {"enable_thinking": False}},
        }
    else:
        settings = backend.chat_kwargs()
        if not backend.vllm and backend.model.startswith("gpt-5"):
            settings["reasoning_effort"] = "none"
    return ProtectedChatOpenAI(
        **settings,
        temperature=0,
        timeout=150,
        max_retries=0,
        max_tokens=900,
        disable_streaming=True,
        streaming=False,
    )
