"""Advisor meeting prep: one run for one household, and the approvals that follow it.

1. The household record (synthetic) loads; CRM notes go through AI Defense as tool results: PII is masked
   using the spans it returns, and a note carrying an injected instruction is withheld.
2. Market data for each holding, the suitability rules (profile against portfolio, Reg BI framing), and
   the sized next-best actions fill the evidence store, with the published house-view update and the
   employer's insider policy when they apply.
3. The meeting-prep Deep Agent drafts the brief (single structured call if it fails; a code-written brief
   if no model may see client data). Hosted models get client data only with AI Defense in enforce.
4. Code verifies every line, grounds each suitability callout in its rule, and drops actions that are not
   in the catalogue or not suitable. Approvals: the advisor, then a supervisor through advisory.recommendation.
"""
from __future__ import annotations

import re
import time
from datetime import datetime

from advisory_agent import AdvisoryContext, fixture_brief, run_deep_agent, run_single_call, with_service_opening
from agentkit import record_tool
from cache import get_snapshot
from claims import field, money, unsupported_numbers
from compliance import advisory_sentence_flags, scan_advisory
from controls import controls
from evidence import Evidence, evidence_run
from fixtures import _halcyon, source_meta
from nba import addressable, candidates
from nim import EgressRefused
from providers.yahoo import ProviderError
from runlog import emit_current, store
from security import DefenseBlocked, DefenseUnavailable
from tools.returns import returns_from_snapshot
from tools.suitability import household_findings, suitability_findings
from untrusted import screen_notes

DISCLAIMER = "Synthetic client data for demonstration only. Not investment, tax, or legal advice."
MODES = {"deep_agent": "Meeting-prep Deep Agent", "single_call": "Single drafting call (Deep Agent fallback)",
         "fixture": "Brief written by code from the rules · no model", "none": "No brief drafted"}
NEUTRAL = {"agenda", "question"}


def _holding_metrics(row: dict, total: float) -> dict:
    ticker = str(row.get("ticker", "")).upper()
    weight = float(row.get("weight_pct") or 0) / 100
    metric = {"ticker": ticker, "name": row.get("name"), "weight": weight, "asset_class": row.get("asset_class"),
              "value": row.get("value") or total * weight, "account": row.get("account")}
    if ticker == "CASH" or row.get("asset_class") == "cash":
        return {**metric, "source": {"kind": "household", "label": "Household record · synthetic"}, "status": "ready", "note": row.get("note")}
    try:
        snapshot, kind = get_snapshot(ticker)
    except ProviderError:
        return {**metric, "status": "absent", "reason": "Market data unavailable."}
    window = (returns_from_snapshot(snapshot).get("windows") or {}).get("1Y") or {}
    return {**metric, "return_1y": window.get("ticker"), "return_1y_spy": window.get("spy"), "return_1y_vs_spy": window.get("excess"),
            "sector": (snapshot.get("info") or {}).get("sector"), "source": {"kind": kind, **source_meta(snapshot, kind)}, "status": "ready"}


def _add_household(ev: Evidence, record: dict, holdings: list[dict]) -> None:
    ips = record.get("ips") or {}
    fields = {
        "total_value": field(float(record.get("total_value") or 0), "usd", label="Household value"),
        "risk_profile": field(record.get("risk_profile"), "text", label="Risk profile"),
        "horizon_years": field(record.get("horizon_years"), "years", f"{record.get('horizon_years')} years", label="Horizon"),
        "annual_need": field(float(ips.get("annual_spending_need") or 0), "usd", label="Annual spending need"),
        "age": field(record.get("age"), "count", label="Age"),
    }
    for row in holdings:
        fields[f"holdings.{row['ticker']}.weight"] = field(row["weight"], "fraction", label=f"{row['ticker']} weight")
        if row.get("value"):
            fields[f"holdings.{row['ticker']}.value"] = field(float(row["value"]), "usd", label=f"{row['ticker']} value")
    text = (f"{record.get('name')}: {record.get('headline')}. Goals: {', '.join(record.get('goals') or [])}. "
            f"Investment policy: {ips.get('objective')}; risk tolerance {ips.get('risk_tolerance')}; horizon {ips.get('horizon')}.")
    ev.add("household", f"Household · {record.get('name')}", source="Household record · synthetic", fields=fields, text=text, synthetic=True)


