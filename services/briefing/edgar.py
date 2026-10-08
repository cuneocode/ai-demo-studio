"""Public SEC fair-access client. Tests monkeypatch HTTP, not the live site."""
from __future__ import annotations

import functools
import json
import os
import re
import subprocess
import threading
import time
from pathlib import Path
from urllib.parse import urlparse

import httpx

TICKERS_URL = "https://www.sec.gov/files/company_tickers.json"
SUBMISSIONS_URL = "https://data.sec.gov/submissions/CIK{cik}.json"
FACTS_URL = "https://data.sec.gov/api/xbrl/companyfacts/CIK{cik}.json"
ARCHIVES_URL = "https://www.sec.gov/Archives/edgar/data/{cik}/{accession}/{document}"
TICKER_TTL_SECONDS = 24 * 60 * 60
MIN_INTERVAL = 0.12  # stay under the 10 req/s fair-access cap

ANNUAL_FORMS = ("10-K", "20-F", "40-F")


class EdgarError(Exception):
    def __init__(self, message: str, status: int = 502):
        super().__init__(message)
        self.status = status


class UnknownIssuer(EdgarError):
    def __init__(self, query: str | None = None):
        super().__init__("Unknown issuer.", 404)
        self.query = query


class AmbiguousIssuer(EdgarError):
    def __init__(self, query: str, candidates: list[dict]):
        super().__init__("Multiple issuers match this name. Pick one ticker.", 409)
        self.query = query
        self.candidates = candidates


class NoAnnualReport(EdgarError):
    def __init__(self):
        super().__init__("No annual report was found for this issuer.", 404)


_rate_lock = threading.Lock()
_last_request = 0.0


def cache_root() -> Path:
    override = os.getenv("BRIEFING_CACHE")
    if override:
        return Path(override)
    return Path(__file__).resolve().parent / ".cache"


@functools.cache
def git_contact() -> str:
    """SEC fair access needs a real contact; the developer's git identity is one."""
    def config(key: str) -> str:
        try:
            return subprocess.run(["git", "config", key], capture_output=True, text=True, timeout=2).stdout.strip()
        except (OSError, subprocess.SubprocessError):
            return ""

    email = config("user.email")
    if "@" not in email:
        return ""
    return f"{config('user.name') or 'FSI AI Demo Studio'} {email}"


def user_agent() -> str:
    return os.getenv("SEC_USER_AGENT", "").strip() or git_contact()


def sec_health() -> dict:
    configured = bool(user_agent())
    tickers = cache_root() / "tickers.json"
    return {
        "status": "configured" if configured else "missing_user_agent",
        "user_agent_set": configured,
        "contact": "env" if os.getenv("SEC_USER_AGENT", "").strip() else "git" if configured else None,
        "tickers_cached": tickers.is_file(),
    }


def pad_cik(value: str | int) -> str:
    digits = re.sub(r"\D", "", str(value))
    if not digits:
        raise EdgarError("Invalid CIK.", 422)
    return f"{int(digits):010d}"


def cik_no_zeros(value: str | int) -> str:
    return str(int(pad_cik(value)))


def public_company(row: dict) -> dict:
    return {
        "cik": pad_cik(row["cik"]),
        "ticker": (row.get("ticker") or "").upper() or None,
        "name": row.get("name") or row.get("title") or "",
    }


def _throttle():
    global _last_request
    with _rate_lock:
        wait = MIN_INTERVAL - (time.monotonic() - _last_request)
        if wait > 0:
            time.sleep(wait)
        _last_request = time.monotonic()


def http_get(url: str, *, binary: bool = False, timeout: float = 30.0):
    """Single HTTP seam for tests to monkeypatch."""
    ua = user_agent()
    if not ua:
        raise EdgarError("Set SEC_USER_AGENT (\"Your Name you@example.com\") or a git user.email.", 503)
    host = urlparse(url).hostname or ""
    if not host.endswith("sec.gov"):
        raise EdgarError("Only SEC hosts are allowed.", 502)
    _throttle()
    headers = {"User-Agent": ua, "Accept-Encoding": "gzip, deflate", "Accept": "application/json, text/html, */*"}
    try:
        with httpx.Client(timeout=timeout, follow_redirects=True, headers=headers) as client:
            response = client.get(url)
            response.raise_for_status()
            return response.content if binary else response.json()
    except httpx.HTTPStatusError as exc:
        status = 403 if exc.response.status_code == 403 else 502
        raise EdgarError("SEC refused this request. Check SEC_USER_AGENT.", status) from None
    except httpx.HTTPError:
        raise EdgarError("The SEC request failed.", 502) from None


def _read_json(path: Path):
    return json.loads(path.read_text(encoding="utf-8"))


def _write_json(path: Path, payload):
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload), encoding="utf-8")


def load_tickers(*, refresh: bool = False) -> list[dict]:
    path = cache_root() / "tickers.json"
    if path.is_file() and not refresh:
        age = time.time() - path.stat().st_mtime
        if age < TICKER_TTL_SECONDS:
            rows = _read_json(path)
            if isinstance(rows, list):
                return rows
    raw = http_get(TICKERS_URL)
    rows = []
    if isinstance(raw, dict):
        values = raw.values()
    elif isinstance(raw, list):
        values = raw
    else:
        values = []
    for item in values:
        if not isinstance(item, dict):
            continue
        cik = item.get("cik_str", item.get("cik"))
        ticker = item.get("ticker")
        title = item.get("title") or item.get("name")
        if cik is None or not ticker:
            continue
        rows.append({"cik": pad_cik(cik), "ticker": str(ticker).upper(), "name": str(title or "")})
    _write_json(path, rows)
    return rows


