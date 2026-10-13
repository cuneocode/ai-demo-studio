"""Next-best actions: a fixed catalogue, sized in dollars from the household record. Code, not an LLM.

Each action is eligible only when a finding supports it, carries its dollar basis as evidence fields, and
gets a Reg BI fit check against the profile (horizon, liquidity, insider policy). An action that does
not fit stays visible as "considered, not suitable" with the reason; the agent may rank only the
suitable ones, and the advisory.recommendation policy denies a brief that includes an unsuitable one.
Sizing conventions are illustrative [confirm with SME].
"""
from __future__ import annotations

import runlog  # noqa: F401
from claims import field, money

EXCHANGE_FUND_LOCKUP_YEARS = 7
GIFT_EXCLUSION_2026 = 19_000  # per donor, per beneficiary [confirm with SME]
DAF_ILLUSTRATIVE = 250_000


def _rules(findings: list[dict]) -> dict[str, dict]:
    return {row["rule"]: row for row in findings if row.get("rule")}


def _action(action_id: str, kind: str, title: str, summary: str, *, dollars: float, dollars_label: str, rules: list[str],
            suitable: bool = True, fit: str = "", cautions: list[str] | None = None, fields: dict | None = None) -> dict:
    return {
        "id": action_id, "type": kind, "title": title, "summary": summary, "rules": rules,
        "dollars": dollars, "dollars_display": money(dollars), "dollars_label": dollars_label,
        "suitable": suitable, "fit": fit, "cautions": cautions or [],
        "fields": {"dollars": field(dollars, "usd", label=dollars_label), **(fields or {})},
    }


