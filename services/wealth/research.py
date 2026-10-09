"""Market event → house-view update: one research run, start to finish.

1. Compliance pre-check: the restricted list, enforced by Agent Control (research.precheck). A restricted
   issuer stops here: no data pull, no model call.
2. Deterministic tools fill the evidence store: market snapshot, earnings, valuation (P/B and ROE for
   banks), returns, macro, signal divergences, house view, the earnings event, the affected book.
3. The allowlisted news feed is screened item by item (AI Defense tool-result inspection plus the local
   screen); a poisoned story is withheld before any model sees it.
4. The research Deep Agent drafts claims; if it fails, one structured call drafts them; with no model at
   all, code quotes the event's own lines. The tier used is part of the result.
5. Code verifies every claim, scans the verified ones for rating, guarantee, and MNPI language, and
   decides house-view impact triggers. Publishing needs a strategist (POST /api/wealth/research/publish).
"""
from __future__ import annotations

import time

from agentkit import record_tool
from cache import get_macro, get_snapshot, is_fresh
from compliance import research_sentence_flags, restricted_check, scan_research
from controls import controls
from evidence import Evidence, add_event, add_house_view, add_households, add_market, evidence_run, is_bank
from fixtures import _halcyon, affected_households, earnings_event, house_view, source_meta
from nim import EgressRefused
from providers.fred import FredError
from providers.yahoo import ProviderError
from research_agent import ResearchContext, fixture_update, run_deep_agent, run_single_call
from runlog import emit_current
from security import DefenseBlocked, DefenseUnavailable
from tools.conflicts import detect_conflicts
from tools.earnings import earnings_from_snapshot
from tools.macro import macro_from_payload
from tools.peers import peers_from_snapshot
from tools.returns import returns_from_snapshot
from untrusted import screen_news

import filings

DISCLAIMER = "Synthetic research for a fictional issuer, for demonstration only. Not investment advice."
REAL_DISCLAIMER = "Demonstration only, from public market data. Not investment advice."
SCENARIOS = {"earnings", "restricted", "poisoned-news", "bank", "ticker"}
MODES = {"deep_agent": "Research Deep Agent", "single_call": "Single drafting call (Deep Agent fallback)",
         "fixture": "Fixture summary · written by code, no model", "none": "No update drafted"}


class ResearchFailed(Exception):
    def __init__(self, status: int, message: str):
        super().__init__(message)
        self.status = status


def news_items(ticker: str, include_attack: bool) -> list[dict]:
    data = _halcyon("news.json")
    if not isinstance(data, dict) or str(data.get("ticker", "")).upper() != ticker.upper():
        return []
    return [item for item in data.get("items") or [] if isinstance(item, dict) and (include_attack or not item.get("poisoned"))]


def _triggers(ev: Evidence) -> list[str]:
    fields = (ev.get("event") or {}).get("fields") or {}
    out = []
    if (fields.get("eps_surprise") or {}).get("value", 0) < 0:
        out.append(f"EPS missed consensus ({fields['eps_surprise']['display']})")
    if (fields.get("guidance_midpoint_change") or {}).get("value", 0) < 0:
        out.append(f"Guidance midpoint cut ({fields['guidance_midpoint_change']['display']})")
    if (fields.get("price_move") or {}).get("value", 0) < -0.10:
        out.append(f"Stock fell {fields['price_move']['display']} on the report")
    return out


def _panels(snapshot: dict, macro_payload: dict | None):
    earnings = earnings_from_snapshot(snapshot)
    peers = peers_from_snapshot(snapshot)
    returns = returns_from_snapshot(snapshot)
    macro = macro_from_payload(macro_payload)
    divergences = detect_conflicts(snapshot, earnings, peers, returns, macro)
    return earnings, peers, returns, macro, divergences


