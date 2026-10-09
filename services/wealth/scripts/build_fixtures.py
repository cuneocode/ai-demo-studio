"""Regenerate the fictional market data and the synthetic book of households. Deterministic.

    cd services/wealth && .venv/bin/python scripts/build_fixtures.py

Writes fixtures/halcyon/market/HCYN.json and KSTL.json (fictional issuers, synthetic prices in the
wealth snapshot format) and fixtures/households/book-summary.json (240 synthetic households: 214 hold
HCYN, 31 above 10%, 6 executives or affiliates). The SPY benchmark is the real public series from the
committed NVDA snapshot (data/snapshots/NVDA.json), cut at the fictional as-of date.
"""
from __future__ import annotations

import json
import math
import random
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
REPO = SERVICE.parents[1]
MARKET = REPO / "fixtures" / "halcyon" / "market"
BOOK = REPO / "fixtures" / "households" / "book-summary.json"
AS_OF = "2026-10-08"
FETCHED = f"{AS_OF}T21:00:00+00:00"


def spy_history() -> list[dict]:
    snapshot = json.loads((SERVICE / "data" / "snapshots" / "NVDA.json").read_text(encoding="utf-8"))
    return [row for row in snapshot["benchmark"]["history"] if row["date"] <= AS_OF]


def bridged_path(dates: list[str], anchors: dict[str, float], jumps: dict[str, float], seed: int, vol: float) -> list[dict]:
    """A seeded random walk forced through anchor prices (log-linear correction between anchors)."""
    rng = random.Random(seed)
    steps = [0.0] + [jumps.get(date, rng.gauss(0, vol)) for date in dates[1:]]
    raw = []
    level = 0.0
    for step in steps:
        level += step
        raw.append(level)
    marks = sorted((dates.index(date), math.log(price)) for date, price in anchors.items())
    path = list(raw)
    for (i0, t0), (i1, t1) in zip(marks, marks[1:]):
        for i in range(i0, i1 + 1):
            share = (i - i0) / (i1 - i0)
            path[i] = raw[i] + (t0 - raw[i0]) * (1 - share) + (t1 - raw[i1]) * share
    return [{"date": date, "close": round(math.exp(value), 2)} for date, value in zip(dates, path)]


def nearest(dates: list[str], target: str) -> str:
    return max(date for date in dates if date <= target)


def earnings_rows(rows: list[tuple[str, float | None, float]]) -> list[dict]:
    result = []
    for period, actual, estimate in rows:
        surprise = None if actual is None else round((actual - estimate) / abs(estimate) * 100, 2)
        result.append({"period": period, "epsActual": actual, "epsEstimate": estimate, "surprisePct": surprise})
    return result


def snapshot(ticker: str, name: str, info: dict, history: list[dict], spy: list[dict], earnings, income, recs, peers) -> dict:
    return {
        "ticker": ticker,
        "name": name,
        "fetchedAt": FETCHED,
        "fictional": True,
        "fixture": {
            "kind": "fictional-synthetic",
            "source": "Synthetic data for a fictional issuer (services/wealth/scripts/build_fixtures.py)",
            "asOf": AS_OF,
            "benchmark_source": "SPY closes are real public data from the committed NVDA snapshot",
        },
        "info": {"symbol": ticker, "name": name, "currency": "USD", "quoteType": "EQUITY", **info},
        "history": history,
        "benchmark": {"ticker": "SPY", "history": spy},
        "earnings": earnings,
        "income": [{"period": period, "revenue": revenue} for period, revenue in income],
        "recommendations": recs,
        "peers": peers,
    }


