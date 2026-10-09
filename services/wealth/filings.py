"""Sections of the fictional issuer's synthetic 10-K (fixtures/halcyon/annual-report-fy2025.html).

The research agent's filings tool: titled sections (Item 1A risk factors, Item 7 MD&A, ...) a claim can
quote verbatim, and a keyword search over them. Only fictional issuers have a filing here; real tickers
get no filings tool (their story is indicators only).
"""
from __future__ import annotations

import re
from functools import lru_cache
from html.parser import HTMLParser

from fixtures import _halcyon, fixtures_root


class _Sections(HTMLParser):
    def __init__(self) -> None:
        super().__init__()
        self.sections: list[dict] = []
        self.item = ""
        self.heading: str | None = None
        self.capture = None
        self.buffer: list[str] = []
        self.skip = 0

    def handle_starttag(self, tag, attrs):
        if tag in {"script", "style"}:
            self.skip += 1
        if tag in {"h2", "h3"}:
            self._flush()
            self.capture = tag
            self.buffer_heading = []
        elif tag in {"p", "li", "td", "th"}:
            self.buffer.append(" ")

    def handle_endtag(self, tag):
        if tag in {"script", "style"}:
            self.skip = max(0, self.skip - 1)
        if tag == self.capture:
            title = re.sub(r"\s+", " ", "".join(self.buffer_heading)).strip()
            if tag == "h2":
                self.item = title
                self.heading = title
            else:
                self.heading = title
            self.capture = None
        elif tag in {"p", "li", "tr"}:
            self.buffer.append(" ")

    def handle_data(self, data):
        if self.skip:
            return
        if self.capture:
            self.buffer_heading.append(data)
        else:
            self.buffer.append(data)

    def _flush(self):
        text = re.sub(r"\s+", " ", "".join(self.buffer)).strip()
        if self.heading and len(text) > 80:
            item = self.item.split(".")[0].strip()
            title = self.heading if self.heading == self.item else f"{item} · {self.heading}"
            slug = re.sub(r"[^a-z0-9]+", "-", title.lower()).strip("-")[:60]
            self.sections.append({"slug": slug, "item": item, "title": title, "text": text})
        self.buffer = []

    def close(self):
        super().close()
        self._flush()


@lru_cache(maxsize=4)
def _parse(path: str) -> tuple[dict, ...]:
    try:
        with open(path, encoding="utf-8") as handle:
            html = handle.read()
    except OSError:
        return ()
    parser = _Sections()
    parser.feed(html)
    parser.close()
    return tuple(parser.sections)


def sections(ticker: str) -> list[dict]:
    issuer = _halcyon("issuer.json")
    if not isinstance(issuer, dict) or str(issuer.get("ticker", "")).upper() != ticker.upper() or not issuer.get("annual_report"):
        return []
    path = fixtures_root().parent / issuer["annual_report"]
    return [dict(row) for row in _parse(str(path))]


def search(ticker: str, query: str, limit: int = 3) -> list[dict]:
    words = {word for word in re.findall(r"[a-z]{3,}", query.lower())}
    scored = []
    for row in sections(ticker):
        haystack = (row["title"] + " " + row["text"]).lower()
        score = sum(haystack.count(word) for word in words) + 3 * sum(1 for word in words if word in row["title"].lower())
        if score:
            scored.append((score, row))
    scored.sort(key=lambda pair: -pair[0])
    return [row for _score, row in scored[:limit]]


__all__ = ["search", "sections"]
