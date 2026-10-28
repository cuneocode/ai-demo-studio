"""Splunk Agent Observability traces (Galileo SDK) for triage runs, plus the optional OTLP status.

A trace per investigation: a tool span for each score, rules, neighborhood, explain, similar-cases,
playbook, and draft call, and the agent's model calls through the LangChain callback. Configuration
is not delivery: a run reports "recorded" only after the SDK's flush returned the trace.
"""
import asyncio
import json
import os
import time


class FraudTelemetry:
    def __init__(self):
        traces = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
        token = os.getenv("SPLUNK_ACCESS_TOKEN")
        realm = os.getenv("SPLUNK_REALM")
        if traces or (token and realm):
            self.status = "configured"
            self.missing = []
        else:
            self.status = "missing_configuration"
            self.missing = ["SPLUNK_REALM + SPLUNK_ACCESS_TOKEN, or OTEL_EXPORTER_OTLP_ENDPOINT"]
        self.service_name = os.getenv("OTEL_SERVICE_NAME", "fraud-scoring")

    @property
    def galileo(self) -> str:
        return "configured" if os.getenv("GALILEO_API_KEY") else "disabled"

    def health(self):
        return {"status": self.status, "service_name": self.service_name, "missing": self.missing, "galileo": self.galileo}

    def delivery(self, case_id: str):
        if self.status != "configured":
            return {"status": self.status}
        return {"status": "configured", "case_id": case_id}


telemetry = FraudTelemetry()


def _text(value) -> str:
    return value if isinstance(value, str) else json.dumps(value, default=str)[:20_000]


class AgentTrace:
    """One Splunk Agent Observability trace; every method is a no-op when the SDK is off or fails."""

    def __init__(self, name: str, input_text: str, metadata: dict | None = None):
        self.status = "disabled"
        self.logger = None
        self.callbacks: list = []
        if telemetry.galileo != "configured":
            return
        try:
            from galileo import GalileoLogger
            from galileo.handlers.langchain import GalileoAsyncCallback
            self.logger = GalileoLogger()
            self.logger.start_trace(input=input_text, name=name, metadata={k: str(v) for k, v in (metadata or {}).items()},
                                    tags=["fraud-triage", "fsi-studio"])
            self.callbacks = [GalileoAsyncCallback(galileo_logger=self.logger, start_new_trace=False, flush_on_chain_end=False)]
            self.status = "enabled"
        except Exception:
            self.logger, self.callbacks, self.status = None, [], "unavailable"

    def tool(self, name: str, arguments: dict, output, started: float, *, error: bool = False) -> None:
        if not self.logger:
            return
        try:
            self.logger.add_tool_span(input=_text(arguments), output=_text(output), name=name,
                                      duration_ns=int((time.monotonic() - started) * 1e9), status_code=500 if error else 200,
                                      tags=["fraud-tool"])
        except Exception:
            pass

    async def finish(self, output: str, code: int = 200) -> str:
        if not self.logger:
            return self.status
        try:
            self.logger.conclude(output=output, status_code=code, conclude_all=True)
            uploaded = await asyncio.wait_for(self.logger.async_flush(), 8)
            self.status = "recorded" if uploaded else "no trace recorded"
        except Exception:
            self.status = "delivery unavailable"
        finally:
            try:
                self.logger.disable_agent_control()
            except Exception:
                pass
            self.logger = None
        return self.status
