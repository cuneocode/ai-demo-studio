"""Deep Agent factory: supervisor plans and delegates; it never reads node bodies."""
from __future__ import annotations

import inspect
import json
import shutil
from pathlib import Path

from pydantic import BaseModel, Field, model_validator

from cover import table_metrics
from grounding import ground_briefing
from model_backend import model_settings
from security import ProtectedChatOpenAI
from subagents import theme_subagents
from tools import session_var, supervisor_tools

BRIEFING_PROMPT = """You are the company-briefing supervisor for a financial-services demo studio.

Follow the Deep Research pattern:
1. write_todos for resolve/ingest, TOC, five specialists, assemble.
2. Use only identity, ingest, TOC, and XBRL tools. Never call read_filing_node.
3. Never dump Item 1A or any node body into your own context. Delegate.
4. Disable any urge to browse the web or run shell commands. There is no execute tool and no web search.
5. Do not use a general-purpose subagent. Task only: objectives, risks, regulatory, ai_initiatives, metrics.
6. After specialists write /filings/notes/{theme}.json, assemble CompanyBriefing from those notes plus get_company_facts. Do not re-read node bodies.
7. Every narrative fact needs a verbatim excerpt. If a specialist abstains, keep the abstain.
8. Metrics come from XBRL company facts, not arithmetic.
9. Content perimeter: the selected EDGAR accession or the uploaded file only.

If the user says a filing is already at /filings/, do not call fetch_annual_report.
If the user says no file, resolve the issuer and fetch the latest annual report, then build the TOC.
Temperature is 0: be precise and refuse to guess.
"""

SKILLS_SOURCE = Path(__file__).resolve().parent / "skills" / "extract-10k"


class AgentIncomplete(RuntimeError):
    """Raised when ainvoke finished without ingesting or navigating a filing."""


class _Lenient(BaseModel):
    """The model sometimes sends null for a field it could not fill; treat that as absent."""

    @model_validator(mode="before")
    @classmethod
    def _drop_nulls(cls, data):
        return {key: value for key, value in data.items() if value is not None} if isinstance(data, dict) else data


class CompanyIdentity(_Lenient):
    name: str = ""
    ticker: str | None = None
    cik: str | None = None


class PeriodInfo(_Lenient):
    form: str | None = None
    filed_at: str | None = Field(default=None, alias="filedAt")
    period_of_report: str | None = Field(default=None, alias="periodOfReport")
    fiscal_year: int | None = Field(default=None, alias="fiscalYear")

    model_config = {"populate_by_name": True}


class SourceInfo(_Lenient):
    kind: str = "edgar"
    label: str = ""
    url: str | None = None
    filename: str | None = None
    accession: str | None = None


class CitationFact(_Lenient):
    text: str = ""
    item: str = ""
    node_id: str = ""
    excerpt: str = ""
    source_url: str = ""


class ThemeSection(_Lenient):
    status: str = "abstain"
    reason: str | None = None
    facts: list[CitationFact] = Field(default_factory=list)


class MetricItem(_Lenient):
    label: str
    value: float | int | str | None = None
    unit: str | None = None
    period: str | None = None
    concept: str | None = None
    accession: str | None = None
    origin: str = "absent"
    excerpt: str | None = None
    node_id: str | None = None


class CompanyBriefing(_Lenient):
    company: CompanyIdentity = Field(default_factory=CompanyIdentity)
    period: PeriodInfo = Field(default_factory=PeriodInfo)
    source: SourceInfo = Field(default_factory=SourceInfo)
    objectives: ThemeSection = Field(default_factory=ThemeSection)
    risks: ThemeSection = Field(default_factory=ThemeSection)
    regulatory: ThemeSection = Field(default_factory=ThemeSection)
    ai_initiatives: ThemeSection = Field(default_factory=ThemeSection)
    metrics: list[MetricItem] = Field(default_factory=list)


_HARNESS_READY = False


def apply_briefing_harness() -> None:
    global _HARNESS_READY
    if _HARNESS_READY:
        return
    from deepagents import GeneralPurposeSubagentProfile, HarnessProfile, register_harness_profile

    register_harness_profile(
        "openai",
        HarnessProfile(
            excluded_tools=frozenset({"execute"}),
            general_purpose_subagent=GeneralPurposeSubagentProfile(enabled=False),
        ),
    )
    _HARNESS_READY = True


def stage_skill(run_dir: Path) -> None:
    dest = run_dir / "skills" / "extract-10k"
    dest.mkdir(parents=True, exist_ok=True)
    source = SKILLS_SOURCE / "SKILL.md"
    if source.is_file():
        shutil.copy2(source, dest / "SKILL.md")


