"""Deterministic briefing tools. EDGAR/upload I/O never enters Inspection."""
from __future__ import annotations

import json
from contextvars import ContextVar
from dataclasses import dataclass, field
from pathlib import Path

from langchain_core.tools import tool

import documents
import edgar
import navigator
import xbrl

MAX_NODE_READS = 8
DEFAULT_NODE_CHARS = 6000

SUPERVISOR_TOOL_NAMES = (
    "resolve_company",
    "fetch_annual_report",
    "extract_pdf_text",
    "build_filing_toc",
    "get_company_facts",
)
THEME_TOOL_NAMES = ("list_filing_toc", "read_filing_node")
METRICS_TOOL_NAMES = ("get_company_facts",)


@dataclass
class BriefingSession:
    run_id: str
    run_dir: Path
    path: str
    query: str | None = None
    cik: str | None = None
    ticker: str | None = None
    name: str | None = None
    filename: str | None = None
    accession: str | None = None
    form: str | None = None
    filed_at: str | None = None
    period_of_report: str | None = None
    fiscal_year: int | None = None
    source_url: str | None = None
    synthetic: bool = False
    current_theme: str | None = None
    nodes_read: list[dict] = field(default_factory=list)
    reads_by_theme: dict[str, int] = field(default_factory=dict)
    tools_used: list[str] = field(default_factory=list)
    company_facts: list[dict] = field(default_factory=list)
    meta: dict = field(default_factory=dict)


session_var: ContextVar[BriefingSession | None] = ContextVar("briefing_session", default=None)


def current_session() -> BriefingSession:
    session = session_var.get()
    if session is None:
        raise RuntimeError("No briefing session is active.")
    return session


def record_tool(name: str) -> BriefingSession:
    session = current_session()
    session.tools_used.append(name)
    return session


def _write_json(path: Path, payload) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(payload, indent=2), encoding="utf-8")


def write_meta(session: BriefingSession) -> None:
    meta = {
        "source": session.path,
        "filename": session.filename,
        "form": session.form,
        "filedAt": session.filed_at,
        "periodOfReport": session.period_of_report,
        "accession": session.accession,
        "url": session.source_url,
        "cik": session.cik,
        "ticker": session.ticker,
        "name": session.name,
        "fiscalYear": session.fiscal_year,
    }
    session.meta = meta
    _write_json(session.run_dir / "meta.json", meta)


def apply_identity(session: BriefingSession, company: dict, filing: dict | None = None) -> None:
    session.cik = company.get("cik") or session.cik
    session.ticker = company.get("ticker") or session.ticker
    session.name = company.get("name") or session.name
    if filing:
        session.form = filing.get("form")
        session.filed_at = filing.get("filed_at")
        session.period_of_report = filing.get("period_of_report")
        session.fiscal_year = filing.get("fiscal_year")
        session.accession = filing.get("accession")
        session.source_url = filing.get("url")
        session.name = filing.get("name") or session.name
        session.ticker = filing.get("ticker") or session.ticker
        session.cik = filing.get("cik") or session.cik
    write_meta(session)


@tool
def resolve_company(query: str) -> str:
    """Resolve a US-listed ticker or company name to CIK, ticker, and name via the SEC ticker catalog."""
    session = record_tool("resolve_company")
    try:
        company = edgar.resolve_company(query=query, cik=None)
    except edgar.AmbiguousIssuer as exc:
        return json.dumps({"error": str(exc), "candidates": exc.candidates})
    except edgar.EdgarError as exc:
        return json.dumps({"error": str(exc), "status": exc.status})
    apply_identity(session, company)
    return json.dumps(company)


@tool
def fetch_annual_report(cik: str) -> str:
    """Download the newest 10-K, else 20-F, else 40-F, into /filings/source.html and write /filings/meta.json."""
    session = record_tool("fetch_annual_report")
    if session.path == "upload":
        return "Upload path: the staged filing is the document. Do not replace it with an EDGAR download."
    try:
        filing = edgar.latest_annual_report(cik)
        body, suffix = edgar.download_filing(filing)
    except edgar.EdgarError as exc:
        return json.dumps({"error": str(exc), "status": exc.status})
    target = session.run_dir / f"source{suffix}"
    target.write_bytes(body)
    if suffix in {".htm", ".html", ".txt"}:
        text_name = "source.txt" if suffix == ".txt" else None
        if text_name:
            (session.run_dir / text_name).write_bytes(body)
    apply_identity(session, {"cik": filing["cik"], "ticker": filing.get("ticker"), "name": filing.get("name")}, filing)
    return json.dumps({
        "path": f"/filings/{target.name}",
        "form": filing.get("form"),
        "filedAt": filing.get("filed_at"),
        "periodOfReport": filing.get("period_of_report"),
        "accession": filing.get("accession"),
        "url": filing.get("url"),
    })


