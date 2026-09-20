import asyncio
from types import SimpleNamespace

import httpx
import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI

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


def test_model_inspects_tool_context_and_rejects_sync(inspection):
    verdicts, payloads = inspection
    verdicts.extend([{"is_safe": True}, {"is_safe": False}])

    async def generate(self, *args, **kwargs):
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content="ok"))])

    monkeypatch = pytest.MonkeyPatch()
    monkeypatch.setattr(ChatOpenAI, "_agenerate", generate)
    model = security.ProtectedChatOpenAI(api_key="test-key", model="test-model")
    with pytest.raises(security.DefenseBlocked):
        asyncio.run(model._agenerate([
            HumanMessage(content="query"),
            ToolMessage(content="UNTRUSTED_NODE", tool_call_id="t1"),
        ]))
    assert "UNTRUSTED_NODE" in str(payloads[0])
    assert model.disable_streaming is True
    with pytest.raises(RuntimeError):
        model._generate([HumanMessage(content="test")])
    monkeypatch.undo()


def test_mode_off_skips_inspect_even_with_shared_key(inspection, monkeypatch):
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(security.defense, "key", "test-key")
    asyncio.run(security.defense.inspect([{"role": "user", "content": "hi"}]))
    assert inspection[1] == []


def test_briefing_mode_defaults_off_despite_shared_aidefense_key(monkeypatch):
    monkeypatch.setenv("AIDEFENSE_API_KEY", "shared-brahe-key")
    monkeypatch.setenv("AIDEFENSE_MODE", "enforce")
    monkeypatch.delenv("BRIEFING_AIDEFENSE_MODE", raising=False)
    instance = security.Defense()
    assert instance.mode == "off"
    assert instance.health() == {"status": "disabled", "mode": "off", "fail_open": False}
    assert instance.configured() is True


def test_briefing_mode_enforce_reenable(monkeypatch):
    monkeypatch.setenv("AIDEFENSE_API_KEY", "shared-brahe-key")
    monkeypatch.setenv("BRIEFING_AIDEFENSE_MODE", "enforce")
    instance = security.Defense()
    assert instance.mode == "enforce"
    assert instance.health()["status"] == "configured"