def _filesystem_middleware(backend):
    try:
        from deepagents.middleware import FilesystemMiddleware
    except Exception:
        try:
            from deepagents.middleware.filesystem import FilesystemMiddleware
        except Exception:
            return None
    try:
        return FilesystemMiddleware(
            backend=backend,
            tools=["ls", "read_file", "write_file", "glob", "grep"],
        )
    except TypeError:
        return FilesystemMiddleware(backend=backend)


def _todo_middleware():
    for target in (
        "langchain.agents.middleware.TodoListMiddleware",
        "langchain.agents.middleware.todo.TodoListMiddleware",
    ):
        module_name, _, attr = target.rpartition(".")
        try:
            module = __import__(module_name, fromlist=[attr])
            cls = getattr(module, attr)
            return cls()
        except Exception:
            continue
    return None


def _supervisor_permissions():
    try:
        from deepagents import FilesystemPermission
    except Exception:
        try:
            from deepagents.middleware.filesystem import FilesystemPermission
        except Exception:
            return None
    return [
        FilesystemPermission(operations=["read"], paths=["/filings/nodes/**"], mode="deny"),
    ]


def protected_model():
    return ProtectedChatOpenAI(
        **model_settings(),
        temperature=0,
        timeout=120,
        max_retries=1,
        streaming=False,
        disable_streaming=True,
    )


def build_backend(run_dir: Path):
    from deepagents.backends import CompositeBackend, FilesystemBackend, StateBackend

    try:
        filings = FilesystemBackend(root_dir=str(run_dir), virtual_mode=True, max_file_size_mb=50)
    except TypeError:
        filings = FilesystemBackend(root_dir=str(run_dir), virtual_mode=True)
    return CompositeBackend(default=StateBackend(), routes={"/filings/": filings})


def _create_deep_agent(**kwargs):
    from deepagents import create_deep_agent

    return create_deep_agent(**kwargs)


def build_agent(run_dir: Path):
    apply_briefing_harness()
    stage_skill(run_dir)
    backend = build_backend(run_dir)
    model = protected_model()
    middleware = []
    todo = _todo_middleware()
    if todo is not None:
        middleware.append(todo)
    fs = _filesystem_middleware(backend)
    if fs is not None:
        middleware.append(fs)
    kwargs = {
        "model": model,
        "tools": supervisor_tools(),
        "system_prompt": BRIEFING_PROMPT,
        "subagents": theme_subagents(model),
        "backend": backend,
        "response_format": CompanyBriefing,
        "name": "company-briefing",
        "skills": ["/filings/skills/"],
    }
    if middleware:
        kwargs["middleware"] = middleware
    permissions = _supervisor_permissions()
    if permissions:
        kwargs["permissions"] = permissions
    from deepagents import create_deep_agent

    accepted = set(inspect.signature(create_deep_agent).parameters)
    return _create_deep_agent(**{key: value for key, value in kwargs.items() if key in accepted})


def _theme_from_notes(run_dir: Path, theme: str) -> dict:
    path = run_dir / "notes" / f"{theme}.json"
    if not path.is_file():
        return {"status": "abstain", "reason": "Specialist did not write notes.", "facts": []}
    try:
        payload = json.loads(path.read_text(encoding="utf-8"))
    except json.JSONDecodeError:
        return {"status": "abstain", "reason": "Specialist notes were not valid JSON.", "facts": []}
    if theme == "metrics":
        return payload
    facts = payload.get("facts") if isinstance(payload, dict) else None
    if not isinstance(facts, list):
        facts = []
    status = payload.get("status") if isinstance(payload, dict) else "abstain"
    return {
        "status": status or ("extracted" if facts else "abstain"),
        "reason": payload.get("reason") if isinstance(payload, dict) else None,
        "facts": facts,
    }


def _dump(model: BaseModel) -> dict:
    return model.model_dump(by_alias=True)


