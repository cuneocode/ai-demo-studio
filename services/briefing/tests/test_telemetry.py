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
        request = httpx.Request("POST", url)
        return httpx.Response(200, request=request)

    monkeypatch.setattr(telemetry.httpx, "post", post)
    client = telemetry.BriefingTelemetry()
    result = client.delivery("run-2", [{"name": "briefing.tool.build_filing_toc", "attrs": {"tool": "build_filing_toc"}}])
    assert result == {"status": "exported", "run_id": "run-2"}
    assert seen["url"].endswith("/v1/traces")
