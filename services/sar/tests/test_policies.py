import asyncio
import sys
from pathlib import Path

from controls import POLICIES, Controls, definitions, local_decision
from investigation import _contacts
from runlog import store

sys.path.insert(0, str(Path(__file__).resolve().parents[2] / "common"))


def test_definitions_are_json_controls_that_deny():
    defs = definitions()
    assert set(defs) == set(POLICIES)
    for name, data in defs.items():
        assert data["action"]["decision"] == "deny" and data["execution"] == "server"
        schema = data["condition"]["evaluator"]["config"]["json_schema"]
        assert schema["required"] == POLICIES[name]["keys"]
        assert all(prop == {"const": True} for prop in schema["properties"].values())


def test_no_filing_without_human_and_separate_qa_approval():
    name = "sar-file-requires-approval-v1"
    investigator_only = {"investigator_decided": True, "rationale_recorded": True, "qa_approved": False, "separate_reviewers": False}
    assert local_decision(name, investigator_only) == (False, ["qa_approved", "separate_reviewers"])
    same_person = {**investigator_only, "qa_approved": True}
    assert local_decision(name, same_person) == (False, ["separate_reviewers"])
    assert local_decision(name, {**same_person, "separate_reviewers": True}) == (True, [])
    assert local_decision(name, {**same_person, "separate_reviewers": True, "rationale_recorded": False})[0] is False


def test_no_tipping_off_and_narrative_cited():
    assert local_decision("sar-no-tipping-off-v1", {"no_subject_contact": False}) == (False, ["no_subject_contact"])
    assert local_decision("sar-no-tipping-off-v1", {"no_subject_contact": True}) == (True, [])
    assert local_decision("sar-narrative-cited-v1", {"every_sentence_cited": True, "every_fact_verified": "yes"})[0] is False


def test_checks_are_labelled_local_when_agent_control_is_not_registered():
    controls = Controls()
    run = store.open(prefix="sar-test")
    with store.bind(run.id):
        verdict = asyncio.run(controls.check("sar-no-tipping-off-v1", {"no_subject_contact": False}))
    assert verdict["engine"] == "local" and not verdict["allowed"]
    event = run.events[-1]
    assert event["kind"] == "control" and event["status"] == "denied"
    assert event["title"].startswith("Policy (local check) · sar.no_tipping_off · deny")
    assert "Agent Control" not in event["title"]


def test_contact_detection_in_suggested_steps():
    assert _contacts("Email the customer that the review is closed.")
    assert _contacts("Call Kendall Reyes to ask about the transfers.")
    assert _contacts("Send an RFI to the subject about the deposits.")
    assert not _contacts("Share the 9 compromised funding cards with fraud operations.")
    assert not _contacts("Consider a 314(b) information-sharing request to the funding-card issuers.")
