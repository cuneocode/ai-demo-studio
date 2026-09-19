import asyncio
from types import SimpleNamespace

import httpx
import pytest
from langchain_core.messages import AIMessage, HumanMessage, ToolMessage
from langchain_core.outputs import ChatGeneration, ChatResult
from langchain_openai import ChatOpenAI

import security
import server
from fastapi.testclient import TestClient


@pytest.fixture
def inspection(monkeypatch):
    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-key")
    monkeypatch.setattr(security.defense, "valid", True)
    monkeypatch.setattr(security.defense, "fail_open", False)
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    server.sessions.clear()
    verdicts, payloads = [], []
    class Client:
        def __init__(self, **kwargs): pass
        async def __aenter__(self): return self
        async def __aexit__(self, *args): pass
        async def post(self, url, **kwargs):
            payloads.append(kwargs["json"])
            verdict = verdicts.pop(0)
            if isinstance(verdict, Exception): raise verdict
            return httpx.Response(200, json=verdict, request=httpx.Request("POST", url))
    monkeypatch.setattr(security, "httpx", SimpleNamespace(AsyncClient=Client))
    return verdicts, payloads


@pytest.mark.parametrize("verdict,status", [({"is_safe": False, "event_id": "test-event"}, 403), ({}, 503), (RuntimeError("SECRET"), 503)])
def test_request_denied_before_graph(inspection, monkeypatch, verdict, status):
    verdicts, _ = inspection
    verdicts.append(verdict)
    class Graph:
        async def ainvoke(self, *args, **kwargs):
            pytest.fail("Denied input must not enter checkpoint or model")
    monkeypatch.setattr(server, "graph", Graph())
    response = TestClient(server.app).post("/api/banking/chat", json={"message": "test"})
    assert response.status_code == status
    assert "SECRET" not in response.text
    assert "answer" not in response.json()
    assert response.json()["security"]["blocked" if status == 403 else "errors"] == 1


@pytest.mark.parametrize("mode,fail_open,verdict,status", [
    ("enforce", False, {"is_safe": True}, "allowed"),
    ("monitor", False, {"is_safe": False}, "monitored_violation"),
    ("enforce", True, RuntimeError("unavailable"), "fail_open"),
])
def test_security_modes(inspection, monkeypatch, mode, fail_open, verdict, status):
    inspection[0].append(verdict)
    monkeypatch.setattr(security.defense, "mode", mode)
    monkeypatch.setattr(security.defense, "fail_open", fail_open)
    async def run():
        result = security.SecurityRun()
        token = security.security_run.set(result)
        try:
            await security.defense.inspect([{"role": "user", "content": "test"}])
            assert result.summary()["status"] == status
        finally:
            security.security_run.reset(token)
    asyncio.run(run())


def test_output_tool_call_blocked_and_context_preserved(inspection, monkeypatch):
    verdicts, payloads = inspection
    verdicts.extend([{"is_safe": True}, {"is_safe": False}])
    async def generate(self, *args, **kwargs):
        return ChatResult(generations=[ChatGeneration(message=AIMessage(content="", tool_calls=[{"name": "transfer", "args": {"destination": "test"}, "id": "t"}]))])
    monkeypatch.setattr(ChatOpenAI, "_agenerate", generate)
    model = security.ProtectedChatOpenAI(api_key="test-key", model="test-model")
    with pytest.raises(security.DefenseBlocked):
        asyncio.run(model._agenerate([HumanMessage(content="query"), ToolMessage(content="UNTRUSTED_RETRIEVAL", tool_call_id="previous")]))
    assert "UNTRUSTED_RETRIEVAL" in str(payloads[0])
    assert "destination" in str(payloads[1])
    assert model.disable_streaming is True


def test_sync_path_cannot_bypass_inspection():
    model = security.ProtectedChatOpenAI(api_key="test-key", model="test-model")
    with pytest.raises(RuntimeError):
        model._generate([HumanMessage(content="test")])
