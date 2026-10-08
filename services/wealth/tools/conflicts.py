"""Structured cross-dimension conflicts. Computed before the LLM. No keyword scans."""
from __future__ import annotations

from providers.yahoo import is_rate_sensitive


def _pct(value: float | None) -> str:
    if value is None:
        return "not reported"
    return f"{value * 100:.1f}%"


def detect_conflicts(snapshot: dict, earnings: dict, peers: dict, returns: dict, macro: dict) -> list[dict]:
    rows = []
    beat_rate = earnings.get("beatRate")
    one_year = (returns.get("windows") or {}).get("1Y") or {}
    excess = one_year.get("excess")
    if beat_rate is not None and beat_rate >= 0.6 and (earnings.get("observations") or 0) >= 4 and excess is not None and excess < -0.02:
        rows.append({
            "id": "beat_vs_spy",
            "severity": "high" if excess < -0.08 else "medium",
            "left": f"Beat rate {_pct(beat_rate)} over {earnings.get('observations')} quarters",
            "right": f"1Y excess vs SPY {_pct(excess)}",
            "detail": "Reported EPS beat-rate is high while the stock lagged SPY over the last year.",
        })

    premium = peers.get("pePremium")
    decelerating = (earnings.get("revenue") or {}).get("decelerating")
    latest_yoy = (earnings.get("revenue") or {}).get("latestYoy")
    if premium is not None and premium >= 0.2 and decelerating and latest_yoy is not None:
        rows.append({
            "id": "pe_vs_growth",
            "severity": "high" if premium >= 0.4 else "medium",
            "left": f"P/E premium {_pct(premium)} vs peer median {peers.get('medianPe')}",
            "right": f"Revenue growth decelerating; latest YoY {_pct(latest_yoy)}",
            "detail": "The issuer trades at a P/E premium to live peers while quarterly revenue growth is slowing.",
        })

    fed = (macro.get("series") or {}).get("FEDFUNDS") or {}
    cpi = (macro.get("series") or {}).get("CPIAUCSL") or {}
    fed_up = fed.get("direction") == "up"
    cpi_up = cpi.get("direction") == "up"
    if macro.get("status") == "ready" and (fed_up or cpi_up) and is_rate_sensitive(snapshot.get("info") or {}):
        driver = "Fed funds rising" if fed_up else "CPI rising"
        sector = (snapshot.get("info") or {}).get("sector") or "rate-sensitive sector"
        rows.append({
            "id": "macro_vs_sector",
            "severity": "medium",
            "left": f"{driver} (Fed {fed.get('latest')}; CPI {cpi.get('latest')})",
            "right": f"{sector} is rate-sensitive",
            "detail": "Policy or inflation is moving against a rate-sensitive sector in the cached snapshot.",
        })
    return rows
