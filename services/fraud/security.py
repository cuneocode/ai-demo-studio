"""Cisco AI Defense inspection for the triage agent's untrusted text and model hops, never the score path.

Stages: the cardholder's dispute text and analyst notes (untrusted input), the agent's prompt before it
leaves for the model, the agent's summary, and the legacy optional narrative. The tenant returns a verdict
(is_safe, classifications, matched rules); it does not redact, so any masking is done by the application.
"""
import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

import httpx

from runlog import emit_current

STAGE_LABEL = {
    "narrative_input": "analyst-summary prompt", "narrative_output": "analyst summary",
    "dispute_text": "cardholder dispute note", "analyst_note": "analyst case note",
    "agent_input": "agent prompt", "agent_output": "agent summary",
}


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


security_run: ContextVar[SecurityRun | None] = ContextVar("fraud_security_run", default=None)


def _rules(verdict: dict) -> list[str]:
    """Matched rule names with entity types, e.g. "Prompt Injection", "PCI · Credit Card Number"."""
    out = []
    for rule in verdict.get("rules") or []:
        if not isinstance(rule, dict) or not isinstance(rule.get("rule_name"), str):
            continue
        entities = [item for item in rule.get("entity_types") or [] if isinstance(item, str)]
        out.append(f"{rule['rule_name']}{' · ' + ', '.join(entities[:3]) if entities else ''}")
    return out[:6]


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
        region_host = {
            "us-west-2": "us", "us": "us", "eu-central-1": "eu", "eu": "eu",
            "ap-northeast-1": "ap", "ap-ne-1": "ap", "ap": "ap",
        }.get(region)
        self.valid = self.mode in {"off", "monitor", "enforce"} and bool(region_host) and 0 < self.timeout <= 120
        self.endpoint = (
            f"https://{region_host}.api.inspect.aidefense.security.cisco.com/api/v1/inspect/chat"
            if region_host else ""
        )

    @property
    def configured(self) -> bool:
        return self.mode != "off" and bool(self.key) and self.valid

    def health(self):
        return {
            "status": "disabled" if self.mode == "off" else "configured" if self.key and self.valid else "missing_configuration",
            "mode": self.mode,
            "fail_open": self.fail_open,
        }

    async def _call(self, messages, stage: str) -> dict:
        run = security_run.get()
        if not self.valid or not self.key:
            raise ValueError("Invalid security configuration")
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
            response = await client.post(
                self.endpoint,
                headers={"X-Cisco-AI-Defense-API-Key": self.key},
                json={
                    "messages": messages,
                    "metadata": {
                        "src_app": "fsi-ai-studio-fraud-scoring",
                        "client_transaction_id": f"{run.request_id if run else uuid.uuid4()}:{stage}",
                    },
                },
            )
            response.raise_for_status()
            verdict = response.json()
        if type(verdict.get("is_safe")) is not bool:
            raise ValueError("Missing inspection verdict")
        return verdict

    async def check(self, messages, stage: str, *, title: str | None = None, enforce: bool = False) -> dict:
        """One inspection, emitted on the timeline; never raises.

        Returns {status: allowed|blocked|flagged|unavailable|off, safe, withhold, rules, classifiers, event_id}.
        withhold is True when the application must not use the text (blocked, or unavailable and failing closed).
        enforce blocks a violation even in monitor mode (the Studio egress policy require_ai_defense).
        """
        what = title or STAGE_LABEL.get(stage, stage)
        if self.mode == "off":
            return {"status": "off", "safe": None, "withhold": False, "rules": [], "classifiers": [], "event_id": None}
        run = security_run.get()
        try:
            verdict = await self._call(messages, stage)
        except Exception:
            if run:
                run.errors += 1
            withhold = not self.fail_open
            emit_current("guardrail", f"AI Defense · {what} · inspection unavailable", status="error",
                         body="Failed closed: the text is withheld." if withhold else "Failed open: the text is used uninspected.",
                         data={"stage": stage, "mode": self.mode})
            return {"status": "unavailable", "safe": None, "withhold": withhold, "rules": [], "classifiers": [], "event_id": None}
        event_id = verdict.get("event_id") if isinstance(verdict.get("event_id"), str) else None
        safe = verdict["is_safe"]
        if run:
            run.checks += 1
            if event_id and event_id not in run.event_ids:
                run.event_ids.append(event_id)
            if not safe:
                run.blocked += 1
        raw = verdict.get("classifications")
        classifiers = [item for item in raw if isinstance(item, str)][:6] if isinstance(raw, list) else []
        rules = _rules(verdict)
        status = "allowed" if safe else "blocked" if self.mode == "enforce" or enforce else "flagged"
        label = "clean" if safe else f"{', '.join(rules) or 'violation'} · {'blocked' if status == 'blocked' else 'flagged (monitor)'}"
        emit_current("guardrail", f"AI Defense · {what} · {label}", status=status,
                     data={"stage": stage, "mode": self.mode, "event_id": event_id, "classifiers": classifiers, "rules": rules,
                           "action": verdict.get("action") if isinstance(verdict.get("action"), str) else None})
        return {"status": status, "safe": safe, "withhold": status == "blocked", "rules": rules,
                "classifiers": classifiers, "event_id": event_id}

    async def inspect(self, messages, stage="narrative_input"):
        """The legacy narrative path: raises DefenseBlocked / DefenseUnavailable instead of returning a verdict."""
        result = await self.check(messages, stage)
        if result["status"] == "unavailable" and result["withhold"]:
            raise DefenseUnavailable("AI Defense inspection is unavailable. Narrative omitted.")
        if result["status"] == "blocked":
            raise DefenseBlocked("AI Defense blocked the narrative. Score was still released.")


defense = Defense()
