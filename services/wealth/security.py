"""AI Defense on every model hop. Fetch, cache, tools, and grounding stay off Inspection.

Deny or inspection unavailability omits the note or brief. Indicator rows still release.
"""
import json
import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

import httpx

from runlog import emit_current

STAGE_LABEL = {"model_input": "prompt", "model_output": "model response"}


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
    forced: bool = False  # enforce was forced because client data went to a hosted model

    def summary(self):
        mode = "enforce" if self.forced else defense.mode
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
            "forced": self.forced,
        }


security_run: ContextVar[SecurityRun | None] = ContextVar("wealth_security_run", default=None)


class Defense:
    def __init__(self):
        self.key = os.getenv("AIDEFENSE_API_KEY", "")
        self.mode = os.getenv("WEALTH_AIDEFENSE_MODE", "off").lower()
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

    def can_enforce(self):
        """Whether a request can be inspected in enforce mode, whatever the configured mode."""
        return bool(self.key and self.endpoint and 0 < self.timeout <= 120)

    async def inspect(self, messages, stage="model_input", enforce=False):
        mode = "enforce" if enforce else self.mode
        run = security_run.get()
        if enforce and run:
            run.forced = True
        if mode == "off" or (not self.key and not enforce):
            return
        try:
            if not self.key or not self.endpoint or not (0 < self.timeout <= 120):
                raise ValueError("Invalid security configuration")
            if not enforce and not self.valid:
                raise ValueError("Invalid security configuration")
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
                response = await client.post(
                    self.endpoint,
                    headers={"X-Cisco-AI-Defense-API-Key": self.key},
                    json={
                        "messages": messages,
                        "metadata": {
                            "src_app": "fsi-ai-studio-wealth",
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
            emit_current("guardrail", f"AI Defense · {STAGE_LABEL.get(stage, stage)} · inspection unavailable", status="error",
                         body="No verdict came back, so the request failed closed.", data={"stage": stage, "mode": mode})
            raise DefenseUnavailable("AI Defense inspection is unavailable. Note or brief omitted.") from None
        event_id = verdict.get("event_id") if isinstance(verdict.get("event_id"), str) else None
        if run:
            run.checks += 1
            if event_id and event_id not in run.event_ids:
                run.event_ids.append(event_id)
            if not verdict["is_safe"]:
                run.blocked += 1
        outcome = "allowed" if verdict["is_safe"] else "flagged" if mode == "monitor" else "blocked"
        classes = [str(item) for item in verdict.get("classifications") or [] if item]
        emit_current("guardrail", f"AI Defense · {STAGE_LABEL.get(stage, stage)} · {outcome}" + (f" · {', '.join(classes)}" if classes else ""),
                     status=outcome, data={"stage": stage, "mode": mode, "forced": enforce and self.mode != "enforce",
                                           "event_id": event_id, "classifiers": classes})
        if not verdict["is_safe"] and mode != "monitor":
            raise DefenseBlocked("AI Defense blocked this synthesis. Note or brief omitted.")


    async def inspect_untrusted(self, text: str, label: str) -> dict:
        """Tool-result inspection of one untrusted item (a news story, a CRM note). Never raises.

        Runs whenever an AI Defense key is configured, whatever the model-hop mode, because the caller
        withholds or masks the item rather than failing the run. Returns the verdict and the detected
        PII spans (offsets into `text`)."""
        if not (self.key and self.endpoint and 0 < self.timeout <= 120):
            return {"status": "not_configured", "by": "AI Defense", "classifications": [], "rules": [], "spans": []}
        run = security_run.get()
        content = UNTRUSTED_PREFIX + text
        try:
            async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
                response = await client.post(
                    self.endpoint,
                    headers={"X-Cisco-AI-Defense-API-Key": self.key},
                    json={"messages": [{"role": "user", "content": content}],
                          "metadata": {"src_app": "fsi-ai-studio-wealth",
                                       "client_transaction_id": f"{run.request_id if run else uuid.uuid4()}:tool_result:{label}"[:120]}},
                )
                response.raise_for_status()
                verdict = response.json()
            if type(verdict.get("is_safe")) is not bool:
                raise ValueError("Missing inspection verdict")
        except Exception:
            if run:
                run.errors += 1
            return {"status": "unavailable", "by": "AI Defense", "classifications": [], "rules": [], "spans": []}
        if run:
            run.checks += 1
            if not verdict["is_safe"]:
                run.blocked += 1
            event_id = verdict.get("event_id")
            if isinstance(event_id, str) and event_id not in run.event_ids:
                run.event_ids.append(event_id)
        spans = []
        for row in verdict.get("detected_spans") or verdict.get("detected_pii") or []:
            try:
                start = int(row.get("start_index")) - len(UNTRUSTED_PREFIX)
                end = int(row.get("end_index")) - len(UNTRUSTED_PREFIX)
            except (TypeError, ValueError):
                continue
            if 0 <= start < end <= len(text):
                entity = str(row.get("entity_name") or row.get("type") or "PII").replace("PII_ENTITY_TYPE_", "").replace("_", " ").title()
                spans.append({"start": start, "end": end, "entity": entity})
        return {
            "status": "allowed" if verdict["is_safe"] else "flagged",
            "by": "AI Defense",
            "action": verdict.get("action"),
            "classifications": [str(item) for item in verdict.get("classifications") or [] if item],
            "rules": sorted({str(rule.get("rule_name")) for rule in verdict.get("rules") or [] if isinstance(rule, dict) and rule.get("rule_name")}),
            "spans": spans,
            "event_id": verdict.get("event_id") if isinstance(verdict.get("event_id"), str) else None,
        }


UNTRUSTED_PREFIX = "Tool result (untrusted data): "


def inspection_messages(messages):
    result = []
    for message in messages:
        role = {"human": "user", "system": "system", "ai": "assistant", "tool": "user", "function": "user"}.get(
            getattr(message, "type", "user"), "user"
        )
        content = message.content if isinstance(message.content, str) else json.dumps(message.content, default=str)
        if getattr(message, "tool_calls", None):
            content += "\nTool calls: " + json.dumps(message.tool_calls, default=str)
        if getattr(message, "type", None) in {"tool", "function"}:
            content = UNTRUSTED_PREFIX + content
        result.append({"role": role, "content": content or "[empty message]"})
    return result


defense = Defense()
