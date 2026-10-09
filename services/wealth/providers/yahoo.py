"""yfinance only. Named functions. No arbitrary HTTP."""
from __future__ import annotations

import math
from datetime import datetime, timezone

import yfinance as yf

RATE_SENSITIVE_SECTORS = {"financial services", "financials", "real estate", "utilities"}


class ProviderError(Exception):
    status = 502


def _finite(value):
    try:
        number = float(value)
    except (TypeError, ValueError):
        return None
    if math.isnan(number) or math.isinf(number):
        return None
    return number


def _series_close(frame):
    if frame is None or getattr(frame, "empty", True):
        return []
    column = "Close" if "Close" in frame.columns else frame.columns[0]
    rows = []
    for index, value in frame[column].items():
        close = _finite(value)
        if close is None:
            continue
        if hasattr(index, "to_pydatetime"):
            stamp = index.to_pydatetime()
            if stamp.tzinfo is None:
                stamp = stamp.replace(tzinfo=timezone.utc)
            date = stamp.astimezone(timezone.utc).date().isoformat()
        else:
            date = str(index)[:10]
        rows.append({"date": date, "close": close})
    return rows


def _cell(frame, row, *names):
    for name in names:
        if name in frame.columns:
            return _finite(frame.at[row, name])
    return None


def _period_label(value) -> str:
    if hasattr(value, "date"):
        return value.date().isoformat()
    text = str(value)
    return text[:10] if len(text) >= 10 else text


def history(ticker: str, period: str = "2y") -> list[dict]:
    frame = yf.Ticker(ticker).history(period=period, auto_adjust=True)
    return _series_close(frame)


def info(ticker: str) -> dict:
    raw = yf.Ticker(ticker).info or {}
    if not isinstance(raw, dict) or not raw:
        return {}
    return {
        "symbol": (raw.get("symbol") or ticker).upper(),
        "name": raw.get("shortName") or raw.get("longName") or ticker.upper(),
        "sector": raw.get("sector"),
        "industry": raw.get("industry"),
        "industryKey": raw.get("industryKey"),
        "sectorKey": raw.get("sectorKey"),
        "marketCap": _finite(raw.get("marketCap")),
        "trailingPE": _finite(raw.get("trailingPE") or raw.get("forwardPE")),
        "forwardPE": _finite(raw.get("forwardPE")),
        "priceToBook": _finite(raw.get("priceToBook")),
        "returnOnEquity": _finite(raw.get("returnOnEquity")),
        "currency": raw.get("currency") or "USD",
        "quoteType": raw.get("quoteType"),
    }


def earnings(ticker: str) -> list[dict]:
    instrument = yf.Ticker(ticker)
    frame = None
    getter = getattr(instrument, "get_earnings_dates", None)
    if callable(getter):
        try:
            frame = getter(limit=12)
        except TypeError:
            frame = getter()
        except Exception:
            frame = None
    if frame is None or getattr(frame, "empty", True):
        frame = getattr(instrument, "earnings_dates", None)
    if frame is None or getattr(frame, "empty", True):
        return []
    rows = []
    for index in list(frame.index)[:12]:
        actual = _cell(frame, index, "Reported EPS", "reportedEPS", "epsActual")
        estimate = _cell(frame, index, "EPS Estimate", "epsEstimate", "estimate")
        surprise = _cell(frame, index, "Surprise(%)", "surprisePercent", "surprise")
        if actual is None and estimate is None:
            continue
        rows.append({
            "period": _period_label(index),
            "epsActual": actual,
            "epsEstimate": estimate,
            "surprisePct": surprise,
        })
    return rows


def income_quarters(ticker: str) -> list[dict]:
    frame = getattr(yf.Ticker(ticker), "quarterly_income_stmt", None)
    if frame is None or getattr(frame, "empty", True):
        return []
    revenue_row = None
    for label in ("Total Revenue", "Operating Revenue", "Revenue"):
        if label in frame.index:
            revenue_row = frame.loc[label]
            break
    if revenue_row is None:
        return []
    rows = []
    for column, value in revenue_row.items():
        amount = _finite(value)
        if amount is None:
            continue
        rows.append({"period": _period_label(column), "revenue": amount})
    return rows