def candidates(household: dict, findings: list[dict]) -> list[dict]:
    rules = _rules(findings)
    horizon = float(household.get("horizon_years") or 0)
    profile = household.get("risk_profile") or ""
    out: list[dict] = []

    concentration = rules.get("R-CONC-01")
    if concentration:
        f = concentration["fields"]
        ticker = concentration["evidence"].get("ticker")
        excess = f["excess_value"]["value"]
        if rules.get("R-AFF-01"):
            out.append(_action(
                "NBA-10B51", "10b5-1-plan", f"10b5-1 sale plan to reduce {ticker} toward policy",
                f"Sell down {f['excess_value']['display']} of the {f['value']['display']} position on a pre-set schedule, "
                f"bringing {ticker} from {f['weight']['display']} toward the {f['limit']['display']} policy.",
                dollars=excess, dollars_label=f"{ticker} above the {f['limit']['display']} policy", rules=["R-CONC-01", "R-AFF-01"],
                fit="Fits a Moderate profile and the 4-year runway: it cuts single-issuer risk on a schedule set in an open window."
                if profile == "Moderate" else "Reduces single-issuer risk on a pre-set schedule.",
                cautions=["Adopt only in an open window; a cooling-off period applies before the first sale [confirm with SME].",
                          "Rule 144 volume limits apply to an affiliate."],
                fields={"position": f["value"], "weight": f["weight"], "limit": f["limit"]}))
            out.append(_action(
                "NBA-COLLAR", "collar", f"Collar on part of the {ticker} position",
                f"Protect part of the {f['value']['display']} position against a drop while the sale plan runs.",
                dollars=excess, dollars_label="Position that could be hedged", rules=["R-CONC-01", "R-AFF-01"],
                fit="Hedging needs General Counsel pre-clearance under the issuer's insider policy.",
                cautions=["The insider policy requires General Counsel pre-clearance for a collar.", "Listed options and short sales are prohibited."]))
        fits = horizon >= EXCHANGE_FUND_LOCKUP_YEARS
        out.append(_action(
            "NBA-EXCHANGE", "exchange-fund", f"Exchange fund for low-basis {ticker} shares",
            "Swap concentrated shares into a diversified fund without an immediate taxable sale.",
            dollars=excess, dollars_label="Shares that could be contributed", rules=["R-CONC-01"], suitable=fits,
            fit=(f"Not suitable: a {EXCHANGE_FUND_LOCKUP_YEARS}-year lock-up exceeds the {horizon:.0f}-year planning horizon."
                 if not fits else "The lock-up fits the horizon."),
            cautions=[f"Typical {EXCHANGE_FUND_LOCKUP_YEARS}-year lock-up; accredited investors only."]))
        gain = f.get("unrealized_gain")
        if gain:
            price_gain = gain["value"] / f["value"]["value"] if f["value"]["value"] else 0
            out.append(_action(
                "NBA-DAF", "daf-gift", f"Gift appreciated {ticker} shares to a donor-advised fund",
                f"Give {money(DAF_ILLUSTRATIVE)} of low-basis shares instead of cash, avoiding about {money(DAF_ILLUSTRATIVE * price_gain)} of realized gain.",
                dollars=DAF_ILLUSTRATIVE, dollars_label="Illustrative gift", rules=["R-CONC-01"],
                fit="Fits only if the client has charitable goals; ask before proposing.",
                cautions=["Ask about charitable intent first; nothing is on file.", "Gifts by an affiliate still follow the insider policy."],
                fields={"gain_avoided": field(DAF_ILLUSTRATIVE * price_gain, "usd", label="Gain not realized"),
                        "unrealized_gain": gain}))

    idle = rules.get("R-LIQ-02")
    if idle:
        f = idle["fields"]
        goals = ", ".join(household.get("goals") or [])
        out.append(_action(
            "NBA-LADDER", "treasury-ladder", "Treasury ladder for idle cash",
            f"Put {f['above_reserve']['display']} above the {f['reserve']['display']} reserve into Treasuries that mature with the plan's dates ({goals}).",
            dollars=f["above_reserve"]["value"], dollars_label="Cash above the reserve", rules=["R-LIQ-02"],
            fit="Low risk and liquid at each maturity; fits every profile.", fields={"idle_cash": f["idle_cash"], "reserve": f["reserve"]}))

    education = rules.get("R-EDU-01")
    if education:
        f = education["fields"]
        superfund = GIFT_EXCLUSION_2026 * 5
        out.append(_action(
            "NBA-529", "529-plan", "Open and fund a 529 plan",
            f"Front-load up to {money(superfund)} with a five-year gift election toward about {f['total_cost']['display']} of college costs.",
            dollars=superfund, dollars_label="Five-year gift election, one donor", rules=["R-EDU-01"],
            fit="Tax-advantaged for a goal that starts soon; invest conservatively given the short runway.",
            cautions=["Gift-tax election limits apply [confirm with SME]."], fields={"total_cost": f["total_cost"]}))

    estate = rules.get("R-REV-01")
    if estate:
        f = estate["fields"]
        value = f.get("trust_value", {}).get("value") or float(household.get("total_value") or 0)
        out.append(_action(
            "NBA-ESTATE", "estate-review", "Estate document review with an attorney" if f.get("last_review") else "Draft a will and estate plan",
            estate["detail"] + " Refer to an estate attorney.", dollars=value,
            dollars_label="Trust assets" if f.get("trust_value") else "Assets with no estate plan", rules=["R-REV-01"],
            fit="A referral, not an investment recommendation."))

    beneficiary = rules.get("R-BEN-01")
    if beneficiary:
        f = beneficiary["fields"]
        out.append(_action("NBA-BENEFICIARY", "beneficiary", "Complete missing beneficiary designations", beneficiary["detail"],
                           dollars=f["value"]["value"], dollars_label="Value without a beneficiary", rules=["R-BEN-01"],
                           fit="Administrative; fits every profile."))

    rmd = rules.get("R-RMD-01")
    if rmd:
        value = (rmd["fields"].get("account_value") or {}).get("value") or 0
        out.append(_action("NBA-RMD", "rmd", "Schedule the required distribution", rmd["detail"], dollars=value,
                           dollars_label="Account subject to the distribution", rules=["R-RMD-01"], fit="Deadline-driven; fits every profile."))

    cd = rules.get("R-LIQ-03")
    if cd:
        f = cd["fields"]
        out.append(_action("NBA-CD", "cd-maturity", "Decide on the maturing CD ladder",
                           f"Choose whether to roll the {f['cd_value']['display']} ladder maturing {f['matures']['display']} or use it for income.",
                           dollars=f["cd_value"]["value"], dollars_label="CD ladder maturing", rules=["R-LIQ-03"],
                           fit="Income and preservation fit a Conservative profile."))

    risk = rules.get("R-RISK-02") or rules.get("R-RISK-01")
    if risk:
        f = risk["fields"]
        above = risk["rule"] == "R-RISK-02"
        out.append(_action("NBA-REBALANCE", "rebalance", f"Rebalance back inside the {profile} band",
                           f"Move about {f['shift_value']['display']} so equities go from {f['equity_share']['display']} to "
                           + (f"at most {f['band_max']['display']}." if above else f"at least {f['band_min']['display']}."),
                           dollars=f["shift_value"]["value"], dollars_label="Value to move", rules=[risk["rule"]],
                           fit=f"Brings the allocation back to the {profile} profile the client chose."))
    order = {"10b5-1-plan": 0, "rebalance": 1, "treasury-ladder": 2, "rmd": 3, "cd-maturity": 4, "529-plan": 5, "estate-review": 6,
             "beneficiary": 7, "collar": 8, "daf-gift": 9, "exchange-fund": 10}
    out.sort(key=lambda row: (not row["suitable"], order.get(row["type"], 20), -row["dollars"]))
    return out


GROUPS = {"10b5-1-plan": "allocation", "collar": "allocation", "exchange-fund": "allocation", "daf-gift": "allocation",
          "rebalance": "allocation", "treasury-ladder": "cash", "cd-maturity": "cash", "529-plan": "education", "rmd": "distribution"}


def addressable(actions: list[dict]) -> float:
    """Investable dollars in play: overlapping actions on the same dollars count once; referrals are not counted."""
    seen: dict[str, float] = {}
    for row in actions:
        group = GROUPS.get(row["type"])
        if row["suitable"] and group:
            seen[group] = max(seen.get(group, 0.0), row["dollars"])
    return sum(seen.values())


__all__ = ["addressable", "candidates"]
