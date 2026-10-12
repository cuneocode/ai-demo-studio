import asyncio
from types import SimpleNamespace

import httpx
import pytest
from langchain_core.messages import AIMessage, HumanMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI

import nim
import security


@pytest.fixture
def inspection(monkeypatch):
    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-key")
    monkeypatch.setattr(security.defense, "valid", True)
    monkeypatch.setattr(security.defense, "fail_open", False)
    verdicts, payloads = [], []

    class Client:
        def __init__(self, **kwargs):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *args):
            pass

        async def post(self, url, **kwargs):
            payloads.append(kwargs["json"])
            verdict = verdicts.pop(0)
            if isinstance(verdict, Exception):
                raise verdict
            return httpx.Response(200, json=verdict, request=httpx.Request("POST", url))

    monkeypatch.setattr(security, "httpx", SimpleNamespace(AsyncClient=Client))
    return verdicts, payloads


def test_unavailable_and_deny_fail_closed(inspection):
    run = security.SecurityRun()
    token = security.security_run.set(run)
    inspection[0].append(RuntimeError("SECRET"))
    with pytest.raises(security.DefenseUnavailable):
        asyncio.run(security.defense.inspect([{"role": "user", "content": "hi"}]))
    assert run.errors == 1
    assert "SECRET" not in run.summary()["status"]
    inspection[0].append({"is_safe": False, "event_id": "evt"})
    with pytest.raises(security.DefenseBlocked):
        asyncio.run(security.defense.inspect([{"role": "user", "content": "hi"}]))
    security.security_run.reset(token)
    assert security.defense.fail_open is False


def test_model_inspects_and_rejects_sync(inspection):
    verdicts, payloads = inspection
    verdicts.extend([{"is_safe": True}, {"is_safe": False}])

    async def generate(self, *args, **kwargs):
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content="ok"))])

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(ChatOpenAI, "_agenerate", generate)
    model = nim.ProtectedChatOpenAI(api_key="test-key", model="test-model")
    with pytest.raises(security.DefenseBlocked):
        asyncio.run(model._agenerate([HumanMessage(content="query")]))
    assert payloads
    assert payloads[0]["metadata"]["src_app"] == "fsi-ai-studio-wealth"
    assert model.disable_streaming is True
    with pytest.raises(RuntimeError):
        model._generate([HumanMessage(content="test")])
    monkeypatch.undo()


def test_a_withheld_tool_result_reports_blocked_not_monitored_and_skips_empty_event_ids(inspection, monkeypatch):
    from evidence import Evidence
    from untrusted import screen_news

    verdicts, _payloads = inspection
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(security.defense, "inspect_untrusted", security.Defense.inspect_untrusted.__get__(security.defense))
    verdicts.extend([{"is_safe": True, "event_id": ""},
                     {"is_safe": False, "event_id": "evt-1", "rules": [{"rule_name": "Prompt Injection"}], "classifications": ["SECURITY_VIOLATION"]}])
    run = security.SecurityRun()
    token = security.security_run.set(run)
    try:
        rows = asyncio.run(screen_news(Evidence(), [{"id": "a", "headline": "Quarter closed", "body": "Results were in line."},
                                                    {"id": "b", "headline": "Blog", "body": "Buy now."}]))
    finally:
        security.security_run.reset(token)
    assert [row["status"] for row in rows] == ["kept", "withheld"] and rows[1]["by"] == "AI Defense"
    summary = run.summary()
    assert summary["mode"] == "off" and summary["status"] == "blocked" and summary["acted_on"] == 1
    assert summary["event_ids"] == ["evt-1"], "an empty event id is not an AI Defense event"


def test_a_monitor_mode_model_hop_violation_is_reported_as_monitored(inspection, monkeypatch):
    verdicts, _payloads = inspection
    monkeypatch.setattr(security.defense, "mode", "monitor")
    verdicts.append({"is_safe": False, "event_id": "evt-2"})
    run = security.SecurityRun()
    token = security.security_run.set(run)
    try:
        asyncio.run(security.defense.inspect([{"role": "user", "content": "hi"}]))
    finally:
        security.security_run.reset(token)
    assert run.summary()["status"] == "monitored_violation"


def test_wealth_mode_defaults_off(monkeypatch):
    monkeypatch.setenv("AIDEFENSE_API_KEY", "shared-brahe-key")
    monkeypatch.setenv("AIDEFENSE_MODE", "enforce")
    monkeypatch.delenv("WEALTH_AIDEFENSE_MODE", raising=False)
    instance = security.Defense()
    assert instance.mode == "off"
    assert instance.health()["fail_open"] is False
    assert instance.configured() is True
