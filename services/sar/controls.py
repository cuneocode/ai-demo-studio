"""SAR policies: hosted Splunk Agent Control when registered, the same rules locally otherwise.

Banking pattern (services/banking/runtime_controls.py): deterministic code computes a typed
verdict, and a server-managed JSON control with a deny action enforces it. Only verdict
booleans reach the control service, never case data.

  sar-narrative-cited-v1         step sar-narrative-release (post): every sentence cited and verified
  sar-no-tipping-off-v1          step sar-customer-contact (pre):   no contact with the subject
  sar-file-requires-approval-v1  step sar-file (pre):               investigator decision + separate QA approval

setup_controls.py registers them (an explicit admin step). On startup the service looks for
them on the tenant; if they are missing it evaluates the identical JSON rules in-process
and every verdict is labelled "local check", never "Agent Control".
"""
from __future__ import annotations

import asyncio
import os
import threading

from runlog import emit_current

AGENT_NAME = "fsi-sar-investigation"
NARRATIVE_STEP = "sar-narrative-release"
CONTACT_STEP = "sar-customer-contact"
FILE_STEP = "sar-file"

POLICIES = {
    "sar-narrative-cited-v1": {
        "label": "Narrative must cite evidence", "short": "sar.narrative_cited", "step": NARRATIVE_STEP, "stage": "post",
        "step_type": "llm", "keys": ["every_sentence_cited", "every_fact_verified"],
    },
    "sar-no-tipping-off-v1": {
        "label": "No tipping off", "short": "sar.no_tipping_off", "step": CONTACT_STEP, "stage": "pre",
        "step_type": "tool", "keys": ["no_subject_contact"],
    },
    "sar-file-requires-approval-v1": {
        "label": "No filing without human approval", "short": "sar.file_requires_approval", "step": FILE_STEP, "stage": "pre",
        "step_type": "tool", "keys": ["investigator_decided", "rationale_recorded", "qa_approved", "separate_reviewers"],
    },
}
REASONS = {
    "every_sentence_cited": "a sentence has no valid citation",
    "every_fact_verified": "a figure is not in the cited evidence",
    "no_subject_contact": "the investigation may not contact the subject (tipping off)",
    "investigator_decided": "the investigator has not decided",
    "rationale_recorded": "no rationale is recorded",
    "qa_approved": "second-line QA has not approved",
    "separate_reviewers": "QA must be a different person from the investigator",
}


def server_url() -> str:
    return os.getenv("SAR_AGENT_CONTROL_URL") or next(
        (u for u in [os.getenv("AGENT_CONTROL_URL", "")] if u and "localhost" not in u),
        "https://agent-control.multitenant.galileocloud.io")


def definitions() -> dict:
    return {name: {
        "description": f"FSI studio SAR investigation: {spec['label']}. Deterministic verdict booleans; deny unless every key is true.",
        "enabled": True, "execution": "server",
        "scope": {"step_types": [spec["step_type"]], "step_names": [spec["step"]], "stages": [spec["stage"]]},
        "condition": {"selector": {"path": "input" if spec["stage"] == "pre" else "output"},
                      "evaluator": {"name": "json", "config": {"json_schema": {
                          "type": "object", "required": spec["keys"],
                          "properties": {key: {"const": True} for key in spec["keys"]},
                      }}}},
        "action": {"decision": "deny"}, "tags": ["fsi-sar", "studio-managed"],
    } for name, spec in POLICIES.items()}


def local_decision(name: str, verdict: dict) -> tuple[bool, list[str]]:
    """The control's JSON schema, evaluated in-process: deny unless every required key is exactly true."""
    failed = [key for key in POLICIES[name]["keys"] if verdict.get(key) is not True]
    return not failed, failed