def _add_findings(ev: Evidence, findings: list[dict]) -> None:
    for row in findings:
        if row.get("rule"):
            ev.add(f"suitability:{row['rule']}", f"{row['rule']} · {row['title']}", source="Suitability rules (code)", kind="rule",
                   fields={**row["fields"], "reg_bi": field(row["reg_bi"], "text", label="Reg BI question")}, text=row["detail"])


def _add_actions(ev: Evidence, actions: list[dict]) -> None:
    for row in actions:
        text = " ".join([row["title"] + ".", row["summary"], row["fit"], *row["cautions"]])
        ev.add(f"action:{row['id']}", row["title"], source="Next-best-action catalogue (code)", kind="action", fields=row["fields"], text=text)


def _add_research(ev: Evidence, research: dict | None, holdings: list[dict]) -> dict | None:
    """The published house-view update (from the browser), or the recorded one when the client holds the issuer."""
    update, origin = None, None
    if isinstance(research, dict) and isinstance(research.get("update"), dict):
        update, origin = research, "published"
    else:
        tickers = {row["ticker"] for row in holdings}
        recorded = store.recording("research-hcyn")
        result = (recorded or {}).get("result") or {}
        if result.get("ticker") in tickers and isinstance(result.get("update"), dict):
            update, origin = result, "recorded"
    if not update:
        return None
    claims = [row for row in update["update"].get("claims") or [] if row.get("status") == "verified"]
    view = ((update.get("context") or {}).get("house_view") or {})
    fields = {"rating": field(view.get("rating") or update["update"].get("rating") or "", "text", label="House view rating")}
    for row in claims:
        if row.get("field_path") and row.get("display") and row.get("value") is not None and row.get("unit"):
            fields[f"{row['evidence_id']}.{row['field_path']}"] = field(row["value"], row["unit"], row["display"])
    impact = {"consistent": "consistent with the house view", "needs_strategist_review": "flagged for strategist review"}.get(
        update["update"].get("house_view_impact"), "")
    text = " ".join(row.get("text") or "" for row in claims)
    ev.add("research:update", f"House-view update · {update.get('ticker')} · {view.get('rating') or ''} · {impact}".strip(" ·"),
           source=f"Research desk · {'published' if origin == 'published' else 'recorded run'}", kind="research", fields=fields, text=text,
           synthetic=True)
    return {"origin": origin, "ticker": update.get("ticker"), "rating": view.get("rating"), "impact": update["update"].get("house_view_impact"),
            "published_at": update.get("published_at"), "claims": len(claims)}


SERVICE_ACTIONS = {"block_and_reissue": "blocked the card and issued a replacement with a new number",
                   "contact_customer": "contacted the client"}


def _day(value) -> str:
    try:
        when = datetime.fromisoformat(str(value).replace("Z", "+00:00"))
    except ValueError:
        return "recently"
    return f"{when:%b} {when.day}"


def _add_service_events(ev: Evidence, record: dict, events: list | None) -> dict | None:
    """What the client already knows about a resolved card issue: from card fraud triage this session, else the
    household record (sample). Only whitelisted fields are read and the text is written here, so an escalation,
    a SAR, or any investigation detail can never reach the brief (no tipping off)."""
    for item in events or []:
        if not isinstance(item, dict) or item.get("customerId") != record["id"]:
            continue
        last4 = re.sub(r"\D", "", str(item.get("cardLast4") or ""))[-4:]
        actions = [action for action in SERVICE_ACTIONS if action in (item.get("actions") or [])]
        if len(last4) != 4 or "block_and_reissue" not in actions:
            continue
        merchant = re.sub(r"[^A-Za-z0-9 &'.-]", "", str(item.get("merchant") or ""))[:60].strip() or "a merchant"
        try:
            amount = f" ({money(float(item['amount']))})" if item.get("amount") is not None else ""
        except (TypeError, ValueError):
            amount = ""
        origin = "this session" if item.get("provenance") == "live" else "recorded run"
        text = (f"On {_day(item.get('occurredAt'))}, card ending {last4} was used for an unauthorised online purchase at {merchant}{amount}. "
                f"The bank {', and '.join(SERVICE_ACTIONS[action] for action in actions)}.")
        title = f"Card ending {last4} compromised and reissued"
        ev.add(f"service:card-{last4}", title, source=f"Card fraud triage · {origin}", kind="service", text=text, synthetic=True)
        return {"origin": "fraud", "detail": origin, "title": title}
    for item in record.get("service_events") or []:
        if item.get("kind") == "fraud_case" and item.get("summary"):
            ev.add("service:record", "Recent card issue (customer record)", source="Customer record · sample", kind="service",
                   text=item["summary"], synthetic=True)
            return {"origin": "record", "detail": "sample", "title": "Recent card issue"}
    return None


