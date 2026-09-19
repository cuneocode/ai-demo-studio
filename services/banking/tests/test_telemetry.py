import os
from pathlib import Path
import subprocess
import sys
from types import SimpleNamespace

from opentelemetry.sdk.trace.export import SpanExportResult
from telemetry import AcknowledgedExporter, BankingTelemetry


def test_real_instrumentor_exports_agent_model_tool_and_metrics():
    root = Path(__file__).resolve().parents[1]
    env = {**os.environ, "PYTHONPATH": str(root)}
    result = subprocess.run([sys.executable, str(root / "tests/otel_smoke.py")], cwd=root, env=env, capture_output=True, text=True, timeout=45)
    assert result.returncode == 0, result.stdout + result.stderr


def test_export_failure_is_not_reported_as_delivery():
    class Exporter:
        def export(self, spans): return SpanExportResult.FAILURE
    telemetry = BankingTelemetry()
    telemetry.exporter = AcknowledgedExporter(Exporter())
    telemetry.provider = SimpleNamespace(force_flush=lambda **kwargs: True)
    telemetry.exporter.export([SimpleNamespace(context=SimpleNamespace(trace_id=123))])
    result = telemetry.delivery(format(123, "032x"))
    assert result["status"] == "delivery_failed"
    assert result["span_count"] == 0


def test_unconfigured_export_never_claims_delivery():
    assert BankingTelemetry().delivery("local-trace")["status"] == "not_configured"
