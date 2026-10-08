"""Splunk-supported GenAI instrumentation; endpoint acknowledgement is not dashboard verification.

No message content is exported by default. A collector is optional, not silently
assumed to exist. No API credentials are sent to React or stored in span attributes.
"""
import os
import re
import threading
from collections import OrderedDict
from urllib.parse import unquote

from opentelemetry import trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.sdk.trace.export import BatchSpanProcessor, SpanExporter, SpanExportResult


class AcknowledgedExporter(SpanExporter):
    def __init__(self, delegate):
        self.delegate = delegate
        self.deliveries = OrderedDict()
        self.lock = threading.Lock()

    def export(self, spans):
        try:
            result = self.delegate.export(spans)
        except Exception:
            result = SpanExportResult.FAILURE
        with self.lock:
            for span in spans:
                tid = format(span.context.trace_id, "032x")
                item = self.deliveries.setdefault(tid, {"span_count": 0, "failed": False})
                item["failed"] |= result != SpanExportResult.SUCCESS
                if result == SpanExportResult.SUCCESS:
                    item["span_count"] += 1
                self.deliveries.move_to_end(tid)
            while len(self.deliveries) > 256:
                self.deliveries.popitem(last=False)
        return result

    def shutdown(self):
        self.delegate.shutdown()


class WealthTelemetry:
    def __init__(self):
        self.service_name = os.getenv("OTEL_SERVICE_NAME", "wealth-research")
        self.provider = None
        self.meter_provider = None
        self.exporter = None
        self.status = "missing_configuration"
        self.missing = ["SPLUNK_REALM + SPLUNK_ACCESS_TOKEN, or OTLP traces and metrics endpoints"]

    def start(self):
        if self.provider is not None:
            return
        # This is the official Splunk LangChain distribution, not Traceloop's
        # conflicting package with the same Python namespace. Keep lockfile pins.
        os.environ.setdefault("OTEL_INSTRUMENTATION_GENAI_EMITTERS", "span_metric")
        os.environ.setdefault("OTEL_INSTRUMENTATION_GENAI_CAPTURE_MESSAGE_CONTENT", "NO_CONTENT")
        os.environ.setdefault("OTEL_EXPORTER_OTLP_METRICS_TEMPORALITY_PREFERENCE", "delta")
        from opentelemetry.instrumentation.langchain import LangchainInstrumentor
        from opentelemetry.sdk.metrics import MeterProvider
        from opentelemetry.sdk.metrics.export import PeriodicExportingMetricReader
        from opentelemetry.exporter.otlp.proto.http.trace_exporter import OTLPSpanExporter
        from opentelemetry.exporter.otlp.proto.http.metric_exporter import OTLPMetricExporter

        resource = Resource.create({"service.name": self.service_name, "deployment.environment.name": "local"})
        self.provider = TracerProvider(resource=resource)
        realm, token = os.getenv("SPLUNK_REALM", ""), os.getenv("SPLUNK_ACCESS_TOKEN", "")
        base = os.getenv("OTEL_EXPORTER_OTLP_ENDPOINT", "").rstrip("/")
        traces = os.getenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", f"{base}/v1/traces" if base else "")
        metrics = os.getenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", f"{base}/v1/metrics" if base else "")
        headers = {}
        if not traces and realm and token and re.fullmatch(r"[a-z]+\d+", realm):
            traces = f"https://ingest.{realm}.observability.splunkcloud.com/v2/trace/otlp"
            metrics = f"https://ingest.{realm}.observability.splunkcloud.com/v2/datapoint/otlp"
            headers = {"X-SF-Token": token}

        def signal_headers(signal):
            raw = os.getenv(f"OTEL_EXPORTER_OTLP_{signal}_HEADERS", os.getenv("OTEL_EXPORTER_OTLP_HEADERS", ""))
            return {**headers, **{unquote(k.strip()): unquote(v.strip()) for part in raw.split(",") if "=" in part for k, v in [part.split("=", 1)]}}

        readers = []
        if traces:
            self.exporter = AcknowledgedExporter(OTLPSpanExporter(endpoint=traces, headers=signal_headers("TRACES"), timeout=5))
            self.provider.add_span_processor(BatchSpanProcessor(self.exporter, schedule_delay_millis=1000))
        if metrics:
            readers.append(PeriodicExportingMetricReader(OTLPMetricExporter(endpoint=metrics, headers=signal_headers("METRICS"), timeout=5), export_interval_millis=15000))
        self.meter_provider = MeterProvider(resource=resource, metric_readers=readers)
        self.status = "configured" if traces and metrics else "partial_configuration" if traces or metrics else "missing_configuration"
        if traces or metrics:
            self.missing = ([] if traces else ["OTEL_EXPORTER_OTLP_TRACES_ENDPOINT"]) + ([] if metrics else ["OTEL_EXPORTER_OTLP_METRICS_ENDPOINT"])
        instrumentor = LangchainInstrumentor()
        if not instrumentor.is_instrumented_by_opentelemetry:
            instrumentor.instrument(tracer_provider=self.provider, meter_provider=self.meter_provider)

    def health(self):
        return {"status": self.status, "service_name": self.service_name, "missing": self.missing}

    def span(self):
        provider = self.provider or trace.get_tracer_provider()
        # Do not record exception messages; upstream errors may contain prompts.
        return provider.get_tracer("fsi.wealth").start_as_current_span("wealth.request", record_exception=False, set_status_on_exception=False)

    def delivery(self, trace_id):
        result = {"status": "not_configured", "trace_id": trace_id}
        if not self.exporter:
            return result
        flushed = self.provider.force_flush(timeout_millis=6000)
        with self.exporter.lock:
            item = dict(self.exporter.deliveries.get(trace_id, {}))
        result.update(status="delivery_failed" if item.get("failed") else "accepted_by_endpoint" if flushed and item.get("span_count") else "delivery_pending", span_count=item.get("span_count", 0))
        return result

    def shutdown(self):
        if self.meter_provider:
            self.meter_provider.shutdown(timeout_millis=6000)
        if self.provider:
            self.provider.shutdown()


wealth_telemetry = WealthTelemetry()
