import json

from fastapi.testclient import TestClient

import advisory
import nim
import research
import security
import server
from providers.yahoo import ProviderError
from tests.conftest import sample_macro, sample_snapshot


def _client(monkeypatch, tmp_path, galileo="disabled"):
    monkeypatch.setenv("WEALTH_CACHE", str(tmp_path))
    monkeypatch.setenv("WEALTH_AIDEFENSE_MODE", "off")
    monkeypatch.setenv("NIM_BASE_URL", "http://127.0.0.1:8003/v1")
    monkeypatch.setenv("NIM_MODEL", "test-model")
    monkeypatch.delenv("FRED_API_KEY", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_TRACES_ENDPOINT", raising=False)
    monkeypatch.delenv("OTEL_EXPORTER_OTLP_METRICS_ENDPOINT", raising=False)
    monkeypatch.delenv("SPLUNK_ACCESS_TOKEN", raising=False)
    monkeypatch.delenv("SPLUNK_REALM", raising=False)
    if galileo == "disabled":
        monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    else:
        monkeypatch.setenv("GALILEO_API_KEY", "test")
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(server, "_agent_importable", lambda: True)

    async def reachable(*_args):
        return True

    monkeypatch.setattr(nim, "nim_reachable", reachable)
    monkeypatch.setattr(server, "nim_reachable", reachable)
    return TestClient(server.app)


def test_health_ready_when_nim_up(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    health = client.get("/api/wealth/health").json()
    assert health["ready"] is True and health["agent"] == "deepagents"
    assert health["nim"]["status"] == "reachable"
    assert health["yahoo"]["status"] == "not_asserted"
    assert health["fred"]["status"] == "absent"
    assert health["perimeter"] == "Yahoo + FRED allowlist only"
    assert health["security"]["fail_open"] is False
    assert health["galileo"] == "disabled"
    assert health["splunk"]["status"] == "missing_configuration"
    assert health["observability"]["tracing"]["status"] == "not_configured"
    assert health["observability"]["tracing"]["transport"] == "Galileo SDK"
    assert health["controls"]["source"] == "local"
    assert set(health["controls"]["policies"]) == {"research.precheck", "research.publish", "advisory.recommendation"}
    assert health["evaluation"]["status"] == "not_configured"


def test_health_reports_galileo_configured_without_dashboard_proof(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path, galileo="configured")
    health = client.get("/api/wealth/health").json()
    assert health["galileo"] == "configured"
    assert health["observability"]["tracing"]["status"] == "configured"
    assert health["observability"]["evaluators"]["results"] == "not_verified"


def test_health_not_ready_when_nim_down(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    async def down(*_args):
        return False

    monkeypatch.setattr(nim, "nim_reachable", down)
    monkeypatch.setattr(server, "nim_reachable", down)
    health = client.get("/api/wealth/health").json()
    assert health["ready"] is False
    assert health["nim"]["status"] == "down"


def test_analyze_requires_ticker_and_a_known_scenario(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    assert client.post("/api/wealth/research/analyze", json={}).status_code == 422
    assert client.post("/api/wealth/research/analyze", json={"ticker": "not a ticker"}).status_code == 422
    assert client.post("/api/wealth/research/analyze", json={"ticker": "JPM", "scenario": "anything"}).status_code == 422


def _market(monkeypatch, kind="live", macro=None):
    monkeypatch.setattr(research, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(ticker), kind))
    monkeypatch.setattr(research, "get_macro", lambda refresh=False: (macro, "live" if macro else None))


def test_real_ticker_releases_panels_with_bank_metrics_when_no_model_answers(monkeypatch, tmp_path, no_models):
    client = _client(monkeypatch, tmp_path)
    _market(monkeypatch, macro={"status": "absent", "reason": "FRED_API_KEY is not configured.", "series": {}})
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM", "scenario": "bank"}).json()
    assert body["source"]["kind"] == "live"
    assert body["conflicts"] and body["earnings"]["beatRate"] == 1.0
    assert body["company"]["metric_family"] == "bank"
    assert body["update"]["status"] == "unavailable" and body["update"]["mode"] == "none"
    assert body["publish"]["status"] == "unavailable" and "No house view" in body["publish"]["reason"]
    assert "public market data" in body["disclaimer"] and "Not investment advice" in body["disclaimer"]
    assert "rating" not in json.dumps(body["update"]).lower().replace('"rating": null', "")


def test_analyze_cache_kind_and_refresh(monkeypatch, tmp_path, no_models):
    client = _client(monkeypatch, tmp_path)
    _market(monkeypatch, kind="live", macro=sample_macro())
    assert client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()["source"]["kind"] == "live"
    monkeypatch.setattr(research, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(ticker), "live" if refresh else "cache"))
    assert client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()["source"]["kind"] == "cache"
    assert client.post("/api/wealth/research/analyze", json={"ticker": "JPM", "refresh": True}).json()["source"]["kind"] == "live"


def test_analyze_empty_provider_is_502(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    def boom(*_args, **_kwargs):
        raise ProviderError("Market data for that ticker was empty.")

    monkeypatch.setattr(research, "get_snapshot", boom)
    response = client.post("/api/wealth/research/analyze", json={"ticker": "ZZZZ"})
    assert response.status_code == 502
    assert "empty" in response.json()["detail"].lower()


def test_defense_block_on_the_agent_falls_back_and_keeps_the_panels(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    _market(monkeypatch, macro=sample_macro())

    async def blocked(*_args, **_kwargs):
        raise security.DefenseBlocked("AI Defense blocked this synthesis.")

    monkeypatch.setattr(research, "run_deep_agent", blocked)
    monkeypatch.setattr(research, "run_single_call", blocked)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert body["conflicts"] and body["earnings"]["status"] == "ready"
    assert body["update"]["status"] == "unavailable" and "AI Defense blocked" in body["update"]["reason"]
    assert body["usage"]["llm_calls"] == 0


def test_analyze_reports_model_and_tool_usage(monkeypatch, tmp_path):
    from langchain_core.messages import AIMessage
    from langchain_core.outputs import ChatGeneration

    import usage

    client = _client(monkeypatch, tmp_path)
    _market(monkeypatch, macro=sample_macro())

    async def drafted(*_args, **_kwargs):
        reply = AIMessage(content="note", usage_metadata={"input_tokens": 900, "output_tokens": 210, "total_tokens": 1110})
        usage.model_usage.get().record([ChatGeneration(message=reply)])
        return {"house_view_impact": "no_house_view", "claims": []}, "deep_agent"

    monkeypatch.setattr(research, "run_deep_agent", drafted)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert body["usage"]["llm_calls"] == 1 and body["usage"]["input_tokens"] == 900 and body["usage"]["output_tokens"] == 210
    assert body["usage"]["tool_calls"] >= 5


def test_entered_holdings_get_rules_but_no_brief(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(ticker), "cache"))
    response = client.post("/api/wealth/advisory/brief", json={
        "holdings": [{"ticker": "JPM", "weight": 0.4}, {"ticker": "BAC", "weight": 0.6}],
        "clientNotes": "Growth objective, moderate risk, 8 year horizon.",
    })
    assert response.status_code == 200
    body = response.json()
    assert len(body["holdings"]) == 2
    assert body["brief"]["status"] == "unavailable" and "Choose a household" in body["brief"]["reason"]
    assert "Not investment, tax, or legal advice" in body["disclaimer"]
    assert any(item["severity"] == "high" for item in body["suitability"]), "60% in one name is above the 20% cap"


def test_advisory_all_holdings_empty_is_502(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    def boom(*_args, **_kwargs):
        raise ProviderError("Market data for that ticker was empty.")

    monkeypatch.setattr(server, "get_snapshot", boom)
    response = client.post("/api/wealth/advisory/brief", json={"holdings": [{"ticker": "ZZZZ", "weight": 1}]})
    assert response.status_code == 502


def _galileo(seen):
    class Logger:
        def start_trace(self, **kwargs):
            seen["start"] = kwargs

        def conclude(self, **kwargs):
            seen["conclude"] = kwargs

        async def async_flush(self):
            seen["flush"] = True
            return ["trace-1"]

        def disable_agent_control(self):
            seen["disabled"] = True

        def add_tool_span(self, **kwargs):
            seen.setdefault("tools", []).append(kwargs["name"])

    return Logger()


def test_analyze_attaches_galileo_callback_and_tool_spans_when_configured(monkeypatch, tmp_path):
    seen = {}
    monkeypatch.setattr(server, "attach_galileo", lambda name, text: (_galileo(seen), ["callback"], "enabled"))
    client = _client(monkeypatch, tmp_path, galileo="configured")
    _market(monkeypatch, macro=sample_macro())

    async def drafted(_ctx, callbacks):
        seen["callbacks"] = callbacks
        raise RuntimeError("skip")

    monkeypatch.setattr(research, "run_deep_agent", drafted)
    monkeypatch.setattr(research, "run_single_call", drafted)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert seen["callbacks"] == ["callback"]
    assert body["telemetry"]["galileo"] == "recorded" and seen.get("flush") is True
    assert {"restricted_list_check", "market_snapshot", "indicators"} <= set(seen["tools"])
    assert body["telemetry"]["splunk"]["status"] == "not_configured"


def test_analyze_does_not_export_when_unconfigured(monkeypatch, tmp_path, no_models):
    attached = []
    monkeypatch.setattr(server, "attach_galileo", lambda name, text: attached.append((name, text)) or (None, [], "disabled"))
    client = _client(monkeypatch, tmp_path)
    _market(monkeypatch, kind="cache")
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert body["telemetry"]["galileo"] == "disabled"
    assert body["telemetry"]["splunk"]["status"] == "not_configured"
    assert body["source"]["kind"] == "cache" and body["earnings"]


def test_meeting_prep_attaches_galileo_callback_when_configured(monkeypatch, tmp_path):
    seen = {}
    monkeypatch.setattr(server, "attach_galileo", lambda name, text: (_galileo(seen), ["callback"], "enabled"))
    client = _client(monkeypatch, tmp_path, galileo="configured")

    async def drafted(_ctx, callbacks):
        seen["callbacks"] = callbacks
        raise RuntimeError("skip")

    monkeypatch.setattr(advisory, "run_deep_agent", drafted)
    monkeypatch.setattr(advisory, "run_single_call", drafted)
    body = client.post("/api/wealth/advisory/brief", json={"household_id": "okafor"}).json()
    assert seen["callbacks"] == ["callback"] and body["telemetry"]["galileo"] == "recorded"
    assert {"get_household", "crm_notes", "suitability_rules", "next_best_actions"} <= set(seen["tools"])


def test_attach_galileo_skips_sdk_without_key(monkeypatch):
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    logger, callbacks, status = server.attach_galileo("Wealth research · synthesize", "JPM")
    assert logger is None
    assert callbacks == []
    assert status == "disabled"


def test_attach_galileo_builds_official_callback(monkeypatch):
    import sys
    import types

    monkeypatch.setenv("GALILEO_API_KEY", "test")
    seen = {}

    class Logger:
        def start_trace(self, **kwargs):
            seen["start"] = kwargs

    class Callback:
        def __init__(self, **kwargs):
            seen["kwargs"] = kwargs

    galileo = types.ModuleType("galileo")
    galileo.GalileoLogger = Logger
    handlers = types.ModuleType("galileo.handlers")
    langchain = types.ModuleType("galileo.handlers.langchain")
    langchain.GalileoAsyncCallback = Callback
    monkeypatch.setitem(sys.modules, "galileo", galileo)
    monkeypatch.setitem(sys.modules, "galileo.handlers", handlers)
    monkeypatch.setitem(sys.modules, "galileo.handlers.langchain", langchain)
    logger, callbacks, status = server.attach_galileo("Wealth research · synthesize", "JPM")
    assert status == "enabled"
    assert logger is not None
    assert callbacks
    assert seen["start"]["name"] == "Wealth research · synthesize"
    assert seen["kwargs"]["start_new_trace"] is False
