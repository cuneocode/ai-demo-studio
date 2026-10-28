import asyncio
import json
import importlib
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import server


@pytest.fixture
def client(monkeypatch):
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)
    monkeypatch.setattr(server.defense, "mode", "off")
    async def controls_off(*args, **kwargs):
        return None
    monkeypatch.setattr(server.runtime_controls, "check", controls_off)
    server.sessions.clear()
    return TestClient(server.app)


def test_validation_and_missing_service(client, monkeypatch):
    monkeypatch.setattr(server, "graph", None)
    assert client.post("/api/banking/chat", json={"message": ""}).status_code == 422
    assert client.post("/api/banking/chat", json={"message": "x" * 4001}).status_code == 422
    assert client.post("/api/banking/chat", json={"message": "hello"}).status_code == 503


def test_sessions_and_error_redaction(client, monkeypatch):
    class Graph:
        class Checkpointer:
            async def aget_state(self, config):
                return SimpleNamespace(values={"messages": []})

            async def adelete_thread(self, sid):
                return None

        checkpointer = Checkpointer()

        async def aget_state(self, config):
            return await self.checkpointer.aget_state(config)

        async def ainvoke(self, payload, config):
            if payload["messages"][0].content == "fail":
                raise ValueError("SECRET_PROVIDER_TOKEN")
            return {"messages": [SimpleNamespace(content="Your mock credit score is 550.")]}
    monkeypatch.setattr(server, "graph", Graph())
    first = client.post("/api/banking/chat", json={"message": "score"}).json()
    assert "550" in first["answer"]
    second = client.post("/api/banking/chat", json={"message": "again", "session_id": first["session_id"]}).json()
    assert second["session_id"] == first["session_id"]
    other = client.post("/api/banking/chat", json={"message": "score"}).json()
    assert other["session_id"] != first["session_id"]
    error = client.post("/api/banking/chat", json={"message": "fail"})
    assert error.status_code == 502
    assert error.json()["trace"] == []
    assert error.json()["duration_ms"] >= 0
    assert "SECRET" not in error.text
    assert client.post("/api/banking/chat", json={"message": "hi", "session_id": "00000000-0000-0000-0000-000000000000"}).status_code == 404


def test_local_document_retrieval(monkeypatch):
    monkeypatch.delenv("PINECONE_API_KEY", raising=False)
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_NAME", "test-model")
    from src.galileo_langgraph_fsi_agent.tools.pinecone_retrieval_tool import PineconeRetrievalTool
    from src.galileo_langgraph_fsi_agent.tools.credit_score_tool import CreditScoreTool
    result = PineconeRetrievalTool("unused").invoke({"query": "Orbit annual fee", "k": 8})
    assert "orbit-credit-card" in result
    assert "celestial" in result
    assert "550" in CreditScoreTool().invoke({})
    with pytest.raises(ValueError):
        PineconeRetrievalTool("unused").invoke({"query": "card", "k": 100})


def test_trace_reports_executed_tools():
    trace = server.ExecutionTrace()
    asyncio.run(trace.on_tool_start({"name": "pinecone_retrieval"}, "{}", run_id="r1"))
    asyncio.run(trace.on_tool_end("Document 1 — orbit.md:\nAnnual fee: $0\n\nDocument 2 — celestial.md:\nAnnual fee: $99\n", run_id="r1"))
    assert trace.events == [{"name": "pinecone_retrieval", "kind": "tool"}]
    assert trace.sources == [{"title": "orbit.md", "text": "Annual fee: $0"}, {"title": "celestial.md", "text": "Annual fee: $99"}]


def test_sources_come_only_from_retrieval_results():
    # A handoff's output quotes the whole conversation, retrieved documents included.
    trace = server.ExecutionTrace()
    asyncio.run(trace.on_tool_start({"name": "transfer_back_to_supervisor"}, "{}", run_id="h1"))
    asyncio.run(trace.on_tool_end("Command(update={'messages': [ToolMessage(content='Document 1 — orbit.md:\\nAnnual fee: $0')]})", run_id="h1"))
    asyncio.run(trace.on_tool_start({"name": "credit_score_retrieval"}, "{}", run_id="c1"))
    asyncio.run(trace.on_tool_end("Document 1 — fake.md:\nYour credit score is 550", run_id="c1"))
    assert trace.sources == []
    assert [event["kind"] for event in trace.events] == ["handoff", "tool"]


def test_unexported_trace_id_is_not_returned(client, monkeypatch):
    class Graph:
        async def ainvoke(self, payload, config):
            return {"messages": [SimpleNamespace(content="Orbit Basic has no annual fee.")]}

    monkeypatch.setattr(server, "graph", Graph())
    monkeypatch.setattr(server.banking_telemetry, "exporter", None)
    body = client.post("/api/banking/chat", json={"message": "fees"}).json()
    assert body["telemetry"]["splunk"] == {"status": "not_configured"}


def test_chat_reports_graph_model_usage(client, monkeypatch):
    from langchain_core.messages import AIMessage
    from langchain_core.outputs import ChatGeneration, LLMResult

    class Graph:
        async def ainvoke(self, payload, config):
            for usage in ({"input_tokens": 300, "output_tokens": 40, "total_tokens": 340}, None):
                message = AIMessage(content="step", usage_metadata=usage) if usage else AIMessage(content="step")
                for callback in config["callbacks"]:
                    if hasattr(callback, "on_llm_end"):
                        await callback.on_llm_end(LLMResult(generations=[[ChatGeneration(message=message)]]))
            return {"messages": [SimpleNamespace(content="Brahe Platinum needs a 700 score.")]}

    monkeypatch.setattr(server, "graph", Graph())
    body = client.post("/api/banking/chat", json={"message": "platinum"}).json()
    assert body["usage"] == {"llm_calls": 2, "input_tokens": 300, "output_tokens": 40}


def test_recorded_scripted_prompts_are_served_read_only(client):
    listed = client.get("/api/banking/recordings").json()["recordings"]
    meta = next(item for item in listed if item["name"] == "scripted-prompts")
    assert meta["synthetic"] is True and meta["recorded_at"]
    doc = client.get("/api/banking/recordings/scripted-prompts").json()
    turns = {turn["id"]: turn for turn in doc["result"]["turns"]}
    scripted = json.loads((next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "app" / "banking-scenarios.json").read_text())
    assert set(turns) == {item["id"] for item in scripted}
    assert all(turn["status"] == item["httpStatus"] for item in scripted for turn in [turns[item["id"]]])
    assert turns["success"]["body"]["answer"] and turns["ai-defense"]["body"]["security"]["event_ids"]
    assert turns["agent-controls"]["body"]["controls"]["status"] == "blocked"
    assert "api_key" not in json.dumps(doc).lower()
    assert client.get("/api/banking/recordings/missing-one").status_code == 404
    assert client.get("/api/banking/recordings/Bad_Name").status_code == 404
