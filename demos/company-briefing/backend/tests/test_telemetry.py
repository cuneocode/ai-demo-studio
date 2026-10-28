import httpx

import telemetry


def test_delivery_is_missing_without_otlp_config(monkeypatch):
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", raising=False)
    monkeypatch.delenv("SPLUNK_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("SPLUNK_REALM", raising=False)
    client = telemetry.BriefingTelemetry()
    result = client.delivery("run-1")
    assert result["status"] == "missing_configuration"
    assert "exported" not in result["status"]


def test_delivery_reports_export_result(monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://otel.example.invalid")
    seen = {}

    def post(url, **kwargs):
        seen["url"] = url
        seen["json"] = kwargs["json"]
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request)

    monkeypatch.setattr(telemetry.httpx, "post", post)
    client = telemetry.BriefingTelemetry()
    result = client.delivery("run-2", [
        {"name": "briefing.tool.build_filing_toc", "attrs": {"tool": "build_filing_toc"}},
        {"name": "briefing.tool.read_node", "attrs": {"tool": "read_node"}},
    ])
    assert result["status"] == "exported" and result["run_id"] == "run-2" and result["span_count"] == 2
    spans = seen["json"]["resourceSpans"][0]["scopeSpans"][0]["spans"]
    assert {span["traceId"] for span in spans} == {result["trace_id"]}
    assert seen["url"].endswith("/v1/traces")


def test_failed_export_reports_no_spans(monkeypatch):
    monkeypatch.setenv("OTEL_EXPORTER_OTLP_ENDPOINT", "https://otel.example.invalid")

    def post(url, **kwargs):
        raise httpx.ConnectError("down")

    monkeypatch.setattr(telemetry.httpx, "post", post)
    result = telemetry.BriefingTelemetry().delivery("run-3")
    assert result["status"] == "export_failed" and result["span_count"] == 0
