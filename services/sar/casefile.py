"""Synthetic case files and the evidence ledger every narrative sentence must cite.

Fixtures live at the repo root in fixtures/sar/ (scenarios, cases, typologies, adverse media).
Every fact the agent can see is an evidence item with a stable id; tools return those items,
and citations.py checks the narrative against them.
"""
from __future__ import annotations

import json
import re
from dataclasses import dataclass, field
from datetime import date, datetime, timedelta
from functools import lru_cache
from pathlib import Path

from facts import extract
from typologies import credits, debits, evaluate, posted

ROOT = Path(__file__).resolve().parents[2]
FIXTURES = ROOT / "fixtures" / "sar"
DEADLINE_DAYS = 30

TYPE_LABEL = {
    "p2p_in": "P2P credit", "cash_deposit": "cash deposit", "card_settlement": "card-processor settlement",
    "wire_in": "inbound wire", "ach_in": "ACH credit", "atm": "ATM cash withdrawal", "crypto": "crypto-exchange purchase",
    "p2p_out": "P2P debit", "wire_out": "outbound wire", "ach_out": "ACH debit", "internal_transfer": "transfer to own account",
    "card_purchase": "debit card purchase",
}
TYPE_PLURAL = {
    "p2p_in": "P2P credits", "cash_deposit": "Cash deposits", "card_settlement": "Card-processor settlements",
    "wire_in": "Inbound wires", "ach_in": "ACH credits", "atm": "ATM cash withdrawals", "crypto": "Crypto-exchange purchases",
    "p2p_out": "P2P debits", "wire_out": "Outbound wires", "ach_out": "ACH debits", "internal_transfer": "Transfers to own accounts",
    "card_purchase": "Debit card purchases",
}
TYPE_CODE = {
    "p2p_in": "P2P", "cash_deposit": "CASH", "card_settlement": "CARD", "wire_in": "WIRE", "ach_in": "ACH",
    "atm": "ATM", "crypto": "CRYPTO", "p2p_out": "P2P", "wire_out": "WIRE", "ach_out": "ACH",
    "internal_transfer": "OWN", "card_purchase": "CARD",
}
TYPOLOGY_CODE = {"money_mule": "MM", "structuring": "ST", "funnel_account": "FA"}


def _json(path: Path) -> dict:
    return json.loads(path.read_text(encoding="utf-8"))


@lru_cache(maxsize=1)
def scenarios() -> list[dict]:
    return _json(FIXTURES / "scenarios.json")["scenarios"]


def scenario(scenario_id: str | None) -> dict | None:
    return next((item for item in scenarios() if item["id"] == scenario_id), None)


@lru_cache(maxsize=8)
def load_case(path: str) -> dict:
    resolved = (ROOT / path).resolve()
    if FIXTURES not in resolved.parents:
        raise ValueError("Case files must live in fixtures/sar/.")
    return _json(resolved)


@lru_cache(maxsize=1)
def catalogue() -> dict:
    return _json(FIXTURES / "typologies.json")


@lru_cache(maxsize=1)
def media() -> dict:
    return _json(FIXTURES / "adverse-media.json")


def money(value: float) -> str:
    return f"${value:,.2f}"


def day(value: str) -> str:
    return value[:10]


def deadline(case: dict) -> dict:
    detected = date.fromisoformat(case["alert"]["detected"])
    as_of = date.fromisoformat(case.get("as_of") or date.today().isoformat())
    due = detected + timedelta(days=DEADLINE_DAYS)
    return {"detected": detected.isoformat(), "due": due.isoformat(), "as_of": as_of.isoformat(),
            "day": (as_of - detected).days, "of": DEADLINE_DAYS, "days_left": (due - as_of).days}


def subject_kind(case: dict) -> str:
    return "business" if case.get("subject", {}).get("entity_type") else "individual"


def card(item: dict) -> dict:
    """A scenario card for the studio, without PII beyond the fictional subject name."""
    case = load_case(item["case"])
    in_total = sum(t["amount"] for t in credits(case))
    return {
        "id": item["id"], "kind": item["kind"], "title": item["title"], "summary": item["summary"],
        "expected": item.get("expected"), "case_id": case["id"], "label": case["label"],
        "subject": {"name": case["subject"]["name"], "kind": subject_kind(case)},
        "alert": {"id": case["alert"]["id"], "source": case["alert"]["source"], "priority": case["alert"].get("priority")},
        "deadline": deadline(case), "inbound_total": round(in_total, 2), "synthetic": True,
    }


