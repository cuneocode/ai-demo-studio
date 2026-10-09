"""The briefing model endpoint: the first healthy backend in the Studio settings chain, else .env."""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "llm"))
from studio_models import ChainUnavailable, Selection, mark_down, pick, resolve, retryable  # noqa: E402

USE_CASE = "company-briefing"
_built: dict = {}


def selection() -> Selection | None:
    try:
        return pick(USE_CASE)
    except ChainUnavailable:
        return None


def model_settings() -> dict:
    chosen = selection()
    backend = chosen.backend if chosen else resolve(USE_CASE)
    if backend is None:
        name = os.getenv("MODEL_NAME", "gpt-4o-mini")
        _built["served_by"] = {"provider": "env", "label": "Lab .env", "model": name, "fallback": False, "reason": ""}
        return {"model": name, "reasoning_effort": "none" if name.startswith("gpt-5.6") else None}
    _built["served_by"] = chosen.served_by() if chosen else {**backend.public(), "fallback": False, "reason": "health unknown"}
    _built["backend"] = backend
    settings = backend.chat_kwargs()
    if not backend.vllm and backend.model.startswith("gpt-5.6"):
        settings["reasoning_effort"] = "none"
    return settings


def configured() -> bool:
    backend = resolve(USE_CASE)
    if backend is None:
        return bool(os.getenv("OPENAI_API_KEY"))
    return backend.vllm or bool(backend.api_key)


def mark_failed(exc: BaseException) -> None:
    backend = _built.get("backend")
    if backend is not None and retryable(exc):
        mark_down(backend)


def served_by() -> dict | None:
    """The backend the last briefing agent was built on."""
    return _built.get("served_by")


def describe() -> dict:
    """The backend answering now (health-checked), with the one the last briefing used."""
    chosen = selection()
    backend = chosen.backend if chosen else resolve(USE_CASE)
    base = backend.public() if backend else {"provider": "env", "model": os.getenv("MODEL_NAME", "gpt-4o-mini")}
    return {**base, "answering": chosen.served_by() if chosen else None, "served_by": served_by()}
