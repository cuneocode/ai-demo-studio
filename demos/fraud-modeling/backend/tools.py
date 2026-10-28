"""Deterministic triage tools. The scorer, rules, graph, and playbook do the work; the LLM only plans and explains.

The Deep Agent (agent.py) and the scripted orchestrator (triage.py) call the same functions, so the
timeline shows the same tool events either way. Each tool returns JSON-safe evidence under an id the
summary must cite: score, rules, neighborhood, reasons, similar, playbook#<section>.
"""
import re
import time
from dataclasses import dataclass, field
from pathlib import Path

import controls
from neighborhood import get_neighborhood as build_neighborhood
from reasons import reasons_for
from rules import rules_score as run_rules
from runlog import store
from scorer import FIXTURE, ScoreError, risk_band, risk_label, scorer, suggested_action, threshold
from telemetry import AgentTrace

PLAYBOOKS = Path(__file__).resolve().parent / "data" / "playbook"
PATTERNS = {"cpp": "cpp", "card_testing": "card-testing", "card-testing": "card-testing", "ato": "ato", "general": "general"}
ACTION_TEXT = {
    "contact_customer": "Contact customer", "block_and_reissue": "Block and reissue", "false_positive": "Mark false positive",
    "escalate": "Escalate to investigations", "bulk_reissue": "Proactively reissue exposed cards", "close_case": "Close case",
    "decline": "Decline", "flag_merchant": "Flag merchant for CPP review", "add_note": "Add case note",
}

# Reversible actions the agent may take before the analyst decides; contacting the customer stays with the analyst.
PRE_DECISION = {"flag_merchant": "{merchant} flagged for CPP review (simulated)", "add_note": "Case note added (simulated)"}


@dataclass
class TriageContext:
    run_id: str
    case: dict
    scenario: dict
    trace: AgentTrace
    evidence: dict = field(default_factory=dict)
    proposals: list[dict] = field(default_factory=list)
    tool_calls: int = 0
    dispute: dict | None = None  # {text, withheld, rules}
    done: list[str] = field(default_factory=list)  # reversible actions the agent already took

    def emit(self, kind: str, title: str, **kwargs):
        return store.emit(self.run_id, kind, title, **kwargs)


def _band_title(probability: float) -> str:
    return risk_label(risk_band(probability, threshold()))


async def _timed(ctx: TriageContext, name: str, arguments: dict, work):
    started = time.monotonic()
    ctx.tool_calls += 1
    try:
        result = await work()
    except Exception as exc:
        ctx.trace.tool(name, arguments, {"error": type(exc).__name__}, started, error=True)
        raise
    ctx.trace.tool(name, arguments, result, started)
    return result


async def score_payment(ctx: TriageContext, case: dict | None = None, *, quiet: bool = False) -> dict:
    """Graph model score through the never-dead chain: live sidecar → recorded scores → sample scores."""
    case = case or ctx.case

    async def work():
        try:
            result = await scorer.score(case)
        except ScoreError as exc:
            ctx.emit("tool.result", "No scoring backend returned a score", status="error", body=str(exc), data={"tool": "score_payment"})
            raise
        for skipped in result["fallback"]:
            ctx.emit("model.failover", f"Scorer fallback · {skipped['label']} could not answer", status="flagged",
                     body=skipped["reason"], data={"backend": skipped["backend"]})
        band = risk_band(result["probability"], threshold())
        score = {
            "case_id": case["id"], "probability": round(result["probability"], 4), "threshold": threshold(), "risk_band": band,
            "risk_label": risk_label(band), "suggested_action": suggested_action(band), "backend": result["backend"],
            "backend_label": result["backend_label"], "engine": result["engine"], "latency_ms": result["latency_ms"],
            "recorded_at": result["recorded_at"], "explain": result.get("explain"), "timing_ms": result.get("timing_ms"),
            "device": result.get("device"), "shap": result["shap"], "synthetic": result["backend"] == FIXTURE,
            "scoreable_by_model": case.get("scoreable_by_model", True),
        }
        if not quiet:
            device = f" · {score['device'].upper()}" if score.get("device") else ""
            timing = (score.get("timing_ms") or {}).get("total_ms")
            ctx.emit("tool.result", f"Graph model · {score['probability']:.2f} · {score['risk_label']} · {score['backend_label']}",
                     status="flagged" if band == "high" else "ok",
                     body=None if case.get("scoreable_by_model", True) else "Illustrative case: the graph model cannot see device or address events, so this score is not the deciding signal.",
                     data={"tool": "score_payment", "evidence": "score", "case_id": case["id"], "probability": score["probability"],
                           "risk_band": band, "backend": score["backend"], "label": score["backend_label"],
                           "latency_ms": score["latency_ms"], "model_ms": timing, "device": score.get("device"),
                           "recorded_at": score["recorded_at"], "synthetic": score["synthetic"],
                           "summary": f"{score['risk_label']} ({score['probability']:.2f}){device}"})
        return score

    score = await _timed(ctx, "score_payment", {"case_id": case["id"]}, work)
    if case is ctx.case:
        ctx.evidence["score"] = score
    return score


