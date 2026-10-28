"""One SAR investigation run: agent draft → verification and policies → investigator → QA → simulated e-filing.

Runs as the start handler of the shared runs router (POST /api/sar/runs). The human steps
await store.wait_decision(); the studio answers through POST /api/sar/runs/{id}/review and
/qa. Nothing is filed anywhere: "e-filing" is a simulated confirmation number.
"""
from __future__ import annotations

import asyncio
import hashlib
import os
import re
import time
from contextvars import Token

from agent import AgentIncomplete, run_live, run_sample
from casefile import CaseFile, now_iso, scenario
from citations import check_rationale, verify
from controls import controls
from model import EgressRefused, served
from observe import attach_galileo, finish_galileo
from runlog import emit_current, store
from security import DefenseBlocked, DefenseUnavailable, SecurityRun, security_run
from telemetry import sar_telemetry
from tools import Investigation
from usage import ModelUsage, model_usage

DECISION_TIMEOUT = float(os.getenv("SAR_DECISION_TIMEOUT_SECONDS", "1800"))
MAX_ROUNDS = 4
CONTACT = re.compile(
    r"\b(contact|call|phone|e-?mail|notify|inform|message|text|tell|ask|interview|send (?:a |an )?(?:letter|notice|message|rfi)|rfi|reach out)\b"
    r"[^.]{0,60}\b(customer|subject|account ?holder|client|him|her|them|kendall|reyes|owner|vance|novak)\b", re.IGNORECASE)
SIMULATED = "Simulated BSA E-Filing (nothing is sent to FinCEN)"


def _contacts(step: str) -> bool:
    return bool(CONTACT.search(step or ""))


def _audit(audit: list, actor: str, role: str, action: str, detail: str = "") -> None:
    audit.append({"at": now_iso(), "actor": actor, "role": role, "action": action, "detail": detail})


def _header(cf: CaseFile) -> dict:
    case = cf.case
    subject = case["subject"]
    return {"id": case["id"], "label": case["label"], "scenario": cf.scenario["id"], "kind": cf.scenario["kind"],
            "title": cf.scenario["title"], "subject": {"name": subject["name"], "kind": "business" if subject.get("entity_type") else "individual",
                                                       "detail": subject.get("entity_type") or subject.get("occupation"),
                                                       "location": f"{subject['address']['city']}, {subject['address']['state']}",
                                                       "ssn_masked": "***-**-" + str(subject.get("ssn") or subject.get("beneficial_owner", {}).get("ssn") or "")[-4:]},
            "alert": case["alert"], "deadline": cf.deadline, "accounts": [a["number_masked"] for a in case.get("accounts", [])],
            "handoff": bool(cf.handoff), "synthetic": True}


