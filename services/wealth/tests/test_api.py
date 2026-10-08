from fastapi.testclient import TestClient

import nim
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

    async def reachable():
        return True

    monkeypatch.setattr(nim, "nim_reachable", reachable)
    monkeypatch.setattr(server, "nim_reachable", reachable)
    return TestClient(server.app)


def test_health_ready_when_nim_up(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    health = client.get("/api/wealth/health").json()
    assert health["ready"] is True
    assert health["nim"]["status"] == "reachable"
    assert health["yahoo"]["status"] == "not_asserted"
    assert health["fred"]["status"] == "absent"
    assert health["perimeter"] == "Yahoo + FRED allowlist only"
    assert health["source"]["kind"] != "fixture" if "source" in health else True
    assert health["security"]["fail_open"] is False
    assert health["galileo"] == "disabled"
    assert health["splunk"]["status"] == "missing_configuration"
    assert health["observability"]["tracing"]["status"] == "not_configured"
    assert health["observability"]["tracing"]["transport"] == "Galileo SDK"
    assert health["observability"]["evaluators"]["status"] == "not_verified"
    assert health["observability"]["controls"]["status"] == "not_integrated"
    assert "controls" not in health


def test_health_reports_galileo_configured_without_dashboard_proof(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path, galileo="configured")
    health = client.get("/api/wealth/health").json()
    assert health["galileo"] == "configured"
    assert health["observability"]["tracing"]["status"] == "configured"
    assert health["observability"]["evaluators"]["results"] == "not_verified"


def test_health_not_ready_when_nim_down(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    async def down():
        return False

    monkeypatch.setattr(nim, "nim_reachable", down)
    monkeypatch.setattr(server, "nim_reachable", down)
    health = client.get("/api/wealth/health").json()
    assert health["ready"] is False
    assert health["nim"]["status"] == "down"


def test_analyze_requires_ticker(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    assert client.post("/api/wealth/research/analyze", json={}).status_code == 422
    assert client.post("/api/wealth/research/analyze", json={"ticker": "not a ticker"}).status_code == 422


def test_analyze_live_tools_and_omitted_note(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    snap = sample_snapshot()
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (snap, "live"))
    monkeypatch.setattr(server, "get_macro", lambda refresh=False: ({"status": "absent", "reason": "FRED_API_KEY is not configured.", "series": {}}, None))

    async def fake_note(*_args, **_kwargs):
        return (
            {"status": "unavailable", "reason": "The local NIM did not return a usable note.", "summary": None, "bullets": [], "citations": []},
            {"status": "unavailable", "reason": "The local NIM did not return a usable note.", "action": None, "thesis": None, "disclaimer": "Demo recommendation — not financial advice"},
        )

    monkeypatch.setattr(server, "draft_note", fake_note)
    response = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"})
    assert response.status_code == 200
    body = response.json()
    assert body["source"]["kind"] == "live"
    assert body["source"]["kind"] != "fixture"
    assert body["conflicts"]
    assert body["earnings"]["beatRate"] == 1.0
    assert body["note"]["status"] == "unavailable"
    assert body["recommendation"]["disclaimer"]
    assert "not financial advice" in body["disclaimer"]
    assert "controls" not in body


def test_analyze_cache_kind_and_refresh(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    calls = {"n": 0}

    def fetch(ticker, refresh=False):
        calls["n"] += 1
        return sample_snapshot(ticker), "live" if refresh or calls["n"] == 1 else "cache"

    async def fake_note(*_args, **_kwargs):
        return (
            {"status": "omitted", "reason": "skip", "summary": None, "bullets": [], "citations": []},
            {"status": "omitted", "reason": "skip", "action": None, "thesis": None, "disclaimer": "Demo recommendation — not financial advice"},
        )

    monkeypatch.setattr(server, "get_snapshot", fetch)
    monkeypatch.setattr(server, "get_macro", lambda refresh=False: (sample_macro(), "cache"))
    monkeypatch.setattr(server, "draft_note", fake_note)
    first = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert first["source"]["kind"] == "live"
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(ticker), "cache" if not refresh else "live"))
    cached = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert cached["source"]["kind"] == "cache"
    refreshed = client.post("/api/wealth/research/analyze", json={"ticker": "JPM", "refresh": True}).json()
    assert refreshed["source"]["kind"] == "live"


def test_analyze_empty_provider_is_502(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    def boom(*_args, **_kwargs):
        raise ProviderError("Market data for that ticker was empty.")

    monkeypatch.setattr(server, "get_snapshot", boom)
    response = client.post("/api/wealth/research/analyze", json={"ticker": "ZZZZ"})
    assert response.status_code == 502
    assert "empty" in response.json()["detail"].lower()


def test_defense_omits_note_keeps_conflicts(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(), "live"))
    monkeypatch.setattr(server, "get_macro", lambda refresh=False: (sample_macro(), "live"))

    async def blocked(*_args, **_kwargs):
        run = security.security_run.get()
        if run:
            run.checks += 1
            run.blocked += 1
        return (
            {"status": "blocked", "reason": "AI Defense blocked this synthesis.", "summary": None, "bullets": [], "citations": []},
            {"status": "blocked", "reason": "AI Defense blocked this synthesis.", "action": None, "thesis": None, "disclaimer": "Demo recommendation — not financial advice"},
        )

    monkeypatch.setattr(server, "draft_note", blocked)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert body["conflicts"]
    assert body["earnings"]["status"] == "ready"
    assert body["note"]["status"] == "blocked"
    assert body["recommendation"]["status"] == "blocked"


def test_advisory_brief_keeps_holdings_when_nim_omits(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(ticker), "cache"))

    async def fake_brief(*_args, **_kwargs):
        return {
            "status": "unavailable",
            "reason": "The local NIM did not return a usable brief.",
            "opening": None,
            "agenda": [],
            "discussion_points": [],
            "suitability_callouts": [],
            "citations": [],
            "disclaimer": "Demo brief — not advice",
        }

    monkeypatch.setattr(server, "draft_brief", fake_brief)
    response = client.post("/api/wealth/advisory/brief", json={
        "holdings": [{"ticker": "JPM", "weight": 0.4}, {"ticker": "BAC", "weight": 0.6}],
        "clientNotes": "Growth objective, moderate risk, 8 year horizon.",
        "briefing": {"objectives": {"facts": [{"text": "Expand digital platforms", "excerpt": "Expand digital platforms"}]}},
        "research": {"ticker": "JPM", "note": {"summary": "Beat rate 100%"}},
    })
    assert response.status_code == 200
    body = response.json()
    assert len(body["holdings"]) == 2
    assert body["brief"]["status"] == "unavailable"
    assert "not advice" in body["disclaimer"]
    assert body["suitability"] == [] or all(item["id"] != "missing_ips" for item in body["suitability"])
    assert "controls" not in body


def test_advisory_all_holdings_empty_is_502(monkeypatch, tmp_path):
    client = _client(monkeypatch, tmp_path)

    def boom(*_args, **_kwargs):
        raise ProviderError("Market data for that ticker was empty.")

    monkeypatch.setattr(server, "get_snapshot", boom)
    response = client.post("/api/wealth/advisory/brief", json={"holdings": [{"ticker": "ZZZZ", "weight": 1}]})
    assert response.status_code == 502


def test_analyze_attaches_galileo_callback_when_configured(monkeypatch, tmp_path):
    seen = {}

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

    class Callback:
        def __init__(self, **kwargs):
            seen["callback"] = kwargs

    monkeypatch.setattr(server, "attach_galileo", lambda name, text: (Logger(), [Callback(galileo_logger="attached")], "enabled"))
    client = _client(monkeypatch, tmp_path, galileo="configured")
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(), "live"))
    monkeypatch.setattr(server, "get_macro", lambda refresh=False: (sample_macro(), "cache"))

    async def fake_note(*_args, callbacks=None, **_kwargs):
        seen["callbacks"] = callbacks
        return (
            {"status": "unavailable", "reason": "skip", "summary": None, "bullets": [], "citations": []},
            {"status": "unavailable", "reason": "skip", "action": None, "thesis": None, "disclaimer": "Demo recommendation — not financial advice"},
        )

    monkeypatch.setattr(server, "draft_note", fake_note)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert seen["callbacks"]
    assert body["telemetry"]["galileo"] == "recorded"
    assert seen.get("flush") is True
    assert body["telemetry"]["splunk"]["status"] == "not_configured"


