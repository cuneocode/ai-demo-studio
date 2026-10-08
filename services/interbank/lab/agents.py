"""LangChain Deep Agents running on the OpenAI API."""

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

from lab.config import SERVICE_NAME, env
from lab.events import emit
from lab.genai import reasoning_summaries

# The agents plan with write_todos and keep case notes in the Deep Agents virtual
# filesystem; counterparty work goes over A2A instead of local sub-agents.
register_harness_profile(
    "openai",
    HarnessProfile(general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False)),
)


def chat_model() -> ChatOpenAI:
    # gpt-5.6-luna accepts function tools with reasoning only on the Responses API.
    # Reasoning summaries are what the dashboard shows as each agent's thinking.
    return ChatOpenAI(
        model=env("MODEL_NAME"),
        base_url=os.getenv("MODEL_BASE_URL") or None,
        api_key=env("MODEL_API_KEY"),
        use_responses_api=True,
        reasoning={"effort": os.getenv("MODEL_REASONING_EFFORT", "medium"), "summary": "detailed"},
        max_tokens=4000,
        timeout=240,
        max_retries=1,
    )


def build_deep_agent(*, name: str, system_prompt: str, tools: Sequence[Any]):
    return create_deep_agent(
        model=chat_model(),
        tools=list(tools),
        system_prompt=system_prompt,
        checkpointer=InMemorySaver(),
        name=name,
    )


async def run_turn(agent, *, prompt: str, thread_id: str, run_id: str) -> str:
    """Run one conversational turn, reporting every model step to the timeline."""
    answer = ""
    stream = agent.astream(
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