def halcyon(spy: list[dict]) -> dict:
    """Consistent with fixtures/halcyon/annual-report-fy2025.html: FY2024 revenue $2,980.1M, FY2025 $4,112.6M,
    FY2025 diluted EPS $4.77, 165.2M shares, closes $52.60 (2024-12-31) and $78.15 (2025-12-31)."""
    dates = [row["date"] for row in spy]
    shares = 165_212_400
    history = bridged_path(
        dates,
        anchors={
            dates[0]: 44.80, nearest(dates, "2024-12-31"): 52.60, nearest(dates, "2025-10-08"): 70.50,
            nearest(dates, "2025-12-31"): 78.15, nearest(dates, "2026-10-07"): 80.10, AS_OF: 87.40,
        },
        jumps={AS_OF: math.log(87.40 / 80.10)},
        seed=2026, vol=0.022,
    )
    earnings = earnings_rows([
        ("2027-02-10", None, 1.92),
        ("2026-10-07", 1.79, 1.62),
        ("2026-07-29", 1.61, 1.52),
        ("2026-04-29", 1.48, 1.41),
        ("2026-02-11", 1.40, 1.33),
        ("2025-10-22", 1.22, 1.24),
        ("2025-07-30", 1.13, 1.05),
        ("2025-04-30", 1.02, 0.95),
        ("2025-02-12", 0.86, 0.80),
    ])
    ttm = 1.79 + 1.61 + 1.48 + 1.40
    income = [
        ("2024-03-31", 650_000_000), ("2024-06-30", 710_000_000), ("2024-09-30", 768_000_000), ("2024-12-31", 852_100_000),
        ("2025-03-31", 905_000_000), ("2025-06-30", 980_000_000), ("2025-09-30", 1_060_000_000), ("2025-12-31", 1_167_600_000),
        ("2026-03-31", 1_255_000_000), ("2026-06-30", 1_370_000_000), ("2026-09-30", 1_512_000_000),
    ]
    recs = [
        {"period": "0m", "strongBuy": 6.0, "buy": 11.0, "hold": 4.0, "sell": 0.0, "strongSell": 0.0},
        {"period": "-1m", "strongBuy": 5.0, "buy": 11.0, "hold": 5.0, "sell": 0.0, "strongSell": 0.0},
        {"period": "-2m", "strongBuy": 5.0, "buy": 10.0, "hold": 6.0, "sell": 0.0, "strongSell": 0.0},
        {"period": "-3m", "strongBuy": 4.0, "buy": 10.0, "hold": 6.0, "sell": 1.0, "strongSell": 0.0},
    ]
    peer = lambda ticker, name, industry, cap, pe: {  # noqa: E731
        "ticker": ticker, "name": f"{name} (fictional)", "sector": "Technology", "industry": industry,
        "marketCap": cap, "trailingPE": pe, "fictional": True,
    }
    peers = [
        peer("ARQX", "Arquent Networks", "Semiconductors", 31_000_000_000.0, 19.5),
        peer("LMFX", "Lumafex Photonics", "Communication Equipment", 11_800_000_000.0, 17.2),
        peer("VNTL", "Ventralis Systems", "Computer Hardware", 7_900_000_000.0, 12.4),
        peer("QFLX", "Quillflex Thermal", "Electronic Components", 5_300_000_000.0, 21.0),
    ]
    info = {
        "sector": "Technology", "industry": "Communication Equipment",
        "industryKey": "communication-equipment", "sectorKey": "technology",
        "exchange": "Nasdaq Global Select Market (fictional listing)",
        "marketCap": round(87.40 * shares, 2), "sharesOutstanding": shares,
        "trailingPE": round(87.40 / ttm, 2), "forwardPE": round(87.40 / 7.60, 2),
        "description": "Fictional maker of optical interconnect and liquid-cooled AI rack systems for accelerated-compute data centers.",
    }
    return snapshot("HCYN", "Halcyon Interconnect, Inc.", info, history, spy, earnings, income, recs, peers)