@tool
def extract_pdf_text() -> str:
    """Extract the text layer of /filings/source.pdf to /filings/source.txt. Fails if the PDF has no text."""
    session = record_tool("extract_pdf_text")
    pdf = session.run_dir / "source.pdf"
    if not pdf.is_file():
        return "No PDF is staged at /filings/source.pdf."
    existing = session.run_dir / "source.txt"
    if existing.is_file() and existing.stat().st_size > 0:
        return "Text already extracted at /filings/source.txt."
    text = documents.extract_pdf_text(pdf)
    existing.write_text(text, encoding="utf-8")
    return f"Wrote /filings/source.txt ({len(text)} characters)."


@tool
def build_filing_toc(source_path: str = "/filings/source.html") -> str:
    """Parse Item 1/1A/1C/7/8 (and titled sub-nodes) into /filings/toc.json and /filings/nodes/{id}.md."""
    session = record_tool("build_filing_toc")
    toc = navigator.build_filing_toc(session.run_dir, session.meta)
    return json.dumps({"nodes": len(toc.get("nodes") or []), "path": "/filings/toc.json"})


@tool
def get_company_facts(cik: str, fy: int | None = None) -> str:
    """Return allowlisted XBRL company facts for a fiscal year. Do not invent or compute figures."""
    session = record_tool("get_company_facts")
    year = fy or session.fiscal_year
    try:
        facts = xbrl.get_company_facts(cik, fy=year, accession=session.accession)
    except edgar.EdgarError as exc:
        return json.dumps({"error": str(exc), "status": exc.status})
    session.company_facts = facts
    (session.run_dir / "facts.json").write_text(json.dumps(facts, indent=2), encoding="utf-8")
    return json.dumps(facts)


@tool
def list_filing_toc() -> str:
    """List titled filing nodes from /filings/toc.json. Use this before read_filing_node."""
    session = record_tool("list_filing_toc")
    path = session.run_dir / "toc.json"
    if not path.is_file():
        toc = navigator.build_filing_toc(session.run_dir, session.meta)
        return json.dumps(toc)
    return path.read_text(encoding="utf-8")


@tool
def read_filing_node(node_id: str, max_chars: int = DEFAULT_NODE_CHARS) -> str:
    """Read one TOC node. Budget: at most 8 nodes per specialist. Never dump an entire Item."""
    session = record_tool("read_filing_node")
    theme = session.current_theme or "theme"
    used = session.reads_by_theme.get(theme, 0)
    if used >= MAX_NODE_READS:
        return f"Node read budget exceeded ({MAX_NODE_READS}). Use nodes already read."
    try:
        text = navigator.node_body(session.run_dir, node_id)
    except FileNotFoundError:
        return f"Unknown filing node: {node_id}"
    session.reads_by_theme[theme] = used + 1
    limit = max(500, min(int(max_chars or DEFAULT_NODE_CHARS), 12000))
    clipped = text[:limit]
    session.nodes_read.append({"id": node_id, "theme": theme, "chars": len(clipped)})
    return clipped


def bound_read_filing_node(theme: str):
    @tool("read_filing_node")
    def themed_read_filing_node(node_id: str, max_chars: int = DEFAULT_NODE_CHARS) -> str:
        """Read one TOC node. Budget: at most 8 nodes per specialist."""
        session = session_var.get()
        if session:
            session.current_theme = theme
        return read_filing_node.invoke({"node_id": node_id, "max_chars": max_chars})

    return themed_read_filing_node


def supervisor_tools():
    return [resolve_company, fetch_annual_report, extract_pdf_text, build_filing_toc, get_company_facts]


def theme_tools(theme: str):
    return [list_filing_toc, bound_read_filing_node(theme)]


def metrics_tools():
    return [get_company_facts]