class Controls:
    def __init__(self):
        self.mode = "local"
        self.detail = "Agent Control is not configured for SAR; the same rules run as local checks."
        self._lock = threading.Lock()
        self._started = False

    def health(self) -> dict:
        return {"status": "enforcing" if self.mode == "hosted" else "local", "execution": "server" if self.mode == "hosted" else "local",
                "names": [spec["short"] for spec in POLICIES.values()], "detail": self.detail, "fail_open": False}

    def start(self) -> None:
        """Loads bound controls; never creates or attaches them (setup_controls.py does that)."""
        with self._lock:
            if self._started:
                return
            self._started = True
        if not (os.getenv("GALILEO_API_KEY") and os.getenv("GALILEO_LOG_STREAM") and os.getenv("GALILEO_PROJECT")):
            self.detail = "Agent Control needs GALILEO_API_KEY, GALILEO_PROJECT, and GALILEO_LOG_STREAM; running the same rules as local checks."
            return
        try:
            import agent_control
            from galileo.log_streams import LogStreams
            stream = LogStreams().get(name=os.environ["GALILEO_LOG_STREAM"], project_name=os.environ["GALILEO_PROJECT"])
            agent_control.init(agent_name=AGENT_NAME, server_url=server_url(),
                               api_key=os.environ["GALILEO_API_KEY"], api_key_header="Galileo-API-Key",
                               runtime_token_header=os.getenv("SAR_CONTROL_TOKEN_HEADER", "Authorization"),
                               target_type="log_stream", target_id=str(stream.id),
                               observability_enabled=True, observability_sink_name="registered", policy_refresh_interval_seconds=60,
                               steps=[{"type": spec["step_type"], "name": spec["step"]} for spec in POLICIES.values()])
            missing = self._missing()
            if missing:
                self.detail = (f"SAR controls are not registered on the Agent Control tenant ({', '.join(missing)}); "
                               "running the same rules as local checks. Register them with services/sar/setup_controls.py.")
                return
            self.mode = "hosted"
            self.detail = "Hosted Splunk Agent Control: SAR controls bound to the studio log stream."
        except Exception as exc:  # unavailable tenant is not a crash; the rules still run locally
            self.detail = f"Agent Control unavailable ({type(exc).__name__}); running the same rules as local checks."

    def _missing(self) -> list[str]:
        import agent_control
        configured = {c["name"]: c for c in (agent_control.get_server_controls() or [])}
        missing = []
        for name, expected in definitions().items():
            actual = configured.get(name, {}).get("control", {})
            scope = actual.get("scope", {})
            if (actual.get("enabled") is not True or actual.get("action", {}).get("decision") != "deny"
                    or any(scope.get(k) != expected["scope"][k] for k in ("step_names", "stages", "step_types"))):
                missing.append(name)
        return missing

    async def _hosted(self, name: str, verdict: dict) -> bool:
        import agent_control
        spec = POLICIES[name]
        result = await asyncio.wait_for(agent_control.evaluate_controls(
            spec["step"], agent_name=AGENT_NAME, stage=spec["stage"],
            **{"input" if spec["stage"] == "pre" else "output": verdict}), 20)
        if result.errors:
            raise RuntimeError("Agent Control did not complete the check")
        return bool(result.is_safe)

    async def check(self, name: str, verdict: dict, *, note: str | None = None, deny_note: str | None = None) -> dict:
        """Evaluates one policy, emits a `control` event, and returns {allowed, failed, engine}."""
        spec = POLICIES[name]
        allowed, failed = local_decision(name, verdict)
        engine = "local"
        if self.mode == "hosted":
            try:
                hosted = await self._hosted(name, verdict)
                engine = "hosted"
                if hosted != allowed:
                    failed = failed or ["hosted policy denied"]
                allowed = hosted
            except Exception:
                allowed, engine = False, "hosted-unavailable"
                failed = ["Agent Control unavailable (failed closed)"]
        label = "Agent Control" if engine == "hosted" else "Policy (local check)" if engine == "local" else "Agent Control unavailable"
        reason = "; ".join(REASONS.get(key, key) for key in failed)
        title = f"{label} · {spec['short']} · {'allow' if allowed else 'deny'}" + ("" if allowed else f" · {deny_note or reason}")
        emit_current("control", title, status="allowed" if allowed else "denied",
                     body=note if allowed else (reason or None),
                     data={"policy": name, "short": spec["short"], "engine": engine, "verdict": verdict, "failed": failed,
                           "step": spec["step"], "stage": spec["stage"]})
        return {"policy": spec["short"], "name": name, "label": spec["label"], "allowed": allowed, "failed": failed,
                "engine": engine, "reason": reason}


controls = Controls()
