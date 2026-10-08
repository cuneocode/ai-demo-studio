"""The briefing model endpoint: the model chosen in Studio settings, else .env."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "llm"))
from studio_models import resolve  # noqa: E402

USE_CASE = "company-briefing"


def model_settings() -> dict:
    backend = resolve(USE_CASE)
    if backend is None:
        name = os.getenv("MODEL_NAME", "gpt-4o-mini")
        return {"model": name, "reasoning_effort": "none" if name.startswith("gpt-5.6") else None}
    settings = backend.chat_kwargs()
    if not backend.vllm and backend.model.startswith("gpt-5.6"):
        settings["reasoning_effort"] = "none"
    return settings


def configured() -> bool:
    backend = resolve(USE_CASE)
    if backend is None:
        return bool(os.getenv("OPENAI_API_KEY"))
    return backend.vllm or bool(backend.api_key)


def describe() -> dict:
    backend = resolve(USE_CASE)
    return backend.public() if backend else {"provider": "env", "model": os.getenv("MODEL_NAME", "gpt-4o-mini")}
