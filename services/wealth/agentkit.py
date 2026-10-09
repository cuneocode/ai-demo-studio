"""What the research and meeting-prep Deep Agents share: tool events, spans, delegation, the harness.

Every tool, deterministic or agent-called, goes through record_tool(): one agent.tool_call and one
tool.result on the run timeline, a tool span on the Galileo trace (Splunk Agent Observability) when
one is open, and a count for the stats row. The Deep Agent harness matches services/briefing/agent.py:
no shell tool and no general-purpose subagent.
"""
from __future__ import annotations

import inspect
import json
import time
from contextvars import ContextVar
from typing import Any

from langchain_core.callbacks import AsyncCallbackHandler

from runlog import emit_current
from usage import model_usage

galileo_current: ContextVar[Any] = ContextVar("wealth_galileo_logger", default=None)
_HARNESS_READY = False


def record_tool(name: str, arguments: dict | None, summary: str, *, agent: str = "workflow", status: str = "ok",
                body: str | None = None, output: Any = None, started: float | None = None, data: dict | None = None) -> None:
    usage = model_usage.get()
    if usage:
        usage.tool_calls += 1
    args = ", ".join(f"{key}={value}" for key, value in (arguments or {}).items() if value not in (None, "", [], {}))
    emit_current("agent.tool_call", f"{name}({args})"[:200], source=agent,
                 data={"tool": name, "agent": agent, "arguments": arguments or {}})
    emit_current("tool.result", summary, status=status, source=agent, body=body,
                 data={"tool": name, "agent": agent, **(data or {})})
    logger = galileo_current.get()
    if logger is not None:
        try:
            logger.add_tool_span(
                input=json.dumps(arguments or {}, default=str)[:4000],
                output=json.dumps(output if output is not None else summary, default=str)[:8000],
                name=name, duration_ns=int((time.monotonic() - started) * 1e9) if started else None,
                metadata={"agent": agent, "status": status})
        except Exception:
            pass


class DelegationEvents(AsyncCallbackHandler):
    """Puts the supervisor's delegations and plans on the timeline (its own tools emit themselves)."""

    def __init__(self, supervisor: str) -> None:
        self.supervisor = supervisor

    async def on_tool_start(self, serialized, input_str, *, inputs=None, **kwargs) -> None:
        name = (serialized or {}).get("name") or kwargs.get("name")
        payload = inputs if isinstance(inputs, dict) else _parse(input_str)
        if name == "task":
            target = payload.get("subagent_type") or payload.get("name") or "subagent"
            emit_current("agent.message", f"{self.supervisor} → {target} subagent", source=self.supervisor, target=target,
                         body=str(payload.get("description") or "")[:600] or None, data={"subagent": target})
        elif name == "write_todos":
            todos = payload.get("todos") or []
            steps = [str(item.get("content") if isinstance(item, dict) else item) for item in todos][:8]
            if steps:
                emit_current("agent.thinking", f"{self.supervisor} · plan ({len(steps)} steps)", source=self.supervisor,
                             body="\n".join(f"• {step}" for step in steps))


def _parse(text) -> dict:
    if isinstance(text, dict):
        return text
    try:
        value = json.loads(text) if isinstance(text, str) else {}
    except ValueError:
        value = {}
    return value if isinstance(value, dict) else {}


def apply_harness() -> None:
    global _HARNESS_READY
    if _HARNESS_READY:
        return
    from deepagents import GeneralPurposeSubagentProfile, HarnessProfile, register_harness_profile

    register_harness_profile("openai", HarnessProfile(
        excluded_tools=frozenset({"execute", "ls", "read_file", "write_file", "edit_file", "glob", "grep"}),
        general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
    ))
    _HARNESS_READY = True


def build_deep_agent(**kwargs):
    apply_harness()
    from deepagents import create_deep_agent

    accepted = set(inspect.signature(create_deep_agent).parameters)
    return create_deep_agent(**{key: value for key, value in kwargs.items() if key in accepted})


ALIASES = {"text": ("claim", "sentence", "statement", "line"), "evidence_id": ("evidence", "source_id", "id"),
           "field_path": ("field", "path"), "section": ("type", "kind", "category")}


def _ref(value) -> str | None:
    if isinstance(value, dict):
        value = value.get("evidence_id") or value.get("id")
    return str(value) if isinstance(value, (str, int)) and str(value) else None


def claim_aliases(data):
    """Maps the key names and shapes models commonly use instead of the schema's onto it."""
    if not isinstance(data, dict):
        return data
    out = dict(data)
    for key, names in ALIASES.items():
        if not out.get(key):
            for name in names:
                if isinstance(out.get(name), str) and out[name]:
                    out[key] = out.pop(name)
                    break
    if isinstance(out.get("section"), str):
        out["section"] = out["section"].strip().lower().replace(" ", "_").replace("-", "_")
    if "evidence_id" in out:
        out["evidence_id"] = _ref(out["evidence_id"]) or ""
    if isinstance(out.get("field_path"), str):
        path = out["field_path"].strip()
        for prefix in ("fields.", f"{out.get('evidence_id')}.fields.", f"{out.get('evidence_id')}."):
            if out.get("evidence_id") and path.startswith(prefix) or prefix == "fields." and path.startswith(prefix):
                path = path[len(prefix):]
                break
        out["field_path"] = path or None
    if out.get("also") is not None:
        also = out["also"] if isinstance(out["also"], list) else [out["also"]]
        out["also"] = [ref for ref in (_ref(item) for item in also) if ref]
    if isinstance(out.get("value"), str):
        try:
            out["value"] = float(out["value"].replace(",", "").rstrip("%"))
        except ValueError:
            out["value"] = None
    return out


def parse_claims(text: str, limit: int = 24) -> list[dict] | None:
    try:
        value = json.loads(text) if isinstance(text, str) else text
    except ValueError:
        return None
    if isinstance(value, dict):
        value = value.get("claims") or value.get("lines") or []
    if not isinstance(value, list):
        return None
    return [claim_aliases(row) for row in value if isinstance(row, dict)][:limit]


async def run_until_submitted(graph, prompt: str, callbacks: list, *, done, timeout: float, recursion_limit: int = 45) -> bool:
    """Streams the agent and stops as soon as it has submitted. Returns False if it stopped first (limit or time)."""
    import asyncio

    from langgraph.errors import GraphRecursionError

    async def stream():
        async for _chunk in graph.astream({"messages": [{"role": "user", "content": prompt}]},
                                          config={"callbacks": callbacks, "recursion_limit": recursion_limit}, stream_mode="updates"):
            if done():
                return True
        return done()

    try:
        return await asyncio.wait_for(stream(), timeout)
    except (GraphRecursionError, asyncio.TimeoutError):
        if not done():
            emit_current("agent.message", "Agent hit its step or time budget", status="flagged",
                         body=f"Stopped after {recursion_limit} steps or {int(timeout)} seconds.")
        return done()


def structured_response(result) -> Any:
    if not isinstance(result, dict):
        return None
    for key in ("structured_response", "response", "output"):
        if result.get(key) is not None:
            return result[key]
    return None


def as_dict(value) -> dict | None:
    if value is None:
        return None
    if hasattr(value, "model_dump"):
        return value.model_dump()
    return value if isinstance(value, dict) else None


__all__ = ["DelegationEvents", "as_dict", "build_deep_agent", "claim_aliases", "galileo_current", "parse_claims", "record_tool",
           "run_until_submitted", "structured_response"]
