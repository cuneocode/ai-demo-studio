"""A transparent baseline rules engine: one payment at a time, the way most authorization rules work.

Deterministic and synthetic. It is the comparison the graph model is measured against in the
demo, not a bank's production ruleset. Scores run 0–999 like common vendor scores.
"""

APPROVE_BELOW = 400
DECLINE_FROM = 650
HIGH_RISK_MCC = {"5732": "Electronics", "5816": "Digital goods", "4722": "Travel", "6051": "Quasi-cash", "5999": "Miscellaneous retail"}


def rules_score(case: dict) -> dict:
    """Score, decision (approve / review / decline), and every rule that fired with its points."""
    history = case.get("history") or {}
    profile = case.get("profile") or {}
    signals = case.get("signals") or {}
    amount = float(case.get("amount") or 0)
    typical = profile.get("typical_amount")
    fired: list[dict] = [{"rule": "BASE", "text": "Baseline for any authorization", "points": 40}]

    def fire(rule: str, text: str, points: int):
        fired.append({"rule": rule, "text": text, "points": points})

    if case.get("channel") == "cnp":
        fire("CNP", "Card not present", 60)
    if typical:
        ratio = amount / typical
        if ratio >= 4:
            fire("AMT_4X", f"Amount {ratio:.1f}× this card's typical spend", 60)
        elif ratio >= 2.5:
            fire("AMT_2X", f"Amount {ratio:.1f}× this card's typical spend", 20)
    small = int(history.get("card_small_payments_24h") or 0)
    if small >= 5:
        fire("VELOCITY_SMALL", f"{small} authorizations under $5 in the last 24 hours", 300)
    if case.get("mcc") in HIGH_RISK_MCC and amount >= 500:
        fire("MCC_HIGH_RISK", f"High-risk category ({HIGH_RISK_MCC[case['mcc']]}) over $500", 80)
    if signals.get("new_device"):
        fire("NEW_DEVICE", "New device on the account", 150)
    hours = signals.get("address_change_hours")
    if isinstance(hours, (int, float)) and hours <= 48:
        fire("ADDRESS_CHANGE", f"Mailing address changed {hours:g} hours ago", 200)
    if signals.get("reissue_requested"):
        fire("REISSUE_REQUEST", "Card reissue requested", 150)
    if int(history.get("card_prior_fraud") or 0) > 0:
        fire("PRIOR_FRAUD", "Card had confirmed fraud before", 120)
    visits = int(history.get("card_prior_visits_here") or 0)
    if visits >= 3:
        fire("KNOWN_MERCHANT", f"Card used here {visits} times before", -30)

    score = max(0, min(999, sum(item["points"] for item in fired)))
    decision = "decline" if score >= DECLINE_FROM else "review" if score >= APPROVE_BELOW else "approve"
    return {"score": score, "max": 999, "decision": decision, "fired": fired,
            "thresholds": {"review": APPROVE_BELOW, "decline": DECLINE_FROM},
            "sees_network": False, "engine": "Baseline rules (synthetic, deterministic)"}