async def rules_score(ctx: TriageContext) -> dict:
    async def work():
        result = run_rules(ctx.case)
        fired = [item for item in result["fired"] if item["rule"] != "BASE"]
        ctx.emit("tool.result", f"Rules engine · {result['score']}/999 · {result['decision']}",
                 status="flagged" if result["decision"] != "approve" else "ok",
                 body="; ".join(f"{item['text']} ({item['points']:+d})" for item in fired) or "No risk rule fired beyond the baseline.",
                 data={"tool": "rules_score", "evidence": "rules", **result})
        return result

    ctx.evidence["rules"] = await _timed(ctx, "rules_score", {"case_id": ctx.case["id"]}, work)
    return ctx.evidence["rules"]


async def get_neighborhood(ctx: TriageContext) -> dict:
    async def work():
        graph = build_neighborhood(ctx.case)
        share = f" ({graph['fraud_share'] * 100:.1f}% of cards)" if graph.get("fraud_share") else ""
        ctx.emit("tool.result", f"Neighborhood · {graph['cards_seen']:,} cards at {graph['merchant']} · {graph['cards_confirmed_fraud']} confirmed fraud{share}",
                 status="flagged" if (graph.get("fraud_share") or 0) >= 0.03 else "ok",
                 body=f"As of the payment time ({graph['source'].lower()}). Only payments before this one count.",
                 data={"tool": "get_neighborhood", "evidence": "neighborhood", "graph": graph})
        return graph

    graph = await _timed(ctx, "get_neighborhood", {"case_id": ctx.case["id"]}, work)
    ctx.evidence["neighborhood"] = {key: value for key, value in graph.items() if key not in {"nodes", "edges"}}
    return ctx.evidence["neighborhood"]


async def explain(ctx: TriageContext) -> dict:
    async def work():
        score = ctx.evidence.get("score") or await score_payment(ctx, quiet=True)
        reasons = reasons_for(score["shap"], ctx.case)
        units = (score.get("explain") or {}).get("units")
        method = (score.get("explain") or {}).get("method")
        how = "Exact XGBoost TreeSHAP, log-odds" if method == "xgboost_treeshap" else "Sample contributions (illustrative log-odds)"
        ctx.emit("tool.result", f"Reasons · {reasons[0]['text'] if reasons else 'none'}", status="ok",
                 body="\n".join(f"- {item['text']} ({item['value']:+.2f})" for item in reasons[:5]),
                 data={"tool": "explain", "evidence": "reasons", "reasons": reasons, "method": method, "units": units, "how": how})
        return {"reasons": reasons, "method": method, "units": units, "how": how}

    ctx.evidence["reasons"] = await _timed(ctx, "explain", {"case_id": ctx.case["id"]}, work)
    return ctx.evidence["reasons"]


async def similar_cases(ctx: TriageContext) -> dict:
    async def work():
        similar = ctx.case.get("similar") or []
        ctx.emit("tool.result", f"Similar cases · {len(similar)} earlier alert{'s' if len(similar) != 1 else ''}" if similar else "Similar cases · none on file",
                 status="ok", body="\n".join(f"- {item['id']}: {item['summary']} → {item['outcome']}" for item in similar) or None,
                 data={"tool": "similar_cases", "evidence": "similar", "cases": similar})
        return {"cases": similar}

    ctx.evidence["similar"] = await _timed(ctx, "similar_cases", {"case_id": ctx.case["id"]}, work)
    return ctx.evidence["similar"]


def _section(markdown: str, name: str) -> str:
    match = re.search(rf"^## {re.escape(name)}\s*\n(.*?)(?=^## |\Z)", markdown, flags=re.M | re.S | re.I)
    return match.group(1).strip() if match else ""


