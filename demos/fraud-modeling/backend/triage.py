"""A triage run: score the queue, investigate one alert, wait for the analyst, then act under policy.

POST /api/fraud/runs {scenario, input: {score_queue, mode}} starts it; the studio polls the timeline.
Investigation is the Deep Agent when the Studio model chain has a reachable backend, otherwise a scripted
orchestrator calling the same tools (labelled "Scripted"). Card actions wait for the analyst's decision
(POST /api/fraud/runs/{id}/decision) and pass the fraud.take_action policy before they are recorded.
"""
import asyncio
import os
import time
from datetime import UTC, datetime, timedelta

import agent as triage_agent
import controls
import tools
from cases import label_reveal, load_cases, public_case, scenario_for
from rules import rules_score as run_rules
from model_backend import USE_CASE, ChainUnavailable, call_with_failover, egress_decision, pick
from runlog import store
from scorer import FIXTURE, ScoreError, scorer
from security import SecurityRun, defense, security_run
from telemetry import AgentTrace

DECISION_TIMEOUT = float(os.getenv("FRAUD_DECISION_TIMEOUT", "900"))
DISPOSITIONS = ("contact_customer", "block_and_reissue", "false_positive", "escalate")
PERSONA = "Maya · card-fraud operations analyst · post-authorization queue (synthetic data)"
# A run's AI Defense tally, so case notes saved while it waits for the analyst count toward its security summary.
RUN_SECURITY: dict[str, SecurityRun] = {}


def agent_mode() -> str:
    return (os.getenv("FRAUD_AGENT") or "auto").lower()


def agent_health() -> dict:
    if agent_mode() == "off":
        return {"status": "disabled", "label": "Scripted (FRAUD_AGENT=off)", "served_by": None}
    try:
        selection = pick(USE_CASE)
    except ChainUnavailable as exc:
        return {"status": "unavailable", "label": "Scripted · no model reachable", "served_by": exc.served_by()}
    return {"status": "ready", "label": f"Deep Agent · {selection.backend.label}", "served_by": selection.served_by()}


def _scripted_summary(ctx: tools.TriageContext) -> str:
    ev = ctx.evidence
    score, rules, graph, reasons = ev.get("score") or {}, ev.get("rules") or {}, ev.get("neighborhood") or {}, ev.get("reasons") or {}
    lines = [f"- Rules engine says **{rules.get('decision', '?')}** ({rules.get('score', '?')}/999); the graph model says "
             f"**{score.get('risk_label', '?')}** ({score.get('probability', 0):.2f}). [rules] [score]"]
    if graph.get("cards_seen"):
        lines.append(f"- {graph['merchant']}: {graph['cards_confirmed_fraud']} of {graph['cards_seen']:,} cards seen before this payment "
                     f"had confirmed fraud. [neighborhood]")
    top = (reasons.get("reasons") or [None])[0]
    if top:
        lines.append(f"- Strongest reason: {top['text']} ({top['value']:+.2f}). [reasons]")
    similar = (ev.get("similar") or {}).get("cases") or []
    if similar:
        lines.append(f"- {len(similar)} similar earlier alert{'s' if len(similar) != 1 else ''}; latest outcome: {similar[0]['outcome']}. [similar]")
    draft = ev.get("draft") or {}
    if draft:
        lines.append(f"- Suggested: {tools.ACTION_TEXT.get(draft.get('action'), draft.get('action'))}. {draft.get('why', '')} [draft]")
    return "\n".join(lines)


async def _scripted(ctx: tools.TriageContext) -> None:
    steps = [("score_payment", tools.score_payment), ("rules_score", tools.rules_score), ("get_neighborhood", tools.get_neighborhood),
             ("explain", tools.explain), ("similar_cases", tools.similar_cases), ("fraud_playbook", tools.fraud_playbook),
             ("draft_disposition", tools.draft_disposition)]
    for name, fn in steps:
        if name == "score_payment" and "score" in ctx.evidence:
            continue
        ctx.emit("agent.tool_call", f"Calls {name}", data={"tool": name, "arguments": {"case_id": ctx.case["id"]}, "scripted": True})
        await fn(ctx)
        await asyncio.sleep(0.15)


async def _fill_missing(ctx: tools.TriageContext) -> None:
    """The UI's case file needs every piece; a tool the agent skipped is run by the orchestrator, visibly."""
    needed = [("score", tools.score_payment, "score_payment"), ("rules", tools.rules_score, "rules_score"),
              ("neighborhood", tools.get_neighborhood, "get_neighborhood"), ("reasons", tools.explain, "explain"),
              ("similar", tools.similar_cases, "similar_cases"), ("draft", tools.draft_disposition, "draft_disposition")]
    for key, fn, name in needed:
        if key not in ctx.evidence:
            ctx.emit("agent.tool_call", f"Calls {name} (orchestrator: the agent skipped it)", data={"tool": name, "scripted": True})
            await fn(ctx)


