"""End to end through the HTTP API in sample mode: no model, but every other step is live."""
import time

import pytest
from fastapi.testclient import TestClient

import server


@pytest.fixture(scope="module")
def client():
    with TestClient(server.app) as test_client:
        yield test_client


def start(client, scenario_id, **extra):
    body = {"scenario": scenario_id, "input": {"mode": "sample", **extra}}
    response = client.post("/api/sar/runs", json=body)
    assert response.status_code == 200
    return response.json()["run_id"]


def wait_for(client, run_id, predicate, timeout=20):
    deadline = time.monotonic() + timeout
    while time.monotonic() < deadline:
        page = client.get(f"/api/sar/runs/{run_id}").json()
        found = [e for e in page["events"] if predicate(e)]
        if found:
            return found[-1], page
        if page["run"]["status"] != "running":
            break
        time.sleep(0.05)
    raise AssertionError(f"timed out; last events: {[e['title'] for e in page['events']][-6:]}")


def request(stage, round_number=None):
    return lambda e: e["kind"] == "hitl.request" and e["data"].get("stage") == stage and (round_number is None or e["data"].get("round") == round_number)


def test_health_reports_model_defense_controls_and_telemetry(client):
    body = client.get("/api/sar/health").json()
    assert body["model"]["status"] in {"reachable", "down"}
    assert body["security"]["mode"] == "enforce"
    assert body["hosted_fallback"].startswith("refused")
    assert body["controls"]["status"] == "local" and "sar.file_requires_approval" in body["controls"]["names"]
    assert body["splunk"]["status"] and body["galileo"] == "disabled"
    assert "Simulated" in body["filing"]


def test_scenario_cards(client):
    cards = client.get("/api/sar/scenarios").json()["scenarios"]
    assert [c["id"] for c in cards] == ["mule-reyes", "structuring-harbor", "explained-novak", "injection-reyes"]
    mule = cards[0]
    assert mule["deadline"] == {"detected": "2026-10-03", "due": "2026-11-02", "as_of": "2026-10-09", "day": 6, "of": 30, "days_left": 24}
    assert "ssn" not in str(mule).lower()


def test_file_path_needs_investigator_then_a_different_qa_reviewer(client):
    run_id = start(client, "mule-reyes")
    event, page = wait_for(client, run_id, request("investigator"))
    package = event["data"]["package"]
    assert package["draft"]["recommendation"] == "file" and package["draft"]["agrees"]
    assert package["provenance"] == "sample" and package["usage"]["llm_calls"] == 0
    assert any(t["id"] == "money_mule" and t["matched"] for t in package["typologies"])
    titles = [e["title"] for e in page["events"]]
    assert any("sar.narrative_cited · allow" in t for t in titles)
    assert any("sar.no_tipping_off · allow" in t for t in titles)

    response = client.post(f"/api/sar/runs/{run_id}/review", json={
        "request_id": event["data"]["request_id"], "decision": "file", "by": "Theo Marsh",
        "rationale": "Money-mule typology matched on all six indicators; activity unexplained."})
    assert response.status_code == 200
    qa, page = wait_for(client, run_id, request("qa"))
    assert any("sar.file_requires_approval · deny · awaiting second-line QA" in e["title"] for e in page["events"])

    client.post(f"/api/sar/runs/{run_id}/qa", json={"request_id": qa["data"]["request_id"], "decision": "approve", "by": "theo marsh"})
    retry, page = wait_for(client, run_id, lambda e: e["kind"] == "hitl.request" and "different reviewer" in e["title"])
    assert any("separate_reviewers" in str(e["data"].get("failed")) for e in page["events"] if e["kind"] == "control")

    client.post(f"/api/sar/runs/{run_id}/qa", json={"request_id": retry["data"]["request_id"], "decision": "approve", "by": "Lena Ortiz"})
    done, page = wait_for(client, run_id, lambda e: e["kind"] == "result")
    assert done["title"].startswith("SAR filed (simulated) · SIM-BSA-")
    result = page["run"]["result"]
    assert result["outcome"] == "filed_simulated" and result["decision"]["qa"] == "Lena Ortiz"
    assert [a["action"] for a in result["audit"]][-1] == "SAR e-filed (simulated)"


