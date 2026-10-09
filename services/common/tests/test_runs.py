import asyncio
import json
import sys
from pathlib import Path

import pytest
from fastapi import FastAPI
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import runs  # noqa: E402


@pytest.fixture()
def store(tmp_path):
    return runs.RunStore("fraud", component="fraud-agent", cache_dir=tmp_path / "runs", recordings_dir=tmp_path / "recorded")


def test_events_keep_order_and_page_after(store):
    run = store.open("fr-test-0001", label="CPP")
    for index in range(5):
        store.emit(run.id, "agent.tool_call", f"step {index}", data={"tool": "score_payment"})
    page = store.page(run.id, after=3)
    assert [event["title"] for event in page["events"]] == ["step 3", "step 4"]
    assert page["total"] == 5
    assert all(event["v"] == 1 and event["lane"] == "tools" for event in page["events"])
    ns = [event["ns"] for event in store.page(run.id)["events"]]
    assert ns == sorted(ns)


def test_redaction_drops_credentials_at_any_depth(store):
    run = store.open("fr-test-0002")
    event = store.emit(run.id, "llm.call", "model", body="x" * 30_000,
                       data={"Authorization": "Bearer abc", "nested": {"api_key": "k", "token": "t", "ok": 1},
                             "list": [{"password": "p", "keep": True}]})
    assert event["data"] == {"nested": {"ok": 1}, "list": [{"keep": True}]}
    assert len(event["body"]) == runs.MAX_BODY + 1


def test_unknown_kind_status_and_lane_are_normalized(store):
    run = store.open("fr-test-0003")
    event = store.emit(run.id, "weird", "t", status="bogus", lane="nowhere")
    assert (event["kind"], event["status"], event["lane"]) == ("agent.message", "info", "agent")
    assert store.emit("missing-run", "run", "t") is None


def test_client_run_id_must_be_new_and_well_formed(store):
    first = store.open("fr-test-0004")
    again = store.open("fr-test-0004")
    bad = store.open("../etc/passwd")
    assert again.id != first.id and bad.id.startswith("fraud-")


def test_bind_routes_emit_current_and_mirrors_jsonl(store, tmp_path):
    run = store.open("fr-test-0005")
    assert runs.emit_current("run", "outside") is None
    with store.bind(run.id):
        runs.emit_model_call({"provider": "openai", "label": "OpenAI API", "model": "gpt", "fallback": True,
                              "reason": "Sparky vLLM unreachable"}, latency_ms=12)
    kinds = [event["kind"] for event in store.page(run.id)["events"]]
    assert kinds == ["model.failover", "llm.call"]
    lines = (tmp_path / "runs" / f"{run.id}.jsonl").read_text().splitlines()
    assert [json.loads(line)["kind"] for line in lines] == kinds


def test_record_golden_and_list_recordings(store, tmp_path):
    run = store.open("fr-test-0006", label="CPP alert", scenario="cpp-orbit")
    with store.bind(run.id):
        runs.emit_model_call({"provider": "sparky-vllm", "label": "Sparky vLLM", "model": "nemotron", "fallback": False})
    store.finish(run.id, "completed", {"probability": 0.74})
    store.record_golden(run.id, "fraud-cpp-orbit", title="CPP alert")
    listed = store.recordings()
    assert listed[0]["name"] == "fraud-cpp-orbit" and listed[0]["served_by"]["provider"] == "sparky-vllm"
    doc = store.recording("fraud-cpp-orbit")
    assert doc["result"] == {"probability": 0.74} and len(doc["events"]) == 1
    assert store.recording("../secrets") is None


def test_router_pages_runs_and_serves_recordings(store):
    app = FastAPI()

    async def start(run, payload):
        runs.emit_current("agent.tool_call", "score", data={"tool": "score_payment"})
        return {"ok": True, "echo": payload.get("x")}

    app.include_router(runs.router(store, "/api/fraud", start=start))
    client = TestClient(app)
    created = client.post("/api/fraud/runs", json={"scenario": "cpp-orbit", "input": {"x": 1}}).json()
    run_id = created["run_id"]
    for _ in range(50):
        page = client.get(f"/api/fraud/runs/{run_id}").json()
        if page["run"]["status"] != "running":
            break
    assert page["run"]["status"] == "completed" and page["run"]["result"] == {"ok": True, "echo": 1}
    assert page["events"][0]["title"] == "score"
    assert client.get("/api/fraud/runs/nope").status_code == 404
    assert client.get("/api/fraud/recordings").json() == {"recordings": []}
    assert client.get("/api/fraud/recordings/nope").status_code == 404


def test_hitl_decision_resolves_the_waiting_run(store):
    run = store.open("fr-test-0007")

    async def flow():
        waiter = asyncio.create_task(store.wait_decision(run.id, "approve-1", timeout=2))
        await asyncio.sleep(0)
        assert store.decide(run.id, "approve-1", {"decision": "approve", "by": "Maya", "api_key": "x"})
        return await waiter

    decision = asyncio.run(flow())
    assert decision == {"decision": "approve", "by": "Maya"}
    assert store.page(run.id)["events"][-1]["kind"] == "hitl.decision"
    assert store.decide(run.id, "approve-1", {"decision": "approve"}) is False
