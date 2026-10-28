"""The SAR agent's model: the Studio chain for `sar-support`, the egress policy, and AI Defense per hop.

SAR case files are customer PII, so a hosted model is used only with AI Defense forced to
enforce on that request (studio_models.CLIENT_DATA_POLICY); without AI Defense the call is
refused (EgressRefused) and the demo offers the recorded run or the sample narrative.
"""
from __future__ import annotations

import sys
import time
from contextvars import ContextVar
from pathlib import Path

from langchain_openai import ChatOpenAI

from runlog import emit_current
from security import defense, inspection_messages
from usage import model_usage

sys.path.insert(0, str(next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "services" / "llm"))
from studio_models import (  # noqa: E402,F401
    ChainUnavailable,
    Selection,
    apick,
    egress_decision,
    mark_down,
    resolve,
    retryable,
)

USE_CASE = "sar-support"

# The served_by record for the current run's model hops.
served: ContextVar[dict | None] = ContextVar("sar_served_by", default=None)
_last: dict[str, dict] = {}


class EgressRefused(Exception):
    """Case data would reach a hosted model the use case's policy does not allow."""

    def __init__(self, reason: str, selection: Selection):
        super().__init__(reason)
        self.selection = selection


async def reachable() -> bool:
    try:
        selection = await apick(USE_CASE)
    except ChainUnavailable as exc:
        _last[USE_CASE] = exc.served_by()
        return False
    _last[USE_CASE] = selection.served_by()
    return True


def health(is_reachable: bool) -> dict:
    backend = resolve(USE_CASE)
    answering = _last.get(USE_CASE) or {}
    return {
        "status": "reachable" if is_reachable else "down",
        "provider": answering.get("provider") or (backend.provider if backend else None),
        "label": answering.get("label") or (backend.label if backend else "No model configured"),
        "model": answering.get("model") or (backend.model if backend else None),
        "private": answering.get("private", backend.private if backend else None),
        "fallback": bool(answering.get("fallback")),
        "reason": answering.get("reason", ""),
    }


def served_record(selection: Selection, decision: dict) -> dict:
    record = selection.served_by()
    record["egress"] = decision["policy"]
    record["ai_defense"] = "enforce (forced for hosted model)" if decision["force_enforce"] else None
    return record


def admit(selection: Selection) -> tuple[dict, dict]:
    """The egress decision for this backend, with its timeline events. Raises EgressRefused."""
    decision = egress_decision(USE_CASE, selection, defense.can_enforce())
    record = served_record(selection, decision)
    holder = served.get()
    if holder is not None:
        holder.clear()
        holder.update(record)
    label = selection.backend.label
    if selection.fallback:
        emit_current("model.failover", f"Model fallback · next in chain is {label}", status="flagged",
                     body=selection.reason or None, data={"served_by": record})
    if not decision["allowed"]:
        emit_current("guardrail", f"Case data not sent · {label} is a hosted model", status="blocked",
                     body=decision["reason"], data={"served_by": record, "policy": decision["policy"]})
        raise EgressRefused(decision["reason"], selection)
    if decision["force_enforce"]:
        emit_current("guardrail", f"AI Defense forced to enforce · case data bound for {label} (hosted)", status="ok",
                     body="Every prompt and response is inspected in enforce mode before data leaves; an unsafe verdict stops the call.",
                     data={"served_by": record, "policy": decision["policy"]})
    else:
        emit_current("guardrail", f"Case data stays on {label} (private inference)", status="ok",
                     data={"served_by": record, "policy": decision["policy"]})
    return decision, record


class ProtectedChatOpenAI(ChatOpenAI):
    """AI Defense on the prompt and the response of every hop, and one llm.call event per hop."""

    disable_streaming: bool = True
    streaming: bool = False
    enforce: bool = False
    record: dict = {}

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        await defense.inspect(inspection_messages(messages), "model_input", enforce=self.enforce)
        started = time.monotonic()
        try:
            result = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
        except Exception as exc:
            emit_current("llm.call", f"{self.model_name} · call failed ({type(exc).__name__})", status="error",
                         data={"served_by": self.record, "latency_ms": round((time.monotonic() - started) * 1000)})
            raise
        latency = round((time.monotonic() - started) * 1000)
        usage = model_usage.get()
        tokens_in, tokens_out = usage.record(result.generations) if usage else (None, None)
        calls = [call.get("name") for g in result.generations for call in (getattr(g.message, "tool_calls", None) or [])]
        title = f"{self.record.get('model') or self.model_name} · {self.record.get('label') or 'model'}"
        emit_current("llm.call", title + (f" · plans {', '.join(c for c in calls if c)}" if calls else " · drafts"), status="ok",
                     data={"served_by": self.record, "latency_ms": latency, "input_tokens": tokens_in, "output_tokens": tokens_out})
        for generation in result.generations:
            await defense.inspect(inspection_messages([generation.message]), "model_output", enforce=self.enforce)
        return result

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("Use async model invocation for the protected SAR runtime.")


def chat_model(selection: Selection, decision: dict, record: dict) -> ProtectedChatOpenAI:
    backend = selection.backend
    settings = backend.chat_kwargs()
    if not backend.vllm and backend.model.startswith("gpt-5"):
        settings["reasoning_effort"] = "none"
    return ProtectedChatOpenAI(
        **settings,
        enforce=decision["force_enforce"],
        record=record,
        temperature=0,
        timeout=150,
        max_retries=0,
        max_tokens=2400,
        disable_streaming=True,
        streaming=False,
    )
