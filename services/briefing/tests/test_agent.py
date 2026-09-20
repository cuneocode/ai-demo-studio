from pathlib import Path

import agent
import tools
from subagents import THEME_NAMES, theme_subagents


def test_protected_model_disables_luna_reasoning_for_tools(monkeypatch):
    monkeypatch.setenv("MODEL_NAME", "gpt-5.6-luna")
    model = agent.protected_model()
    assert model.reasoning_effort == "none"


def test_supervisor_prompt_forbids_node_reads_and_web():
    assert "Never call read_filing_node" in agent.BRIEFING_PROMPT
    assert "no web search" in agent.BRIEFING_PROMPT.lower() or "no web search" in agent.BRIEFING_PROMPT
    assert "general-purpose" in agent.BRIEFING_PROMPT


def test_theme_subagents_and_tools():
    specs = theme_subagents()
    names = [spec["name"] for spec in specs]
    assert names == list(THEME_NAMES)
    assert "general-purpose" not in names
    for spec in specs:
        tool_names = {getattr(tool, "name", None) for tool in spec["tools"]}
        if spec["name"] == "metrics":
            assert tool_names == {"get_company_facts"}
            assert "read_filing_node" not in tool_names
        else:
            assert "read_filing_node" in tool_names
            assert "fetch_annual_report" not in tool_names


def test_require_agent_completed_rejects_hollow_runs(tmp_path):
    empty = tools.BriefingSession(run_id="e", run_dir=tmp_path, path="edgar", query="JPM")
    try:
        agent.require_agent_completed(empty)
        raise AssertionError("hollow edgar run must fail")
    except agent.AgentIncomplete:
        pass
    (tmp_path / "source.html").write_text("<html>Item 1. Business</html>", encoding="utf-8")
    uploaded = tools.BriefingSession(run_id="u", run_dir=tmp_path, path="upload", filename="a.html")
    try:
        agent.require_agent_completed(uploaded)
        raise AssertionError("upload without TOC or notes must fail")
    except agent.AgentIncomplete:
        pass
    (tmp_path / "toc.json").write_text('{"nodes":[]}', encoding="utf-8")
    fetched = tools.BriefingSession(run_id="f", run_dir=tmp_path, path="edgar", query="JPM")
    fetched.tools_used.append("fetch_annual_report")
    agent.require_agent_completed(fetched)


def test_user_messages(tmp_path):
    upload = tools.BriefingSession(run_id="u", run_dir=tmp_path, path="upload", filename="report.pdf", query="Acme")
    (tmp_path / "source.pdf").write_bytes(b"%PDF")
    message = agent.user_message(upload)
    assert "Filing already at /filings/source.pdf" in message
    assert "Do not call fetch_annual_report" in message
    auto = tools.BriefingSession(run_id="a", run_dir=tmp_path, path="edgar", query="JPM", ticker="JPM")
    assert "No file. Resolve JPM" in agent.user_message(auto)


def test_build_agent_disables_general_purpose(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    captured = {}

    def fake_create(**kwargs):
        captured.update(kwargs)
        return {"ainvoke": None}

    class FakeBackend:
        def __init__(self, *args, **kwargs):
            pass

    class FakeComposite:
        def __init__(self, default, routes):
            self.default = default
            self.routes = routes

    monkeypatch.setattr(agent, "apply_briefing_harness", lambda: captured.setdefault("harness", True))
    monkeypatch.setattr(agent, "_create_deep_agent", fake_create)
    monkeypatch.setattr("deepagents.backends.CompositeBackend", FakeComposite)
    monkeypatch.setattr("deepagents.backends.FilesystemBackend", FakeBackend)
    monkeypatch.setattr("deepagents.backends.StateBackend", FakeBackend)

    skill = Path(tmp_path / "skills" / "extract-10k")
    monkeypatch.setattr(agent, "SKILLS_SOURCE", Path(__file__).resolve().parents[1] / "skills" / "extract-10k")
    agent.build_agent(tmp_path)
    assert captured.get("harness") is True
    assert captured["name"] == "company-briefing"
    tool_names = {tool.name for tool in captured["tools"]}
    assert "read_filing_node" not in tool_names
    assert {spec["name"] for spec in captured["subagents"]} == set(THEME_NAMES)
    assert (tmp_path / "skills" / "extract-10k" / "SKILL.md").is_file()
    assert skill  # keep fixture path referenced


def _tool_names(graph):
    node = graph.nodes["tools"]
    for _ in range(6):
        names = getattr(node, "tools_by_name", None)
        if names:
            return set(names)
        node = getattr(node, "bound", None) or getattr(node, "runnable", None)
    raise AssertionError("compiled graph has no tools")


def test_constructed_graph_excludes_execute_and_general_purpose(monkeypatch, tmp_path):
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("BRIEFING_AIDEFENSE_MODE", "off")
    graph = agent.build_agent(tmp_path)
    names = _tool_names(graph)
    assert "execute" not in names
    assert "read_filing_node" not in names
    assert {"resolve_company", "fetch_annual_report", "build_filing_toc", "get_company_facts", "task", "write_todos"} <= names
    description = graph.nodes["tools"].tools_by_name["task"].description if hasattr(graph.nodes["tools"], "tools_by_name") else ""
    if not description:
        node = graph.nodes["tools"]
        for _ in range(6):
            tools = getattr(node, "tools_by_name", None)
            if tools and "task" in tools:
                description = tools["task"].description
                break
            node = getattr(node, "bound", None)
    assert "- objectives:" in description
    assert "- general-purpose:" not in description
