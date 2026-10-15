"""The run's evidence store: every tool output a model may cite, with values pre-formatted by code.

Each item has an id the model cites (`event`, `earnings`, `valuation`, `news:hcyn-n1`, `household`,
`suitability:R-CONC-01`, ...), flat field paths with {value, unit, display}, and optional free text a
qualitative claim may quote. Items that a guardrail withheld (a poisoned news story, an injected CRM
note) are recorded as withheld, so a claim citing them fails verification with that reason.
"""
from __future__ import annotations

import statistics
from contextvars import ContextVar

import runlog  # noqa: F401  (puts services/common on sys.path)
from claims import field, money, pct, quantities, verify_all

BANK_INDUSTRIES = ("bank", "banks", "capital markets", "credit services")


class Evidence:
    def __init__(self) -> None:
        self.items: dict[str, dict] = {}
        self.withheld: dict[str, dict] = {}

    def add(self, item_id: str, title: str, *, source: str, fields: dict | None = None, text: str | None = None,
            kind: str = "data", synthetic: bool = False, **meta) -> dict:
        item = {"id": item_id, "title": title, "source": source, "kind": kind, "synthetic": synthetic,
                "fields": fields or {}, "text": text or "", **meta}
        self.items[item_id] = item
        self.withheld.pop(item_id, None)
        return item

    def withhold(self, item_id: str, title: str, reason: str, **meta) -> None:
        self.items.pop(item_id, None)
        self.withheld[item_id] = {"id": item_id, "title": title, "reason": reason, **meta}

    def get(self, item_id: str) -> dict | None:
        return self.items.get(item_id)

    def compact(self, ids: list[str] | None = None, text_limit: int = 900) -> list[dict]:
        """What a model sees: ids, titles, field displays, and (trimmed) quotable text."""
        rows = []
        for item_id, item in self.items.items():
            if ids is not None and item_id not in ids:
                continue
            row = {"evidence_id": item_id, "title": item["title"], "source": item["source"]}
            if item["fields"]:
                row["fields"] = {path: spec["display"] for path, spec in item["fields"].items()}
            if item["text"]:
                row["text"] = item["text"][:text_limit]
            rows.append(row)
        return rows

    def public(self) -> list[dict]:
        rows = []
        for item in self.items.values():
            rows.append({
                "id": item["id"], "title": item["title"], "source": item["source"], "kind": item["kind"],
                "synthetic": item["synthetic"],
                "fields": {path: {"display": spec["display"], "label": spec.get("label")} for path, spec in item["fields"].items()},
                "text": item["text"][:1600],
                **{key: item[key] for key in ("date", "publisher", "url", "section") if key in item},
            })
        return rows

    def verify(self, claims: list[dict]) -> dict:
        result = verify_all(claims, self.items)
        for row in result["claims"]:
            if row["status"] != "verified" and row.get("evidence_id") in self.withheld:
                row["reason"] = f"Cites {self.withheld[row['evidence_id']]['title']}, which a guardrail withheld: {self.withheld[row['evidence_id']]['reason']}"
        return result


evidence_run: ContextVar[Evidence | None] = ContextVar("wealth_evidence", default=None)


def current() -> Evidence:
    store = evidence_run.get()
    if store is None:
        store = Evidence()
        evidence_run.set(store)
    return store


