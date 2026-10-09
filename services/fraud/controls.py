"""Action and note policies for the fraud triage agent: deterministic verdicts, enforced by hosted Agent Control.

Code computes each verdict (is the action reversible or analyst-approved; is the note free of a full card
number or SSN). Only the verdict booleans reach Agent Control, where server-managed JSON controls deny when
one is false: the same pattern as services/banking/runtime_controls.py and services/wealth/controls.py, on
the same tenant settings. setup_controls.py creates and binds these controls; startup never does.

When the controls are not bound or Agent Control is unreachable, the same verdicts are enforced locally and
every check says "Local policy check", so the demo never claims Agent Control ran when it did not.
Nothing here calls an LLM.
"""
import asyncio
import os
import re

AGENT_NAME = "fsi-fraud-triage-runtime"
STEPS = {"take_action": ("fsi-fraud-take-action", "pre"), "case_note": ("fsi-fraud-case-note", "pre")}
# control name → (policy id, label, verdict key, step key)
POLICIES = {
    "fsi-fraud-take-action-approval-v1": ("fraud.take_action", "Analyst approval for irreversible card actions",
                                          "approved_or_reversible", "take_action"),
    "fsi-fraud-note-no-pii-v1": ("fraud.note_pii", "No full card number or SSN in case notes", "no_full_pan_or_ssn", "case_note"),
}
LOCAL_LABEL = "Local policy check"
HOSTED_LABEL = "Agent Control"

IRREVERSIBLE = frozenset({"block_and_reissue", "decline", "close_case", "bulk_reissue", "false_positive"})
REVERSIBLE = frozenset({"contact_customer", "escalate", "flag_merchant", "add_note"})
ACTIONS = IRREVERSIBLE | REVERSIBLE
ANALYST_ROLES = frozenset({"analyst"})

PAN = re.compile(r"(?<!\d)(?:\d[ -]?){12,18}\d(?!\d)")
SSN = re.compile(r"\b\d{3}-\d{2}-\d{4}\b")


def server_url() -> str:
    configured = os.getenv("AGENT_CONTROL_URL", "")
    return configured if configured and "localhost" not in configured else "https://agent-control.multitenant.galileocloud.io"


def definitions() -> dict:
    out = {}
    for name, (_policy, label, key, step_key) in POLICIES.items():
        step, stage = STEPS[step_key]
        out[name] = {
            "description": f"FSI card fraud triage: {label}. Deterministic verdict computed by the fraud service; hosted Agent Control enforcement.",
            "enabled": True, "execution": "server",
            "scope": {"step_types": ["tool"], "step_names": [step], "stages": [stage]},
            "condition": {"selector": {"path": "input"}, "evaluator": {"name": "json", "config": {"json_schema": {
                "type": "object", "required": [key], "properties": {key: {"const": True}},
            }}}},
            "action": {"decision": "deny"}, "tags": ["fsi-fraud", "studio-managed"],
        }
    return out


# ------------------------------------------------------------------ deterministic verdicts ----

def _luhn(digits: str) -> bool:
    total = 0
    for index, char in enumerate(reversed(digits)):
        value = int(char)
        if index % 2:
            value = value * 2 - 9 if value > 4 else value * 2
        total += value
    return total % 10 == 0


def find_pans(text: str) -> list[str]:
    found = []
    for match in PAN.finditer(text or ""):
        digits = re.sub(r"\D", "", match.group())
        if 13 <= len(digits) <= 19 and _luhn(digits):
            found.append(match.group())
    return found


def take_action(action: str, *, approved_by: str | None = None, role: str | None = None, scope: str | None = None) -> dict:
    """fraud.take_action verdict: reversible actions pass; irreversible ones need an analyst's approval."""
    if action not in ACTIONS:
        return _verdict("fraud.take_action", "deny", f"Unknown action {action!r}.", action=action)
    if action in REVERSIBLE:
        return _verdict("fraud.take_action", "allow", "Reversible action; no approval needed.", action=action)
    if role in ANALYST_ROLES and approved_by:
        return _verdict("fraud.take_action", "allow", f"Approved by {approved_by}.", action=action, approved_by=approved_by, scope=scope)
    return _verdict("fraud.take_action", "deny", "Requires analyst approval. The agent may propose it; only an analyst can approve it.",
                    action=action, scope=scope)


def note_pii(note: str) -> dict:
    """fraud.note_pii verdict: deny a note with a full card number (Luhn-valid) or an SSN pattern."""
    pans, ssns = find_pans(note), SSN.findall(note or "")
    found = (["card number"] if pans else []) + (["SSN"] if ssns else [])
    if found:
        return _verdict("fraud.note_pii", "deny", f"The note contains a full {' and '.join(found)}. Re-enter with the last 4 only.",
                        entities=found, masked=mask(note))
    return _verdict("fraud.note_pii", "allow", "No full card number or SSN.")


