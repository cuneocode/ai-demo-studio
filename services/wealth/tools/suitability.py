"""Advisor suitability rules: the client's profile against the portfolio. Code, not an LLM.

Every finding names its rule, says which Reg BI care-obligation question it raises, and carries the
numbers it rests on as evidence fields (value, unit, display) so a brief's callouts can be verified.
Rules and thresholds follow the plan's illustrative firm policy (docs/plans/fsi-demo-redesign.md,
Appendix A) [confirm with SME]. A single issuer above the 10% guide is medium; above the 20% cap, high.
"""
from __future__ import annotations

import runlog  # noqa: F401  (puts services/common on sys.path)
from claims import field

GUIDE_PCT = 10.0  # single issuer: above the guide is medium
CAP_PCT = 20.0  # single issuer: above the cap is high
IPS_FIELDS = {
    "objective": ("objective", "goal", "growth", "income", "preservation"),
    "risk": ("risk", "tolerance", "conservative", "moderate", "aggressive"),
    "horizon": ("horizon", "years", "retirement", "near-term", "long-term"),
}
CARE = "Reg BI care obligation: a reasonable basis that the recommendation is in this client's best interest given the profile."

# rule → (title, category, the Reg BI or planning question it raises)
RULES = {
    "R-CONC-01": ("Single issuer above policy", "suitability", "Care: concentration risk against the stated risk profile and horizon."),
    "R-RISK-01": ("Equity share below the risk band", "suitability", "Care: the allocation is more conservative than the profile the client chose."),
    "R-RISK-02": ("Equity share above the risk band", "suitability", "Care: the allocation carries more risk than the client's profile allows."),
    "R-AFF-01": ("Affiliate or insider restrictions", "suitability", "Care: any sale must fit Rule 144, blackout windows, and 10b5-1 rules [confirm with SME]."),
    "R-LIQ-01": ("Cash below the liquidity reserve", "suitability", "Care: the client's spending need is not covered by liquid assets."),
    "R-LIQ-02": ("Idle cash above the reserve", "planning", "Planning: cash beyond the reserve has no stated purpose."),
    "R-LIQ-03": ("CD ladder maturing", "planning", "Planning: a maturity needs a decision before it rolls or sits in cash."),
    "R-BEN-01": ("Missing beneficiary", "planning", "Planning: an account would pass without a designation."),
    "R-RMD-01": ("Required distribution due", "planning", "Planning: a required distribution has a deadline [confirm rules with SME]."),
    "R-REV-01": ("Estate documents need review", "planning", "Planning: estate documents are missing or out of date."),
    "R-EDU-01": ("College funding gap", "planning", "Planning: a near-term education goal has no dedicated funding."),
}
RISK_BANDS = {"Conservative": (0, 40), "Moderate": (40, 65), "Growth": (60, 85), "Aggressive": (0, 100)}
RESERVE_MONTHS = 6
IDLE_MONTHS = 12
REVIEW_YEARS = 5
CD_WINDOW_DAYS = 60


def _weight(value) -> float | None:
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if number > 1.5:
        number = number / 100.0
    return number if 0 < number <= 1.5 else None


def _finding(rule: str, severity: str, detail: str, key: str | None = None, fields: dict | None = None, **evidence) -> dict:
    title, category, question = RULES[rule]
    return {"id": f"{rule}:{key}" if key else rule, "rule": rule, "title": title, "severity": severity, "category": category,
            "reg_bi": question, "detail": detail, "fields": fields or {}, "evidence": evidence}


