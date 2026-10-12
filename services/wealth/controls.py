"""Wealth policies: deterministic verdicts, enforced by hosted Agent Control when it is reachable.

Code computes each verdict (services/wealth/compliance.py, the claim verifier, the human decision);
only the verdict booleans reach Agent Control, where server-managed JSON controls deny when one is
false. This mirrors the banking demo (services/banking/runtime_controls.py) and reuses its tenant
settings. scripts/setup_controls.py creates and binds these controls; normal startup never does.

When hosted controls are not bound or not reachable, the same verdicts are enforced locally and every
check is labelled "Local policy check" so the demo never claims Agent Control ran when it did not.
"""
from __future__ import annotations

import asyncio
import os

from runlog import emit_current

AGENT_NAME = "fsi-wealth-runtime"
STEPS = {
    "research_precheck": ("fsi-wealth-research-precheck", "pre"),
    "research_publish": ("fsi-wealth-research-publish", "post"),
    "advisory_send": ("fsi-wealth-advisory-send", "post"),
}
# control name → (label, verdict key, step key)
POLICIES = {
    "fsi-wealth-research-precheck-restricted-v1": ("Restricted list", "issuer_not_restricted", "research_precheck"),
    "fsi-wealth-research-restricted-v1": ("Restricted list", "issuer_not_restricted", "research_publish"),
    "fsi-wealth-research-no-rating-v1": ("No rating or price target", "no_rating_or_price_target", "research_publish"),
    "fsi-wealth-research-no-guarantee-v1": ("No performance guarantees", "no_guarantee", "research_publish"),
    "fsi-wealth-research-claims-verified-v1": ("Only verified claims", "claims_verified", "research_publish"),
    "fsi-wealth-research-strategist-approval-v1": ("Strategist approval", "strategist_approved", "research_publish"),
    "fsi-wealth-advisory-no-guarantee-v1": ("No performance guarantees", "no_guarantee", "advisory_send"),
    "fsi-wealth-advisory-no-trade-instruction-v1": ("No trade or wire instructions", "no_trade_or_wire_instruction", "advisory_send"),
    "fsi-wealth-advisory-suitable-v1": ("Suitable for the client's profile", "suitable_for_profile", "advisory_send"),
    "fsi-wealth-advisory-supervisor-approval-v1": ("Supervisor approval", "supervisor_approved", "advisory_send"),
}
POLICY_IDS = {"research_precheck": "research.precheck", "research_publish": "research.publish", "advisory_send": "advisory.recommendation"}


def server_url() -> str:
    configured = os.getenv("AGENT_CONTROL_URL", "")
    return configured if configured and "localhost" not in configured else "https://agent-control.multitenant.galileocloud.io"


def definitions() -> dict:
    out = {}
    for name, (label, key, step_key) in POLICIES.items():
        step, stage = STEPS[step_key]
        out[name] = {
            "description": f"FSI wealth: {label}. Deterministic verdict computed by the wealth service; hosted Agent Control enforcement.",
            "enabled": True, "execution": "server",
            "scope": {"step_types": ["llm"], "step_names": [step], "stages": [stage]},
            "condition": {"selector": {"path": "input" if stage == "pre" else "output"},
                          "evaluator": {"name": "json", "config": {"json_schema": {
                              "type": "object", "required": [key], "properties": {key: {"const": True}},
                          }}}},
            "action": {"decision": "deny"}, "tags": ["fsi-wealth", "studio-managed"],
        }
    return out