async def _postprocess(cf: CaseFile, draft: dict, ctx: Investigation) -> dict:
    """Verifies the agent's draft, checks it against the indicators, and runs the release policies."""
    checked = verify(draft.get("sections") or [], cf.ledger, cf.year, drop=True)
    for item in checked["dropped"]:
        emit_current("claim.verdict", f"Sentence dropped · {item['section']} · {'; '.join(item['problems'])}", status="flagged",
                     body=item["text"], data={"cites": item["cites"], "problems": item["problems"]})
    emit_current("claim.verdict",
                 f"Citations · {checked['kept']} of {checked['total']} sentences verified against the evidence"
                 + (f" · {len(checked['dropped'])} dropped" if checked["dropped"] else ""),
                 status="ok" if not checked["dropped"] else "flagged",
                 data={"kept": checked["kept"], "total": checked["total"], "missing_sections": checked["missing_sections"]})
    if checked["missing_sections"]:
        emit_current("claim.verdict", f"Narrative is missing {', '.join(checked['missing_sections'])}", status="flagged",
                     body="FinCEN narratives answer who, what, when, where, why, and how. The investigator can add them.")
    rationale = check_rationale(draft.get("rationale", ""), draft.get("rationale_cites") or [], cf.ledger, cf.year)
    indicator_rec = "file" if any(t["matched"] for t in cf.typologies) else "no_file"
    agent_rec = draft.get("recommendation") if draft.get("recommendation") in {"file", "no_file"} else indicator_rec
    agrees = agent_rec == indicator_rec
    matched = [t["label"] for t in cf.typologies if t["matched"]]
    emit_current("claim.verdict",
                 f"Recommendation · {'file' if agent_rec == 'file' else 'no SAR'} · "
                 + ("agrees with the typology indicators" if agrees else "CONFLICTS with the typology indicators"),
                 status="ok" if agrees else "flagged",
                 body=("Matched: " + ", ".join(matched)) if matched else "No typology matched.",
                 data={"agent": agent_rec, "indicators": indicator_rec})
    steps = [str(s)[:240] for s in (draft.get("next_steps") or [])][:6]
    contact_steps = [s for s in steps if _contacts(s)]
    tipping = await controls.check("sar-no-tipping-off-v1", {"no_subject_contact": not contact_steps and not ctx.contact_attempts},
                                   note="No step in the draft contacts the subject or reveals the review.",
                                   deny_note="a suggested step would contact the subject")
    if contact_steps:
        steps = [s for s in steps if s not in contact_steps]
    narrative_gate = await controls.check("sar-narrative-cited-v1", {"every_sentence_cited": checked["every_sentence_cited"],
                                                                     "every_fact_verified": checked["every_fact_verified"]},
                                          note="Every kept sentence cites evidence that states its figures and dates.")
    return {
        "sections": checked["sections"], "dropped": checked["dropped"], "verification": {k: checked[k] for k in ("total", "kept", "failing", "cited_share", "missing_sections")},
        "recommendation": agent_rec, "indicator_recommendation": indicator_rec, "agrees": agrees,
        "rationale": rationale, "next_steps": steps, "removed_steps": contact_steps,
        "policies": [tipping, narrative_gate], "released": narrative_gate["allowed"],
        "contact_attempts": len(ctx.contact_attempts),
    }


def _confirmation(run_id: str) -> str:
    return "SIM-BSA-" + hashlib.sha256(run_id.encode()).hexdigest()[:10].upper()


async def _wait(run_id: str, request_id: str) -> dict | None:
    try:
        return await store.wait_decision(run_id, request_id, timeout=DECISION_TIMEOUT)
    except asyncio.TimeoutError:
        return None