@dataclass
class Evidence:
    id: str
    kind: str
    title: str
    text: str
    source: str
    untrusted: bool = False
    withheld: bool = False
    flagged_by: list[str] = field(default_factory=list)
    extra_dates: list[str] = field(default_factory=list)

    def line(self) -> str:
        if self.withheld:
            return f"[{self.id}] WITHHELD: {self.title} was flagged ({'; '.join(self.flagged_by) or 'unsafe'}) and is not shown."
        return f"[{self.id}] {self.text}"

    def public(self) -> dict:
        return {"id": self.id, "kind": self.kind, "title": self.title, "text": None if self.withheld else self.text,
                "source": self.source, "untrusted": self.untrusted, "withheld": self.withheld, "flagged_by": self.flagged_by}

    def facts(self, year: int):
        found = extract(self.text, year)
        found.dates.extend(self.extra_dates)
        return found


class Ledger:
    def __init__(self):
        self.items: dict[str, Evidence] = {}

    def add(self, item: Evidence) -> Evidence:
        self.items[item.id] = item
        return item

    def get(self, evidence_id: str) -> Evidence | None:
        return self.items.get(evidence_id)

    def lines(self, ids) -> str:
        return "\n".join(self.items[i].line() for i in ids if i in self.items)

    def public(self) -> list[dict]:
        return [item.public() for item in self.items.values()]


def _sanitize(value, limit: int = 400) -> str:
    text = re.sub(r"[\x00-\x1f\x7f]+", " ", str(value or "")).strip()
    return text[:limit]


def _counterparty_name(case: dict, cp_id: str | None) -> str:
    match = next((c for c in case.get("counterparties", []) if c["id"] == cp_id), None)
    return match["name"] if match else (cp_id or "unknown")


def _txn_text(case: dict, txn: dict, memo: str | None) -> str:
    when = txn["at"][:16].replace("T", " ")
    parts = [f"{when} · {TYPE_LABEL.get(txn['type'], txn['type'])} · {money(txn['amount'])}"]
    if txn.get("status") == "declined":
        parts[0] += " · DECLINED"
    if txn.get("counterparty"):
        parts.append(("from " if txn["direction"] == "in" else "to ") + f"{_counterparty_name(case, txn['counterparty'])} ({txn['counterparty']})")
    if txn.get("location"):
        parts.append(txn["location"])
    if txn.get("merchant"):
        parts.append(txn["merchant"])
    funding = txn.get("funding") or {}
    if funding.get("card_masked"):
        parts.append(f"funding card {funding['card_masked']}" + (f" (on the {funding['fraud_list']})" if funding.get("fraud_listed") else ""))
    if txn.get("decline_reason"):
        parts.append(txn["decline_reason"])
    if txn.get("beneficiary_country"):
        parts.append(f"beneficiary country {txn['beneficiary_country']}")
    if memo:
        parts.append(f'memo "{memo}"')
    return " · ".join(parts)


def _aggregate(evidence_id: str, label: str, rows: list[dict], *, direction: str, case: dict, base: float | None = None) -> Evidence:
    total = sum(t["amount"] for t in rows)
    first, last = day(rows[0]["at"]), day(rows[-1]["at"])
    days = (date.fromisoformat(last) - date.fromisoformat(first)).days + 1
    parties = {t.get("counterparty") for t in rows if t.get("counterparty")}
    places = {t.get("location") for t in rows if t.get("location")}
    text = f"{label}: {len(rows)} totalling {money(total)}, {first} to {last} ({days} day{'s' if days != 1 else ''})"
    if parties:
        text += f", {len(parties)} distinct counterpart{'ies' if len(parties) != 1 else 'y'}"
    if places:
        text += f", {len(places)} distinct location{'s' if len(places) != 1 else ''}"
    if len(rows) > 1:
        text += f", smallest {money(min(t['amount'] for t in rows))}, largest {money(max(t['amount'] for t in rows))}"
    if base:
        text += f"; {total / base * 100:.1f}% of all posted credits"
    return Evidence(evidence_id, "aggregate", label, text + ".", "Computed from core-banking transactions (deterministic)",
                    extra_dates=[first, last])


