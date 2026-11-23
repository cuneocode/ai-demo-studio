"""LangChain Deep Agents on the model endpoint the studio selects."""

from __future__ import annotations

import json
import os
from collections.abc import Sequence
from typing import Any

from deepagents import (
    GeneralPurposeSubagentProfile,
    HarnessProfile,
    create_deep_agent,
    register_harness_profile,
)
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_openai import ChatOpenAI
from langgraph.checkpoint.memory import InMemorySaver

from lab import models
from lab.config import SERVICE_NAME
from lab.events import emit
from lab.genai import reasoning_summaries

# The agents plan with write_todos and keep case notes in the Deep Agents virtual
# filesystem; counterparty work goes over A2A instead of local sub-agents.
register_harness_profile(
    "openai",
    HarnessProfile(general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False)),
)


def chat_model(backend: models.Backend) -> ChatOpenAI:
    common = {"model": backend.model, "base_url": backend.base_url, "api_key": backend.api_key or "not-needed",
              "max_tokens": 4000, "timeout": 240, "max_retries": 1}
    if backend.responses_api:
        # gpt-5.6-luna accepts function tools with reasoning only on the Responses API.
        # Reasoning summaries are what the dashboard shows as each agent's thinking.
        return ChatOpenAI(**common, use_responses_api=True,
                          reasoning={"effort": os.getenv("MODEL_REASONING_EFFORT", "medium"), "summary": "detailed"})
    # Chat Completions: tool calls and answers still stream to the timeline, without thinking.
    if backend.kind == "vllm":
        return ChatOpenAI(**common, extra_body={"chat_template_kwargs": {"enable_thinking": False}})
    return ChatOpenAI(**common, reasoning_effort="none" if backend.model.startswith("gpt-5") else None)


_ANNOUNCED: dict[str, tuple | None] = {}


class DeepAgent:
    """A Deep Agent rebuilt whenever the studio switches this lab's model backend."""

    def __init__(self, *, name: str, system_prompt: str, tools: Sequence[Any]):
        self.name = name
        self._spec = {"name": name, "system_prompt": system_prompt, "tools": list(tools)}
        self._graph = None
        self._signature: tuple | None = None
        self.served_by: dict = {}

    def announce(self, run_id: str) -> bool:
        """True once per run for this service, and again only if the backend changes during that run."""
        if _ANNOUNCED.get(run_id) == self._signature:
            return False
        if len(_ANNOUNCED) > 64:
            _ANNOUNCED.pop(next(iter(_ANNOUNCED)))
        _ANNOUNCED[run_id] = self._signature
        return True

    def current(self):
        backend, self.served_by = models.select()
        if self._graph is None or backend.signature != self._signature:
            self._graph = create_deep_agent(model=chat_model(backend), checkpointer=InMemorySaver(), **self._spec)
            self._signature = backend.signature
        return self._graph


def build_deep_agent(*, name: str, system_prompt: str, tools: Sequence[Any]) -> DeepAgent:
    return DeepAgent(name=name, system_prompt=system_prompt, tools=tools)


async def run_turn(agent: DeepAgent, *, prompt: str, thread_id: str, run_id: str) -> str:
    """Run one conversational turn, reporting every model step to the timeline."""
    answer = ""
    graph = agent.current()
    served = agent.served_by
    if served.get("fallback") and agent.announce(run_id):
        await emit(run_id, "model.failover", f"{SERVICE_NAME} on {served.get('label')}", body=served.get("reason"),
                   data={"served_by": served})
    stream = graph.astream(
        {"messages": [HumanMessage(content=prompt)]},
        config={"configurable": {"thread_id": thread_id}, "recursion_limit": 60},
        stream_mode="updates",
    )
    async for update in stream:
        for payload in update.values():
            messages = payload.get("messages") if isinstance(payload, dict) else None
            if not isinstance(messages, list):
                continue
            for message in messages:
                if isinstance(message, AIMessage):
                    usage = message.usage_metadata or {}
                    await emit(run_id, "llm.call", f"{SERVICE_NAME} model call",
                               data={"input_tokens": usage.get("input_tokens"), "output_tokens": usage.get("output_tokens"),
                                     "served_by": {k: served.get(k) for k in ("provider", "label", "model", "private", "fallback")}})
                    for thought in reasoning_summaries(message.content):
                        await emit(run_id, "agent.thinking", _headline(thought), body=thought)
                    content = message.text.strip()
                    if content:
                        answer = content
                    for call in message.tool_calls:
                        await emit(run_id, "agent.tool_call", f"Calls {call['name']}",
                                   target=_tool_target(call["name"]), body=content or None,
                                   data={"tool": call["name"], "arguments": call["args"]})
                    if content and not message.tool_calls:
                        await emit(run_id, "agent.message", f"{SERVICE_NAME} response",
                                   body=content)
                elif isinstance(message, ToolMessage):
                    await emit(run_id, "tool.result", f"{message.name} returned",
                               source=_tool_target(message.name or ""), target=SERVICE_NAME,
                               body=_text(message.content), data={"tool": message.name})
    return answer


def _tool_target(tool: str) -> str:
    org = SERVICE_NAME.removesuffix("-agent")
    if tool == "query_settlement_records":
        return f"{org}-records"
    if tool.startswith("send_message_to_"):
        return f"{org}-gateway"
    return SERVICE_NAME


def _headline(thought: str) -> str:
    """Reasoning summaries open with a bold title, e.g. "**Querying settlements**"."""
    first = thought.strip().splitlines()[0].strip() if thought.strip() else ""
    return first.strip("*").strip() or "Thinking"


def _text(content: Any) -> str:
    return content if isinstance(content, str) else json.dumps(content, ensure_ascii=False)
