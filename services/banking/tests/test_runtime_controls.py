import asyncio
import sys
from pathlib import Path
from types import SimpleNamespace

import pytest
from fastapi.testclient import TestClient

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent_control
import runtime_controls as rcmod
import server
from pydantic import ValidationError
from security import DefenseBlocked


@pytest.fixture(autouse=True)
def no_remote_telemetry(monkeypatch):
    monkeypatch.delenv("GALILEO_API_KEY", raising=False)


def test_control_definitions_are_server_json_gates():
    definitions = rcmod.definitions()
    assert set(definitions) == set(rcmod.POLICIES)
    for name, definition in definitions.items():
        label, key, step, stage = rcmod.POLICIES[name]
        control = definition["condition"]["evaluator"]["config"]["json_schema"]
        assert definition["enabled"] is True
        assert definition["execution"] == "server"
        assert definition["action"] == {"decision": "deny"}
        assert control["required"] == [key]
        assert control["properties"][key] == {"const": True}
        assert definition["scope"] == {"step_types": ["llm"], "step_names": [step], "stages": [stage]}


@pytest.mark.parametrize("bad", [{"in_scope": "true"}, {}, {"in_scope": True, "extra": False}])
def test_judge_strict_schema_rejects_strings_missing_fields_and_extras(monkeypatch, bad):
    class Model:
        def with_structured_output(self, *args, **kwargs):
            return self

        async def ainvoke(self, *args, **kwargs):
            return bad

    monkeypatch.setattr(rcmod, "ProtectedChatOpenAI", lambda **kwargs: Model())
    controls = rcmod.RuntimeControls()
    with pytest.raises(ValidationError):
        asyncio.run(controls.judge(rcmod.ScopeVerdict, rcmod.SCOPE_POLICY, {"request": "x"}))


def test_enforce_fails_closed_when_sdk_omits_expected_check_or_reports_error(monkeypatch):
    controls = rcmod.RuntimeControls()
    monkeypatch.setattr(controls, "verify_controls", lambda: None)
    for result in [SimpleNamespace(matches=[], non_matches=[], errors=[], is_safe=True),
                   SimpleNamespace(matches=[], non_matches=[], errors=["sdk error"], is_safe=True)]:
        async def evaluate(*args, _result=result, **kwargs):
            return _result
        monkeypatch.setattr(agent_control, "evaluate_controls", evaluate)
        with pytest.raises(rcmod.ControlsUnavailable):
            asyncio.run(controls.enforce(rcmod.SCOPE_STEP, "pre", {"in_scope": True}, rcmod.ControlRun()))


def test_enforce_treats_hosted_short_circuit_deny_as_block(monkeypatch):
    controls = rcmod.RuntimeControls()
    monkeypatch.setattr(controls, "verify_controls", lambda: None)
    name = "brahe-bank-evidence-grounding-v1"
    item = SimpleNamespace(control_name=name, control_id="control-1", control_execution_id="execution-1")
    result = SimpleNamespace(matches=[item], non_matches=[], errors=[], is_safe=False)

    async def evaluate(*args, **kwargs):
        return result

    monkeypatch.setattr(agent_control, "evaluate_controls", evaluate)
    run = rcmod.ControlRun()
    with pytest.raises(rcmod.ControlsBlocked):
        asyncio.run(controls.enforce(rcmod.ANSWER_STEP, "post", {"grounded": False, "no_approval_claim": True}, run))
    assert run.status == "blocked"
    assert run.checks[0]["status"] == "blocked"


@pytest.mark.parametrize("mutate", [
    lambda control: control.update(enabled=False),
    lambda control: control["scope"].update(stages=["post"]),
])
def test_verify_controls_rejects_disabled_or_mis_scoped_controls(monkeypatch, mutate):
    configured = [{"name": name, "control": definition} for name, definition in rcmod.definitions().items()]
    mutate(configured[0]["control"])
    monkeypatch.setattr(agent_control, "get_server_controls", lambda: configured)
    with pytest.raises(rcmod.ControlsUnavailable):
        rcmod.RuntimeControls().verify_controls()


def test_server_orders_defense_before_controls_and_passes_complete_tool_evidence(monkeypatch):
    events, received = [], []
    monkeypatch.setattr(server.defense, "mode", "off")
    async def inspect(messages, stage="model_input"):
        events.append("defense:" + stage)
    async def check(stage, request, run, **kwargs):
        events.append("controls:" + stage)
        if stage == "post":
            received.append(kwargs["evidence"])
            run.status = "allowed"
    monkeypatch.setattr(server.defense, "inspect", inspect)
    monkeypatch.setattr(server.runtime_controls, "check", check)
    evidence = "EVIDENCE-" + ("x" * 5000)
    class Graph:
        class CP:
            async def adelete_thread(self, sid): pass
        checkpointer = CP()
        async def ainvoke(self, payload, config):
            return {"messages": [SimpleNamespace(type="tool", name="credit_score_retrieval", content=evidence),
                                  SimpleNamespace(type="ai", content="Your mock score is 550.")]}
    monkeypatch.setattr(server, "graph", Graph())
    server.sessions.clear()
    response = TestClient(server.app).post("/api/banking/chat", json={"message": "score"})
    assert response.status_code == 200
    assert events == ["defense:request_input", "controls:pre", "defense:response_output", "controls:post"]
    assert received[0][0]["content"] == evidence


def test_defense_block_prevents_quality_check_and_graph(monkeypatch):
    calls = []
    async def block(messages, stage="model_input"):
        calls.append("defense:" + stage)
        raise DefenseBlocked("blocked")
    async def quality(*args, **kwargs):
        pytest.fail("quality controls must not run after AI Defense blocks")
    class Graph:
        async def ainvoke(self, *args, **kwargs):
            pytest.fail("graph must not run after AI Defense blocks")
    monkeypatch.setattr(server.defense, "inspect", block)
    monkeypatch.setattr(server.runtime_controls, "check", quality)
    monkeypatch.setattr(server, "graph", Graph())
    server.sessions.clear()
    response = TestClient(server.app).post("/api/banking/chat", json={"message": "unsafe"})
    assert response.status_code == 403
    assert calls == ["defense:request_input"]
    assert response.json()["session_reset"] is True


def test_control_block_or_error_releases_no_answer_and_resets_session(monkeypatch):
    for exception, status in [(rcmod.ControlsBlocked("blocked"), 422), (rcmod.ControlsUnavailable("error"), 503)]:
        calls = []
        async def inspect(messages, stage="model_input"): calls.append("defense:" + stage)
        async def quality(stage, request, run, **kwargs):
            calls.append("controls:" + stage)
            if stage == "post": raise exception
        class CP:
            async def adelete_thread(self, sid): calls.append("reset")
        class Graph:
            checkpointer = CP()
            async def ainvoke(self, *args, **kwargs):
                calls.append("graph")
                return {"messages": [SimpleNamespace(type="ai", content="answer")]}
        server.sessions.clear()
        monkeypatch.setattr(server.defense, "inspect", inspect)
        monkeypatch.setattr(server.runtime_controls, "check", quality)
        monkeypatch.setattr(server, "graph", Graph())
        response = TestClient(server.app).post("/api/banking/chat", json={"message": "score"})
        assert response.status_code == status
        assert "answer" not in response.json()
        assert response.json()["session_reset"] is True
        assert calls[-1] == "reset"
