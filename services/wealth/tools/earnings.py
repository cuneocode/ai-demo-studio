"""Earnings surprise and beat-rate math over a cached snapshot."""
from __future__ import annotations


def _sorted_income(snapshot: dict) -> list[dict]:
    rows = [row for row in snapshot.get("income") or [] if row.get("revenue") is not None]
    return sorted(rows, key=lambda row: row.get("period") or "")


def revenue_growth(snapshot: dict) -> dict:
    rows = _sorted_income(snapshot)
    yoy = []
    for index in range(4, len(rows)):
        prior = rows[index - 4].get("revenue")
        current = rows[index].get("revenue")
        if not prior:
            continue
        yoy.append({
            "period": rows[index].get("period"),
            "growth": (current / prior) - 1,
        })
    decelerating = False
    if len(yoy) >= 2:
        decelerating = yoy[-1]["growth"] < yoy[-2]["growth"]
    return {
        "quarters": [{"period": row.get("period"), "revenue": row.get("revenue")} for row in rows[-8:]],
        "yoy": yoy[-4:],
        "latestYoy": yoy[-1]["growth"] if yoy else None,
        "priorYoy": yoy[-2]["growth"] if len(yoy) >= 2 else None,
        "decelerating": decelerating,
    }


def earnings_from_snapshot(snapshot: dict) -> dict:
    quarters = [row for row in snapshot.get("earnings") or [] if row.get("epsActual") is not None or row.get("surprisePct") is not None]
    surprises = []
    for row in quarters:
        surprise = row.get("surprisePct")
        actual = row.get("epsActual")
        estimate = row.get("epsEstimate")
        if surprise is None and actual is not None and estimate not in (None, 0):
            surprise = ((actual - estimate) / abs(estimate)) * 100
        surprises.append({**row, "surprisePct": surprise, "beat": surprise is not None and surprise > 0})
    scored = [row for row in surprises if row.get("surprisePct") is not None]
    beat_rate = (sum(1 for row in scored if row["beat"]) / len(scored)) if scored else None
    revenue = revenue_growth(snapshot)
    status = "ready" if scored or revenue["quarters"] else "absent"
    return {
        "status": status,
        "quarters": surprises[:8],
        "observations": len(scored),
        "beats": sum(1 for row in scored if row["beat"]),
        "beatRate": beat_rate,
        "latestSurprisePct": scored[0]["surprisePct"] if scored else None,
        "revenue": revenue,
    }