def _num(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number == number else None


def is_bank(info: dict) -> bool:
    industry = str(info.get("industry") or "").lower()
    return str(info.get("sector") or "").lower() == "financial services" and any(word in industry for word in BANK_INDUSTRIES)


# ------------------------------------------------------------------ research ----

def add_market(ev: Evidence, ticker: str, snapshot: dict, source: dict, earnings: dict, peers: dict, returns: dict,
               macro: dict, divergences: list[dict]) -> None:
    label = source.get("label") or "Market data"
    synthetic = bool(source.get("fictional"))
    info = snapshot.get("info") or {}

    scored = [row for row in earnings.get("quarters") or [] if row.get("surprisePct") is not None]
    streak = 0
    for row in scored:
        if not row.get("beat"):
            break
        streak += 1
    fields = {}
    if earnings.get("beatRate") is not None:
        fields["beat_rate"] = field(earnings["beatRate"], "fraction", label="Beat rate")
        fields["beats"] = field(earnings.get("beats") or 0, "count", label="Quarters beaten")
        fields["observations"] = field(earnings.get("observations") or 0, "count", label="Quarters observed")
        fields["beat_streak"] = field(streak, "count", label="Consecutive beats")
    if earnings.get("latestSurprisePct") is not None:
        fields["latest_surprise"] = field(round(earnings["latestSurprisePct"], 2), "pct", label="Latest EPS surprise")
    revenue = earnings.get("revenue") or {}
    if revenue.get("latestYoy") is not None:
        fields["revenue_latest_yoy"] = field(revenue["latestYoy"], "fraction", label="Revenue growth, latest quarter YoY")
    if revenue.get("priorYoy") is not None:
        fields["revenue_prior_yoy"] = field(revenue["priorYoy"], "fraction", label="Revenue growth, prior quarter YoY")
    history = "; ".join(
        f"{row.get('period')}: EPS {money(row['epsActual'])} vs {money(row['epsEstimate'])} est ({'beat' if row.get('beat') else 'miss'})"
        for row in scored[:8] if row.get("epsActual") is not None and row.get("epsEstimate") is not None)
    ev.add("earnings", f"{ticker} earnings history", source=label, fields=fields, text=history, synthetic=synthetic)

    windows = {}
    for name, window in (returns.get("windows") or {}).items():
        if window.get("ticker") is not None:
            windows[f"{name}.return"] = field(window["ticker"], "fraction", pct(window["ticker"], signed=True), label=f"{name} return")
        if window.get("spy") is not None:
            windows[f"{name}.spy"] = field(window["spy"], "fraction", pct(window["spy"], signed=True), label=f"SPY {name} return")
        if window.get("excess") is not None:
            windows[f"{name}.excess"] = field(window["excess"], "fraction", pct(window["excess"], signed=True), label=f"{name} vs SPY")
    ev.add("returns", f"{ticker} returns vs SPY", source=f"{label} · as of {returns.get('asOf')}", fields=windows, synthetic=synthetic)

    members = peers.get("members") or snapshot.get("peers") or []
    valuation = {}
    bank = is_bank(info)
    if bank:
        pb = _num(info.get("priceToBook"))
        roe = _num(info.get("returnOnEquity"))
        peer_pb = [v for v in (_num(m.get("priceToBook")) for m in snapshot.get("peers") or []) if v]
        peer_roe = [v for v in (_num(m.get("returnOnEquity")) for m in snapshot.get("peers") or []) if v is not None]
        if pb:
            valuation["price_to_book"] = field(pb, "x", f"{pb:.2f}x", label="Price to book")
        if peer_pb:
            valuation["peer_median_pb"] = field(statistics.median(peer_pb), "x", f"{statistics.median(peer_pb):.2f}x", label="Peer median P/B")
        if roe is not None:
            valuation["roe"] = field(roe, "fraction", label="Return on equity")
        if peer_roe:
            valuation["peer_median_roe"] = field(statistics.median(peer_roe), "fraction", label="Peer median ROE")
    if peers.get("subjectPe"):
        valuation["trailing_pe"] = field(peers["subjectPe"], "x", label="Trailing P/E")
    if _num(info.get("forwardPE")):
        valuation["forward_pe"] = field(_num(info.get("forwardPE")), "x", label="Forward P/E")
    if peers.get("medianPe"):
        valuation["peer_median_pe"] = field(peers["medianPe"], "x", label="Peer median trailing P/E")
    if peers.get("pePremium") is not None:
        valuation["pe_vs_peers"] = field(peers["pePremium"], "fraction", pct(peers["pePremium"], signed=True), label="Trailing P/E vs peer median")
    roster = ", ".join(
        f"{m.get('ticker')} {m['trailingPE']:.1f}x" if m.get("trailingPE") else str(m.get("ticker")) for m in members if m.get("ticker"))
    ev.add("valuation", f"{ticker} valuation vs peers" + (" (bank metrics)" if bank else ""), source=label, fields=valuation,
           text=f"Peers: {roster}." if roster else "", synthetic=synthetic, metric_family="bank" if bank else "earnings")

    if macro.get("status") == "ready":
        series = {}
        for key, item in (macro.get("series") or {}).items():
            latest = _num(item.get("latest"))
            if latest is None:
                continue
            unit = "pct" if "%" in str(item.get("unit") or "") or key in {"FEDFUNDS", "DGS10", "UNRATE"} else "count"
            display = f"{latest:.2f}%" if unit == "pct" else f"{latest:,.1f}"
            series[f"{key}.latest"] = field(latest, unit, display, label=f"{item.get('label') or key} ({item.get('asOf')})")
        text = "; ".join(f"{item.get('label') or key} {item.get('direction') or 'flat'} as of {item.get('asOf')}" for key, item in (macro.get("series") or {}).items())
        ev.add("macro", "Macro series (FRED)", source="FRED", fields=series, text=text)

    if divergences:
        ev.add("divergences", "Signal divergences", source="Computed by code", kind="computed",
               text=" ".join(f"{row['title']}: {row['left']}; {row['right']}." for row in divergences))


def add_event(ev: Evidence, event: dict) -> None:
    eps, est = _num(event.get("eps_actual")), _num(event.get("eps_estimate"))
    fields = {}
    if eps is not None:
        fields["eps_actual"] = field(eps, "usd", label="EPS")
    if est is not None:
        fields["eps_estimate"] = field(est, "usd", label="EPS consensus")
    if eps is not None and est:
        fields["eps_surprise"] = field((eps - est) / abs(est), "fraction", label="EPS surprise")
    revenue, revenue_est = _num(event.get("revenue")), _num(event.get("revenue_estimate"))
    if revenue:
        fields["revenue"] = field(revenue, "usd", label="Revenue")
    if revenue_est:
        fields["revenue_estimate"] = field(revenue_est, "usd", label="Revenue consensus")
    if revenue and revenue_est:
        fields["revenue_surprise"] = field(revenue / revenue_est - 1, "fraction", label="Revenue vs consensus")
    for key, label in (("revenue_yoy", "Revenue growth YoY"), ("gross_margin", "Gross margin")):
        if _num(event.get(key)) is not None:
            fields[key] = field(_num(event[key]), "fraction", label=label)
    guidance = [q.value for q in quantities(event.get("guidance_change") or "") if q.dim == "money"]
    if len(guidance) >= 4:
        fields["guidance_low"] = field(guidance[0], "usd", label="New guidance, low")
        fields["guidance_high"] = field(guidance[1], "usd", label="New guidance, high")
        fields["prior_guidance_low"] = field(guidance[2], "usd", label="Prior guidance, low")
        fields["prior_guidance_high"] = field(guidance[3], "usd", label="Prior guidance, high")
        fields["guidance_midpoint_change"] = field((guidance[0] + guidance[1]) / (guidance[2] + guidance[3]) - 1, "fraction",
                                                   label="Guidance midpoint change")
    reaction = event.get("price_reaction") or {}
    before, after = _num(reaction.get("close_before")), _num(reaction.get("close_after"))
    if before and after:
        fields["close_before"] = field(before, "usd", label="Close before the report")
        fields["close_after"] = field(after, "usd", label=f"Close {reaction.get('date_after') or 'after'}")
        fields["price_move"] = field(after / before - 1, "fraction", label="Price move")
    text = " ".join([event.get("guidance_change") or "", *(event.get("what_changed") or [])]).strip()
    ev.add("event", f"{event.get('period')} earnings ({event.get('date')})", source=event.get("source") or "Synthetic",
           fields=fields, text=text, synthetic=bool(event.get("synthetic")), date=event.get("date"))


def add_house_view(ev: Evidence, view: dict) -> None:
    text = " ".join([*(view.get("thesis_points") or []), *(view.get("key_risks") or []), view.get("rating_policy") or ""]).strip()
    ev.add("house_view", f"House view · {view.get('owner')}", source=f"{view.get('owner')} · {view.get('as_of')}", kind="house_view",
           fields={"rating": field(view.get("rating"), "text", label="Rating"),
                   "focus_list": field(bool(view.get("focus_list")), "bool", "on the Focus List" if view.get("focus_list") else "not on the Focus List",
                                       label="Focus List")},
           text=text, synthetic=bool(view.get("synthetic")))


def add_households(ev: Evidence, book: dict) -> None:
    ev.add("households", "Affected households (book of record)", source="Household book · synthetic", kind="book", synthetic=True,
           fields={"households": field(book["households"], "count", label="Households in the book"),
                   "holders": field(book["count"], "count", label="Households holding it"),
                   "concentrated": field(book["concentrated"], "count", label=f"Above {book['threshold_pct']}%"),
                   "executives": field(book["executives"], "count", label="Executives or affiliates")})


def add_news(ev: Evidence, item: dict) -> str:
    item_id = f"news:{item['id']}"
    ev.add(item_id, item.get("headline") or item["id"], source=item.get("publisher") or "news", kind="news",
           text=f"{item.get('headline')}. {item.get('body')}", synthetic=item.get("synthetic", True), date=item.get("date"), publisher=item.get("publisher"), url=item.get("url"))
    return item_id


def add_filing(ev: Evidence, section: dict) -> str:
    item_id = f"filing:{section['slug']}"
    ev.add(item_id, f"10-K FY2025 · {section['title']}", source="Synthetic 10-K (fictional issuer)", kind="filing",
           text=section["text"], synthetic=True, section=section["item"])
    return item_id


__all__ = ["Evidence", "add_event", "add_filing", "add_households", "add_house_view", "add_market", "add_news",
           "current", "evidence_run", "is_bank"]