def _add_issuer_policy(ev: Evidence, record: dict) -> bool:
    issuer = _halcyon("issuer.json")
    if not record.get("affiliate") or not isinstance(issuer, dict) or issuer.get("ticker") != record.get("employer_ticker"):
        return False
    policy = issuer.get("insider_trading_policy") or {}
    ev.add("issuer:policy", f"{issuer.get('short_name')} insider-trading policy", source=policy.get("source") or "10-K (synthetic)",
           kind="policy", text=policy.get("summary") or "", synthetic=True)
    return True


async def run_meeting_prep(record: dict, *, research: dict | None, briefing: dict | None, callbacks: list,
                           service_events: list | None = None) -> dict:
    started = time.monotonic()
    ev = Evidence()
    evidence_run.set(ev)
    name = record.get("name")
    emit_current("run", f"Meeting prep · {name}", status="started",
                 body="Household record and screened CRM notes, suitability rules, sized actions, the house-view update; then the brief.")

    t0 = time.monotonic()
    total = float(record.get("total_value") or 0)
    record_tool("get_household", {"id": record["id"]}, f"Household · synthetic · {money(total)} · {record.get('risk_profile')} profile",
                started=t0, body=record.get("headline"))
    notes = await screen_notes(record.get("crm_notes") or [])
    for row in notes:
        if row["status"] != "withheld":
            ev.add(f"crm:{row['index']}", f"CRM note · {row['date']} · {row['author']}", source="CRM (screened)", kind="note",
                   text=row["text"], synthetic=True)
        else:
            ev.withhold(f"crm:{row['index']}", f"CRM note · {row['date']}", row.get("reason") or "an injected instruction")
    record_tool("crm_notes", {"household": record["id"]},
                f"CRM notes · {sum(1 for r in notes if r['status'] != 'withheld')} usable, {sum(1 for r in notes if r['status'] == 'masked')} masked, "
                f"{sum(1 for r in notes if r['status'] == 'withheld')} withheld",
                status="flagged" if any(r["status"] != "kept" for r in notes) else "ok")

    t0 = time.monotonic()
    holdings = [_holding_metrics(row, total) for row in record.get("holdings") or []]
    record_tool("market_snapshot", {"tickers": [h["ticker"] for h in holdings if h["ticker"] != "CASH"]},
                f"Market data · {sum(1 for h in holdings if h['status'] == 'ready')} of {len(holdings)} holdings", started=t0)
    _add_household(ev, record, holdings)

    t0 = time.monotonic()
    findings = household_findings(record)
    _add_findings(ev, findings)
    suitability = [row for row in findings if row.get("category") == "suitability"]
    record_tool("suitability_rules", {"profile": record.get("risk_profile")},
                f"Suitability rules · {len(suitability)} suitability, {len(findings) - len(suitability)} planning", started=t0,
                status="flagged" if suitability else "ok", output=[row["id"] for row in findings])
    for row in findings:
        emit_current("tool.result", f"{row['rule']} · {row['title']} · {row['severity']}", status="flagged" if row["category"] == "suitability" else "info",
                     source="suitability_rules", body=row["detail"], data={"tool": "suitability_rules", "rule": row["rule"],
                                                                            "severity": row["severity"], "category": row["category"]})
    t0 = time.monotonic()
    actions = candidates(record, findings)
    _add_actions(ev, actions)
    excluded = [row for row in actions if not row["suitable"]]
    record_tool("next_best_actions", {"household": record["id"]},
                f"Next-best actions · {len(actions) - len(excluded)} suitable · {money(addressable(actions))} investable in play",
                started=t0, body="; ".join(f"{row['title']}: {row['fit']}" for row in excluded) or None)
    context = {"research": _add_research(ev, research, holdings), "issuer_policy": _add_issuer_policy(ev, record),
               "briefing": bool(briefing), "service_event": _add_service_events(ev, record, service_events)}
    if context["service_event"]:
        r = context["service_event"]
        record_tool("service_events", {"household": record["id"]}, f"Service event · {r['title']} · {r['detail']}",
                    body="Customer-visible facts only, written by code from an allowlist of fields.")
    if context["research"]:
        r = context["research"]
        record_tool("house_view_update", {"ticker": r["ticker"]},
                    f"House-view update · {r['ticker']} {r['rating'] or ''} · {r['origin']}", body=f"{r['claims']} verified claims attached")

    ctx = AdvisoryContext(name=name, profile=record.get("risk_profile") or "", evidence=ev, actions=actions, findings=findings, notes=notes)
    draft, mode, failure, refused = None, "none", None, False
    try:
        draft, mode = await run_deep_agent(ctx, callbacks)
    except EgressRefused as exc:
        failure, refused = str(exc), True
    except (DefenseBlocked, DefenseUnavailable) as exc:
        failure = str(exc)
    except Exception as exc:
        failure = f"{type(exc).__name__}: {str(exc)[:160]}" if str(exc) else type(exc).__name__
        emit_current("agent.message", "Meeting-prep agent did not finish · falling back to one drafting call", status="flagged", body=failure)
        try:
            draft, mode = await run_single_call(ctx, callbacks)
        except Exception as again:
            failure = f"{type(again).__name__}: {str(again)[:160]}" if str(again) else type(again).__name__
    if draft is None:
        draft, mode = fixture_brief(ctx), "fixture"
        emit_current("agent.message", "No model drafted the brief · code wrote it from the rules and actions", status="flagged",
                     body=("Client data stayed in the bank: " + failure) if refused else failure)

    brief = _ground(ev, with_service_opening(ctx, draft), actions, findings)
    included = [a for a in actions if a["id"] in brief["action_ids"]]
    scan = scan_advisory([row["text"] for row in brief["lines"] if row["status"] in {"verified", "agenda", "question"}], included,
                         record.get("risk_profile"))
    emit_current("claim.verdict", f"Brief verifier · {brief['counts']['verified']} of {brief['counts']['claims']} statements verified"
                 + (f" · {brief['counts']['policy']} blocked by policy" if brief["counts"]["policy"] else ""),
                 status="ok" if brief["counts"]["verified"] == brief["counts"]["claims"] else "flagged",
                 body="Statements, callouts, and the rationale are checked against the cited record; agenda lines and questions must not invent numbers.")
    emit_current("hitl.request", "Advisor review, then supervisor approval", status="info", lane="human",
                 body="Nothing is sent or executed until a supervisor approves; approval runs the advisory.recommendation policies.",
                 data={"request_id": "advisor", "policy": "advisory.recommendation"})
    emit_current("result", f"Meeting brief ready · {len(included)} actions · {brief['counts']['verified']} verified statements",
                 status="ok" if brief["lines"] else "info")
    return {
        "household": {"id": record["id"], "name": name, "synthetic": True, "risk_profile": record.get("risk_profile"),
                      "total_value": total, "headline": record.get("headline"), "age": record.get("age"),
                      "horizon_years": record.get("horizon_years"), "goals": record.get("goals") or [],
                      "affiliate": bool(record.get("affiliate")), "employer_ticker": record.get("employer_ticker")},
        "holdings": holdings, "notes": notes, "suitability": findings, "actions": actions,
        "addressable": addressable(actions), "addressable_display": money(addressable(actions)),
        "context": context, "evidence": ev.public(), "withheld": list(ev.withheld.values()),
        "brief": {**brief, "status": "ready" if brief["lines"] else "unavailable", "mode": mode, "mode_label": MODES[mode],
                  "reason": failure if mode == "fixture" else None, "refused": refused},
        "compliance": scan,
        "approval": {"status": "awaiting_advisor", "request_id": "advisor"},
        "duration_ms": round((time.monotonic() - started) * 1000), "disclaimer": DISCLAIMER,
    }