class WealthControls:
    def __init__(self) -> None:
        self.ready = False
        self.reason = "not started"
        self._lock = asyncio.Lock()
        self._tried = False

    def health(self) -> dict:
        return {
            "status": "enforcing" if self.ready else "local" if self._tried else "not_started",
            "source": "agent_control" if self.ready else "local",
            "reason": None if self.ready else self.reason,
            "policies": sorted({POLICY_IDS[step] for _l, _k, step in POLICIES.values()}),
        }

    def _start(self) -> None:
        import agent_control
        from galileo.log_streams import LogStreams

        stream = LogStreams().get(name=os.environ["GALILEO_LOG_STREAM"], project_name=os.environ["GALILEO_PROJECT"])
        agent_control.init(
            agent_name=AGENT_NAME, server_url=server_url(), api_key=os.environ["GALILEO_API_KEY"], api_key_header="Galileo-API-Key",
            runtime_token_header="Authorization", target_type="log_stream", target_id=str(stream.id),
            observability_enabled=True, observability_sink_name="registered", policy_refresh_interval_seconds=60,
            steps=[{"type": "llm", "name": step} for step, _stage in STEPS.values()])
        self._verify(agent_control)

    def _verify(self, agent_control) -> None:
        configured = {row["name"]: row for row in (agent_control.get_server_controls() or [])}
        for name, expected in definitions().items():
            actual = configured.get(name, {}).get("control", {})
            if not actual:
                raise RuntimeError("wealth controls are not bound to this log stream (run services/wealth/scripts/setup_controls.py)")
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
            if not (os.getenv("GALILEO_API_KEY") and os.getenv("GALILEO_LOG_STREAM") and os.getenv("GALILEO_PROJECT")):
                self.reason = "Galileo is not configured"
                return False
            try:
                await asyncio.wait_for(asyncio.to_thread(self._start), 25)
                self.ready = True
                self.reason = ""
            except Exception as exc:  # the reason is shown; secrets never are
                message = str(exc) if isinstance(exc, RuntimeError) else type(exc).__name__
                self.reason = f"Agent Control unavailable: {message}"
        return self.ready

    async def evaluate(self, step_key: str, verdicts: dict[str, bool], *, emit: bool = True) -> dict:
        """Every policy on the step, with its verdict and who enforced it."""
        step, stage = STEPS[step_key]
        policies = {name: spec for name, spec in POLICIES.items() if spec[2] == step_key}
        source = "local"
        denied_names: set[str] | None = None
        detail = self.reason
        if await self.ensure():
            try:
                import agent_control
                result = await asyncio.wait_for(agent_control.evaluate_controls(
                    step, agent_name=AGENT_NAME, stage=stage, **{"input" if stage == "pre" else "output": verdicts}), 20)
                if result.errors:
                    raise RuntimeError("Agent Control did not complete every check")
                denied_names = {item.control_name for item in result.matches or [] if item.control_name in policies}
                seen = denied_names | {item.control_name for item in result.non_matches or [] if item.control_name in policies}
                if not result.is_safe and not denied_names:
                    raise RuntimeError("Agent Control denied without naming a wealth control")
                if result.is_safe and not set(policies) <= seen:
                    raise RuntimeError("Agent Control skipped a wealth control")
                if result.is_safe and not all(verdicts.get(key) for _label, key, _step in policies.values()):
                    raise RuntimeError("Agent Control allowed a failing verdict, so the local check decides")
                source = "agent_control"
            except Exception as exc:
                denied_names = None
                detail = f"Agent Control unavailable for this check: {exc if isinstance(exc, RuntimeError) else type(exc).__name__}"
        checks = []
        for name, (label, key, _step) in policies.items():
            passed = bool(verdicts.get(key))
            if denied_names is not None:
                status = "denied" if name in denied_names else "allowed"
                if source == "agent_control" and name not in denied_names and not passed and denied_names:
                    status = "not_evaluated"  # the hosted engine may stop at the first deny
            else:
                status = "allowed" if passed else "denied"
            checks.append({"policy": POLICY_IDS[step_key], "control": name, "label": label, "key": key, "verdict": passed,
                           "status": status, "source": source})
        allowed = all(row["status"] == "allowed" for row in checks)
        if emit:
            by = "Agent Control" if source == "agent_control" else "Local policy check"
            for row in checks:
                emit_current("control", f"{by} · {POLICY_IDS[step_key]} · {row['label']} · {row['status'].replace('_', ' ')}",
                             status="allowed" if row["status"] == "allowed" else "denied" if row["status"] == "denied" else "info",
                             body=None if source == "agent_control" else detail or None,
                             data={"policy": row["policy"], "control": row["control"], "source": source, "verdict": row["verdict"]})
        return {"policy": POLICY_IDS[step_key], "allowed": allowed, "source": source, "checks": checks,
                "detail": None if source == "agent_control" else detail}


controls = WealthControls()

__all__ = ["AGENT_NAME", "POLICIES", "STEPS", "WealthControls", "controls", "definitions", "server_url"]
