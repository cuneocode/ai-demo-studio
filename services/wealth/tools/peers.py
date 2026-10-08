"""Live peer median and percentile math over the cached issuer snapshot."""
from __future__ import annotations

import statistics


def _pe(item: dict) -> float | None:
    value = item.get("trailingPE")
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    return number if number > 0 else None


def peers_from_snapshot(snapshot: dict) -> dict:
    meta = snapshot.get("info") or {}
    members = snapshot.get("peers") or []
    subject_pe = _pe(meta)
    peer_pes = [value for value in (_pe(item) for item in members) if value is not None]
    median = statistics.median(peer_pes) if peer_pes else None
    premium = None
    percentile = None
    if subject_pe is not None and median:
        premium = (subject_pe / median) - 1
    if subject_pe is not None and peer_pes:
        below = sum(1 for value in peer_pes if value <= subject_pe)
        percentile = below / len(peer_pes)
    return {
        "status": "ready" if members else "absent",
        "tickers": [item.get("ticker") for item in members if item.get("ticker")],
        "count": len(members),
        "sector": meta.get("sector"),
        "industry": meta.get("industry"),
        "subjectPe": subject_pe,
        "medianPe": median,
        "pePremium": premium,
        "pePercentile": percentile,
        "members": [
            {
                "ticker": item.get("ticker"),
                "name": item.get("name"),
                "marketCap": item.get("marketCap"),
                "trailingPE": _pe(item),
            }
            for item in members
        ],
    }
