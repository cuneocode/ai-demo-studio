"""LangChain ChatOpenAI for the wealth use cases. ainvoke only. Temperature 0.

Each call walks the use case's chain from Studio settings (services/llm/studio_models.py):
the first healthy backend answers, a connect failure retries once on the next one, and
`served` records which model answered. Advisory sends client data, so a hosted model is
used only with AI Defense forced to enforce on that request; without AI Defense the call
is refused (EgressRefused) and the demo falls back to a recorded run.
"""
from __future__ import annotations

import sys
import time
from contextvars import ContextVar
from dataclasses import replace
from pathlib import Path

from langchain_openai import ChatOpenAI

from runlog import emit_current, emit_model_call
from security import defense, inspection_messages
from usage import model_usage

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "llm"))
from studio_models import (  # noqa: E402
    ChainUnavailable,
    Selection,
    apick,
    egress_decision,
    mark_down,
    pick,
    resolve,
    retryable,
)

RESEARCH = "market-research"
ADVISORY = "client-advisory"

# A dict the request handler sets and structured() fills in place (wait_for runs the draft in a child task).
served: ContextVar[dict | None] = ContextVar("wealth_served_by", default=None)
_last: dict[str, dict] = {}


class EgressRefused(Exception):
    """Client data would reach a hosted model the use case's policy does not allow."""

    def __init__(self, reason: str, selection: Selection):
        super().__init__(reason)
        self.selection = selection


def nim_base_url(use_case: str = RESEARCH) -> str:
    backend = resolve(use_case)
    return backend.base_url if backend else ""


def nim_model(use_case: str = RESEARCH) -> str:
    backend = resolve(use_case)
    return backend.model if backend else ""


def models_url(use_case: str = RESEARCH) -> str:
    base = nim_base_url(use_case)
    return f"{base}/models" if base else ""


async def nim_reachable(use_case: str = RESEARCH) -> bool:
    """Whether any backend in the chain answers its health probe right now."""
    try:
        selection = await apick(use_case)
    except ChainUnavailable as exc:
        _last[use_case] = exc.served_by()
        return False
    _last[use_case] = selection.served_by()
    return True


def nim_health(reachable: bool, use_case: str = RESEARCH) -> dict:
    """The backend that would answer (from the last probe), or the chain's first entry."""
    backend = resolve(use_case)
    answering = _last.get(use_case) or {}
    return {
        "status": "reachable" if reachable else "down",
        "provider": answering.get("provider") or (backend.provider if backend else None),
        "label": answering.get("label") or (backend.label if backend else "No model configured"),
        "model": answering.get("model") or (backend.model if backend else None),
        "private": answering.get("private", backend.private if backend else None),
        "fallback": bool(answering.get("fallback")),
        "reason": answering.get("reason", ""),
    }


class ProtectedChatOpenAI(ChatOpenAI):
    disable_streaming: bool = True
    streaming: bool = False
    enforce: bool = False

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        await defense.inspect(inspection_messages(messages), "model_input", enforce=self.enforce)
        result = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
        usage = model_usage.get()
        if usage:
            usage.record(result.generations)
        for generation in result.generations:
            await defense.inspect(inspection_messages([generation.message]), "model_output", enforce=self.enforce)
        return result

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("Use async model invocation for the protected wealth runtime.")


def chat_model(use_case: str = RESEARCH, selection: Selection | None = None, enforce: bool = False) -> ProtectedChatOpenAI:
    backend = (selection or pick(use_case)).backend
    settings = backend.chat_kwargs()
    if not backend.vllm and backend.model.startswith("gpt-5"):
        settings["reasoning_effort"] = "none"
    return ProtectedChatOpenAI(
        **settings,
        enforce=enforce,
        temperature=0,
        timeout=150,
        max_retries=0,
        max_tokens=1600 if use_case == ADVISORY else 1200,
        disable_streaming=True,
        streaming=False,
    )


def _served(selection: Selection, decision: dict) -> dict:
    record = selection.served_by()
    record["egress"] = decision["policy"]
    record["ai_defense"] = "enforce (forced for hosted model)" if decision["force_enforce"] else None
    return record


async def structured(use_case: str, schema, messages: list, config: dict):
    """Structured output from the chain's first healthy backend, with one failover retry."""
    selection = await apick(use_case)

    async def attempt(current: Selection):
        decision = egress_decision(use_case, current, defense.can_enforce())
        record = _served(current, decision)
        holder = served.get()
        if holder is not None:
            holder.clear()
            holder.update(record)
        label = current.backend.label
        if not decision["allowed"]:
            if current.fallback:
                emit_current("model.failover", f"Model fallback · next in chain is {label}", status="flagged",
                             body=current.reason or None, data={"served_by": record})
            emit_current("guardrail", f"Client data not sent · {label} is a hosted model", status="blocked",
                         body=decision["reason"], data={"served_by": record, "policy": decision["policy"]})
            raise EgressRefused(decision["reason"], current)
        if decision["force_enforce"]:
            emit_current("guardrail", f"AI Defense forced to enforce · client data bound for {label} (hosted)", status="ok",
                         body="Every prompt and response is inspected in enforce mode before data leaves; an unsafe verdict stops the call.",
                         data={"served_by": record, "policy": decision["policy"]})
        usage = model_usage.get()
        before = (usage.input_tokens, usage.output_tokens) if usage else (0, 0)
        started = time.monotonic()
        model = chat_model(use_case, current, enforce=decision["force_enforce"])
        try:
            result = await model.with_structured_output(schema, method="json_mode").ainvoke(messages, config=config)
        except Exception as exc:
            emit_model_call(record, title=f"{current.backend.model or 'Model'} · call failed ({type(exc).__name__})",
                            latency_ms=round((time.monotonic() - started) * 1000), status="error")
            raise
        reported = bool(usage and usage.reported)
        emit_model_call(record, latency_ms=round((time.monotonic() - started) * 1000),
                        input_tokens=usage.input_tokens - before[0] if reported else None,
                        output_tokens=usage.output_tokens - before[1] if reported else None)
        return result

    try:
        return await attempt(selection)
    except Exception as exc:
        if not retryable(exc):
            raise
        mark_down(selection.backend)
        try:
            following = await apick(use_case, exclude=(selection.backend.provider,))
        except ChainUnavailable:
            raise exc from None
        following = replace(following, fallback=True,
                            reason=f"{selection.backend.label} failed during the call ({type(exc).__name__})")
        return await attempt(following)