async def _score_queue(ctx: tools.TriageContext, live: bool) -> list[dict]:
    queue = load_cases(live)
    ctx.emit("agent.tool_call", f"Score the alert queue · {len(queue)} payments", data={"tool": "score_payment", "arguments": {"cases": len(queue)}})
    rows = []
    for case in queue:
        try:
            score = await tools.score_payment(ctx, case, quiet=True)
        except ScoreError:
            continue
        rules = run_rules(case)
        row = {"case": public_case(case), "probability": score["probability"], "risk_band": score["risk_band"],
               "risk_label": score["risk_label"], "rules": {"score": rules["score"], "decision": rules["decision"]},
               "suggested_action": tools.ACTION_TEXT[tools.recommend(case, {"score": score, "rules": rules})["action"]],
               "backend": score["backend"], "label": score["backend_label"], "latency_ms": score["latency_ms"],
               "model_ms": (score.get("timing_ms") or {}).get("total_ms"), "device": score.get("device")}
        rows.append(row)
        ctx.emit("tool.result", f"{case['account']} · {case['merchant']} · rules {rules['decision']} · graph {score['probability']:.2f} {score['risk_label'].lower()}",
                 status="flagged" if score["risk_band"] == "high" else "ok",
                 data={"tool": "score_payment", "queue_row": row, "latency_ms": score["latency_ms"], "backend": score["backend"]})
        await asyncio.sleep(0.12)
    return rows


def _transactions(case: dict) -> list[dict]:
    rows = [{"id": f"{case['id']}-auth", "at": case.get("at") or case.get("as_of") or "", "amount": float(case["amount"]),
             "currency": case.get("currency", "USD"), "merchant": case["merchant"], "channel": "card_not_present" if case.get("channel") == "cnp" else "card_present"}]
    network = case.get("network") or {}
    if network.get("small_auths") and case.get("at"):
        start = datetime.fromisoformat(case["at"].replace("Z", "+00:00")) - timedelta(minutes=network.get("small_auth_minutes", 40) + 5)
        for index in range(int(network["small_auths"])):
            rows.insert(index, {"id": f"{case['id']}-test-{index + 1:02d}", "at": (start + timedelta(minutes=index * 4)).isoformat(),
                                "amount": round(1 + (index * 37 % 200) / 100, 2), "currency": "USD",
                                "merchant": network.get("testing_merchant", "Unknown"), "channel": "card_not_present"})
    return rows


def handoff_payload(ctx: tools.TriageContext, decision: dict, served_by) -> dict:
    """The fraud → SAR handoff (app/lifecycle-handoff.ts FraudCaseHandoff), built from this run's evidence."""
    case, ev = ctx.case, ctx.evidence
    score, rules, graph = ev.get("score") or {}, ev.get("rules") or {}, ev.get("neighborhood") or {}
    reasons = (ev.get("reasons") or {}).get("reasons") or []
    evidence = [
        {"label": "Rules engine", "value": f"{rules.get('decision', '?')} · {rules.get('score', '?')}/999", "source": "rules_score"},
        {"label": "Graph model", "value": f"{score.get('risk_label', '?')} · {score.get('probability', 0):.2f} · {score.get('backend_label', '')}", "source": "score_payment"},
    ]
    if graph.get("cards_seen"):
        evidence.append({"label": "Merchant network", "value": f"{graph['cards_confirmed_fraud']} of {graph['cards_seen']:,} cards at {graph['merchant']} had confirmed fraud before this payment", "source": "get_neighborhood"})
    evidence += [{"label": "Reason", "value": f"{item['text']} ({item['value']:+.2f})", "source": "explain · TreeSHAP"} for item in reasons[:3]]
    if case.get("scenario") == "cpp":
        evidence.append({"label": "Illustrative lead", "value": "A deposit account linked to the Orbit Digital Goods ring receives card-funded P2P cash-outs (illustrative; card data cannot score it)", "source": "fraud triage · illustrative"})
    if decision.get("note"):
        evidence.append({"label": "Analyst note", "value": decision["note"][:500], "source": f"analyst · {decision.get('by') or 'Maya'}"})
    return {
        "id": f"handoff-{ctx.run_id}",
        "kind": "fraud-case",
        "createdAt": datetime.now(UTC).isoformat(),
        "customerId": case.get("customer_id") or "unknown",
        "caseId": case["id"],
        "title": f"{case['label']} · {case['account']}",
        "summary": f"Card fraud triage escalated {case['account']} ({case.get('customer', 'synthetic cardholder')}): "
                   f"${float(case['amount']):,.2f} at {case['merchant']}. Rules {rules.get('decision', '?')}, graph model "
                   f"{score.get('risk_label', '?').lower()} ({score.get('probability', 0):.2f}). Synthetic data.",
        "disposition": "escalate",
        "score": score.get("probability"),
        "band": score.get("risk_band"),
        "evidence": evidence,
        "transactions": _transactions(case),
        "runId": ctx.run_id,
        "servedBy": served_by,
    }


