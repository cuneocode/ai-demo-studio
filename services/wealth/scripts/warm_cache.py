"""Warm the wealth snapshot cache so the research and advisory demos answer instantly.

    cd services/wealth && .venv/bin/python scripts/warm_cache.py [--refresh] [--peers] [--commit-fixtures] [TICKER ...]

Without tickers it warms the example chips (app/research-note.ts EXAMPLE_RESEARCH_TICKERS) and every
holding in the synthetic households (fixtures/households). Fictional issuers are skipped: they are
served from fixtures/halcyon/market and never fetched. --peers also warms each discovered peer.
--commit-fixtures writes a trimmed copy of each public snapshot to data/snapshots/, the committed
offline fallback (public market data only, no keys).
"""
from __future__ import annotations

import argparse
import json
import re
import sys
from pathlib import Path

SERVICE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(SERVICE))

from cache import get_snapshot  # noqa: E402
from fixtures import SNAPSHOTS, fictional_tickers, fixtures_root  # noqa: E402

CHIPS = SERVICE.parents[1] / "app" / "research-note.ts"
NOT_SECURITIES = {"CASH"}


def chip_tickers() -> list[str]:
    try:
        source = CHIPS.read_text(encoding="utf-8")
    except OSError:
        return []
    block = re.search(r"EXAMPLE_RESEARCH_TICKERS[^=]*=\s*\[(.*?)\];", source, re.S)
    return re.findall(r'ticker:\s*"([A-Z]{1,5})"', block.group(1)) if block else []


def household_tickers() -> list[str]:
    found: list[str] = []
    for path in sorted((fixtures_root() / "households").glob("*.json")):
        if path.stem == "book-summary":
            continue
        record = json.loads(path.read_text(encoding="utf-8"))
        found += [str(row.get("ticker", "")).upper() for row in record.get("holdings") or []]
    return found


def trimmed(snapshot: dict) -> dict:
    """The committed fixture: closes rounded, peer price histories dropped (the tools read only P/E and size)."""
    history = snapshot.get("history") or []
    copy = {**snapshot}
    copy["history"] = [{"date": row["date"], "close": round(row["close"], 4)} for row in history]
    bench = snapshot.get("benchmark") or {}
    copy["benchmark"] = {**bench, "history": [{"date": row["date"], "close": round(row["close"], 4)} for row in bench.get("history") or []]}
    copy["peers"] = [{key: value for key, value in peer.items() if key != "history"} for peer in snapshot.get("peers") or []]
    copy["fixture"] = {
        "kind": "public-market-snapshot",
        "source": "Yahoo Finance (yfinance), public market data",
        "asOf": history[-1]["date"] if history else None,
        "written_by": "services/wealth/scripts/warm_cache.py --commit-fixtures",
    }
    return copy


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__.splitlines()[0])
    parser.add_argument("tickers", nargs="*")
    parser.add_argument("--refresh", action="store_true", help="fetch even when today's cache is fresh")
    parser.add_argument("--peers", action="store_true", help="also warm each discovered peer")
    parser.add_argument("--commit-fixtures", action="store_true", help="write trimmed copies to data/snapshots/")
    args = parser.parse_args()

    fictional = fictional_tickers()
    wanted = [t.upper() for t in args.tickers] or chip_tickers() + household_tickers()
    queue = list(dict.fromkeys(t for t in wanted if t not in fictional and t not in NOT_SECURITIES))
    seen: set[str] = set()
    failed = 0
    while queue:
        ticker = queue.pop(0)
        if ticker in seen:
            continue
        seen.add(ticker)
        try:
            snapshot, kind = get_snapshot(ticker, refresh=args.refresh)
        except Exception as exc:  # report and keep warming the rest
            failed += 1
            print(f"{ticker:6} FAILED  {type(exc).__name__}: {exc}")
            continue
        peers = [peer.get("ticker") for peer in snapshot.get("peers") or [] if peer.get("ticker")]
        print(f"{ticker:6} {kind:8} fetched {snapshot.get('fetchedAt')} · {len(snapshot.get('history') or [])} closes · peers {', '.join(peers) or 'none'}")
        if args.commit_fixtures and kind in {"live", "cache"}:
            SNAPSHOTS.mkdir(parents=True, exist_ok=True)
            (SNAPSHOTS / f"{ticker}.json").write_text(json.dumps(trimmed(snapshot), separators=(",", ":")) + "\n", encoding="utf-8")
        if args.peers and ticker in wanted:
            queue += [peer for peer in peers if peer not in seen]
    print(f"Warmed {len(seen) - failed} of {len(seen)} tickers" + (f"; fixtures in {SNAPSHOTS}" if args.commit_fixtures else ""))
    return 1 if failed else 0


if __name__ == "__main__":
    raise SystemExit(main())
