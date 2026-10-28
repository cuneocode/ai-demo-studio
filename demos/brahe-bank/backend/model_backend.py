"""Brahe's model endpoint: the first healthy backend in the Studio settings chain.

The graph is rebuilt when signature() changes, so a backend going down moves the next
conversation to the next one in the chain. MODEL_NAME from .env is the last resort.
"""
import os
import sys
from pathlib import Path

sys.path.insert(0, str(next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "services" / "llm"))
from studio_models import ChainUnavailable, EgressDenied, Selection, external_policy, mark_down, pick, require_egress, resolve, retryable  # noqa: E402,F401

USE_CASE = "brahe-bank"
_built: dict = {}


def selection() -> Selection | None:
    try:
        return pick(USE_CASE)
    except ChainUnavailable as exc:
        _built["unavailable"] = exc.served_by()
        return None


def model_settings() -> dict:
    """ChatOpenAI arguments shared by the supervisor, both specialists, and the judge."""
    chosen = selection()
    backend = chosen.backend if chosen else resolve(USE_CASE)
    if backend:
        from security import defense
        require_egress(USE_CASE, chosen or Selection(backend, USE_CASE), ai_defense_enforcing=bool(defense.key and defense.valid and defense.mode == "enforce" and not defense.fail_open))
    if backend is None:
        name = os.environ["MODEL_NAME"]
        _built["served_by"] = {"provider": "env", "label": "Lab .env", "model": name, "fallback": False, "reason": ""}
        return {"model": name, "reasoning_effort": "none" if name.startswith("gpt-5.6") else None}
    _built["served_by"] = chosen.served_by() if chosen else {**backend.public(), "fallback": False, "reason": "health unknown"}
    _built["backend"] = backend
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
    chosen = selection()
    backend = chosen.backend if chosen else resolve(USE_CASE)
    return (backend.signature if backend else ("env", os.getenv("MODEL_NAME"))) + (external_policy(USE_CASE),)


def mark_failed(exc: BaseException) -> None:
    """A connect failure or 5xx marks the backend down, so the next request rebuilds on the next one."""
    backend = _built.get("backend")
    if backend is not None and retryable(exc):
        mark_down(backend)


def served_by() -> dict | None:
    """The backend the current graph was built on."""
    return _built.get("served_by")


def describe() -> dict:
    """The backend answering now (health-checked), with the one the current graph was built on."""
    chosen = selection()
    backend = chosen.backend if chosen else resolve(USE_CASE)
    base = backend.public() if backend else {"provider": "env", "model": os.getenv("MODEL_NAME")}
    answering = chosen.served_by() if chosen else _built.get("unavailable")
    return {**base, "answering": answering, "served_by": served_by()}