async def start(run, payload: dict) -> dict | None:
    item = scenario(payload.get("scenario") or run.scenario)
    if not item:
        emit_current("run", "Unknown scenario", status="error")
        store.finish(run.id, "failed", {"detail": "Unknown scenario."})
        return None
    handoff = payload.get("handoff") if isinstance(payload.get("handoff"), dict) else None
    mode = "sample" if payload.get("mode") == "sample" else "live"
    cf = CaseFile(item, handoff)
    run.label = f"SAR investigation · {cf.case['subject']['name']}"
    run.meta.update({"scenario": item["id"], "mode": mode, "handoff": bool(handoff)})
    emit_current("run", f"Investigation · {cf.scenario['title']}", status="started",
                 body=f"Alert {cf.case['alert']['id']} · detected {cf.deadline['detected']} · due {cf.deadline['due']} (day {cf.deadline['day']} of 30).",
                 data={"case": _header(cf), "mode": mode})
    started = time.monotonic()
    security = SecurityRun()
    sec_token: Token = security_run.set(security)
    usage = ModelUsage()
    usage_token: Token = model_usage.set(usage)
    served_token: Token = served.set({})
    ctx = Investigation(cf)
    galileo_logger, callbacks, galileo = (None, [], "disabled")
    splunk = {"status": "not_configured"}
    draft, served_by, failure = None, None, None
    try:
        with sar_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            if mode == "live":
                galileo_logger, callbacks, galileo = attach_galileo(f"SAR investigation · {cf.scenario['title']}", cf.case["alert"]["id"])
                try:
                    draft, served_by = await asyncio.wait_for(run_live(ctx, callbacks), 300)
                except EgressRefused as exc:
                    failure = ("refused", str(exc))
                except (DefenseBlocked, DefenseUnavailable) as exc:
                    failure = ("blocked", str(exc))
                except asyncio.TimeoutError:
                    failure = ("failed", "The investigation agent timed out.")
                except AgentIncomplete as exc:
                    failure = ("failed", str(exc))
                except Exception as exc:  # the model chain or agent failed; the timeline says so
                    failure = ("failed", f"The investigation agent failed ({type(exc).__name__}).")
            else:
                draft, served_by = await run_sample(ctx)
        splunk = sar_telemetry.delivery(trace_id) if mode == "live" else splunk
    finally:
        galileo = await finish_galileo(galileo_logger, galileo, "draft ready" if draft else (failure or ("", ""))[1], 200 if draft else 500)
        served_record = served.get() or None
        served.reset(served_token)
        model_usage.reset(usage_token)
        security_run.reset(sec_token)
    telemetry = {"splunk": splunk, "galileo": galileo}
    base = {"case": _header(cf), "mode": mode, "typologies": cf.typologies, "evidence": cf.ledger.public(),
            "security": security.summary(), "usage": usage.summary(), "telemetry": telemetry,
            "served_by": served_by or (served_record if usage.llm_calls else None), "would_serve": served_record,
            "duration_ms": round((time.monotonic() - started) * 1000), "tools_used": ctx.tools_used}
    if failure:
        status, reason = failure
        titles = {"refused": "Draft not made · case data stayed in the bank", "blocked": "Draft not made · AI Defense stopped the model call",
                  "failed": "Draft not made · the agent did not finish"}
        emit_current("result", titles[status], status="blocked" if status in {"refused", "blocked"} else "error", body=reason)
        store.finish(run.id, "blocked" if status in {"refused", "blocked"} else "failed", {**base, "outcome": status, "reason": reason})
        return None

    review = await _postprocess(cf, draft, ctx)
    package = {**base, "draft": review, "provenance": "sample" if mode == "sample" else "live"}
    if not review["released"]:
        emit_current("result", "Draft held · the narrative policy denied release", status="blocked",
                     body="No verified sentences remained. Run again or use the sample narrative.")
        store.finish(run.id, "blocked", {**package, "outcome": "held"})
        return None
    return await _human_steps(run, cf, package)


