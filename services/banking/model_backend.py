"""Brahe's model endpoint: the studio's Model backends choice, else MODEL_NAME from .env."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "llm"))
from studio_models import resolve  # noqa: E402

USE_CASE = "brahe-bank"


def model_settings() -> dict:
    """ChatOpenAI arguments shared by the supervisor, both specialists, and the judge."""
    backend = resolve(USE_CASE)
    if backend is None:
        name = os.environ["MODEL_NAME"]
        return {"model": name, "reasoning_effort": "none" if name.startswith("gpt-5.6") else None}
    settings = backend.chat_kwargs()
    if not backend.vllm and backend.model.startswith("gpt-5.6"):
        settings["reasoning_effort"] = "none"
    return settings


def judge_settings() -> dict:
    if resolve(USE_CASE) is None and os.getenv("BRAHE_JUDGE_MODEL"):
        name = os.environ["BRAHE_JUDGE_MODEL"]
        return {"model": name, "reasoning_effort": "none" if name.startswith("gpt-5.6") else None}
    return model_settings()


def signature() -> tuple:
    backend = resolve(USE_CASE)
    return backend.signature if backend else ("env", os.getenv("MODEL_NAME"))


def describe() -> dict:
    backend = resolve(USE_CASE)
    return backend.public() if backend else {"provider": "env", "model": os.getenv("MODEL_NAME")}
