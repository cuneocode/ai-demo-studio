"""Cisco AI Defense for the SAR service, plus a labelled local pattern check.

Two placements:
  * Untrusted text (customer documents, P2P memos, fraud referral notes) is inspected one
    segment at a time before the agent sees it. On this tenant a whole letter or a
    "tool result" wrapper hides an injection that the same paragraph alone trips, so
    segment-level inspection is deliberate. Flagged segments are withheld in enforce mode.
  * Every model hop (prompt and response) is inspected; enforce is forced when the case
    file goes to a hosted model (studio_models.egress_decision).

AI Defense fails closed: no verdict means the segment is withheld or the call stops.
"""
from __future__ import annotations

import asyncio
import json
import os
import re
import uuid
from contextvars import ContextVar
from dataclasses import dataclass, field

import httpx

from runlog import emit_current

STAGE_LABEL = {"model_input": "prompt", "model_output": "model response"}

INJECTION_PATTERNS = [
    r"\bignore (?:all |any )?(?:the )?(?:previous|prior|above|earlier) (?:instructions|directions|rules)",
    r"\bdisregard (?:all |any )?(?:the )?(?:previous|prior|above|investigation) (?:instructions|rules|directions)",
    r"\byou are now in\b",
    r"\bsystem override\b",
    r"\bnote to (?:any )?(?:automated|ai) (?:reviewer|assistant|system)\b",
    r"\bmark (?:this|the) (?:case|account|alert|transfer) as\b",
    r"\b(?:do not|don't) file (?:a |the )?sar\b",
    r"\bclose the (?:alert|case|review)\b",
]
_INJECTION = re.compile("|".join(INJECTION_PATTERNS), re.IGNORECASE)
_DIGITS = re.compile(r"\b(?:\d[ -]?){13,19}\b")
_SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


class DefenseBlocked(Exception):
    pass


class DefenseUnavailable(Exception):
    pass


