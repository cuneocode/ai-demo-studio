"""Identity, period, and headline metrics read by code from an uploaded annual report's own text.

An upload has no EDGAR accession or companyfacts XBRL, so without this the briefing shows no period, ticker, or
metrics. The cover page gives the form, fiscal year end, trading symbol, and registrant name; the income statement
table gives revenue, operating income, net income, and diluted EPS. Every metric keeps the verbatim table line it
came from (origin "verbatim-table") and is grounded against the source like any other excerpt. No model is involved.
"""
from __future__ import annotations

import html
import re
from datetime import datetime
from pathlib import Path

SOURCES = ("source.txt", "source.html", "source.htm")
FORM = re.compile(r"\bFORM\s+(10-K|20-F|40-F)\b", re.I)
PERIOD = re.compile(r"FISCAL\s+YEAR\s+ENDED\s+([A-Za-z]+\s+\d{1,2},\s+\d{4})", re.I)
SYMBOL = re.compile(r"Trading\s+symbol(?:\(s\))?\s*[:·]?\s*([A-Z][A-Z.]{0,5})\b")
REGISTRANT = re.compile(r"\b([A-Z][\w&.,' -]{2,70}?(?:,\s*Inc\.|\s+Inc\.|\s+Corporation|\s+Corp\.|\s+Company|\s+Ltd\.|\s+plc|\s+N\.A\.))")
SYNTHETIC = re.compile(r"\bNOT\s+AN\s+SEC\s+FILING\b|\bSYNTHETIC\b[^.]{0,40}\bFICTIONAL\s+COMPANY\b", re.I)
UNITS = re.compile(r"\(\$\s+in\s+millions(?:,\s*except\s+per[- ]share\s+data)?\)\s+(FY\s?\d{4})", re.I)
NUMBER = r"\$?\s*\(?([\d,]+\.\d+)\)?"
ROWS = (
    ("Revenue", r"(?:Total\s+)?(?:net\s+)?revenues?", "USD millions"),
    ("Operating income", r"Operating\s+income", "USD millions"),
    ("Net income", r"Net\s+income", "USD millions"),
    ("Diluted EPS", r"Diluted\s+earnings\s+per\s+share", "USD per share"),
)


def _raw(run_dir: Path) -> str:
    for name in SOURCES:
        path = run_dir / name
        if path.is_file():
            return path.read_text(encoding="utf-8", errors="replace")
    return ""


def _plain(raw: str) -> str:
    text = re.sub(r"<(script|style)\b.*?</\1>", " ", raw, flags=re.S | re.I)
    return re.sub(r"\s+", " ", html.unescape(re.sub(r"<[^>]+>", " ", text))).strip()


def synthetic_document(raw: str) -> bool:
    """The cover page says the document is synthetic or not an SEC filing."""
    return bool(SYNTHETIC.search(_plain(raw)[:12000]))


def cover_identity(run_dir: Path) -> dict:
    """Form, fiscal year end, trading symbol, registrant, and a synthetic flag from the cover page; empty keys when absent."""
    raw = _raw(run_dir)
    text = _plain(raw)[:12000]
    out: dict = {}
    if synthetic_document(raw):
        out["synthetic"] = True
    if match := FORM.search(text):
        out["form"] = match.group(1).upper()
    if match := PERIOD.search(text):
        try:
            end = datetime.strptime(re.sub(r"\s+", " ", match.group(1)).title(), "%B %d, %Y").date()
            out["period_of_report"], out["fiscal_year"] = end.isoformat(), end.year
        except ValueError:
            pass
        if name := REGISTRANT.search(text[match.end():match.end() + 400]):
            out["name"] = name.group(1).strip(" ,")
    if match := SYMBOL.search(text):
        out["ticker"] = match.group(1).rstrip(".")
    return out


def table_metrics(run_dir: Path) -> list[dict]:
    """Headline income-statement rows for the most recent fiscal year, each with its verbatim table line."""
    raw = _raw(run_dir)
    metrics: list[dict] = []
    for block in re.findall(r"<pre[^>]*>(.*?)</pre>", raw, flags=re.S | re.I) or [raw]:
        header = UNITS.search(block)
        if not header:
            continue
        period = header.group(1).replace(" ", "")
        lines = block.splitlines()
        for label, pattern, unit in ROWS:
            if any(row["label"] == label for row in metrics):
                continue
            for line in lines:
                if match := re.match(rf"\s*{pattern}\s+{NUMBER}", line, flags=re.I):
                    value = float(match.group(1).replace(",", ""))
                    metrics.append({"label": label, "value": value, "unit": unit, "period": period,
                                    "origin": "verbatim-table", "excerpt": line.strip()})
                    break
    return metrics


__all__ = ["cover_identity", "synthetic_document", "table_metrics"]