def suitability_findings(holdings: list[dict], client_notes: str | None = None) -> list[dict]:
    """Custom holdings without a household record: concentration and IPS notes only."""
    findings = []
    normalized = []
    for item in holdings:
        ticker = str(item.get("ticker") or "").upper()
        weight = _weight(item.get("weight"))
        if ticker and weight is not None:
            normalized.append({"ticker": ticker, "weight": weight})
    total = sum(item["weight"] for item in normalized)
    if normalized and abs(total - 1.0) > 0.05:
        findings.append({"id": "weights_sum", "rule": None, "title": "Weights do not add up", "severity": "medium", "category": "data",
                         "detail": f"Stated weights sum to {total * 100:.1f}%, not 100%.", "fields": {}, "evidence": {}})
    for item in normalized:
        pct = item["weight"] * 100
        if item["ticker"] == "CASH" or pct <= GUIDE_PCT:
            continue
        above_cap = pct > CAP_PCT
        findings.append(_finding(
            "R-CONC-01", "high" if above_cap else "medium",
            f"{item['ticker']} is {pct:.1f}% of stated weights, above the {CAP_PCT if above_cap else GUIDE_PCT:.0f}% single-issuer "
            + ("cap." if above_cap else "guide."),
            item["ticker"], fields={"weight": field(item["weight"], "fraction", label=f"{item['ticker']} weight"),
                                    "limit": field((CAP_PCT if above_cap else GUIDE_PCT) / 100, "fraction", label="Policy limit")},
            ticker=item["ticker"], weight_pct=round(pct, 1)))
    return _sorted(findings + _ips_findings((client_notes or "").strip().lower()))


def _ips_findings(notes: str) -> list[dict]:
    if not notes:
        return [{"id": "missing_ips", "rule": None, "title": "No investment policy notes", "severity": "medium", "category": "data",
                 "detail": "No IPS notes were provided (objective, risk tolerance, horizon).", "fields": {}, "evidence": {}}]
    missing = [name for name, needles in IPS_FIELDS.items() if not any(token in notes for token in needles)]
    if missing:
        return [{"id": "missing_ips_fields", "rule": None, "title": "Investment policy notes incomplete", "severity": "low", "category": "data",
                 "detail": "IPS notes do not mention " + ", ".join(missing) + ".", "fields": {}, "evidence": {}}]
    return []


def _money(value: float) -> str:
    from claims import money
    return money(value)