def test_analyze_does_not_export_when_unconfigured(monkeypatch, tmp_path):
    attached = []
    monkeypatch.setattr(server, "attach_galileo", lambda name, text: attached.append((name, text)) or (None, [], "disabled"))
    client = _client(monkeypatch, tmp_path)
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(), "cache"))
    monkeypatch.setattr(server, "get_macro", lambda refresh=False: ({"status": "absent", "series": {}}, None))

    async def fake_note(*_args, callbacks=None, **_kwargs):
        attached.append({"callbacks": callbacks})
        return (
            {"status": "omitted", "reason": "skip", "summary": None, "bullets": [], "citations": []},
            {"status": "omitted", "reason": "skip", "action": None, "thesis": None, "disclaimer": "Demo recommendation — not financial advice"},
        )

    monkeypatch.setattr(server, "draft_note", fake_note)
    body = client.post("/api/wealth/research/analyze", json={"ticker": "JPM"}).json()
    assert body["telemetry"]["galileo"] == "disabled"
    assert body["telemetry"]["splunk"]["status"] == "not_configured"
    assert attached[-1]["callbacks"] == []
    assert body["source"]["kind"] == "cache"
    assert body["earnings"]


def test_advisory_attaches_galileo_callback_when_configured(monkeypatch, tmp_path):
    seen = {}

    class Logger:
        def start_trace(self, **kwargs):
            return None

        def conclude(self, **kwargs):
            seen["conclude"] = kwargs

        async def async_flush(self):
            return ["trace-1"]

        def disable_agent_control(self):
            return None

    class Callback:
        def __init__(self, **kwargs):
            seen["callback"] = True

    monkeypatch.setattr(server, "attach_galileo", lambda name, text: (Logger(), [Callback()], "enabled"))
    client = _client(monkeypatch, tmp_path, galileo="configured")
    monkeypatch.setattr(server, "get_snapshot", lambda ticker, refresh=False: (sample_snapshot(ticker), "cache"))

    async def fake_brief(*_args, callbacks=None, **_kwargs):
        seen["callbacks"] = callbacks
        return {
            "status": "unavailable",
            "reason": "skip",
            "opening": None,
            "agenda": [],
            "discussion_points": [],
            "suitability_callouts": [],
            "citations": [],
            "disclaimer": "Demo brief — not advice",
        }

    monkeypatch.setattr(server, "draft_brief", fake_brief)
    body = client.post("/api/wealth/advisory/brief", json={"holdings": [{"ticker": "JPM", "weight": 1}]}).json()
    assert seen["callbacks"]
    assert body["telemetry"]["galileo"] == "recorded"


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