def test_no_file_path_closes_with_rationale(client):
    run_id = start(client, "explained-novak")
    event, _ = wait_for(client, run_id, request("investigator"))
    assert event["data"]["package"]["draft"]["recommendation"] == "no_file"
    client.post(f"/api/sar/runs/{run_id}/review", json={"request_id": event["data"]["request_id"], "decision": "no_file", "by": "Theo Marsh",
                                                        "rationale": "Documented home sale; proceeds match the settlement statement."})
    qa, page = wait_for(client, run_id, request("qa"))
    assert not any("sar.file_requires_approval" in e["title"] for e in page["events"])
    client.post(f"/api/sar/runs/{run_id}/qa", json={"request_id": qa["data"]["request_id"], "decision": "approve", "by": "Lena Ortiz"})
    done, page = wait_for(client, run_id, lambda e: e["kind"] == "result")
    assert done["title"] == "Case closed · no SAR · rationale on file"
    assert page["run"]["result"]["outcome"] == "closed_no_sar"


def test_investigator_edit_with_an_unsupported_figure_is_returned(client):
    run_id = start(client, "mule-reyes")
    event, _ = wait_for(client, run_id, request("investigator"))
    narrative = [{"section": "what", "sentences": [{"text": "The account received $50,000.00 in P2P credits.", "cites": ["AGG-IN-P2P"]}]}]
    client.post(f"/api/sar/runs/{run_id}/review", json={"request_id": event["data"]["request_id"], "decision": "file", "by": "Theo Marsh",
                                                        "rationale": "Mule activity.", "narrative": narrative})
    again, page = wait_for(client, run_id, request("investigator", 2))
    assert "Edits need citations" in again["data"]["qa_note"]
    assert any("sar.narrative_cited · deny" in e["title"] for e in page["events"])


def test_qa_return_goes_back_to_the_investigator(client):
    run_id = start(client, "structuring-harbor")
    event, _ = wait_for(client, run_id, request("investigator"))
    client.post(f"/api/sar/runs/{run_id}/review", json={"request_id": event["data"]["request_id"], "decision": "file", "by": "Theo Marsh",
                                                        "rationale": "Structuring under the CTR threshold."})
    qa, _ = wait_for(client, run_id, request("qa"))
    client.post(f"/api/sar/runs/{run_id}/qa", json={"request_id": qa["data"]["request_id"], "decision": "return", "by": "Lena Ortiz",
                                                    "note": "Add the teller note to the rationale."})
    again, _ = wait_for(client, run_id, request("investigator", 2))
    assert again["data"]["qa_note"] == "Add the teller note to the rationale."


def test_injection_scenario_withholds_text_and_keeps_the_recommendation(client):
    run_id = start(client, "injection-reyes")
    event, page = wait_for(client, run_id, request("investigator"))
    package = event["data"]["package"]
    evidence = {item["id"]: item for item in package["evidence"]}
    assert evidence["DOC-1.2"]["withheld"] and evidence["DOC-1.2"]["text"] is None
    assert evidence["DOC-1.3"]["withheld"]
    assert package["draft"]["recommendation"] == "file"
    assert package["security"]["withheld_segments"] >= 3


def test_contacting_the_customer_is_denied(client):
    run_id = start(client, "mule-reyes")
    wait_for(client, run_id, request("investigator"))
    body = client.post(f"/api/sar/runs/{run_id}/contact", json={"message": "Can you explain these transfers?", "by": "Theo Marsh"}).json()
    assert body["allowed"] is False and body["policy"] == "sar.no_tipping_off" and body["engine"] == "local"


def test_fraud_handoff_becomes_cited_evidence(client):
    handoff = {"id": "h-1", "kind": "fraud-case", "createdAt": "2026-10-02T22:00:00Z", "customerId": "dana-whitfield", "caseId": "cpp-orbit",
               "title": "Compromised card at Orbit Digital Goods", "summary": "Card ending 1188 blocked and reissued; $286.40 refunded.",
               "disposition": "confirmed fraud", "evidence": [{"label": "Merchant", "value": "Orbit Digital Goods", "source": "fraud score"}],
               "transactions": [{"id": "t1", "at": "2026-10-02T20:41:00Z", "amount": 286.4, "currency": "USD", "merchant": "Orbit Digital Goods", "channel": "cnp"}]}
    run_id = start(client, "mule-reyes", handoff=handoff)
    event, _ = wait_for(client, run_id, request("investigator"))
    package = event["data"]["package"]
    ids = {item["id"] for item in package["evidence"]}
    assert {"REF-2", "REF-3", "REF-TXN"} <= ids and package["case"]["handoff"] is True


def test_unknown_decision_is_rejected(client):
    response = client.post("/api/sar/runs/sar-nope-000000/review", json={"request_id": "x", "decision": "file", "by": "A"})
    assert response.status_code == 409
