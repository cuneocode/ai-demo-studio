"""Deterministic typology indicators: money mule, structuring, funnel account.

Rules and thresholds come from fixtures/sar/typologies.json. No model is involved; the
agent cites these results, and the recommendation must agree with them.
"""
from __future__ import annotations

from datetime import datetime, timedelta

CASH_OUT = {"atm", "crypto", "p2p_out"}
OPS = {">=": lambda value, threshold: value >= threshold, "<=": lambda value, threshold: value <= threshold}


def _at(txn: dict) -> datetime:
    return datetime.fromisoformat(txn["at"])


def posted(case: dict) -> list[dict]:
    return sorted((t for t in case.get("transactions", []) if t.get("status", "posted") == "posted"), key=_at)


def credits(case: dict) -> list[dict]:
    return [t for t in posted(case) if t["direction"] == "in"]


def debits(case: dict, *, include_own: bool = True) -> list[dict]:
    return [t for t in posted(case) if t["direction"] == "out" and (include_own or not t.get("own_account"))]


def cash_deposits(case: dict) -> list[dict]:
    return [t for t in credits(case) if t["type"] == "cash_deposit"]


def _share_out_within(case: dict, hours: int) -> float | None:
    inbound = credits(case)
    total = sum(t["amount"] for t in inbound)
    if not total:
        return None
    events = sorted(inbound + debits(case, include_own=False), key=lambda t: (_at(t), t["direction"] != "in"))
    queue: list[list] = []
    within = 0.0
    for txn in events:
        if txn["direction"] == "in":
            queue.append([_at(txn), txn["amount"]])
            continue
        need = txn["amount"]
        while need > 1e-9 and queue:
            take = min(need, queue[0][1])
            if _at(txn) - queue[0][0] <= timedelta(hours=hours):
                within += take
            queue[0][1] -= take
            need -= take
            if queue[0][1] <= 1e-9:
                queue.pop(0)
    return within / total


def _max_distinct_senders(case: dict, days: int) -> int:
    p2p = [t for t in credits(case) if t["type"] == "p2p_in"]
    best = 0
    for first in p2p:
        start = _at(first)
        senders = {t.get("counterparty") for t in p2p if start <= _at(t) < start + timedelta(days=days)}
        best = max(best, len(senders))
    return best


def _max_cash_window(case: dict, days: int) -> float:
    deposits = cash_deposits(case)
    best = 0.0
    for first in deposits:
        start = _at(first)
        best = max(best, sum(t["amount"] for t in deposits if start <= _at(t) < start + timedelta(days=days)))
    return best


def _account_age_days(case: dict) -> int | None:
    opened = min((a.get("opened") for a in case.get("accounts", []) if a.get("opened")), default=None)
    window = case.get("window", {}).get("start")
    if not opened or not window:
        return None
    return (datetime.fromisoformat(window).date() - datetime.fromisoformat(opened).date()).days


def _near_threshold(case: dict, band: list[float]) -> int:
    low, high = band
    return sum(1 for t in cash_deposits(case) if low <= t["amount"] <= high)


AVOIDANCE_WORDS = ("form", "paperwork", "report", "threshold", "10,000", "10000", "ctr")