def _indicator_text(typology: dict, item: dict) -> str:
    verdict = {"fired": "FIRED", "clear": "not fired", "not_applicable": "not applicable"}[item["status"]]
    return f"{item['id']} {item['label']}: observed {item['observed_text']} (threshold {item['threshold_text']}) · {verdict}."


class CaseFile:
    """One run's view of a case: the ledger, the typology results, and the untrusted segments."""

    def __init__(self, scenario_item: dict, handoff: dict | None = None):
        self.scenario = scenario_item
        self.case = load_case(scenario_item["case"])
        self.variant = scenario_item.get("documents") or "clean"
        self.year = int(self.case.get("as_of", "2026")[:4])
        self.handoff = handoff
        self.memos = dict((self.case.get("memo_overrides") or {}).get(self.variant, {}))
        self.ledger = Ledger()
        self.typologies = evaluate(self.case, catalogue())
        self.deadline = deadline(self.case)
        self._build()

    # ------------------------------------------------------------------ build ----
    def _build(self):
        case, add = self.case, self.ledger.add
        alert = case["alert"]
        dl = self.deadline
        add(Evidence("ALERT-1", "alert", f"Alert {alert['id']}",
                     f"Alert {alert['id']} detected {alert['detected']} by {alert['source']}: {alert['summary']} "
                     f"Filing deadline {dl['due']} ({DEADLINE_DAYS} days from detection); case snapshot {dl['as_of']} is day {dl['day']} of {DEADLINE_DAYS}.",
                     "Transaction monitoring (synthetic)"))
        referral = case.get("referral")
        if referral:
            add(Evidence("REF-1", "referral", f"Fraud referral {referral['case_id']}",
                         f"Fraud referral {referral['case_id']} from {referral['from']} on {referral['date']}: {referral['summary']}",
                         "Fraud operations (synthetic)"))
        if self.handoff:
            self._add_handoff(self.handoff)
        subject, kyc = case["subject"], case.get("kyc", {})
        if subject_kind(case) == "business":
            owner = subject.get("beneficial_owner", {})
            who = (f"{subject['name']}, a {subject['entity_type']}, customer since {subject['customer_since']}, "
                   f"located in {subject['address']['city']}, {subject['address']['state']}; beneficial owner {owner.get('name')} ({owner.get('role')}).")
        else:
            who = (f"{subject['name']}, age {subject['age']}, {subject['occupation']}, customer since {subject['customer_since']}, "
                   f"located in {subject['address']['city']}, {subject['address']['state']}.")
        add(Evidence("KYC-1", "kyc", "KYC profile (minimized)",
                     who + f" Risk rating {kyc.get('risk_rating')}. Expected activity: {kyc.get('expected_activity')}. "
                     f"Source of funds: {kyc.get('source_of_funds')}. PEP: {'yes' if kyc.get('pep') else 'no'}. Sanctions screening: {kyc.get('sanctions_screening')}."
                     + (f" {kyc['business']}." if kyc.get("business") else ""),
                     "KYC system (synthetic); SSN, date of birth, and street address withheld from the model"))
        for index, account in enumerate(case.get("accounts", []), 1):
            add(Evidence(f"ACCT-{index}", "account", f"Account {account['number_masked']}",
                         f"{account['type'].replace('_', ' ')} {account['number_masked']} opened {account['opened']}, status {account['status']}"
                         + (f", balance before the review window {money(account['balance_before_window'])}" if account.get("balance_before_window") is not None else "") + ".",
                         "Core banking (synthetic)"))
        for txn in sorted(case.get("transactions", []), key=lambda t: t["at"]):
            memo = self.memos.get(txn["id"], txn.get("memo"))
            item = add(Evidence(txn["id"], "transaction", f"{TYPE_LABEL.get(txn['type'], txn['type'])} {money(txn['amount'])}",
                                _txn_text(case, txn, memo), "Core banking (synthetic)"))
            if memo:
                item.untrusted = True
        self._add_aggregates()
        for cp in case.get("counterparties", []):
            text = f"{cp['name']} ({cp['kind']}); relationship on file: {cp.get('relationship_on_file', 'none')}"
            if cp.get("funding_card_masked"):
                text += f"; funding card {cp['funding_card_masked']}" + (" is on the fraud team's compromised-card list" if cp.get("fraud_listed") else "")
            if cp.get("country"):
                text += f"; country {cp['country']}"
            if cp.get("note"):
                text += f"; {cp['note']}"
            add(Evidence(cp["id"], "counterparty", cp["name"], text + ".", "Counterparty records (synthetic)"))
        for alert_item in case.get("prior_alerts", []):
            add(Evidence(alert_item["id"], "prior_alert", f"Prior alert {alert_item['alert_id']}",
                         f"Prior alert {alert_item['alert_id']} on {alert_item['date']} ({alert_item['rule']}): {alert_item['activity']}. "
                         f"Disposition: {alert_item['disposition']} on {alert_item['closed']}. Rationale: {alert_item['rationale']}",
                         "Case management (synthetic)"))
        for note in case.get("teller_notes", []):
            add(Evidence(note["id"], "teller_note", f"Teller note {note['date']}",
                         f"Teller note {note['date']} at {note['location']}: {note['note']}", "Branch notes (synthetic)"))
        for article in media()["articles"]:
            add(Evidence(article["id"], "adverse_media", article["title"],
                         f"{media()['source']['name']}, {article['date']}: {article['title']}. {article['summary']}",
                         f"{media()['source']['name']} (allowlisted)"))
        for doc in (case.get("documents") or {}).get(self.variant, []):
            for index, segment in enumerate(doc["segments"], 1):
                add(Evidence(f"{doc['id']}.{index}", "document", f"{doc['title']}, segment {index}",
                             f"{doc['title']} (received {doc['received']}, {doc['source']}), segment {index}: {segment}",
                             "Customer-supplied document (untrusted)", untrusted=True))
        for typology in self.typologies:
            code = TYPOLOGY_CODE.get(typology["id"], typology["id"].upper())
            for item in typology["indicators"]:
                self.ledger.add(Evidence(f"IND-{item['id']}", "indicator", f"{item['id']} {item['label']}",
                                         _indicator_text(typology, item), "Typology rules (deterministic)"))
            fired = [i["id"] for i in typology["indicators"] if i["status"] == "fired"]
            self.ledger.add(Evidence(f"TYP-{code}", "typology", typology["label"],
                                     f"{typology['label']} typology: {typology['fired']} of {typology['total']} indicators fired"
                                     + (f" ({', '.join(fired)})" if fired else "")
                                     + f"; a match needs {typology['rule']} · {'MATCHED' if typology['matched'] else 'not matched'}.",
                                     "Typology rules (deterministic)"))

    def _add_aggregates(self):
        case = self.case
        inbound, outbound = credits(case), debits(case)
        base = sum(t["amount"] for t in inbound) or None
        if inbound:
            self.ledger.add(_aggregate("AGG-IN", "Posted credits", inbound, direction="in", case=case))
        if outbound:
            self.ledger.add(_aggregate("AGG-OUT", "Posted debits", outbound, direction="out", case=case, base=base))
        for direction, rows in (("IN", inbound), ("OUT", outbound)):
            kinds = sorted({t["type"] for t in rows})
            for kind in kinds:
                subset = [t for t in rows if t["type"] == kind]
                code = f"AGG-{direction}-{TYPE_CODE.get(kind, kind.upper())}"
                if code in self.ledger.items:
                    code += "2"
                self.ledger.add(_aggregate(code, TYPE_PLURAL.get(kind, kind), subset,
                                           direction=direction.lower(), case=case, base=base if direction == "OUT" else None))
        listed = [t for t in case.get("transactions", []) if (t.get("funding") or {}).get("fraud_listed")]
        if listed:
            posted_listed = [t for t in listed if t.get("status", "posted") == "posted"]
            declined = [t for t in listed if t.get("status") == "declined"]
            cards = {t["funding"]["card_masked"] for t in posted_listed}
            lists = sorted({t["funding"].get("fraud_list", "fraud list") for t in listed})
            text = (f"Fraud-listed funding: {len(posted_listed)} posted credits totalling {money(sum(t['amount'] for t in posted_listed))} "
                    f"were funded by {len(cards)} distinct cards on the {', '.join(lists)}")
            if declined:
                text += "; " + "; ".join(f"{money(t['amount'])} attempted {day(t['at'])} with card {t['funding']['card_masked']} was declined: {t.get('decline_reason', 'declined')}" for t in declined)
            dates = [day(t["at"]) for t in listed]
            self.ledger.add(Evidence("AGG-FRAUD", "aggregate", "Fraud-listed funding", text + ".",
                                     "Fraud operations list joined to core banking (deterministic)", extra_dates=[min(dates), max(dates)]))

    def _add_handoff(self, handoff: dict):
        title = _sanitize(handoff.get("title"), 160) or "Fraud case"
        summary = _sanitize(handoff.get("summary"), 600)
        self.ledger.add(Evidence("REF-2", "referral", f"Studio handoff · {title}",
                                 f"Handoff from the fraud demo ({_sanitize(handoff.get('createdAt'), 40)[:10]}), case {_sanitize(handoff.get('caseId'), 60)}: {title}. {summary}"
                                 + (f" Disposition: {_sanitize(handoff.get('disposition'), 80)}." if handoff.get("disposition") else ""),
                                 "Fraud demo handoff (untrusted until screened)", untrusted=True))
        for index, item in enumerate((handoff.get("evidence") or [])[:12], 3):
            if not isinstance(item, dict):
                continue
            self.ledger.add(Evidence(f"REF-{index}", "referral", f"Handoff evidence · {_sanitize(item.get('label'), 80)}",
                                     f"Fraud handoff evidence: {_sanitize(item.get('label'), 80)}: {_sanitize(item.get('value'), 200)}"
                                     + (f" (source: {_sanitize(item.get('source'), 80)})" if item.get("source") else "") + ".",
                                     "Fraud demo handoff (untrusted until screened)", untrusted=True))
        rows = [t for t in (handoff.get("transactions") or [])[:20] if isinstance(t, dict)]
        if rows:
            listed = "; ".join(f"{_sanitize(t.get('at'), 40)[:10]} {_sanitize(t.get('merchant'), 60)} {money(float(t.get('amount') or 0))} {_sanitize(t.get('channel'), 30)}" for t in rows)
            self.ledger.add(Evidence("REF-TXN", "referral", "Handoff transactions", f"Fraud handoff transactions: {listed}.",
                                     "Fraud demo handoff (untrusted until screened)", untrusted=True))

    # ------------------------------------------------------------------ views ----
    def ids(self, kind: str) -> list[str]:
        return [item.id for item in self.ledger.items.values() if item.kind == kind]

    def segments(self, kind: str) -> list[dict]:
        """Untrusted text to screen: document segments, memos, or handoff fields."""
        if kind == "document":
            return [{"id": i, "text": self.ledger.items[i].text.split(": ", 1)[-1]} for i in self.ids("document")]
        if kind == "memo":
            seen: dict[str, list[str]] = {}
            for txn in self.case.get("transactions", []):
                memo = self.memos.get(txn["id"], txn.get("memo"))
                if memo:
                    seen.setdefault(memo, []).append(txn["id"])
            return [{"id": ids[0] if len(ids) == 1 else f"{ids[0]} (+{len(ids) - 1})", "text": memo, "txns": ids} for memo, ids in seen.items()]
        if kind == "referral":
            return [{"id": item.id, "text": item.text} for item in self.ledger.items.values() if item.kind == "referral" and item.untrusted]
        return []

    def withhold(self, results: list[dict], kind: str):
        for result in results:
            if not result.get("withheld"):
                continue
            targets = result.get("txns") or [result["id"]]
            for target in targets:
                item = self.ledger.get(target)
                if not item:
                    continue
                item.flagged_by = result.get("flagged_by", [])
                if kind == "memo":
                    item.text = re.sub(r' · memo ".*"$', " · memo withheld (flagged as unsafe)", item.text)
                    item.flagged_by = result.get("flagged_by", [])
                else:
                    item.withheld = True

    def typology_summary(self) -> list[dict]:
        return self.typologies

    def first_activity(self) -> str | None:
        rows = posted(self.case)
        return day(rows[0]["at"]) if rows else None


def now_iso() -> str:
    return datetime.now().astimezone().isoformat(timespec="seconds")