def _ground(ev: Evidence, draft: dict, actions: list[dict], findings: list[dict]) -> dict:
    lines_in = [dict(row) for row in draft.get("lines") or [] if isinstance(row, dict) and row.get("text")]
    rules = {row["rule"] for row in findings if row.get("rule")}
    checked = ev.verify([row for row in lines_in if row.get("section") not in NEUTRAL])["claims"]
    lines = []
    for row in checked:
        if row.get("section") == "callout":
            rule = str(row.get("evidence_id") or "").removeprefix("suitability:")
            if rule not in rules:
                row = {**row, "status": "unverified", "reason": f"Callout cites {rule or 'no rule'}, which is not a finding for this household."}
        flags = advisory_sentence_flags(row.get("text") or "")
        if flags:
            row = {**row, "status": "policy", "reason": f"Blocked by policy: contains {', '.join(flags)}."}
        lines.append(row)
    for row in lines_in:
        if row.get("section") not in NEUTRAL:
            continue
        cited = [ev.items[eid] for eid in [row.get("evidence_id"), *(row.get("also") or [])] if eid in ev.items]
        flags = advisory_sentence_flags(row.get("text") or "")
        loose = unsupported_numbers(row.get("text") or "", cited)
        if flags:
            lines.append({**row, "status": "policy", "reason": f"Blocked by policy: contains {', '.join(flags)}."})
        elif loose:
            lines.append({**row, "status": "unverified", "reason": f"States {loose[0]}, which is not in the cited record."})
        else:
            lines.append({**row, "status": row["section"], "reason": "Agenda line, not a factual claim." if row["section"] == "agenda"
                          else "A question for the client, not a claim."})
    for row in lines:
        if row["status"] in {"unverified", "policy"}:
            emit_current("claim.verdict", f"{'Blocked by policy' if row['status'] == 'policy' else 'Struck'} · {row['text'][:110]}",
                         status="flagged", body=row["reason"], data={"section": row.get("section"), "evidence_id": row.get("evidence_id")})
    by_id = {a["id"]: a for a in actions}
    ranked, dropped = [], []
    for item in sorted(draft.get("ranked_actions") or [], key=lambda r: r.get("rank") or 99):
        action = by_id.get(str(item.get("action_id")))
        if not action:
            dropped.append({"action_id": item.get("action_id"), "reason": "Not in the action catalogue."})
        elif not action["suitable"]:
            dropped.append({"action_id": action["id"], "reason": action["fit"]})
        elif action["id"] not in ranked:
            ranked.append(action["id"])
    for row in dropped:
        emit_current("claim.verdict", f"Action dropped · {row['action_id']}", status="flagged", body=row["reason"])
    claims = [row for row in lines if row["status"] in {"verified", "unverified", "policy"}]
    return {"lines": lines, "action_ids": ranked[:5], "dropped_actions": dropped,
            "counts": {"claims": len(claims), "verified": sum(1 for r in claims if r["status"] == "verified"),
                       "unverified": sum(1 for r in claims if r["status"] == "unverified"),
                       "policy": sum(1 for r in claims if r["status"] == "policy")}}


async def custom_findings(holdings: list[dict], notes: str | None) -> list[dict]:
    return suitability_findings(holdings, notes)


async def supervise(result: dict, action_ids: list[str], decision: str) -> dict:
    """Supervisor approval: the advisory.recommendation policies over what would be recorded."""
    actions = {a["id"]: a for a in result.get("actions") or []}
    chosen = [actions[a] for a in action_ids if a in actions]
    lines = [row for row in (result.get("brief") or {}).get("lines") or [] if row.get("status") in {"verified", "agenda", "question"}]
    scan = scan_advisory([row.get("text") or "" for row in lines], chosen, (result.get("household") or {}).get("risk_profile"))
    verdicts = {**scan["verdicts"], "supervisor_approved": decision == "approve"}
    gate = await controls.evaluate("advisory_send", verdicts)
    return {"verdicts": verdicts, "controls": gate, "findings": scan["findings"], "actions": [a["id"] for a in chosen]}


__all__ = ["DISCLAIMER", "MODES", "custom_findings", "run_meeting_prep", "supervise"]
