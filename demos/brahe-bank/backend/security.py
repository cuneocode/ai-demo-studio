"""Application-enforced Cisco Inspection API boundary; never log inspected text.

Credentials stay server-side. Tool results and tool-call arguments are inspected
as part of the model conversation, before the graph can act on model output.
This does not replace source authorization or constitute credit approval.
"""
import json
import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

import httpx
from langchain_openai import ChatOpenAI


class DefenseBlocked(Exception):
    pass


class DefenseUnavailable(Exception):
    pass


@dataclass
class SecurityRun:
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    checks: int = 0
    blocked: int = 0
    errors: int = 0
    event_ids: list[str] = field(default_factory=list)

    def summary(self):
        mode = defense.mode
        status = "disabled" if mode == "off" else "not_checked"
        if self.checks:
            status = "allowed"
        if self.blocked:
            status = "blocked" if mode == "enforce" else "monitored_violation"
        if self.errors:
            status = "inspection_unavailable" if not defense.fail_open else "fail_open"
        return {"mode": mode, "status": status, "checks": self.checks,
                "blocked": self.blocked, "errors": self.errors, "event_ids": self.event_ids}


security_run: ContextVar[SecurityRun | None] = ContextVar("banking_security_run", default=None)


class Defense:
    def __init__(self):
        self.key = os.getenv("AIDEFENSE_API_KEY", "")
        self.mode = os.getenv("AIDEFENSE_MODE", "enforce" if self.key else "off").lower()
        self.fail_open = os.getenv("AIDEFENSE_FAIL_OPEN", "false").lower() == "true"
        try:
            self.timeout = float(os.getenv("AIDEFENSE_TIMEOUT", "30"))
        except ValueError:
            self.timeout = 0
        region = os.getenv("AIDEFENSE_REGION", "us-west-2").lower()
        region_host = {"us-west-2": "us", "us": "us", "eu-central-1": "eu", "eu": "eu", "ap-northeast-1": "ap", "ap-ne-1": "ap", "ap": "ap"}.get(region)
        self.valid = self.mode in {"off", "monitor", "enforce"} and bool(region_host) and 0 < self.timeout <= 120
        self.endpoint = f"https://{region_host}.api.inspect.aidefense.security.cisco.com/api/v1/inspect/chat" if region_host else ""

    def health(self):
        return {"status": "disabled" if self.mode == "off" else "configured" if self.key and self.valid else "missing_configuration",
                "mode": self.mode, "fail_open": self.fail_open}

    async def inspect(self, messages, stage="model_input"):
        if self.mode == "off":
            return
        run = security_run.get()
        try:
            if not self.valid or not self.key:
                raise ValueError("Invalid security configuration")
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
                response = await client.post(self.endpoint,
                    headers={"X-Cisco-AI-Defense-API-Key": self.key},
                    json={"messages": messages, "metadata": {"src_app": "fsi-ai-studio-brahe-bank",
                          "client_transaction_id": f"{run.request_id if run else uuid.uuid4()}:{stage}"}})
                response.raise_for_status()
                verdict = response.json()
            if type(verdict.get("is_safe")) is not bool:
                raise ValueError("Missing inspection verdict")
        except Exception:
            if run:
                run.errors += 1
            if not self.fail_open:
                raise DefenseUnavailable("AI Defense inspection is unavailable. No answer was released.") from None
            return
        if run:
            run.checks += 1
            event_id = verdict.get("event_id")
            if isinstance(event_id, str) and event_id and event_id not in run.event_ids:
                run.event_ids.append(event_id)
            if not verdict["is_safe"]:
                run.blocked += 1
        # Attach only verdict metadata to the current model span, never payloads.
        from opentelemetry import trace
        span = trace.get_current_span()
        span.set_attribute("cisco.ai_defense.last_stage", stage)
        span.set_attribute("cisco.ai_defense.is_safe", verdict["is_safe"])
        if verdict.get("event_id"):
            span.set_attribute("cisco.ai_defense.event_id", verdict["event_id"])
        if not verdict["is_safe"] and self.mode == "enforce":
            raise DefenseBlocked("AI Defense blocked this interaction. No answer was released.")


def inspection_messages(messages):
    """Preserve the entire text/tool context; no truncation-based guardrail bypass."""
    result = []
    for message in messages:
        role = {"human": "user", "system": "system", "ai": "assistant", "tool": "user", "function": "user"}.get(message.type, "user")
        content = message.content if isinstance(message.content, str) else json.dumps(message.content, default=str)
        if getattr(message, "tool_calls", None):
            content += "\nTool calls: " + json.dumps(message.tool_calls, default=str)
        if message.type in {"tool", "function"}:
            content = "Tool result (untrusted data): " + content
        result.append({"role": role, "content": content or "[empty message]"})
    return result


defense = Defense()


class ProtectedChatOpenAI(ChatOpenAI):
    # Streaming is disabled intentionally: inspect a complete model response
    # before LangGraph can execute tools or return any generated text.
    disable_streaming: bool = True
    streaming: bool = False

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        await defense.inspect(inspection_messages(messages), "model_input")
        result = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
        for generation in result.generations:
            await defense.inspect(inspection_messages([generation.message]), "model_output")
        return result

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        # Brahe's service is async-only. Reject sync invocation rather than expose
        # an uninspected second code path when an upstream caller changes.
        raise RuntimeError("Use async model invocation for the protected banking runtime.")
