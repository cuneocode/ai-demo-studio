"""Splunk Agent Control on the agent's outbound A2A step.

The gateway is the network enforcement point (Cisco AI Defense on every hop).
Agent Control is the agent-runtime enforcement point: before this bank's agent
sends anything to the other bank, the server-defined controls bound to the
Splunk Agent Stream evaluate the exact message text.
"""

from __future__ import annotations

import asyncio
import os

import agent_control
from splunk_ao.logger import SplunkAOLogger

from lab.config import ORGANIZATION, env
from lab.telemetry import set_output, span

STEP_NAME = f"{ORGANIZATION}.send_a2a_message"
AGENT_NAME = f"interbank-{ORGANIZATION}-agent"


class ControlBlocked(RuntimeError):
    pass


class OutboundControls:
    def __init__(self) -> None:
        self.stream_id: str | None = None
        self._lock = asyncio.Lock()

    def _init(self) -> None:
        logger = SplunkAOLogger(project=env("SPLUNK_AO_PROJECT"),
                                agent_stream=env("SPLUNK_AO_AGENT_STREAM"), mode="batch")
        if not logger.agent_stream_id:
            raise RuntimeError("Splunk Agent Stream was not resolved")
        self.stream_id = str(logger.agent_stream_id)
        agent_control.init(
            agent_name=AGENT_NAME,
            agent_description=f"{ORGANIZATION} settlement investigation agent",
            server_url=env("AGENT_CONTROL_URL"),
            api_key=env("SPLUNK_AO_API_KEY"),
            api_key_header=os.getenv("AGENT_CONTROL_API_KEY_HEADER", "Splunk-AO-API-Key"),
            runtime_token_header=os.getenv("AGENT_CONTROL_RUNTIME_TOKEN_HEADER", "Authorization"),
            target_type="log_stream",
            target_id=self.stream_id,
            steps=[{"type": "tool", "name": STEP_NAME}],
            observability_enabled=True,
            policy_refresh_interval_seconds=30,
        )

    async def check_outbound(self, message: str) -> list[dict]:
        """Raise ControlBlocked if a bound control denies this outbound A2A message."""
        async with self._lock:
            if self.stream_id is None:
                await asyncio.to_thread(self._init)
        with span("Splunk Agent Control: outbound A2A message", kind="tool",
                  label="splunk_agent_control.evaluate_controls", input=message,
                  attributes={"guardrail.step": STEP_NAME, "guardrail.agent": AGENT_NAME,
                              "guardrail.stage": "pre"}) as current:
            result = await agent_control.evaluate_controls(
                STEP_NAME,
                step_type="tool",
                stage="pre",
                input={"message": message},
                agent_name=AGENT_NAME,
            )
            checks = [
                {"control": item.control_name, "matched": matched}
                for matched, items in ((True, result.matches), (False, result.non_matches))
                for item in items or []
            ]
            verdict = {"allowed": bool(result.is_safe), "controls": checks}
            current.set_attribute("guardrail.action", "allow" if result.is_safe else "deny")
            set_output(current, verdict)
            if result.errors:
                raise ControlBlocked("Agent Control evaluation failed; message not sent")
            if not result.is_safe:
                names = ", ".join(c["control"] for c in checks if c["matched"])
                raise ControlBlocked(f"Splunk Agent Control denied the outbound message ({names})")
            return checks


outbound_controls = OutboundControls()
