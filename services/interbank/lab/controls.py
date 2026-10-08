"""Splunk Agent Control on the agent's outbound A2A step.

The gateway is the network enforcement point (Cisco AI Defense on every hop).
Agent Control is the agent-runtime enforcement point: before this bank's agent
sends anything to the other bank, the server-defined controls bound to the
Splunk Agent Stream evaluate the exact message text.
"""

from __future__ import annotations

import asyncio
import os
from collections.abc import Sequence

import agent_control
from agent_control.observability import EventBatcher
from agent_control.otel_sink import create_otel_control_event_sink
from agent_control_models import ControlExecutionEvent
from agent_control_telemetry.sinks import BaseControlEventSink, SinkResult
from splunk_ao.logger import SplunkAOLogger

from lab.config import ORGANIZATION, env
from lab.telemetry import set_output, setup_telemetry, span

STEP_NAME = f"{ORGANIZATION}.send_a2a_message"
AGENT_NAME = f"interbank-{ORGANIZATION}-agent"


class ControlBlocked(RuntimeError):
    pass


class _ServerEventSink(BaseControlEventSink):
    """The SDK's default delivery: control-execution events to the Agent Control server."""

    def __init__(self, batcher: EventBatcher) -> None:
        self.batcher = batcher

    def write_events(self, events: Sequence[ControlExecutionEvent]) -> SinkResult:
        accepted = sum(1 for event in events if self.batcher.add_event(event))
        return SinkResult(accepted=accepted, dropped=len(events) - accepted)


def _register_event_sinks(server_url: str, api_key: str, api_key_header: str) -> None:
    """Fan each control execution out to the server and to this process's trace.

    The OTel sink records `agent_control.control_execution` spans parented on the
    span that called evaluate_controls, so every control verdict sits inside the
    investigation's Splunk trace next to the agent and gateway spans.
    """
    batcher = EventBatcher(server_url=server_url, api_key=api_key, api_key_header=api_key_header)
    batcher.start()
    agent_control.register_control_event_sink(_ServerEventSink(batcher))
    agent_control.register_control_event_sink(
        create_otel_control_event_sink({"enabled": True}, tracer_provider=setup_telemetry()))


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
        server_url = env("AGENT_CONTROL_URL")
        api_key = env("SPLUNK_AO_API_KEY")
        api_key_header = os.getenv("AGENT_CONTROL_API_KEY_HEADER", "Splunk-AO-API-Key")
        _register_event_sinks(server_url, api_key, api_key_header)
        agent_control.init(
            agent_name=AGENT_NAME,
            agent_description=f"{ORGANIZATION} settlement investigation agent",
            server_url=server_url,
            api_key=api_key,
            api_key_header=api_key_header,
            runtime_token_header=os.getenv("AGENT_CONTROL_RUNTIME_TOKEN_HEADER", "Authorization"),
            target_type="log_stream",
            target_id=self.stream_id,
            steps=[{"type": "tool", "name": STEP_NAME}],
            observability_enabled=True,
            observability_sink_name="registered",
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