def search_companies(query: str, limit: int = 8) -> list[dict]:
    q = (query or "").strip()
    if not q:
        return []
    q_upper = q.upper()
    q_lower = q.lower()
    exact, title_exact, ticker_sub, title_sub = [], [], [], []
    for row in load_tickers():
        ticker = row["ticker"]
        name = row["name"]
        if ticker == q_upper:
            exact.append(row)
        elif name.lower() == q_lower:
            title_exact.append(row)
        elif ticker.startswith(q_upper) or q_upper in ticker:
            ticker_sub.append(row)
        elif q_lower in name.lower():
            title_sub.append(row)
    seen: set[str] = set()
    out: list[dict] = []
    for group in (exact, title_exact, ticker_sub, title_sub):
        for row in group:
            if row["cik"] in seen:
                continue
            seen.add(row["cik"])
            out.append(public_company(row))
            if len(out) >= limit:
                return out
    return out


def resolve_company(query: str | None = None, cik: str | None = None) -> dict:
    if cik:
        padded = pad_cik(cik)
        for row in load_tickers():
            if row["cik"] == padded:
                return public_company(row)
        return {"cik": padded, "ticker": None, "name": ""}
    q = (query or "").strip()
    if not q:
        raise UnknownIssuer(query)
    matches = search_companies(q, limit=8)
    q_upper = q.upper()
    q_lower = q.lower()
    exact = [row for row in matches if (row.get("ticker") or "").upper() == q_upper]
    if len(exact) == 1:
        return exact[0]
    title_exact = [row for row in matches if (row.get("name") or "").lower() == q_lower]
    if len(title_exact) == 1:
        return title_exact[0]
    if len(matches) == 1:
        return matches[0]
    if not matches:
        raise UnknownIssuer(q)
    raise AmbiguousIssuer(q, matches)


def _recent_rows(payload: dict) -> list[dict]:
    recent = (payload.get("filings") or {}).get("recent") or {}
    forms = recent.get("form") or []
    rows = []
    for index, form in enumerate(forms):
        rows.append({
            "form": form,
            "accession": (recent.get("accessionNumber") or [None])[index] if index < len(recent.get("accessionNumber") or []) else None,
            "filed_at": (recent.get("filingDate") or [None])[index] if index < len(recent.get("filingDate") or []) else None,
            "period_of_report": (recent.get("reportDate") or [None])[index] if index < len(recent.get("reportDate") or []) else None,
            "primary_document": (recent.get("primaryDocument") or [None])[index] if index < len(recent.get("primaryDocument") or []) else None,
        })
    return rows


def _prefer_annual(rows: list[dict]) -> dict | None:
    for wanted in ANNUAL_FORMS:
        primary = [row for row in rows if row.get("form") == wanted]
        if primary:
            return primary[0]
        amendments = [row for row in rows if row.get("form") == f"{wanted}/A"]
        if amendments:
            return amendments[0]
    return None


def load_submissions(cik: str, *, refresh: bool = False) -> dict:
    padded = pad_cik(cik)
    path = cache_root() / "submissions" / f"{padded}.json"
    if path.is_file() and not refresh:
        age = time.time() - path.stat().st_mtime
        if age < TICKER_TTL_SECONDS:
            return _read_json(path)
    payload = http_get(SUBMISSIONS_URL.format(cik=padded))
    _write_json(path, payload)
    return payload


def latest_annual_report(cik: str, *, refresh: bool = False) -> dict:
    padded = pad_cik(cik)
    payload = load_submissions(padded, refresh=refresh)
    row = _prefer_annual(_recent_rows(payload))
    if not row or not row.get("accession") or not row.get("primary_document"):
        raise NoAnnualReport()
    accession = str(row["accession"])
    document = str(row["primary_document"])
    url = ARCHIVES_URL.format(
        cik=cik_no_zeros(padded),
        accession=accession.replace("-", ""),
        document=document,
    )
    period = row.get("period_of_report") or ""
    fiscal_year = None
    if period and re.match(r"^\d{4}", period):
        fiscal_year = int(period[:4])
    name = payload.get("name") or ""
    tickers = payload.get("tickers") or []
    return {
        "cik": padded,
        "name": name,
        "ticker": (tickers[0] if tickers else None),
        "form": row.get("form"),
        "filed_at": row.get("filed_at"),
        "period_of_report": period or None,
        "fiscal_year": fiscal_year,
        "accession": accession,
        "primary_document": document,
        "url": url,
    }


def filing_cache_dir(cik: str, accession: str) -> Path:
    return cache_root() / "filings" / pad_cik(cik) / accession.replace("-", "")


def download_filing(meta: dict, *, refresh: bool = False) -> tuple[bytes, str]:
    dest_dir = filing_cache_dir(meta["cik"], meta["accession"])
    document = meta["primary_document"]
    suffix = Path(document).suffix.lower() or ".html"
    cached = dest_dir / f"source{suffix}"
    meta_path = dest_dir / "meta.json"
    if cached.is_file() and not refresh:
        return cached.read_bytes(), suffix
    body = http_get(meta["url"], binary=True)
    dest_dir.mkdir(parents=True, exist_ok=True)
    cached.write_bytes(body)
    _write_json(meta_path, {**meta, "source": "edgar"})
    return body, suffix


def load_company_facts(cik: str, *, refresh: bool = False) -> dict:
    padded = pad_cik(cik)
    path = cache_root() / "facts" / f"{padded}.json"
    if path.is_file() and not refresh:
        age = time.time() - path.stat().st_mtime
        if age < TICKER_TTL_SECONDS:
            return _read_json(path)
    payload = http_get(FACTS_URL.format(cik=padded))
    _write_json(path, payload)
    return payload
