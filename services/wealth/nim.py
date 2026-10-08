"""LangChain ChatOpenAI pointed at the local NIM. ainvoke only. Temperature 0."""
from __future__ import annotations

import os

import httpx
from langchain_openai import ChatOpenAI

from security import defense, inspection_messages

DEFAULT_NIM_BASE = "http://127.0.0.1:8003/v1"
DEFAULT_NIM_MODEL = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"


def nim_base_url() -> str:
    return (os.getenv("NIM_BASE_URL") or DEFAULT_NIM_BASE).rstrip("/")


def nim_model() -> str:
    return os.getenv("NIM_MODEL") or os.getenv("NEMOTRON_MODEL") or DEFAULT_NIM_MODEL


def nim_api_key() -> str:
    return os.getenv("NIM_API_KEY") or os.getenv("OPENAI_API_KEY") or "not-needed"


def models_url() -> str:
    base = nim_base_url()
    return f"{base}/models" if base.endswith("/v1") else f"{base}/v1/models"


async def nim_reachable() -> bool:
    try:
        async with httpx.AsyncClient(timeout=3.0, follow_redirects=False) as client:
            response = await client.get(models_url())
            response.raise_for_status()
            body = response.json()
            return isinstance(body, dict) and ("data" in body or "models" in body or body)
    except Exception:
        return False


def nim_health(reachable: bool) -> dict:
    return {
        "status": "reachable" if reachable else "down",
        "base_url": nim_base_url(),
        "model": nim_model(),
        "models_url": models_url(),
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


def chat_model() -> ProtectedChatOpenAI:
    return ProtectedChatOpenAI(
        model=nim_model(),
        api_key=nim_api_key(),
        base_url=nim_base_url(),
        temperature=0,
        timeout=150,
        max_retries=0,
        max_tokens=900,
        disable_streaming=True,
        streaming=False,
        extra_body={"chat_template_kwargs": {"enable_thinking": False}},
    )