async def _act(ctx: tools.TriageContext, action: str, decision: dict) -> dict:
    by = decision.get("by") or "Maya (analyst)"
    verdict = await controls.enforce_action(action, approved_by=by, role="analyst", scope=decision.get("scope"))
    text = tools.ACTION_TEXT.get(action, action)
    ctx.emit("control", f"{verdict['engine_label']} · fraud.take_action · {text} · {'allow · approved by ' + by if verdict['decision'] == 'allow' else 'deny'}",
             status="allowed" if verdict["decision"] == "allow" else "denied", body=verdict.get("detail") or verdict["reason"],
             data={**verdict, "approved_by": by})
    if verdict["decision"] != "allow":
        return {"action": action, "status": "denied"}
    card = ctx.case["account"]
    effect = {
        "block_and_reissue": f"Card {card} blocked; replacement ordered with a new number (simulated)",
        "contact_customer": f"Customer outreach queued for {card} with the drafted script (simulated)",
        "false_positive": "Alert released as a false positive; payment stands (simulated)",
        "escalate": "Case escalated to investigations; SAR referral drafted",
        "bulk_reissue": f"{(ctx.case.get('network') or {}).get('other_cards_to_reissue', 0)} exposed cards queued for proactive reissue (simulated)",
        "flag_merchant": f"{ctx.case['merchant']} flagged for CPP review (simulated)",
    }.get(action, text)
    ctx.emit("tool.result", effect, status="ok", data={"tool": "take_action", "action": action, "simulated": action != "escalate"})
    return {"action": action, "status": "done", "effect": effect, "approved_by": by}