def assemble_briefing(session, structured=None) -> dict:
    run_dir = session.run_dir
    data = {}
    if structured is not None:
        if isinstance(structured, BaseModel):
            data = _dump(structured)
        elif isinstance(structured, dict):
            data = dict(structured)
    notes = {theme: _theme_from_notes(run_dir, theme) for theme in ("objectives", "risks", "regulatory", "ai_initiatives")}
    for theme, section in notes.items():
        if section.get("facts") or section.get("status") == "abstain":
            data[theme] = section
    metrics_notes = _theme_from_notes(run_dir, "metrics")
    xbrl_facts = list(session.company_facts or [])
    if not xbrl_facts:
        facts_path = run_dir / "facts.json"
        if facts_path.is_file():
            try:
                loaded = json.loads(facts_path.read_text(encoding="utf-8"))
                if isinstance(loaded, list):
                    xbrl_facts = loaded
                    session.company_facts = loaded
            except json.JSONDecodeError:
                xbrl_facts = []
    table = table_metrics(run_dir) if session.path == "upload" and not xbrl_facts else []
    if xbrl_facts:
        data["metrics"] = xbrl_facts
    elif table:
        data["metrics"] = table
    elif isinstance(metrics_notes, dict) and isinstance(metrics_notes.get("items"), list):
        data["metrics"] = metrics_notes["items"]
    data.setdefault("company", {
        "name": session.name or "",
        "ticker": session.ticker,
        "cik": session.cik,
    })
    if not data["company"].get("name"):
        data["company"] = {
            "name": session.name or "",
            "ticker": session.ticker,
            "cik": session.cik,
        }
    for key, value in (("name", session.name), ("ticker", session.ticker), ("cik", session.cik)):
        if value and not data["company"].get(key):
            data["company"][key] = value
    data["period"] = {
        "form": session.form,
        "filedAt": session.filed_at,
        "periodOfReport": session.period_of_report,
        "fiscalYear": session.fiscal_year,
    }
    if session.path == "upload":
        label = f"Uploaded · {session.filename or 'annual report'}"
        data["source"] = {
            "kind": "upload",
            "label": label,
            "url": None,
            "filename": session.filename,
            "accession": None,
        }
    else:
        data["source"] = {
            "kind": "edgar",
            "label": session.accession or "EDGAR",
            "url": session.source_url,
            "filename": None,
            "accession": session.accession,
        }
    return ground_briefing(data, run_dir, xbrl_facts)


def _structured(result) -> object | None:
    if not isinstance(result, dict):
        return None
    for key in ("structured_response", "response", "output"):
        if result.get(key) is not None:
            return result[key]
    return None


def _todos(result) -> list:
    if not isinstance(result, dict):
        return []
    todos = result.get("todos") or []
    if isinstance(todos, list):
        cleaned = []
        for item in todos:
            if isinstance(item, dict):
                cleaned.append({
                    "content": item.get("content") or item.get("text") or "",
                    "status": item.get("status"),
                })
            else:
                cleaned.append({"content": str(item), "status": None})
        return cleaned
    return []


def require_agent_completed(session) -> None:
    """Refuse a hollow identity-only payload when ainvoke did no filing work."""
    source_names = ("source.pdf", "source.html", "source.htm", "source.txt")
    if not any((session.run_dir / name).is_file() for name in source_names):
        raise AgentIncomplete("The briefing agent did not ingest a filing.")
    toc = session.run_dir / "toc.json"
    notes_dir = session.run_dir / "notes"
    notes = list(notes_dir.glob("*.json")) if notes_dir.is_dir() else []
    used = set(session.tools_used)
    navigated = toc.is_file() or bool({"build_filing_toc", "list_filing_toc"} & used) or bool(notes)
    if session.path == "edgar" and "fetch_annual_report" not in used:
        fetched = any((session.run_dir / name).is_file() for name in ("source.html", "source.htm", "source.txt", "source.pdf"))
        if not fetched:
            raise AgentIncomplete("The briefing agent did not fetch the annual report.")
    if not navigated:
        raise AgentIncomplete("The briefing agent did not navigate the filing.")


async def run_briefing(session, user_text: str) -> dict:
    graph = build_agent(session.run_dir)
    if graph is None or not hasattr(graph, "ainvoke"):
        raise AgentIncomplete("The Deep Agent graph was not constructed.")
    token = session_var.set(session)
    try:
        result = await graph.ainvoke({"messages": [{"role": "user", "content": user_text}]})
    finally:
        session_var.reset(token)
    require_agent_completed(session)
    briefing = assemble_briefing(session, _structured(result))
    briefing["trail"] = {
        "path": session.path,
        "todos": _todos(result),
        "nodes_read": session.nodes_read,
        "tools": session.tools_used,
    }
    return briefing


def user_message(session) -> str:
    if session.path == "upload":
        staged = next(
            (path.name for path in session.run_dir.glob("source.*") if path.suffix.lower() != ".txt" or not (session.run_dir / "source.pdf").exists()),
            "source",
        )
        if (session.run_dir / "source.pdf").is_file():
            staged = "source.pdf"
        identity = session.query or session.cik or session.filename or "the uploaded issuer"
        return (
            f"Filing already at /filings/{staged}. "
            f"The query is identity only: {identity}. "
            "Do not call fetch_annual_report. "
            "You may call resolve_company for display metadata and get_company_facts if a CIK is known. "
            "Build the TOC, task the five specialists, and assemble CompanyBriefing."
        )
    target = session.ticker or session.query or session.cik
    return (
        f"No file. Resolve {target} and fetch the latest annual report. "
        "Then build the TOC, task the five specialists, and assemble CompanyBriefing. "
        "Do not read filing node bodies yourself."
    )
