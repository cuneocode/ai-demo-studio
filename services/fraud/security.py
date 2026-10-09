"""Inspection applies only to optional fraud narratives, never to the score path."""
import os
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

import httpx

from runlog import emit_current

STAGE_LABEL = {"narrative_input": "analyst-summary prompt", "narrative_output": "analyst summary"}


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

    def health(self):
        return {
            "status": "disabled" if self.mode == "off" else "configured" if self.key and self.valid else "missing_configuration",
            "mode": self.mode,
            "fail_open": self.fail_open,
        }

    async def inspect(self, messages, stage="narrative_input"):
        if self.mode == "off":
            return
        run = security_run.get()
        try:
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
        except Exception:
            if run:
                run.errors += 1
            what = STAGE_LABEL.get(stage, stage)
            emit_current("guardrail", f"AI Defense · {what} · inspection unavailable", status="error",
                         body="Failed open; the summary continues." if self.fail_open else "Failed closed; the summary is omitted. The score is unaffected.",
                         data={"stage": stage, "mode": self.mode})
            if not self.fail_open:
                raise DefenseUnavailable("AI Defense inspection is unavailable. Narrative omitted.") from None
            return
        event_id = verdict.get("event_id")
        if run:
            run.checks += 1
            if isinstance(event_id, str) and event_id and event_id not in run.event_ids:
                run.event_ids.append(event_id)
            if not verdict["is_safe"]:
                run.blocked += 1
        what = STAGE_LABEL.get(stage, stage)
        safe = verdict["is_safe"]
        status = "allowed" if safe else "blocked" if self.mode == "enforce" else "flagged"
        raw = verdict.get("classifications")
        classifiers = [item for item in raw if isinstance(item, str)] if isinstance(raw, list) else []
        emit_current("guardrail", f"AI Defense · {what} · {'clean' if safe else 'blocked' if status == 'blocked' else 'violation (monitor)'}",
                     status=status, data={"stage": stage, "mode": self.mode, "event_id": event_id if isinstance(event_id, str) else None,
                                          "classifiers": classifiers[:6]})
        if not safe and self.mode == "enforce":
            raise DefenseBlocked("AI Defense blocked the narrative. Score was still released.")


defense = Defense()
