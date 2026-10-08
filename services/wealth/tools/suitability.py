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