async def _human_steps(run, cf: CaseFile, package: dict) -> dict | None:
    audit: list[dict] = []
    _audit(audit, "Investigation agent" if package["mode"] == "live" else "Scripted sample", "agent", "Draft released for review",
           f"{package['draft']['verification']['kept']} verified sentences · recommends {'filing' if package['draft']['recommendation'] == 'file' else 'no SAR'}")
    qa_note = None
    final_sections = package["draft"]["sections"]
    for round_number in range(1, MAX_ROUNDS + 1):
        request_id = f"investigator-{round_number}"
        emit_current("hitl.request", "Investigator review · edit, decide file or no SAR, give a rationale", status="info",
                     body=qa_note, data={"request_id": request_id, "stage": "investigator", "round": round_number,
                                         "qa_note": qa_note, "package": package if round_number == 1 else None})
        decision = await _wait(run.id, request_id)
        if decision is None:
            return _left_open(run, package, audit)
        choice = decision.get("decision")
        investigator = (decision.get("by") or "Investigator").strip()[:80]
        rationale = (decision.get("rationale") or decision.get("note") or "").strip()
        edited = decision.get("narrative")
        if edited:
            checked = verify(edited, cf.ledger, cf.year, drop=False)
            gate = await controls.check("sar-narrative-cited-v1", {"every_sentence_cited": checked["every_sentence_cited"],
                                                                   "every_fact_verified": checked["every_fact_verified"]},
                                        note="The investigator's edits still cite evidence for every figure.")
            if not gate["allowed"]:
                problems = [f"{item['section']}: {'; '.join(item['problems'])}" for s in checked["sections"] for item in s["sentences"] if not item["ok"]]
                qa_note = "Edits need citations: " + " | ".join(problems[:4])
                _audit(audit, investigator, "investigator", "Edit returned by policy", qa_note)
                emit_current("claim.verdict", "Investigator edits · " + qa_note, status="flagged",
                             data={"sections": checked["sections"]})
                continue
            final_sections = checked["sections"]
            _audit(audit, investigator, "investigator", "Edited the narrative", f"{checked['kept']} sentences, all cited")
        _audit(audit, investigator, "investigator", "Decided " + ("File SAR" if choice == "file" else "No SAR"), rationale)
        if choice == "file":
            await controls.check("sar-file-requires-approval-v1", {"investigator_decided": True, "rationale_recorded": len(rationale) >= 12,
                                                                   "qa_approved": False, "separate_reviewers": False},
                                 deny_note="awaiting second-line QA")
            _audit(audit, "Policy", "control", "Filing held for QA", "No filing on one person's say-so.")
        qa_request = f"qa-{round_number}"
        emit_current("hitl.request", f"Second-line QA · approve {'filing' if choice == 'file' else 'closing without a SAR'} or return", status="info",
                     data={"request_id": qa_request, "stage": "qa", "round": round_number, "decision": choice,
                           "investigator": investigator, "rationale": rationale, "sections": final_sections if edited else None})
        while True:
            qa = await _wait(run.id, qa_request)
            if qa is None:
                return _left_open(run, package, audit)
            reviewer = (qa.get("by") or "QA reviewer").strip()[:80]
            if qa.get("decision") not in {"approve", "approved"}:
                qa_note = (qa.get("note") or "Returned by QA.").strip()
                _audit(audit, reviewer, "qa", "Returned to investigator", qa_note)
                break
            if choice == "file":
                gate = await controls.check("sar-file-requires-approval-v1", {
                    "investigator_decided": True, "rationale_recorded": len(rationale) >= 12, "qa_approved": True,
                    "separate_reviewers": reviewer.lower() != investigator.lower()},
                    note="Investigator decision with rationale, and approval by a different QA reviewer.")
                if not gate["allowed"]:
                    _audit(audit, "Policy", "control", "Filing denied", gate["reason"])
                    qa_request = f"qa-{round_number}-retry-{len(audit)}"
                    emit_current("hitl.request", "Second-line QA · a different reviewer must approve", status="info",
                                 data={"request_id": qa_request, "stage": "qa", "round": round_number, "decision": choice,
                                       "investigator": investigator, "rationale": rationale, "reason": gate["reason"]})
                    continue
                _audit(audit, reviewer, "qa", "Approved filing", qa.get("note") or "")
                confirmation = _confirmation(run.id)
                emit_current("agent.tool_call", "efile_sar (simulated)", body=SIMULATED, data={"tool": "efile_sar", "simulated": True})
                emit_current("tool.result", f"{SIMULATED} · accepted · {confirmation}", status="ok", data={"confirmation": confirmation, "simulated": True})
                _audit(audit, "System", "system", "SAR e-filed (simulated)", confirmation)
                emit_current("result", f"SAR filed (simulated) · {confirmation}", status="ok",
                             body=f"Approved by {reviewer} after {investigator}'s decision. Nothing left this laptop.")
                result = {**package, "outcome": "filed_simulated", "confirmation": confirmation, "final_sections": final_sections,
                          "decision": {"choice": choice, "rationale": rationale, "investigator": investigator, "qa": reviewer}, "audit": audit}
                store.finish(run.id, "completed", result)
                return result
            _audit(audit, reviewer, "qa", "Approved closing without a SAR", qa.get("note") or "")
            emit_current("result", "Case closed · no SAR · rationale on file", status="ok",
                         body=f"{investigator}'s no-file rationale approved by {reviewer}.")
            result = {**package, "outcome": "closed_no_sar", "final_sections": final_sections,
                      "decision": {"choice": choice, "rationale": rationale, "investigator": investigator, "qa": reviewer}, "audit": audit}
            store.finish(run.id, "completed", result)
            return result
    return _left_open(run, package, audit)


def _left_open(run, package: dict, audit: list) -> dict:
    emit_current("result", "Case left open · no decision recorded", status="info")
    result = {**package, "outcome": "open", "audit": audit}
    store.finish(run.id, "completed", result)
    return result
