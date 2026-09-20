import json
from pathlib import Path

import pytest
from fastapi.testclient import TestClient
from pypdf import PdfWriter

import edgar
import security
import server

FIXTURES = Path(__file__).parent / "fixtures"


@pytest.fixture
def client(monkeypatch, tmp_path):
    monkeypatch.setenv("SEC_USER_AGENT", "FSI-Test test@example.com")
    monkeypatch.setenv("OPENAI_API_KEY", "test-key")
    monkeypatch.setenv("MODEL_NAME", "test-model")
    monkeypatch.setenv("BRIEFING_CACHE", str(tmp_path))
    monkeypatch.setattr(security.defense, "mode", "off")
    monkeypatch.setattr(security.defense, "key", "")
    monkeypatch.setattr(security.defense, "valid", True)
    monkeypatch.setattr(server, "_agent_importable", lambda: True)
    monkeypatch.setattr(edgar, "load_tickers", lambda refresh=False: json.loads((FIXTURES / "tickers.json").read_text()))
    return TestClient(server.app)


def test_health_and_search(client):
    health = client.get("/api/briefing/health").json()
    assert health["ready"] is True
    assert health["agent"] == "deep-agent"
    assert health["sec"]["user_agent_set"] is True
    assert health["security"]["fail_open"] is False
    assert health["security"]["mode"] == "off"
    assert health["security"]["status"] == "disabled"
    search = client.get("/api/briefing/search", params={"q": "JPM"}).json()
    assert search["candidates"][0]["ticker"] == "JPM"
    assert client.get("/api/briefing/search").status_code == 422


def test_analyze_requires_input_and_redacts_unknown_file(client):
    missing = client.post("/api/briefing/analyze", data={})
    assert missing.status_code == 422
    bad = client.post("/api/briefing/analyze", files={"file": ("notes.docx", b"hello", "application/msword")})
    assert bad.status_code == 422


def test_unknown_issuer_is_404_without_agent(client, monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("unknown issuer must not reach the model")

    monkeypatch.setattr(server, "execute_briefing", boom)
    response = client.post("/api/briefing/analyze", data={"query": "ZZZZNOTAREALISSUER"})
    assert response.status_code == 404
    assert "ZZZZ" not in response.text or "Unknown issuer" in response.text


def test_ambiguous_name_returns_candidates(client, monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("ambiguous issuer must not reach the model")

    monkeypatch.setattr(server, "execute_briefing", boom)
    response = client.post("/api/briefing/analyze", data={"query": "INC"})
    assert response.status_code == 409
    assert response.json()["candidates"]


def test_empty_pdf_is_422_before_agent(client, tmp_path, monkeypatch):
    async def boom(*_args, **_kwargs):
        raise AssertionError("empty PDF must not reach the model")

    monkeypatch.setattr(server, "execute_briefing", boom)
    blank = tmp_path / "blank.pdf"
    writer = PdfWriter()
    writer.add_blank_page(width=72, height=72)
    writer.write(blank)
    response = client.post(
        "/api/briefing/analyze",
        files={"file": ("scan.pdf", blank.read_bytes(), "application/pdf")},
    )
    assert response.status_code == 422
    assert "no extractable text" in response.json()["detail"]


def test_analyze_upload_and_edgar_paths(client, monkeypatch):
    async def fake_execute(session, message):
        assert session.path in {"upload", "edgar"}
        if session.path == "upload":
            assert "Filing already at" in message
            assert (session.run_dir / "source.html").is_file()
        else:
            assert "No file. Resolve" in message
        return {
            "company": {"name": "Fixture Bank", "ticker": "JPM", "cik": "0000019617"},
            "period": {"form": "10-K", "filedAt": "2025-02-14", "periodOfReport": "2024-12-31", "fiscalYear": 2024},
            "source": {"kind": session.path, "label": "fixture", "url": None, "filename": session.filename, "accession": "0000019617-25-000270"},
            "objectives": {"status": "abstain", "facts": []},
            "risks": {"status": "abstain", "facts": []},
            "regulatory": {"status": "abstain", "facts": []},
            "ai_initiatives": {"status": "abstain", "facts": []},
            "metrics": [],
            "trail": {"path": session.path, "todos": [], "nodes_read": [], "tools": []},
            "grounding": {"dropped_facts": 0, "dropped_metrics": 0},
        }

    monkeypatch.setattr(server, "execute_briefing", fake_execute)
    monkeypatch.setattr(
        edgar,
        "latest_annual_report",
        lambda cik, refresh=False: {
            "cik": "0000019617",
            "name": "JPMORGAN CHASE & CO",
            "ticker": "JPM",
            "form": "10-K",
            "filed_at": "2025-02-14",
            "period_of_report": "2024-12-31",
            "fiscal_year": 2024,
            "accession": "0000019617-25-000270",
            "primary_document": "jpm.htm",
            "url": "https://www.sec.gov/Archives/edgar/data/19617/000001961725000270/jpm.htm",
        },
    )
    html = (FIXTURES / "filing.html").read_bytes()
    uploaded = client.post(
        "/api/briefing/analyze",
        data={"query": "JPM"},
        files={"file": ("jpm.html", html, "text/html")},
    )
    assert uploaded.status_code == 200
    body = uploaded.json()
    assert body["source"]["kind"] == "upload"
    assert body["trail"]["path"] == "upload"
    assert body["security"]["mode"] == "off"
    assert "SECRET" not in uploaded.text

    auto = client.post("/api/briefing/analyze", data={"query": "JPM"})
    assert auto.status_code == 200
    assert auto.json()["trail"]["path"] == "edgar"

    cached = client.post("/api/briefing/analyze", data={"query": "JPM"})
    assert cached.json()["cached"] is True


def test_defense_blocks_briefing(client, monkeypatch):
    async def blocked(*_args, **_kwargs):
        raise security.DefenseBlocked("AI Defense blocked this briefing. No briefing was released.")

    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-key")
    monkeypatch.setattr(server, "execute_briefing", blocked)
    monkeypatch.setattr(
        edgar,
        "latest_annual_report",
        lambda cik, refresh=False: {
            "cik": "0000019617",
            "name": "JPMORGAN CHASE & CO",
            "ticker": "JPM",
            "form": "10-K",
            "filed_at": "2025-02-14",
            "period_of_report": "2024-12-31",
            "fiscal_year": 2024,
            "accession": "0000019617-25-000270",
            "primary_document": "jpm.htm",
            "url": "https://www.sec.gov/x",
        },
    )
    response = client.post("/api/briefing/analyze", data={"query": "JPM"})
    assert response.status_code == 403
    assert "briefing" in response.json()["detail"].lower()
    assert "answer" not in response.json()