async def run_research(ticker: str, scenario: str, *, refresh: bool, callbacks: list) -> dict:
    started = time.monotonic()
    ev = Evidence()
    evidence_run.set(ev)
    emit_current("run", f"House-view update · {ticker}", status="started",
                 body="Restricted-list pre-check, then market data, the event, and screened news; then the research agent drafts cited claims.")

    # 1 · restricted list, before anything else
    t0 = time.monotonic()
    pre = restricted_check(ticker)
    record_tool("restricted_list_check", {"ticker": ticker},
                f"Restricted list · {ticker} {'is restricted' if pre['status'] == 'denied' else 'clear'}",
                status="flagged" if pre["status"] == "denied" else "ok", started=t0,
                body=f"{pre.get('reason')} since {pre.get('since')}" if pre["status"] == "denied" else None)
    gate = await controls.evaluate("research_precheck", pre["verdicts"])
    pre["controls"] = gate
    if not gate["allowed"]:
        emit_current("result", f"Stopped at the pre-check · {ticker} is on the restricted list", status="denied",
                     body=f"{pre.get('reason')} since {pre.get('since')}. No market data was pulled, no model was called, nothing can be published.")
        return {
            "ticker": ticker, "scenario": scenario, "status": "blocked",
            "company": {"name": pre.get("issuer") or ticker, "ticker": ticker},
            "precheck": pre, "update": {"status": "blocked", "mode": "none", "mode_label": MODES["none"], "claims": []},
            "publish": {"status": "blocked", "reason": "Restricted issuer"}, "evidence": [], "news": [],
            "duration_ms": round((time.monotonic() - started) * 1000), "disclaimer": DISCLAIMER,
        }

    # 2 · deterministic evidence
    t0 = time.monotonic()
    try:
        snapshot, source_kind = get_snapshot(ticker, refresh=refresh)
    except ProviderError as exc:
        record_tool("market_snapshot", {"ticker": ticker}, f"Market data · {exc}", status="error", started=t0)
        raise ResearchFailed(exc.status, str(exc)) from None
    source = {"kind": source_kind, "fetchedAt": snapshot.get("fetchedAt"), **source_meta(snapshot, source_kind)}
    record_tool("market_snapshot", {"ticker": ticker, "refresh": refresh}, f"Market data · {source['label']}", started=t0,
                data={"source_kind": source_kind, "fictional": source.get("fictional")})
    t0 = time.monotonic()
    try:
        macro_payload, macro_kind = get_macro(refresh=refresh)
    except FredError:
        macro_payload, macro_kind = None, None
    earnings, peers, returns, macro, divergences = _panels(snapshot, macro_payload)
    record_tool("fred_macro", {}, f"Macro · {'FRED ' + macro_kind if macro_kind and macro.get('status') == 'ready' else 'not available'}",
                status="ok" if macro.get("status") == "ready" else "info", started=t0,
                body=None if macro.get("status") == "ready" else macro.get("reason"))
    add_market(ev, ticker, snapshot, source, earnings, peers, returns, macro, divergences)
    info = snapshot.get("info") or {}
    bank = is_bank(info)
    valuation = (ev.get("valuation") or {}).get("fields") or {}
    lead = [valuation[key]["display"] for key in (("price_to_book", "roe") if bank else ("trailing_pe", "peer_median_pe")) if key in valuation]
    record_tool("indicators", {"ticker": ticker},
                "Indicators · " + " · ".join(part for part in [
                    f"beat rate {ev.get('earnings')['fields']['beat_rate']['display']}" if "beat_rate" in ev.get("earnings")["fields"] else "",
                    ("P/B, ROE " if bank else "P/E vs peers ") + " / ".join(lead) if lead else "",
                    f"1Y {ev.get('returns')['fields']['1Y.return']['display']} vs SPY {ev.get('returns')['fields']['1Y.spy']['display']}"
                    if "1Y.return" in ev.get("returns")["fields"] and "1Y.spy" in ev.get("returns")["fields"] else "",
                ] if part), body="Bank metrics: price to book and return on equity lead; P/E is secondary." if bank else None)
    record_tool("signal_divergences", {}, f"Signal divergences · {len(divergences) or 'none'}", status="flagged" if divergences else "ok",
                body="; ".join(row["title"] for row in divergences) or None)

    view, event, book = house_view(ticker), earnings_event(ticker), affected_households(ticker)
    if view:
        add_house_view(ev, view)
        record_tool("house_view", {"ticker": ticker}, f"House view · {view.get('rating')} · {view.get('owner')}",
                    body="Owned by the CIO Office. The research agent cannot change the rating.")
    if event:
        add_event(ev, event)
        fields = ev.get("event")["fields"]
        record_tool("earnings_event", {"ticker": ticker}, f"Earnings event · {event.get('period')} · EPS {fields['eps_actual']['display']} vs {fields['eps_estimate']['display']}",
                    body=event.get("guidance_change"))
    if book:
        add_households(ev, book)
        record_tool("affected_households", {"ticker": ticker},
                    f"Affected households · {book['count']} hold it, {book['concentrated']} above {book['threshold_pct']}%, {book['executives']} executives")

    # 3 · screened news
    items = news_items(ticker, include_attack=scenario == "poisoned-news")
    news = await screen_news(ev, items) if items else []

    # 4 · drafting tiers
    ctx = ResearchContext(ticker=ticker, company=snapshot.get("name") or ticker, evidence=ev, news=news,
                          has_filing=bool(filings.sections(ticker)), house_view=view, metric_family="bank" if bank else "earnings")
    draft, mode, failure = None, "none", None
    try:
        draft, mode = await run_deep_agent(ctx, callbacks)
    except (EgressRefused, DefenseBlocked) as exc:
        failure = str(exc)
    except Exception as exc:  # the next tier says why
        failure = _reason(exc)
        emit_current("agent.message", "Research agent did not finish · falling back to one drafting call", status="flagged", body=failure)
        try:
            draft, mode = await run_single_call(ctx, callbacks)
        except Exception as again:
            failure = _reason(again)
    if draft is None and event:
        draft, mode = fixture_update(ctx, event), "fixture"
        emit_current("agent.message", "No model answered · the update quotes the event's own lines (fixture tier)", status="flagged", body=failure)

    # 5 · verification, policy, impact
    update = {"status": "unavailable", "mode": mode, "mode_label": MODES[mode], "claims": [], "reason": failure}
    if draft:
        result = ev.verify(draft.get("claims") or [])
        claims = []
        for row in result["claims"]:
            flags = research_sentence_flags(row.get("text") or "") if row["status"] == "verified" else []
            if flags:
                row = {**row, "status": "policy", "reason": f"Blocked by policy: contains {', '.join(flags)}."}
            claims.append(row)
            title = {"verified": "Claim verified", "policy": "Claim blocked by policy", "unverified": "Claim struck · unverified"}[row["status"]]
            emit_current("claim.verdict", f"{title} · {row.get('text', '')[:120]}", status="ok" if row["status"] == "verified" else "flagged",
                         body=row["reason"], data={"evidence_id": row.get("evidence_id"), "field_path": row.get("field_path"),
                                                   "check": row.get("check"), "section": row.get("section")})
        triggers = _triggers(ev)
        impact = draft.get("house_view_impact") or ("no_house_view" if not view else "consistent")
        if not view:
            impact = "no_house_view"
        elif triggers and impact != "needs_strategist_review":
            impact = "needs_strategist_review"
        verified = [row for row in claims if row["status"] == "verified"]
        scan = scan_research([row.get("text") or "" for row in verified])
        update = {
            "status": "ready" if verified else "unavailable", "mode": mode, "mode_label": MODES[mode],
            "house_view_impact": impact, "impact_source": "code trigger" if triggers and draft.get("house_view_impact") != impact else
            "model" if mode in {"deep_agent", "single_call"} else "code", "triggers": triggers,
            "claims": claims, "counts": {"verified": len(verified), "unverified": sum(1 for r in claims if r["status"] == "unverified"),
                                         "policy": sum(1 for r in claims if r["status"] == "policy"), "total": len(claims)},
            "scan": scan, "reason": failure if mode == "fixture" else None,
            "rating": view.get("rating") if view else None,
        }
        emit_current("claim.verdict", f"Claim verifier · {len(verified)} of {len(claims)} verified" +
                     (f" · {update['counts']['policy']} blocked by policy" if update["counts"]["policy"] else ""),
                     status="ok" if len(verified) == len(claims) else "flagged",
                     body="Each claim was checked against the cited tool output: field, value, unit, and every number in the sentence; quotes must appear verbatim.")

    publishable = update["status"] == "ready" and bool(view)
    if publishable:
        emit_current("hitl.request", "Strategist approval to publish the update", status="info", lane="human",
                     body=f"House view stays {view.get('rating')}: only the CIO Office changes it. Publishing runs the research.publish policies.",
                     data={"request_id": "publish", "policy": "research.publish"})
    emit_current("result", _result_title(update, view), status="ok" if update["status"] == "ready" else "info",
                 body=update.get("reason") if update["status"] != "ready" else None)
    one_year = (returns.get("windows") or {}).get("1Y") or {}
    return {
        "ticker": ticker, "scenario": scenario, "status": "ready" if update["status"] == "ready" else "omitted",
        "company": {"name": snapshot.get("name"), "ticker": ticker, "sector": info.get("sector"), "industry": info.get("industry"),
                    "metric_family": "bank" if bank else "earnings"},
        "source": {**source, "macro": macro_kind, "fresh": is_fresh(snapshot)},
        "precheck": pre,
        "earnings": earnings, "peers": peers, "returns": returns, "macro": macro, "conflicts": divergences,
        "valuation": {path: spec["display"] for path, spec in valuation.items()},
        "context": {"house_view": view, "event": event, "affected_households": book, "restricted": None},
        "news": news, "evidence": ev.public(), "withheld": list(ev.withheld.values()),
        "update": update,
        "publish": {"status": "awaiting_approval" if publishable else "unavailable", "request_id": "publish" if publishable else None,
                    "reason": None if publishable else ("No house view on file: the CIO Office covers this issuer first." if not view
                                                        else "No verified claims to publish.")},
        "one_year": one_year,
        "duration_ms": round((time.monotonic() - started) * 1000),
        "disclaimer": DISCLAIMER if source.get("fictional") else REAL_DISCLAIMER,
    }


def _reason(exc: Exception) -> str:
    text = str(exc)
    if isinstance(exc, (DefenseBlocked, DefenseUnavailable, EgressRefused)):
        return text
    if type(exc).__name__ == "TimeoutError":
        return "The model did not finish in time."
    return f"{type(exc).__name__}: {text[:160]}" if text else type(exc).__name__


def _result_title(update: dict, view: dict | None) -> str:
    if update["status"] != "ready":
        return "No update drafted · the data panels still release"
    counts = update["counts"]
    impact = {"consistent": "consistent with the house view", "needs_strategist_review": "needs strategist review",
              "no_house_view": "no house view on file"}[update["house_view_impact"]]
    return f"Update ready · {counts['verified']} verified claims · {impact}"


__all__ = ["DISCLAIMER", "MODES", "ResearchFailed", "SCENARIOS", "news_items", "run_research"]