def recommendations(ticker: str) -> list[dict]:
    frame = getattr(yf.Ticker(ticker), "recommendations", None)
    if frame is None or getattr(frame, "empty", True):
        return []
    rows = []
    for index, row in frame.tail(4).iterrows():
        rows.append({
            "period": _period_label(row.get("period") if "period" in frame.columns else index),
            "strongBuy": _finite(row.get("strongBuy")),
            "buy": _finite(row.get("buy")),
            "hold": _finite(row.get("hold")),
            "sell": _finite(row.get("sell")),
            "strongSell": _finite(row.get("strongSell")),
        })
    return rows


def _industry_candidates(meta: dict) -> list[dict]:
    key = meta.get("industryKey")
    if not key:
        return []
    industry = yf.Industry(key)
    top = getattr(industry, "top_companies", None)
    if top is None or getattr(top, "empty", True):
        return []
    found = []
    for symbol, row in top.iterrows():
        ticker = str(symbol).upper()
        cap = _finite(row.get("marketCap") if "marketCap" in top.columns else row.get("marketcap"))
        found.append({
            "ticker": ticker,
            "name": str(row.get("name") or ticker),
            "marketCap": cap,
            "trailingPE": _finite(row.get("trailingPE") or row.get("pe")),
        })
    return found


def discover_peers(ticker: str, meta: dict, limit: int = 6) -> list[dict]:
    subject = ticker.upper()
    cap = meta.get("marketCap")
    try:
        candidates = _industry_candidates(meta)
    except Exception as exc:
        raise ProviderError("Peer discovery did not return a usable industry set.") from exc
    banded = []
    for item in candidates:
        if item["ticker"] == subject:
            continue
        peer_cap = item.get("marketCap")
        if cap and peer_cap:
            ratio = peer_cap / cap
            if ratio < 0.25 or ratio > 4.0:
                continue
        banded.append(item)
    selected = (banded or [item for item in candidates if item["ticker"] != subject])[:limit]
    peers = []
    for item in selected:
        try:
            peer_info = info(item["ticker"])
            peer_history = history(item["ticker"], period="1y")
        except Exception:
            continue
        if not peer_info and not peer_history:
            continue
        peers.append({
            "ticker": item["ticker"],
            "name": peer_info.get("name") or item.get("name") or item["ticker"],
            "sector": peer_info.get("sector") or meta.get("sector"),
            "industry": peer_info.get("industry") or meta.get("industry"),
            "marketCap": peer_info.get("marketCap") or item.get("marketCap"),
            "trailingPE": peer_info.get("trailingPE") or item.get("trailingPE"),
            "priceToBook": peer_info.get("priceToBook"),
            "returnOnEquity": peer_info.get("returnOnEquity"),
            "history": peer_history,
        })
    return peers


def fetch_snapshot(ticker: str) -> dict:
    symbol = ticker.upper()
    try:
        meta = info(symbol)
        prices = history(symbol, period="2y")
        surprises = earnings(symbol)
        income = income_quarters(symbol)
        street = recommendations(symbol)
        spy = history("SPY", period="2y")
    except ProviderError:
        raise
    except Exception as exc:
        raise ProviderError("Market data for that ticker was empty.") from exc
    if not meta and not prices:
        raise ProviderError("Market data for that ticker was empty.")
    if not prices:
        raise ProviderError("Price history for that ticker was empty.")
    try:
        peers = discover_peers(symbol, meta)
    except ProviderError:
        peers = []
    except Exception:
        peers = []
    return {
        "ticker": symbol,
        "name": meta.get("name") or symbol,
        "fetchedAt": datetime.now(timezone.utc).isoformat(),
        "info": meta,
        "history": prices,
        "benchmark": {"ticker": "SPY", "history": spy},
        "earnings": surprises,
        "income": income,
        "recommendations": street,
        "peers": peers,
    }


def is_rate_sensitive(meta: dict | None) -> bool:
    sector = str((meta or {}).get("sector") or "").strip().lower()
    return sector in RATE_SENSITIVE_SECTORS
