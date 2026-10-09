"""Advisor suitability rules. Not an LLM."""
from __future__ import annotations

CONCENTRATION_LIMIT = 0.25
SINGLE_NAME_CAP = 0.20
IPS_FIELDS = {
    "objective": ("objective", "goal", "growth", "income", "preservation"),
    "risk": ("risk", "tolerance", "conservative", "moderate", "aggressive"),
    "horizon": ("horizon", "years", "retirement", "near-term", "long-term"),
}


def _weight(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1.5:
        number = number / 100.0
    return number if 0 < number <= 1.5 else None


def suitability_findings(holdings: list[dict], client_notes: str | None = None) -> list[dict]:
    findings = []
    normalized = []
    for item in holdings:
        ticker = str(item.get("ticker") or "").upper()
        weight = _weight(item.get("weight"))
        if not ticker or weight is None:
            continue
        normalized.append({"ticker": ticker, "weight": weight})

    total = sum(item["weight"] for item in normalized)
    if normalized and abs(total - 1.0) > 0.05:
        findings.append({
            "id": "weights_sum",
            "severity": "medium",
            "detail": f"Stated weights sum to {total * 100:.1f}%, not 100%.",
        })

    for item in normalized:
        if item["weight"] > CONCENTRATION_LIMIT:
            findings.append({
                "id": f"concentration_{item['ticker']}",
                "severity": "high",
                "detail": f"{item['ticker']} is {item['weight'] * 100:.1f}% of stated weights, above the {CONCENTRATION_LIMIT * 100:.0f}% concentration guide.",
            })
        elif item["weight"] > SINGLE_NAME_CAP:
            findings.append({
                "id": f"single_name_{item['ticker']}",
                "severity": "medium",
                "detail": f"{item['ticker']} is {item['weight'] * 100:.1f}% of stated weights, above the {SINGLE_NAME_CAP * 100:.0f}% single-name cap.",
            })

    notes = (client_notes or "").strip().lower()
    return findings + _ips_findings(notes)


def _ips_findings(notes: str) -> list[dict]:
    findings = []
    if not notes:
        findings.append({
            "id": "missing_ips",
            "severity": "medium",
            "detail": "No IPS notes were provided (objective, risk tolerance, horizon).",
        })
    else:
        missing = [name for name, needles in IPS_FIELDS.items() if not any(token in notes for token in needles)]
        if missing:
            findings.append({
                "id": "missing_ips_fields",
                "severity": "low",
                "detail": "IPS notes do not mention " + ", ".join(missing) + ".",
            })
    return findings


# Firm policy for a known household (plan Appendix A, illustrative [SME]). Each finding names its rule.
RULES = {
    "R-CONC-01": "Single issuer above the policy limit",
    "R-RISK-01": "Equity share below the risk band",
    "R-RISK-02": "Equity share above the risk band",
    "R-LIQ-01": "Liquidity outside policy",
    "R-AFF-01": "Affiliate or insider restrictions",
    "R-BEN-01": "Missing beneficiary",
    "R-RMD-01": "Required distribution due",
    "R-REV-01": "Estate documents need review",
}
RISK_BANDS = {"Conservative": (0, 40), "Moderate": (40, 65), "Growth": (60, 85), "Aggressive": (0, 100)}
IDLE_CASH_PCT = 15
REVIEW_YEARS = 5


def _money(value: float) -> str:
    return f"${value / 1_000_000:.2f}M" if value >= 1_000_000 else f"${value / 1000:,.0f}k"


def _finding(rule: str, severity: str, detail: str, key: str | None = None, **evidence) -> dict:
    return {"id": f"{rule}:{key}" if key else rule, "rule": rule, "title": RULES[rule], "severity": severity,
            "detail": detail, "evidence": evidence}


def household_findings(household: dict, holdings: list[dict]) -> list[dict]:
    """Rule-id findings for a synthetic household. `holdings` are the submitted {ticker, weight (fraction)} rows."""
    known = {str(row.get("ticker", "")).upper(): row for row in household.get("holdings") or []}
    total = float(household.get("total_value") or 0)
    weights = {}
    for item in holdings:
        weight = _weight(item.get("weight"))
        if weight is not None:
            weights[str(item.get("ticker", "")).upper()] = weight * 100
    findings = []
    stated = sum(weights.values())
    if weights and abs(stated - 100) > 5:
        findings.append({"id": "weights_sum", "rule": None, "title": "Weights do not add up", "severity": "medium",
                         "detail": f"Stated weights sum to {stated:.1f}%, not 100%.", "evidence": {}})

    limit = float((household.get("ips") or {}).get("single_issuer_limit_pct") or 10)
    for ticker, pct in weights.items():
        row = known.get(ticker, {})
        if row.get("vehicle", "stock") != "stock" or row.get("asset_class") == "cash" or ticker == "CASH" or pct <= limit:
            continue
        value = f" ({_money(total * pct / 100)})" if total else ""
        findings.append(_finding("R-CONC-01", "high" if pct > 20 else "medium",
                                 f"{ticker} is {pct:.1f}% of the household{value}, above the {limit:.0f}% single-issuer policy.",
                                 ticker, ticker=ticker, weight_pct=round(pct, 1), limit_pct=limit))

    profile = household.get("risk_profile")
    band = RISK_BANDS.get(profile or "")
    equity = sum(pct for ticker, pct in weights.items() if known.get(ticker, {}).get("asset_class", "equity") == "equity" and ticker != "CASH")
    if band and not band[0] <= equity <= band[1]:
        above = equity > band[1]
        gap = equity - band[1] if above else band[0] - equity
        findings.append(_finding("R-RISK-02" if above else "R-RISK-01", "high" if gap > 10 else "medium",
                                 f"Equities are {equity:.1f}% of the household against the {profile} "
                                 + (f"maximum of {band[1]}%." if band[0] == 0 else f"band of {band[0]}–{band[1]}%."),
                                 equity_pct=round(equity, 1), band=list(band), profile=profile))

    cash_pct = weights.get("CASH", 0.0)
    need = float((household.get("ips") or {}).get("annual_spending_need") or 0)
    if cash_pct > IDLE_CASH_PCT:
        note = known.get("CASH", {}).get("note")
        findings.append(_finding("R-LIQ-01", "medium",
                                 f"Cash is {cash_pct:.1f}% of the household" + (f" ({_money(total * cash_pct / 100)})" if total else "")
                                 + f", above the {IDLE_CASH_PCT}% idle-cash guide." + (f" {note}." if note else ""),
                                 cash_pct=round(cash_pct, 1)))
    elif need and total and total * cash_pct / 100 < need / 2:
        findings.append(_finding("R-LIQ-01", "medium", f"Cash covers less than six months of the stated {_money(need)} annual need.",
                                 cash_pct=round(cash_pct, 1)))

    if household.get("affiliate"):
        issuer = household.get("employer_ticker") or "the employer"
        findings.append(_finding("R-AFF-01", "medium",
                                 f"Affiliate of {issuer}: Rule 144, blackout windows, and 10b5-1 cooling-off periods govern any sale [confirm with SME].",
                                 ticker=household.get("employer_ticker")))

    missing = [account for account in household.get("accounts") or [] if not account.get("beneficiary")]
    if missing:
        names = ", ".join(f"{account.get('type')} ({account.get('number')})" for account in missing)
        findings.append(_finding("R-BEN-01", "medium", f"No beneficiary on file for {names}.", accounts=[a.get("number") for a in missing]))

    if household.get("rmd_due"):
        findings.append(_finding("R-RMD-01", "medium", household.get("rmd_note") or "A required minimum distribution is due this year."))

    estate = household.get("estate")
    as_of_year = int(str(household.get("as_of") or "2026")[:4])
    if not estate:
        findings.append(_finding("R-REV-01", "medium", "No will, trust, or estate documents are on file."))
    else:
        reviewed = estate.get("last_review")
        if not reviewed or as_of_year - int(str(reviewed)[:4]) > REVIEW_YEARS:
            documents = ", ".join(estate.get("documents") or []) or "Estate documents"
            when = f"last reviewed {reviewed}" if reviewed else "never reviewed"
            findings.append(_finding("R-REV-01", "medium", f"{documents}: {when}."))
    order = {"high": 0, "medium": 1, "low": 2}
    return sorted(findings, key=lambda item: order.get(item["severity"], 3))
