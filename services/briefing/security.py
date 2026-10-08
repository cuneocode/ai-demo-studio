"""AI Defense on every model hop. Filing bytes never enter Inspection.

Deny or inspection unavailability fail closed: no briefing is released.
"""
import json
import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

import httpx
from langchain_openai import ChatOpenAI

from usage import model_usage


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
            status = "inspection_unavailable"
        return {
            "mode": mode,
            "status": status,
            "checks": self.checks,
            "blocked": self.blocked,
            "errors": self.errors,
            "event_ids": self.event_ids,
            "fail_open": False,
        }


security_run: ContextVar[SecurityRun | None] = ContextVar("briefing_security_run", default=None)


class Defense:
    def __init__(self):
        self.key = os.getenv("AIDEFENSE_API_KEY", "")
        # Briefing Defense is opt-in via BRIEFING_AIDEFENSE_MODE (default off); shared AIDEFENSE_* is for Brahe/Fraud.
        self.mode = os.getenv("BRIEFING_AIDEFENSE_MODE", "off").lower()
        # When enabled, briefing still fails closed. The shared FAIL_OPEN env flag is ignored on purpose.
        self.fail_open = False
        try:
            self.timeout = float(os.getenv("AIDEFENSE_TIMEOUT", "30"))
        except ValueError:
            self.timeout = 0
        region = os.getenv("AIDEFENSE_REGION", "us-west-2").lower()
        region_host = {
            "us-west-2": "us", "us": "us", "eu-central-1": "eu", "eu": "eu",
            "ap-northeast-1": "ap", "ap-ne-1": "ap", "ap": "ap",
        }.get(region)
        self.valid = self.mode in {"off", "monitor", "enforce"} and bool(region_host) and 0 < self.timeout <= 120
        self.endpoint = (
            f"https://{region_host}.api.inspect.aidefense.security.cisco.com/api/v1/inspect/chat"
            if region_host else ""
        )

    def health(self):
        if self.mode == "off":
            status = "disabled"
        elif self.key and self.valid:
            status = "configured"
        else:
            status = "missing_configuration"
        return {"status": status, "mode": self.mode, "fail_open": False}

    def configured(self):
        if self.mode == "off":
            return True
        return bool(self.key and self.valid)

    async def inspect(self, messages, stage="model_input"):
        if self.mode == "off" or not self.key:
            return
        run = security_run.get()
        try:
            if not self.valid:
                raise ValueError("Invalid security configuration")
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
                response = await client.post(
                    self.endpoint,
                    headers={"X-Cisco-AI-Defense-API-Key": self.key},
                    json={
                        "messages": messages,
                        "metadata": {
                            "src_app": "fsi-ai-studio-company-briefing",
                            "client_transaction_id": f"{run.request_id if run else uuid.uuid4()}:{stage}",
                        },
                    },
                )
                response.raise_for_status()
                verdict = response.json()
            if type(verdict.get("is_safe")) is not bool:
                raise ValueError("Missing inspection verdict")
        except Exception:
            if run:
                run.errors += 1
            raise DefenseUnavailable("AI Defense inspection is unavailable. No briefing was released.") from None
        if run:
            run.checks += 1
            event_id = verdict.get("event_id")
            if isinstance(event_id, str) and event_id and event_id not in run.event_ids:
                run.event_ids.append(event_id)
            if not verdict["is_safe"]:
                run.blocked += 1
        if not verdict["is_safe"] and self.mode != "monitor":
            raise DefenseBlocked("AI Defense blocked this briefing. No briefing was released.")


def inspection_messages(messages):
    """Preserve the entire text/tool context; filing bytes are never passed here."""
    result = []
    for message in messages:
        role = {"human": "user", "system": "system", "ai": "assistant", "tool": "user", "function": "user"}.get(
            getattr(message, "type", "user"), "user"
        )
        content = message.content if isinstance(message.content, str) else json.dumps(message.content, default=str)
        if getattr(message, "tool_calls", None):
            content += "\nTool calls: " + json.dumps(message.tool_calls, default=str)
        if getattr(message, "type", None) in {"tool", "function"}:
            content = "Tool result (untrusted data): " + content
        result.append({"role": role, "content": content or "[empty message]"})
    return result


defense = Defense()


class ProtectedChatOpenAI(ChatOpenAI):
    # Streaming is disabled so a complete model hop is inspected before tools run.
    disable_streaming: bool = True
    streaming: bool = False

    async def _agenerate(self, messages, stop=None, run_manager=None, **kwargs):
        await defense.inspect(inspection_messages(messages), "model_input")
        result = await super()._agenerate(messages, stop=stop, run_manager=run_manager, **kwargs)
        usage = model_usage.get()
        if usage:
            usage.record(result.generations)
        for generation in result.generations:
            await defense.inspect(inspection_messages([generation.message]), "model_output")
        return result

    def _generate(self, messages, stop=None, run_manager=None, **kwargs):
        raise RuntimeError("Use async model invocation for the protected briefing runtime.")
