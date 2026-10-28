import json
from pathlib import Path

import pytest

import edgar
import tools

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def session(tmp_path, monkeypatch):
    monkeypatch.setenv("SEC_USER_AGENT", "FSI-Test test@example.com")
    monkeypatch.setenv("BRIEFING_CACHE", str(tmp_path / "cache"))
    current = tools.BriefingSession(run_id="run", run_dir=tmp_path, path="edgar", query="JPM")
    token = tools.session_var.set(current)
    yield current
    tools.session_var.reset(token)


def test_supervisor_never_gets_read_filing_node():
    assert "read_filing_node" not in tools.SUPERVISOR_TOOL_NAMES
    assert {tool.name for tool in tools.supervisor_tools()} == set(tools.SUPERVISOR_TOOL_NAMES)
    assert "read_filing_node" in tools.THEME_TOOL_NAMES


def test_read_filing_node_budget(session, tmp_path):
    (tmp_path / "source.html").write_text((FIXTURES / "filing.html").read_text(), encoding="utf-8")
    import navigator
    toc = navigator.build_filing_toc(tmp_path, {})
    session.current_theme = "risks"
    node_id = toc["nodes"][0]["id"]
    for _ in range(tools.MAX_NODE_READS):
        assert "Unknown" not in tools.read_filing_node.invoke({"node_id": node_id, "max_chars": 200})
    blocked = tools.read_filing_node.invoke({"node_id": node_id, "max_chars": 200})
    assert "budget exceeded" in blocked
    assert session.reads_by_theme["risks"] == tools.MAX_NODE_READS


def test_fetch_refuses_to_replace_upload(session, monkeypatch):
    session.path = "upload"
    result = tools.fetch_annual_report.invoke({"cik": "0000019617"})
    assert "Do not replace" in result
    assert "fetch_annual_report" in session.tools_used


def test_resolve_and_facts_use_fixtures(session, monkeypatch):
    monkeypatch.setattr(edgar, "resolve_company", lambda query=None, cik=None: {"cik": "0000019617", "ticker": "JPM", "name": "JPMORGAN CHASE & CO"})
    monkeypatch.setattr(
        "xbrl.get_company_facts",
        lambda cik, fy=None, accession=None, refresh=False: [{"label": "Revenue", "value": 1, "origin": "xbrl", "concept": "Revenues"}],
    )
    resolved = json.loads(tools.resolve_company.invoke({"query": "JPM"}))
    assert resolved["ticker"] == "JPM"
    facts = json.loads(tools.get_company_facts.invoke({"cik": "0000019617", "fy": 2024}))
    assert facts[0]["value"] == 1
    assert session.company_facts[0]["concept"] == "Revenues"