def household_findings(household: dict, holdings: list[dict] | None = None) -> list[dict]:
    """Rule-id findings for a synthetic household, from its own record (holdings default to the record's)."""
    known = {str(row.get("ticker", "")).upper(): row for row in household.get("holdings") or []}
    total = float(household.get("total_value") or 0)
    weights: dict[str, float] = {}
    for item in holdings or [{"ticker": t, "weight": row.get("weight_pct")} for t, row in known.items()]:
        weight = _weight(item.get("weight"))
        if weight is not None:
            weights[str(item.get("ticker", "")).upper()] = weight * 100
    findings = []
    ips = household.get("ips") or {}
    limit = float(ips.get("single_issuer_limit_pct") or GUIDE_PCT)

    for ticker, pct in weights.items():
        row = known.get(ticker, {})
        if row.get("vehicle", "stock") != "stock" or row.get("asset_class") == "cash" or ticker == "CASH" or pct <= limit:
            continue
        value = float(row.get("value") or total * pct / 100)
        excess = total * (pct - limit) / 100
        basis = row.get("cost_basis_per_share")
        fields = {"weight": field(pct / 100, "fraction", f"{pct:.0f}%" if float(pct).is_integer() else f"{pct:.1f}%", label=f"{ticker} share of the household"),
                  "limit": field(limit / 100, "fraction", f"{limit:.0f}%", label="Single-issuer policy"),
                  "value": field(value, "usd", label=f"{ticker} position"),
                  "excess_value": field(excess, "usd", label=f"Above the {limit:.0f}% policy")}
        if basis and row.get("price") and row.get("shares"):
            gain = (float(row["price"]) - float(basis)) * float(row["shares"])
            fields["unrealized_gain"] = field(gain, "usd", label="Unrealized gain")
            fields["cost_basis"] = field(float(basis), "usd", label="Cost basis per share")
        findings.append(_finding(
            "R-CONC-01", "high" if pct > CAP_PCT else "medium",
            f"{ticker} is {fields['weight']['display']} of the household ({fields['value']['display']}), above the {limit:.0f}% single-issuer policy"
            + (f" and the {CAP_PCT:.0f}% cap" if pct > CAP_PCT else "") + ".",
            ticker, fields=fields, ticker=ticker, weight_pct=round(pct, 1), limit_pct=limit))

    profile = household.get("risk_profile")
    band = RISK_BANDS.get(profile or "")
    equity = sum(pct for ticker, pct in weights.items() if known.get(ticker, {}).get("asset_class", "equity") == "equity" and ticker != "CASH")
    if band and not band[0] <= equity <= band[1]:
        above = equity > band[1]
        gap = equity - band[1] if above else band[0] - equity
        fields = {"equity_share": field(equity / 100, "fraction", f"{equity:.0f}%" if float(round(equity, 1)).is_integer() else f"{equity:.1f}%", label="Equity share"),
                  "band_max": field(band[1] / 100, "fraction", f"{band[1]}%", label=f"{profile} maximum"),
                  "band_min": field(band[0] / 100, "fraction", f"{band[0]}%", label=f"{profile} minimum"),
                  "gap": field(gap / 100, "fraction", f"{gap:.1f} points", label="Distance outside the band"),
                  "shift_value": field(total * gap / 100, "usd", label="Value to move back inside the band")}
        findings.append(_finding(
            "R-RISK-02" if above else "R-RISK-01", "high" if gap > 10 else "medium",
            f"Equities are {fields['equity_share']['display']} of the household against the {profile} "
            + (f"maximum of {band[1]}%." if band[0] == 0 else f"band of {band[0]}–{band[1]}%."),
            fields=fields, equity_pct=round(equity, 1), band=list(band), profile=profile))

    if household.get("affiliate"):
        issuer = household.get("employer_ticker") or "the employer"
        findings.append(_finding("R-AFF-01", "medium",
                                 f"Affiliate of {issuer}: Rule 144, blackout windows, and 10b5-1 cooling-off periods govern any sale [confirm with SME].",
                                 fields={"issuer": field(issuer, "text", label="Employer")}, ticker=household.get("employer_ticker")))

    need = float(ips.get("annual_spending_need") or 0)
    cash_row = known.get("CASH", {})
    cash = float(cash_row.get("value") or total * weights.get("CASH", 0) / 100)
    cd = float((household.get("cd_ladder") or {}).get("value") or 0)
    liquid = cash
    if need and liquid < need * RESERVE_MONTHS / 12:
        findings.append(_finding("R-LIQ-01", "medium", f"Cash of {_money(liquid)} covers less than {RESERVE_MONTHS} months of the {_money(need)} annual need.",
                                 fields={"cash": field(liquid, "usd", label="Cash"), "annual_need": field(need, "usd", label="Annual spending need")}))
    idle = cash - cd
    if cash_row.get("idle") and need and idle > need * RESERVE_MONTHS / 12:
        reserve = need * RESERVE_MONTHS / 12
        findings.append(_finding(
            "R-LIQ-02", "medium" if idle > need * IDLE_MONTHS / 12 else "low",
            f"{_money(idle)} sits idle in cash; a {RESERVE_MONTHS}-month reserve is {_money(reserve)}." + (f" {cash_row.get('note')}." if cash_row.get("note") else ""),
            fields={"idle_cash": field(idle, "usd", label="Idle cash"), "reserve": field(reserve, "usd", label=f"{RESERVE_MONTHS}-month reserve"),
                    "above_reserve": field(idle - reserve, "usd", label="Above the reserve"),
                    "months": field(round(idle / (need / 12), 1), "count", f"{idle / (need / 12):.0f} months", label="Months of spending")},
            cash=idle))
    if cd:
        matures = str((household.get("cd_ladder") or {}).get("matures") or "")
        findings.append(_finding("R-LIQ-03", "medium", f"A {_money(cd)} CD ladder matures {matures}.",
                                 fields={"cd_value": field(cd, "usd", label="CD ladder"), "matures": field(matures, "date", matures, label="Maturity")}))

    missing = [account for account in household.get("accounts") or [] if not account.get("beneficiary")]
    if missing:
        names = ", ".join(str(account.get("type")) for account in missing)
        value = sum(float(account.get("value") or 0) for account in missing)
        findings.append(_finding("R-BEN-01", "medium", f"No beneficiary on file for {names} ({_money(value)}).",
                                 fields={"accounts": field(len(missing), "count", label="Accounts without a beneficiary"),
                                         "value": field(value, "usd", label="Value without a beneficiary")},
                                 accounts=[a.get("type") for a in missing]))

    if household.get("rmd_due"):
        inherited = next((a for a in household.get("accounts") or [] if "inherited" in str(a.get("type", "")).lower()), None)
        fields = {"account_value": field(float(inherited.get("value") or 0), "usd", label=str(inherited.get("type")))} if inherited else {}
        findings.append(_finding("R-RMD-01", "medium", household.get("rmd_note") or "A required minimum distribution is due this year.", fields=fields))

    estate = household.get("estate")
    as_of_year = int(str(household.get("as_of") or "2026")[:4])
    if not estate:
        findings.append(_finding("R-REV-01", "medium", "No will, trust, or estate documents are on file.",
                                 fields={"documents": field(0, "count", "none", label="Estate documents on file")}))
    else:
        reviewed = estate.get("last_review")
        if not reviewed or as_of_year - int(str(reviewed)[:4]) > REVIEW_YEARS:
            documents = ", ".join(estate.get("documents") or []) or "Estate documents"
            created = next((a.get("created") for a in household.get("accounts") or [] if a.get("created")), None)
            when = f"last reviewed {reviewed}" if reviewed else "never reviewed"
            fields = {"last_review": field(reviewed or "never", "text", label="Last review")}
            if created:
                fields["years_since"] = field(as_of_year - int(created), "years", f"{as_of_year - int(created)} years", label="Years since drafted")
            trust = next((a for a in household.get("accounts") or [] if "trust" in str(a.get("type", "")).lower()), None)
            if trust:
                fields["trust_value"] = field(float(trust.get("value") or 0), "usd", label="Trust assets")
            findings.append(_finding("R-REV-01", "medium", f"{documents}: {when}.", fields=fields))

    for dependent in household.get("dependents") or []:
        if dependent.get("college_start") and not dependent.get("plan_529") and dependent.get("college_cost_per_year"):
            years = int(dependent.get("college_years") or 4)
            cost = float(dependent["college_cost_per_year"])
            findings.append(_finding(
                "R-EDU-01", "medium" if int(dependent["college_start"]) - as_of_year <= 2 else "low",
                f"{dependent.get('relation')} starts college in {dependent['college_start']} at about {_money(cost)} a year; no 529 plan is in place.",
                fields={"annual_cost": field(cost, "usd", label="College cost per year"), "years": field(years, "count", label="Years of college"),
                        "total_cost": field(cost * years, "usd", label="Estimated total"),
                        "start": field(int(dependent["college_start"]), "count", str(dependent["college_start"]), label="Starts")}))
    return _sorted(findings)


def _sorted(findings: list[dict]) -> list[dict]:
    severity = {"high": 0, "medium": 1, "low": 2}
    category = {"suitability": 0, "data": 1, "planning": 2}
    return sorted(findings, key=lambda item: (category.get(item.get("category"), 3), severity.get(item["severity"], 3)))


__all__ = ["CAP_PCT", "CARE", "GUIDE_PCT", "RISK_BANDS", "RULES", "household_findings", "suitability_findings"]