def metrics(case: dict, catalogue: dict) -> dict[str, float | int | None]:
    inbound_total = sum(t["amount"] for t in credits(case))
    out = debits(case)
    out_total = sum(t["amount"] for t in out)
    kyc = case.get("kyc", {})
    expected = kyc.get("expected_monthly_inflow")
    expected_cash = kyc.get("expected_monthly_cash")
    deposits = cash_deposits(case)
    cash_total = sum(t["amount"] for t in deposits)
    ctr = catalogue.get("ctr_threshold", 10000)
    home = case.get("subject", {}).get("home_state")
    fraud_listed = [t for t in credits(case) if (t.get("funding") or {}).get("fraud_listed")]

    def out_of_area(txn: dict) -> bool:
        country = txn.get("beneficiary_country")
        return bool((country and country != "US") or (txn.get("state") and home and txn["state"] != home))

    def out_of_area_share() -> float | None:
        if not deposits or not out_total:
            return None
        far = 0.0
        for txn in out:
            if txn["type"] not in {"atm", "wire_out"} or not out_of_area(txn):
                continue
            if any(timedelta(0) <= _at(txn) - _at(dep) <= timedelta(hours=72) for dep in deposits):
                far += txn["amount"]
        return far / out_total

    states = {t.get("state") for t in deposits if t.get("state")}
    depositors = {t.get("conducted_by") for t in deposits if t.get("conducted_by")}
    return {
        "share_out_within_48h": _share_out_within(case, 48),
        "distinct_p2p_senders_14d": _max_distinct_senders(case, 14),
        "inflow_vs_expected_monthly": inbound_total / expected if expected else None,
        "fraud_listed_funding_transfers": len(fraud_listed),
        "account_age_days": _account_age_days(case),
        "cash_out_share": (sum(t["amount"] for t in out if t["type"] in CASH_OUT) / out_total) if out_total else None,
        "near_threshold_cash_count": None,  # filled per indicator band
        "max_cash_7d_under_single": (0.0 if any(t["amount"] >= ctr for t in deposits) else _max_cash_window(case, 7)) if deposits else None,
        "distinct_cash_locations": len({t.get("location") for t in deposits}) if deposits else None,
        "ctr_avoidance_notes": sum(1 for note in case.get("teller_notes", []) if any(word in note.get("note", "").lower() for word in AVOIDANCE_WORDS)),
        "cash_vs_expected_monthly": cash_total / expected_cash if expected_cash and deposits else None,
        "cash_deposit_states_and_depositors": min(len(states), len(depositors)) if deposits else None,
        "out_of_area_share_72h": out_of_area_share(),
        "retained_share": ((inbound_total - out_total) / inbound_total) if deposits and inbound_total else None,
    }


def _observed_text(value: float | int | None, unit: str) -> str:
    if value is None:
        return "not applicable"
    if unit == "share":
        return f"{value * 100:.1f}%"
    if unit == "ratio":
        return f"{value:.1f} times"
    if unit == "usd":
        return f"${value:,.2f}"
    if unit == "days":
        return f"{int(value)} days"
    return f"{int(value)}"


def _threshold_text(op: str, threshold: float, unit: str) -> str:
    sign = "≥" if op == ">=" else "≤"
    if unit == "share":
        return f"{sign} {threshold * 100:.0f}%"
    if unit == "ratio":
        return f"{sign} {threshold:g} times"
    if unit == "usd":
        return f"{sign} ${threshold:,.0f}"
    if unit == "days":
        return f"{sign} {threshold:g} days"
    return f"{sign} {threshold:g}"


def evaluate(case: dict, catalogue: dict) -> list[dict]:
    """Every typology with each indicator's observed value, threshold, and whether it fired."""
    values = metrics(case, catalogue)
    results = []
    for typology in catalogue["typologies"]:
        indicators = []
        for rule in typology["indicators"]:
            observed = values.get(rule["metric"])
            if rule["metric"] == "near_threshold_cash_count":
                observed = _near_threshold(case, rule.get("band", [8000, 9999.99])) if cash_deposits(case) else None
            fired = observed is not None and OPS[rule["op"]](observed, rule["threshold"])
            indicators.append({
                "id": rule["id"],
                "label": rule["label"],
                "observed": observed,
                "observed_text": _observed_text(observed, rule["unit"]),
                "threshold_text": _threshold_text(rule["op"], rule["threshold"], rule["unit"]),
                "status": "fired" if fired else "not_applicable" if observed is None else "clear",
            })
        fired_ids = [item["id"] for item in indicators if item["status"] == "fired"]
        rule = typology["match"]
        matched = len(fired_ids) >= rule["min_indicators"] and all(req in fired_ids for req in rule.get("required", []))
        results.append({
            "id": typology["id"],
            "label": typology["label"],
            "reference": typology.get("reference"),
            "matched": matched,
            "fired": len(fired_ids),
            "total": len(indicators),
            "rule": f"{rule['min_indicators']} of {len(indicators)}" + (f", including {' and '.join(rule.get('required', []))}" if rule.get("required") else ""),
            "indicators": indicators,
        })
    return results


def recommendation(results: list[dict]) -> str:
    """The indicator-backed recommendation the agent's own recommendation is checked against."""
    return "file" if any(item["matched"] for item in results) else "no_file"