def kestrel(spy: list[dict]) -> dict:
    dates = [row["date"] for row in spy]
    history = bridged_path(dates, anchors={dates[0]: 30.10, nearest(dates, "2025-10-08"): 27.60, AS_OF: 24.10}, jumps={}, seed=1144, vol=0.018)
    earnings = earnings_rows([
        ("2026-11-04", None, 0.31),
        ("2026-08-05", 0.29, 0.30), ("2026-05-06", 0.33, 0.31), ("2026-02-11", 0.27, 0.29), ("2025-11-05", 0.30, 0.30),
        ("2025-08-06", 0.28, 0.27),
    ])
    income = [
        ("2025-06-30", 410_000_000), ("2025-09-30", 432_000_000), ("2025-12-31", 401_000_000), ("2026-03-31", 418_000_000),
        ("2026-06-30", 425_000_000), ("2026-09-30", 438_000_000),
    ]
    info = {
        "sector": "Utilities", "industry": "Utilities - Renewable", "industryKey": "utilities-renewable", "sectorKey": "utilities",
        "exchange": "NYSE (fictional listing)", "marketCap": round(24.10 * 180_000_000, 2), "sharesOutstanding": 180_000_000,
        "trailingPE": round(24.10 / 1.19, 2), "forwardPE": round(24.10 / 1.28, 2),
        "description": "Fictional grid-scale battery storage operator. On the firm's restricted list (underwriting syndicate).",
    }
    return snapshot("KSTL", "Kestrel Grid Storage, Inc.", info, history, spy, earnings, income, [], [])


def book() -> dict:
    """240 households: 214 hold HCYN (31 above 10%), 6 executives or affiliates, 26 do not hold it."""
    rng = random.Random(214)
    others = ["VTI", "VXUS", "BND", "SCHD", "NVDA", "MSFT", "AAPL", "JPM", "XOM"]
    ids = ["dana-whitfield", "okafor", "priya-raman"] + [f"hh-{n:04d}" for n in range(1, 238)]
    pool = [i for i in ids if i not in {"dana-whitfield", "okafor", "priya-raman"}]
    rng.shuffle(pool)
    concentrated = ["dana-whitfield"] + pool[:30]
    small = pool[30:213]
    affiliates = {"dana-whitfield", *concentrated[1:5], small[0]}
    rows = []
    for hid in ids:
        if hid == "dana-whitfield":
            hcyn = 46.0
        elif hid in concentrated:
            hcyn = round(rng.uniform(10.5, 38.0), 1)
        elif hid in small:
            hcyn = round(rng.uniform(0.5, 9.5), 1)
        else:
            hcyn = 0.0
        names = rng.sample(others, rng.randint(3, 6))
        raw = [rng.uniform(1, 10) for _ in names]
        rest = 100.0 - hcyn
        weights = [round(rest * value / sum(raw), 1) for value in raw]
        weights[-1] = round(rest - sum(weights[:-1]), 1)
        holdings = dict(zip(names, weights))
        if hcyn:
            holdings = {"HCYN": hcyn, **holdings}
        row = {"id": hid, "holdings": holdings}
        if hid in affiliates:
            row["affiliate"] = True
        rows.append(row)
    holders = [row for row in rows if row["holdings"].get("HCYN")]
    assert len(rows) == 240 and len(holders) == 214
    assert sum(1 for row in holders if row["holdings"]["HCYN"] > 10) == 31
    assert sum(1 for row in holders if row.get("affiliate")) == 6
    return {
        "synthetic": True,
        "label": "Synthetic book of households for the affected-households counts",
        "as_of": AS_OF,
        "generated_by": "services/wealth/scripts/build_fixtures.py",
        "issuer": "HCYN",
        "counts": {"households": 240, "hold_issuer": 214, "above_10_pct": 31, "executives_or_affiliates": 6},
        "households": rows,
    }


def main() -> None:
    spy = spy_history()
    MARKET.mkdir(parents=True, exist_ok=True)
    for item in (halcyon(spy), kestrel(spy)):
        (MARKET / f"{item['ticker']}.json").write_text(json.dumps(item, separators=(",", ":")) + "\n", encoding="utf-8")
        print(f"{item['ticker']}: {len(item['history'])} closes, last {item['history'][-1]}")
    BOOK.write_text(json.dumps(book(), separators=(",", ":")) + "\n", encoding="utf-8")
    print(f"book-summary: {BOOK}")


if __name__ == "__main__":
    main()