async def fraud_playbook(ctx: TriageContext, pattern: str | None = None, section: str = "Response") -> dict:
    async def work():
        key = PATTERNS.get((pattern or ctx.case.get("playbook") or "general").lower(), "general")
        text = (PLAYBOOKS / f"{key}.md").read_text()
        title = text.splitlines()[0].lstrip("# ").strip()
        body = _section(text, section) or _section(text, "Response")
        ctx.emit("tool.result", f"Playbook · {title} · {section.lower()}", status="ok", body=body,
                 data={"tool": "fraud_playbook", "evidence": f"playbook#{section.lower()}", "pattern": key})
        return {"pattern": key, "title": title, "section": section.lower(), "text": body}

    result = await _timed(ctx, "fraud_playbook", {"pattern": pattern, "section": section}, work)
    ctx.evidence[f"playbook#{result['section']}"] = result
    return result


def recommend(case: dict, evidence: dict) -> dict:
    """Deterministic suggested disposition from the band, the rules, and the scenario."""
    score = evidence.get("score") or {}
    rules = evidence.get("rules") or {}
    band = score.get("risk_band", "low")
    if case.get("scenario") == "ato" or rules.get("decision") == "decline":
        return {"action": "escalate", "also": ["contact_customer"], "why": "Account changes plus a high-value booking: the rules decline, the graph model is neutral by design."}
    if band == "high":
        return {"action": "block_and_reissue", "also": ["contact_customer"] + (["flag_merchant"] if case.get("scenario") == "cpp" else []),
                "why": "High graph risk from the merchant's network; contact the customer, then block and reissue."}
    if band == "elevated":
        return {"action": "contact_customer", "also": [], "why": "Elevated risk: verify with the customer before the payment settles."}
    return {"action": "false_positive", "also": [], "why": "Low risk on every signal: release the alert."}


async def draft_disposition(ctx: TriageContext) -> dict:
    async def work():
        rec = recommend(ctx.case, ctx.evidence)
        script = (f"Hello, this is the card fraud team calling about a {ctx.case['merchant']} charge of "
                  f"${float(ctx.case['amount']):,.2f} on your card ending {str(ctx.case['account'])[-4:]}. "
                  "Did you make this purchase? We will never ask for your full card number or SSN.")
        ctx.emit("tool.result", f"Draft disposition · {ACTION_TEXT[rec['action']]}", status="ok", body=rec["why"],
                 data={"tool": "draft_disposition", "evidence": "draft", "recommended": rec["action"], "also": rec["also"],
                       "outreach_script": script})
        return {**rec, "outreach_script": script}

    ctx.evidence["draft"] = await _timed(ctx, "draft_disposition", {"case_id": ctx.case["id"]}, work)
    return ctx.evidence["draft"]


async def propose_action(ctx: TriageContext, action: str, scope: str = "this card") -> dict:
    """The agent's request to act. fraud.take_action denies irreversible actions until an analyst approves."""
    async def work():
        verdict = await controls.enforce_action(action, scope=scope)
        text = ACTION_TEXT.get(action, action)
        outcome = ("deny · requires analyst approval" if verdict["decision"] == "deny"
                   else "allow" if action in PRE_DECISION else "allow · reversible, left for the analyst")
        ctx.emit("control", f"{verdict['engine_label']} · fraud.take_action · {text} · {outcome}",
                 status="denied" if verdict["decision"] == "deny" else "allowed", body=verdict.get("detail") or verdict["reason"],
                 data={**verdict, "scope": scope, "requested_by": "fraud triage agent"})
        if action in controls.ACTIONS and action not in PRE_DECISION and not any(item["action"] == action for item in ctx.proposals):
            ctx.proposals.append({"action": action, "scope": scope, "label": text, "policy": verdict["decision"]})
        if verdict["decision"] == "allow" and action in PRE_DECISION and action not in ctx.done:
            ctx.done.append(action)
            ctx.emit("tool.result", PRE_DECISION[action].format(merchant=ctx.case["merchant"]), status="ok",
                     data={"tool": "take_action", "action": action, "simulated": True})
        return {"action": action, "decision": verdict["decision"], "reason": verdict["reason"],
                "next": "Queued for the analyst's decision." if verdict["decision"] == "deny" else "Allowed."}

    return await _timed(ctx, "propose_action", {"action": action, "scope": scope}, work)
