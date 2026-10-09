"""Structured signal divergences across dimensions. Computed before the LLM. No keyword scans."""
from __future__ import annotations

from providers.yahoo import is_rate_sensitive

TITLES = {
    "beat_vs_spy": "Earnings beats vs. a lagging stock",
    "pe_vs_growth": "Valuation premium vs. slowing growth",
    "macro_vs_sector": "Rates or inflation vs. a rate-sensitive sector",
}


def _pct(value: float | None) -> str:
    if value is None:
        return "not reported"
    return f"{value * 100:.1f}%"


def _signed(value: float | None) -> str:
    if value is None:
        return "not reported"
    return f"{value * 100:+.1f}%"


def vs_spy(ticker_return: float | None, spy_return: float | None) -> str:
    """"+40.0% vs SPY +35.2%, ahead by 4.8 pts"."""
    if ticker_return is None or spy_return is None:
        return f"{_signed(ticker_return)} vs SPY {_signed(spy_return)}"
    gap = (ticker_return - spy_return) * 100
    side = "ahead by" if gap >= 0 else "behind by"
    return f"{_signed(ticker_return)} vs SPY {_signed(spy_return)}, {side} {abs(gap):.1f} pts"


def detect_conflicts(snapshot: dict, earnings: dict, peers: dict, returns: dict, macro: dict) -> list[dict]:
    rows = []
    beat_rate = earnings.get("beatRate")
    one_year = (returns.get("windows") or {}).get("1Y") or {}
    excess = one_year.get("excess")
    if beat_rate is not None and beat_rate >= 0.6 and (earnings.get("observations") or 0) >= 4 and excess is not None and excess < -0.02:
        rows.append({
            "id": "beat_vs_spy",
            "title": TITLES["beat_vs_spy"],
            "severity": "high" if excess < -0.08 else "medium",
            "left": f"Beat estimates in {earnings.get('beats')} of {earnings.get('observations')} quarters ({_pct(beat_rate)})",
            "right": f"1-year return {vs_spy(one_year.get('ticker'), one_year.get('spy'))}",
            "detail": "Reported earnings beat estimates most quarters while the stock lagged SPY over the last year.",
        })

    premium = peers.get("pePremium")
    decelerating = (earnings.get("revenue") or {}).get("decelerating")
    latest_yoy = (earnings.get("revenue") or {}).get("latestYoy")
    if premium is not None and premium >= 0.2 and decelerating and latest_yoy is not None:
        median = peers.get("medianPe")
        rows.append({
            "id": "pe_vs_growth",
            "title": TITLES["pe_vs_growth"],
            "severity": "high" if premium >= 0.4 else "medium",
            "left": f"P/E premium of {_pct(premium)} to the peer median" + (f" of {median:.1f}" if isinstance(median, (int, float)) else ""),
            "right": f"Revenue growth slowing: latest {_signed(latest_yoy)} year over year",
            "detail": "The issuer trades at a P/E premium to its peers while quarterly revenue growth is slowing.",
        })

    fed = (macro.get("series") or {}).get("FEDFUNDS") or {}
    cpi = (macro.get("series") or {}).get("CPIAUCSL") or {}
    fed_up = fed.get("direction") == "up"
    cpi_up = cpi.get("direction") == "up"
    if macro.get("status") == "ready" and (fed_up or cpi_up) and is_rate_sensitive(snapshot.get("info") or {}):
        driver = "Fed funds rate rising" if fed_up else "Inflation (CPI) rising"
        sector = (snapshot.get("info") or {}).get("sector") or "rate-sensitive sector"
        rows.append({
            "id": "macro_vs_sector",
            "title": TITLES["macro_vs_sector"],
            "severity": "medium",
            "left": f"{driver} (Fed funds {fed.get('latest')}%; CPI index {cpi.get('latest')})",
            "right": f"{sector} is rate-sensitive",
            "detail": "Policy or inflation is moving against a rate-sensitive sector in the cached snapshot.",
        })
    return rows
