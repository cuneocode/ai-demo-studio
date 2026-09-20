"""Optional OTLP acknowledgement. Presence of config is not dashboard proof."""
import os


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

    def health(self):
        return {"status": self.status, "service_name": self.service_name, "missing": self.missing}

    def delivery(self, case_id: str):
        if self.status != "configured":
            return {"status": self.status}
        return {"status": "configured", "case_id": case_id}


telemetry = FraudTelemetry()