def mask(note: str) -> str:
    """Last 4 only: masking is done here, by the application. The AI Defense tenant returns verdicts, not redactions."""
    def card(match: re.Match) -> str:
        digits = re.sub(r"\D", "", match.group())
        return f"card ending {digits[-4:]}" if 13 <= len(digits) <= 19 and _luhn(digits) else match.group()
    masked = PAN.sub(card, note or "")
    masked = re.sub(r"\b(card) card ending\b", r"\1 ending", masked, flags=re.I)
    masked = SSN.sub(lambda m: f"SSN ending {m.group()[-4:]}", masked)
    return re.sub(r"\bSSN:?\s+SSN ending\b", "SSN ending", masked, flags=re.I)


def _verdict(policy: str, decision: str, reason: str, **extra) -> dict:
    return {"policy": policy, "decision": decision, "reason": reason, "source": "local", "engine_label": LOCAL_LABEL, **extra}


# ------------------------------------------------------------------- hosted enforcement ----

class FraudControls:
    def __init__(self) -> None:
        self.ready = False
        self.reason = "not started"
        self._tried = False
        self._lock = asyncio.Lock()

    def health(self) -> dict:
        return {"status": "enforcing" if self.ready else "local" if self._tried else "not_started",
                "source": "agent_control" if self.ready else "local", "reason": None if self.ready else self.reason,
                "policies": sorted({spec[0] for spec in POLICIES.values()}), "controls": sorted(POLICIES)}

    def _start(self) -> None:
        import agent_control
        from galileo.log_streams import LogStreams

        stream = LogStreams().get(name=os.environ["GALILEO_LOG_STREAM"], project_name=os.environ["GALILEO_PROJECT"])
        agent_control.init(
            agent_name=AGENT_NAME, server_url=server_url(), api_key=os.environ["GALILEO_API_KEY"], api_key_header="Galileo-API-Key",
            runtime_token_header="Authorization", target_type="log_stream", target_id=str(stream.id),
            observability_enabled=True, observability_sink_name="registered", policy_refresh_interval_seconds=60,
            steps=[{"type": "tool", "name": step} for step, _stage in STEPS.values()])
        self._verify(agent_control)

    def _verify(self, agent_control) -> None:
        configured = {row["name"]: row for row in (agent_control.get_server_controls() or [])}
        for name, expected in definitions().items():
            actual = configured.get(name, {}).get("control", {})
            if not actual:
                raise RuntimeError("fraud controls are not bound to this log stream (run services/fraud/setup_controls.py)")
            if any(actual.get(key) != expected[key] for key in ("enabled", "execution")) or actual.get("action", {}).get("decision") != "deny":
                raise RuntimeError(f"control {name} is disabled or does not deny")
            if any((actual.get("scope") or {}).get(key) != expected["scope"][key] for key in ("step_names", "stages", "step_types")):
                raise RuntimeError(f"control {name} is mis-scoped")

    async def ensure(self) -> bool:
        if self.ready or self._tried:
            return self.ready
        async with self._lock:
            if self._tried:
                return self.ready
            self._tried = True
            if os.getenv("FRAUD_AGENT_CONTROL", "auto").lower() == "off":
                self.reason = "Agent Control is off (FRAUD_AGENT_CONTROL=off)"
                return False
            if not (os.getenv("GALILEO_API_KEY") and os.getenv("GALILEO_LOG_STREAM") and os.getenv("GALILEO_PROJECT")):
                self.reason = "Galileo is not configured"
                return False
            try:
                await asyncio.wait_for(asyncio.to_thread(self._start), 25)
                self.ready, self.reason = True, ""
            except Exception as exc:  # the reason is shown; secrets never are
                self.reason = f"Agent Control unavailable: {exc if isinstance(exc, RuntimeError) else type(exc).__name__}"
        return self.ready

    async def enforce(self, step_key: str, local: dict) -> dict:
        """The local verdict, enforced by hosted Agent Control when bound. A deny from either side denies."""
        name = next(name for name, spec in POLICIES.items() if spec[3] == step_key)
        key = POLICIES[name][2]
        verdicts = {key: local["decision"] == "allow"}
        if not await self.ensure():
            return {**local, "detail": self.reason}
        step, stage = STEPS[step_key]
        try:
            import agent_control
            result = await asyncio.wait_for(agent_control.evaluate_controls(
                step, agent_name=AGENT_NAME, step_type="tool", stage=stage, input=verdicts), 20)
            if result.errors:
                raise RuntimeError("Agent Control did not complete the check")
            denied = any(item.control_name == name for item in result.matches or [])
            seen = denied or any(item.control_name == name for item in result.non_matches or [])
            if not seen:
                raise RuntimeError("Agent Control skipped the fraud control")
            match = next((item for item in (result.matches or []) + (result.non_matches or []) if item.control_name == name), None)
        except Exception as exc:
            return {**local, "detail": f"Agent Control unavailable for this check: {exc if isinstance(exc, RuntimeError) else type(exc).__name__}"}
        decision = "deny" if denied or local["decision"] == "deny" else "allow"
        return {**local, "decision": decision, "source": "agent_control", "engine_label": HOSTED_LABEL, "control": name,
                "control_execution_id": str(getattr(match, "control_execution_id", "") or "") or None}


controls = FraudControls()


async def enforce_action(action: str, **kwargs) -> dict:
    return await controls.enforce("take_action", take_action(action, **kwargs))


async def enforce_note(note: str) -> dict:
    return await controls.enforce("case_note", note_pii(note))


def health() -> dict:
    return controls.health()