async def start(run, payload: dict) -> dict:
    started = time.monotonic()
    await scorer.resolve()
    live = scorer.backend != FIXTURE
    found = scenario_for(run.scenario or "cpp-orbit", live)
    if not found:
        store.emit(run.id, "run", "Unknown scenario", status="error")
        store.finish(run.id, "failed")
        return {}
    scenario, case = found
    security = SecurityRun()
    RUN_SECURITY[run.id] = security
    token = security_run.set(security)
    trace = AgentTrace(f"Fraud triage · {scenario['title']}", f"{case['label']} · {case['account']}",
                       {"run_id": run.id, "scenario": scenario["id"], "case_id": case["id"]})
    ctx = tools.TriageContext(run_id=run.id, case=case, scenario=scenario, trace=trace)
    run.meta.update({"case_id": case["id"], "scenario": scenario["id"], "synthetic": True})
    try:
        store.emit(run.id, "run", f"Triage · {scenario['title']}", status="started", body=PERSONA,
                   data={"scenario": scenario, "case": public_case(case)})
        queue = await _score_queue(ctx, live) if payload.get("score_queue") else []

        store.emit(run.id, "run", f"Open alert · {case['account']} at {case['merchant']} · ${float(case['amount']):,.2f}",
                   body=case.get("situation"), data={"case": public_case(case), "opened": True})

        if scenario.get("dispute_text"):
            text = scenario["dispute_text"]
            store.emit(run.id, "tool.result", "Cardholder dispute note attached · untrusted input", status="info", body=text,
                       data={"tool": "get_dispute", "untrusted": True})
            verdict = await defense.check([{"role": "user", "content": text}], "dispute_text")
            ctx.dispute = {"text": text, "withheld": verdict["withhold"], "rules": verdict["rules"], "status": verdict["status"]}
            if verdict["withhold"]:
                store.emit(run.id, "agent.thinking", "Dispute note withheld · the agent continues without it",
                           body="The instruction never reaches the model, and no close-case action is proposed.")
            elif verdict["status"] == "off":
                store.emit(run.id, "run", "AI Defense is off · the dispute note goes to the agent uninspected", status="flagged")

        summary, usage, served_by, mode = None, {"llm_calls": 0, "input_tokens": 0, "output_tokens": 0}, None, "scripted"
        selection = None
        if agent_mode() != "off" and payload.get("mode") != "scripted":
            try:
                selection = await asyncio.to_thread(pick, USE_CASE)
            except ChainUnavailable as exc:
                store.emit(run.id, "model.failover", "No model reachable on the Studio chain · scripted investigation", status="flagged",
                           body=str(exc), data={"served_by": exc.served_by()})
        if selection is not None:
            served_by = selection.served_by()
            egress = egress_decision(USE_CASE, selection, defense.configured)
            allowed = egress["allowed"]
            if not allowed:
                store.emit(run.id, "control", f"Studio egress policy · {selection.backend.label} · deny", status="denied",
                           body=egress["reason"], data={"policy": egress["policy"], "served_by": served_by})
            elif selection.backend.external and defense.configured:
                check = await defense.check([{"role": "user", "content": triage_agent.prompt_for(ctx)}], "agent_input",
                                            title=f"agent prompt before it leaves for {selection.backend.label}",
                                            enforce=egress["force_enforce"])
                allowed = not check["withhold"]
            if allowed:
                store.emit(run.id, "agent.thinking", f"Deep Agent investigating on {selection.backend.label}",
                           body="Plans, calls the scoring and evidence tools, and drafts a cited summary. It can propose card actions; it cannot take them.",
                           data={"served_by": served_by})
                try:
                    async def call(backend):
                        return await triage_agent.investigate(ctx, backend, served_by)

                    async def on_failover(first, following, exc):
                        nonlocal served_by
                        served_by = following.served_by()  # fallback=True: the agent's first llm.call emits model.failover

                    result, chosen = await asyncio.wait_for(
                        call_with_failover(USE_CASE, call, first=selection, on_failover=on_failover), timeout=240)
                    served_by = chosen.served_by()
                    summary, usage, mode = result["summary"] or None, result["usage"], "agent"
                except Exception as exc:
                    store.emit(run.id, "run", "Triage agent did not finish · scripted investigation instead", status="error",
                               body=type(exc).__name__, data={"served_by": served_by})
        if mode == "scripted":
            if selection is None:
                store.emit(run.id, "agent.thinking", "Scripted investigation · same tools, no model",
                           body="The summary is a template filled from tool outputs, labelled Scripted.")
            await _scripted(ctx)
        await _fill_missing(ctx)
        recommended = ctx.evidence["draft"]["action"]
        if not any(item["action"] == recommended for item in ctx.proposals):
            ctx.emit("agent.tool_call", "Calls propose_action", data={"tool": "propose_action", "arguments": {"action": recommended}, "scripted": mode == "scripted"})
            await tools.propose_action(ctx, recommended)

        if summary and defense.configured:
            check = await defense.check([{"role": "user", "content": "Summarize the alert for the analyst."},
                                         {"role": "assistant", "content": summary}], "agent_output")
            if check["withhold"]:
                summary = None
        if not summary:
            summary, mode = _scripted_summary(ctx), "scripted" if mode == "scripted" else "agent+template"
        citations = triage_agent.citation_check(summary, ctx.evidence, ctx.case)
        unsupported = [f"“{item['text'][:60]}” states {', '.join(item['unsupported'])}" for item in citations["items"] if item["unsupported"]]
        store.emit(run.id, "claim.verdict", f"Citation check · {citations['cited']}/{citations['total']} points cite evidence that states their figures",
                   status="ok" if citations["cited"] == citations["total"] else "flagged",
                   body="Each point must end on an evidence id this run produced, and its figures must appear in that evidence or the alert. "
                        "Wording is not checked." + (f" Not found in the cited evidence: {'; '.join(unsupported)}." if unsupported else ""),
                   data={"citations": citations})
        title = {"agent": "Analyst summary · AI draft", "agent+template": "Analyst summary · template (the agent's own summary was withheld or empty)"}
        store.emit(run.id, "agent.message", title.get(mode, "Analyst summary · scripted (no model)"),
                   body=summary, data={"served_by": served_by if mode == "agent" else None, "mode": mode})
        agent_trace = await trace.finish(summary)
        investigated_ms = round((time.monotonic() - started) * 1000)

        case_file = {"case": public_case(case), "scenario": scenario, "evidence": ctx.evidence, "summary": summary, "mode": mode,
                     "served_by": served_by if mode != "scripted" else None, "proposals": ctx.proposals, "recommended": recommended,
                     "dispute": ctx.dispute, "analyst_note": scenario.get("analyst_note"), "queue": queue}
        options = [{"id": item, "label": tools.ACTION_TEXT[item], "policy": "requires analyst approval" if item in controls.IRREVERSIBLE else "reversible"}
                   for item in DISPOSITIONS]
        store.emit(run.id, "hitl.request", "Analyst decision required", status="info",
                   body=f"Suggested: {tools.ACTION_TEXT[recommended]}. The agent's proposals are waiting on policy; only the analyst can approve card actions.",
                   data={"request_id": "disposition", "options": options, "recommended": recommended, "case_file": case_file,
                         "usage": {**usage, "tool_calls": ctx.tool_calls}, "security": security.summary(), "agent_trace": agent_trace,
                         "investigated_ms": investigated_ms})
        try:
            decision = await store.wait_decision(run.id, "disposition", timeout=DECISION_TIMEOUT)
        except (asyncio.TimeoutError, asyncio.CancelledError):
            store.emit(run.id, "run", "No analyst decision · the case stays open", status="info")
            store.finish(run.id, "completed", {"case_id": case["id"], "disposition": None, "case_file": case_file})
            return {}

        action = decision.get("decision") if decision.get("decision") in DISPOSITIONS else "contact_customer"
        actions = []
        # Escalating a compromised card still protects the cardholder; the referral concerns the ring, not them.
        protect = action == "escalate" and case.get("scenario") == "cpp"
        if action == "block_and_reissue" or protect:
            actions.append(await _act(ctx, "contact_customer", decision))
        if protect:
            actions.append(await _act(ctx, "block_and_reissue", decision))
        actions.append(await _act(ctx, action, decision))
        if action == "block_and_reissue" and case.get("scenario") == "cpp":
            if "flag_merchant" not in ctx.done:
                actions.append(await _act(ctx, "flag_merchant", decision))
            exposed = (case.get("network") or {}).get("other_cards_to_reissue")
            if exposed:
                ctx.emit("agent.tool_call", "Calls propose_action", data={"tool": "propose_action", "arguments": {"action": "bulk_reissue", "scope": f"{exposed} cards"}})
                await tools.propose_action(ctx, "bulk_reissue", f"{exposed} other cards seen at {case['merchant']}")
                store.emit(run.id, "hitl.request", f"Approve proactive reissue of {exposed} exposed cards?", status="info",
                           body="These customers have not reported anything. Reissuing protects them and costs a new card each.",
                           data={"request_id": "bulk_reissue", "options": [{"id": "approve", "label": f"Reissue {exposed} cards"}, {"id": "skip", "label": "Not now"}]})
                try:
                    bulk = await store.wait_decision(run.id, "bulk_reissue", timeout=DECISION_TIMEOUT)
                    if bulk.get("decision") == "approve":
                        actions.append(await _act(ctx, "bulk_reissue", bulk))
                    else:
                        ctx.emit("run", "Proactive reissue skipped by the analyst", status="info")
                except (asyncio.TimeoutError, asyncio.CancelledError):
                    ctx.emit("run", "No decision on proactive reissue · left for later", status="info")

        handoff = handoff_payload(ctx, decision, served_by if mode != "scripted" else None) if action == "escalate" else None
        if handoff:
            ctx.emit("tool.result", "SAR referral drafted · ready to hand off to the SAR team", status="ok",
                     data={"tool": "draft_sar_referral", "handoff": handoff})
        reveal = label_reveal(case)
        if reveal:
            ctx.emit("run", f"Label reveal · TabFormer marks this payment {reveal}", status="info",
                     body="Shown only after the analyst decided.", data={"tabformer_label": reveal})
        duration = round((time.monotonic() - started) * 1000)
        result = {"case_id": case["id"], "scenario": scenario["id"], "disposition": action, "decided_by": decision.get("by"),
                  "note": decision.get("note"), "actions": actions, "handoff": handoff, "label_reveal": reveal,
                  "summary": summary, "mode": mode, "served_by": served_by if mode != "scripted" else None,
                  "usage": {**usage, "tool_calls": ctx.tool_calls}, "security": security.summary(), "agent_trace": agent_trace,
                  "backend": ctx.evidence["score"]["backend"], "backend_label": ctx.evidence["score"]["backend_label"],
                  "recorded_at": ctx.evidence["score"].get("recorded_at"), "duration_ms": duration, "investigated_ms": investigated_ms}
        store.emit(run.id, "result", f"{tools.ACTION_TEXT[action]} · decided by {decision.get('by') or 'the analyst'}", status="ok",
                   body="Audit trail recorded. Card actions in this demo are simulated.", data=result)
        store.finish(run.id, "completed", result)
        return result
    finally:
        RUN_SECURITY.pop(run.id, None)
        security_run.reset(token)