def _luhn(digits: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2:
            value = value * 2 - 9 if value * 2 > 9 else value * 2
        total += value
    return total % 10 == 0


def local_findings(text: str) -> list[str]:
    """Deterministic checks the service runs on every untrusted segment, with or without AI Defense."""
    findings = []
    if _INJECTION.search(text):
        findings.append("Instruction-like text")
    for match in _DIGITS.finditer(text):
        digits = re.sub(r"\D", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn(digits):
            findings.append("Card number")
            break
    if _SSN.search(text):
        findings.append("SSN")
    return findings


@dataclass
class SecurityRun:
    request_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    checks: int = 0
    blocked: int = 0
    errors: int = 0
    withheld: int = 0
    local_flags: int = 0
    event_ids: list[str] = field(default_factory=list)
    forced: bool = False

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
            "withheld_segments": self.withheld,
            "local_flags": self.local_flags,
            "event_ids": self.event_ids,
            "fail_open": False,
            "forced": self.forced,
        }


security_run: ContextVar[SecurityRun | None] = ContextVar("sar_security_run", default=None)


class Defense:
    def __init__(self):
        self.key = os.getenv("AIDEFENSE_API_KEY", "")
        self.mode = (os.getenv("SAR_AIDEFENSE_MODE") or os.getenv("AIDEFENSE_MODE") or "off").lower()
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

    def can_enforce(self) -> bool:
        """Whether a request can be inspected in enforce mode, whatever the configured mode."""
        return bool(self.key and self.endpoint and 0 < self.timeout <= 120)

    def active(self, enforce: bool = False) -> bool:
        return self.can_enforce() and (enforce or self.mode in {"monitor", "enforce"})

    async def _verdict(self, messages: list[dict], stage: str) -> dict:
        run = security_run.get()
        async with httpx.AsyncClient(timeout=self.timeout, follow_redirects=False) as client:
            response = await client.post(
                self.endpoint,
                headers={"X-Cisco-AI-Defense-API-Key": self.key},
                json={
                    "messages": messages,
                    "metadata": {
                        "src_app": "fsi-ai-studio-sar",
                        "client_transaction_id": f"{run.request_id if run else uuid.uuid4()}:{stage}",
                    },
                },
            )
            response.raise_for_status()
            verdict = response.json()
        if type(verdict.get("is_safe")) is not bool:
            raise ValueError("Missing inspection verdict")
        return verdict

    def _count(self, verdict: dict) -> str | None:
        run = security_run.get()
        event_id = verdict.get("event_id") if isinstance(verdict.get("event_id"), str) else None
        if run:
            run.checks += 1
            if event_id and event_id not in run.event_ids:
                run.event_ids.append(event_id)
            if not verdict["is_safe"]:
                run.blocked += 1
        return event_id

    async def inspect(self, messages, stage="model_input", enforce=False):
        """A model hop. Raises DefenseBlocked (enforce) or DefenseUnavailable (no verdict)."""
        mode = "enforce" if enforce else self.mode
        run = security_run.get()
        if enforce and run:
            run.forced = True
        if mode == "off" or not self.can_enforce():
            if enforce:
                raise DefenseUnavailable("AI Defense must inspect this hosted call but is not configured.")
            return
        try:
            verdict = await self._verdict(messages, stage)
        except Exception:
            if run:
                run.errors += 1
            emit_current("guardrail", f"AI Defense · {STAGE_LABEL.get(stage, stage)} · inspection unavailable", status="error",
                         body="No verdict came back, so the call failed closed.", data={"stage": stage, "mode": mode})
            raise DefenseUnavailable("AI Defense inspection is unavailable; nothing was sent.") from None
        event_id = self._count(verdict)
        outcome = "allowed" if verdict["is_safe"] else "flagged" if mode == "monitor" else "blocked"
        rules = rule_names(verdict)
        emit_current("guardrail", f"AI Defense · {STAGE_LABEL.get(stage, stage)} · {outcome}" + (f" · {', '.join(rules)}" if rules else ""),
                     status=outcome, data={"stage": stage, "mode": mode, "forced": enforce and self.mode != "enforce",
                                           "event_id": event_id, "rules": rules})
        if not verdict["is_safe"] and mode != "monitor":
            raise DefenseBlocked("AI Defense blocked this model call.")

    async def screen(self, segments: list[dict], *, label: str, enforce: bool = False) -> list[dict]:
        """Untrusted text, one segment at a time. Returns segments with a verdict and `withheld`.

        Each input is {id, text}. AI Defense (when configured) and the local pattern check both
        run; in enforce mode a segment either one flags is withheld from the agent.
        """
        run = security_run.get()
        mode = "enforce" if enforce else self.mode
        use_defense = self.active(enforce)

        async def one(segment: dict) -> dict:
            text = segment["text"]
            local = local_findings(text)
            result = {**segment, "local": local, "defense": None, "rules": [], "withheld": False, "flagged_by": []}
            if use_defense:
                try:
                    verdict = await self._verdict([{"role": "user", "content": text}], f"untrusted:{segment['id']}")
                    result["event_id"] = self._count(verdict)
                    result["defense"] = "allowed" if verdict["is_safe"] else "flagged"
                    result["rules"] = rule_names(verdict)
                except Exception:
                    if run:
                        run.errors += 1
                    result["defense"] = "unavailable"
            if result["defense"] == "flagged":
                result["flagged_by"].append("AI Defense" + (f" · {', '.join(result['rules'])}" if result["rules"] else ""))
            if local:
                result["flagged_by"].append(f"Local check · {', '.join(local)}")
                if run:
                    run.local_flags += 1
            blocking = mode == "enforce" or not use_defense
            if result["defense"] == "unavailable" or (result["flagged_by"] and blocking):
                result["withheld"] = True
                if run:
                    run.withheld += 1
            return result

        results = list(await asyncio.gather(*(one(segment) for segment in segments)))
        inspected = sum(1 for item in results if item["defense"] in {"allowed", "flagged"})
        for item in results:
            if not item["flagged_by"] and item["defense"] != "unavailable":
                continue
            if item["defense"] == "unavailable":
                title = f"AI Defense · {label} {item['id']} · inspection unavailable · withheld"
                status = "error"
            else:
                who = item["flagged_by"][0] if item["defense"] == "flagged" else item["flagged_by"][-1]
                title = f"{who} · {label} {item['id']} · {'withheld from the agent' if item['withheld'] else 'flagged'}"
                status = "blocked" if item["withheld"] else "flagged"
            emit_current("guardrail", title, status=status,
                         body="Untrusted text is data, not instructions. The flagged segment never reaches the model." if item["withheld"]
                         else "Monitor mode: the segment was flagged but passed through.",
                         data={"segment": item["id"], "rules": item["rules"], "local": item["local"], "mode": mode,
                               "event_id": item.get("event_id"), "withheld": item["withheld"]})
        clean = sum(1 for item in results if not item["flagged_by"] and item["defense"] != "unavailable")
        if use_defense:
            emit_current("guardrail", f"AI Defense · {label} · {inspected} segment{'s' if inspected != 1 else ''} inspected · {clean} clean",
                         status="allowed" if clean == len(results) else "flagged",
                         data={"inspected": inspected, "clean": clean, "mode": mode})
        else:
            emit_current("guardrail", f"Local check only · {label} · {len(results)} segment{'s' if len(results) != 1 else ''} · AI Defense not configured",
                         status="flagged" if clean != len(results) else "info",
                         body="A deterministic pattern check, not AI Defense.", data={"inspected": 0, "clean": clean})
        return results


def rule_names(verdict: dict) -> list[str]:
    names = [str(rule.get("rule_name")) for rule in verdict.get("rules") or [] if isinstance(rule, dict) and rule.get("rule_name")]
    if not names:
        names = [str(item) for item in verdict.get("classifications") or [] if item]
    return list(dict.fromkeys(names))


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
            content = "Tool result (untrusted data): " + content
        result.append({"role": role, "content": content or "[empty message]"})
    return result


defense = Defense()
