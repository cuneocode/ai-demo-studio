"""Optional OTLP export. Config presence is not a delivered span."""
from __future__ import annotations

import os
import time
import uuid

import httpx


class BriefingTelemetry:
    def __init__(self):
        traces = (os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT") or os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT") or "").strip()
        token = (os.getenv("SPLUNK_ACCESS_TOKEN") or "").strip()
        realm = (os.getenv("SPLUNK_REALM") or "").strip()
        self.service_name = os.getenv("OTEL_SERVICE_NAME", "company-briefing")
        self.token = token
        if traces:
            self.endpoint = traces.rstrip("/")
            if not self.endpoint.endswith("/v1/traces"):
                self.endpoint = f"{self.endpoint}/v1/traces"
            self.missing = []
        elif token and realm:
            self.endpoint = f"https://ingest.{realm}.signalfx.com/v2/trace/otlp"
            self.missing = []
        else:
            self.endpoint = ""
            self.missing = ["SPLUNK_REALM + SPLUNK_ACCESS_TOKEN, or OTEL_EXPORTER_OTLP_ENDPOINT"]
        self.status = "configured" if self.endpoint else "missing_configuration"

    def health(self):
        return {
            "status": self.status,
            "service_name": self.service_name,
            "missing": self.missing,
            "export": "otlp" if self.endpoint else "off",
        }

    def _payload(self, run_id: str, trace_id: str, spans: list[dict]) -> dict:
        now = time.time_ns()
        return {
            "resourceSpans": [{
                "resource": {"attributes": [
                    {"key": "service.name", "value": {"stringValue": self.service_name}},
                ]},
                "scopeSpans": [{
                    "scope": {"name": "company-briefing"},
                    "spans": [{
                        "traceId": trace_id,
                        "spanId": uuid.uuid4().hex[:16],
                        "name": span["name"],
                        "kind": 1,
                        "startTimeUnixNano": str(span.get("start") or now),
                        "endTimeUnixNano": str(span.get("end") or now),
                        "attributes": [
                            {"key": key, "value": {"stringValue": str(value)}}
                            for key, value in (span.get("attrs") or {}).items()
                        ],
                    } for span in spans],
                }],
            }],
        }

    def export(self, run_id: str, spans: list[dict] | None = None) -> dict:
        if not self.endpoint:
            return {"status": "missing_configuration"}
        now = time.time_ns()
        recorded = spans or [{"name": "briefing.analyze", "start": now - 1_000_000, "end": now, "attrs": {"run_id": run_id}}]
        # One trace per run, so the run can be found as a whole in Splunk.
        trace_id = uuid.uuid4().hex
        headers = {"Content-Type": "application/json"}
        if self.token:
            headers["X-SF-TOKEN"] = self.token
        try:
            response = httpx.post(self.endpoint, json=self._payload(run_id, trace_id, recorded), headers=headers, timeout=5.0)
            response.raise_for_status()
        except httpx.HTTPError:
            return {"status": "export_failed", "run_id": run_id, "trace_id": trace_id, "span_count": 0}
        return {"status": "exported", "run_id": run_id, "trace_id": trace_id, "span_count": len(recorded)}

    def delivery(self, run_id: str, spans: list[dict] | None = None) -> dict:
        return self.export(run_id, spans)


telemetry = BriefingTelemetry()
