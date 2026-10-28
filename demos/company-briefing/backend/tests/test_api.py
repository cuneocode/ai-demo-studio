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
        server,
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
    assert body["usage"] == {"llm_calls": 0, "input_tokens": None, "output_tokens": None}
    assert "SECRET" not in uploaded.text

    auto = client.post("/api/briefing/analyze", data={"query": "JPM"})
    assert auto.status_code == 200
    assert auto.json()["trail"]["path"] == "edgar"

    cached = client.post("/api/briefing/analyze", data={"query": "JPM"})
    assert cached.json()["cached"] is True
    assert cached.json()["usage"] == {"llm_calls": 0, "input_tokens": 0, "output_tokens": 0}
    # A replay carries the date of the run it came from, so the UI can label it as recorded.
    assert cached.json()["recorded_at"] == auto.json()["recorded_at"]
    assert cached.json()["telemetry"]["splunk"]["status"] == "not_reexported"


def test_defense_blocks_briefing(client, monkeypatch):
    async def blocked(*_args, **_kwargs):
        raise security.DefenseBlocked("AI Defense blocked this briefing. No briefing was released.")

    monkeypatch.setattr(security.defense, "mode", "enforce")
    monkeypatch.setattr(security.defense, "key", "test-key")
    monkeypatch.setattr(server, "execute_briefing", blocked)
    monkeypatch.setattr(
        server,
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


def test_cached_replay_of_a_synthetic_upload_still_says_synthetic(client, monkeypatch):
    async def fake_execute(session, message):
        assert session.synthetic is True
        return {"company": {"name": "Halcyon Interconnect, Inc."}, "source": {"kind": "upload", "label": "Uploaded"},
                "metrics": [], "trail": {"path": "upload", "todos": [], "nodes_read": [], "tools": []}}

    monkeypatch.setattr(server, "execute_briefing", fake_execute)
    report = next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "fixtures" / "halcyon" / "annual-report-fy2025.html"
    upload = {"file": ("annual-report-fy2025.html", report.read_bytes(), "text/html")}
    assert client.post("/api/briefing/analyze", files=upload).json()["cached"] is False
    replay = client.post("/api/briefing/analyze", files=upload).json()
    assert replay["cached"] is True and replay["source"]["synthetic"] is True and replay["recorded_at"]


def test_recorded_halcyon_extract_is_served_read_only(client):
    listed = client.get("/api/briefing/recordings").json()["recordings"]
    meta = next(item for item in listed if item["name"] == "halcyon-annual-report")
    assert meta["synthetic"] is True and meta["recorded_at"]
    doc = client.get("/api/briefing/recordings/halcyon-annual-report").json()
    result = doc["result"]
    assert doc["recorded_at"] == result["recorded_at"] and result["cached"] is False
    assert result["company"]["ticker"] == "HCYN" and result["source"]["synthetic"] is True
    assert result["usage"]["llm_calls"] > 0 and doc["served_by"]["label"]
    assert "api_key" not in json.dumps(doc).lower()
    assert client.get("/api/briefing/recordings/missing-one").status_code == 404
    assert client.get("/api/briefing/recordings/Bad_Name").status_code == 404
