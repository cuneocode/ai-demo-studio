"""Shared run timeline for every demo service (docs/plans/fsi-demo-redesign.md, Appendix B).

A run is an ordered list of events: plan, tool calls, model calls, guardrail and control
verdicts, human decisions, and the result. The studio polls
GET /api/<svc>/runs/{id}?after=n while the run executes, and replays recorded runs
(services/<svc>/data/recorded/<name>.json) at their original pacing when the live
path is down. The event shape is a superset of services/interbank/lab/events.py, so
the same timeline renders either.

Two ways to run:
  * Attach: an existing endpoint accepts a client-chosen run_id, opens it with
    store.open(run_id), and emits while it works. The browser polls in parallel.
  * Start: POST /api/<svc>/runs with {scenario, input}; the service's start handler
    runs in the background and may await store.wait_decision() for a human.

Standard library only (FastAPI is imported only by router()). No `from __future__ import
annotations`: FastAPI must resolve the request models router() defines locally.
"""
import asyncio
import json
import re
import time
import uuid
from contextlib import contextmanager
from contextvars import ContextVar
from dataclasses import dataclass, field
from datetime import UTC, datetime
from pathlib import Path
from typing import Any, Awaitable, Callable, Iterator

SCHEMA_VERSION = 1
KINDS = frozenset({
    "run", "agent.thinking", "agent.tool_call", "agent.message", "tool.result", "llm.call", "guardrail",
    "control", "hitl.request", "hitl.decision", "model.failover", "claim.verdict", "result",
    # interbank kinds, rendered by the same timeline
    "a2a.send", "a2a.receive", "a2a.reply", "a2a.respond", "a2a.denied", "db.query",
})
STATUSES = frozenset({"info", "started", "ok", "allowed", "flagged", "blocked", "denied", "error"})
LANES = frozenset({"agent", "tools", "model", "security", "human"})
RUN_ID = re.compile(r"^[a-z][a-z0-9-]{5,80}$")
RECORDING = re.compile(r"^[a-z0-9][a-z0-9-]{1,80}$")
REDACT = frozenset({"authorization", "api_key", "apikey", "token", "secret", "password", "x-cisco-ai-defense-api-key"})
MAX_BODY = 24_000
MAX_EVENTS = 2_000


def redact(value: Any) -> Any:
    """Drops credential-named keys at any depth and truncates long strings."""
    if isinstance(value, dict):
        return {str(k): redact(v) for k, v in value.items() if str(k).lower() not in REDACT}
    if isinstance(value, (list, tuple)):
        return [redact(v) for v in value]
    if isinstance(value, str) and len(value) > MAX_BODY:
        return value[:MAX_BODY] + "…"
    return value


def _now() -> str:
    return datetime.now(UTC).isoformat()


def new_run_id(prefix: str) -> str:
    stamp = datetime.now(UTC).strftime("%Y%m%d-%H%M%S")
    return f"{prefix}-{stamp}-{uuid.uuid4().hex[:6]}"


def _default_lane(kind: str) -> str:
    if kind in {"guardrail", "control", "claim.verdict"}:
        return "security"
    if kind in {"hitl.request", "hitl.decision"}:
        return "human"
    if kind in {"llm.call", "model.failover"}:
        return "model"
    if kind in {"agent.tool_call", "tool.result", "db.query"}:
        return "tools"
    return "agent"


@dataclass
class Run:
    id: str
    service: str
    label: str = ""
    scenario: str | None = None
    status: str = "running"  # running | completed | blocked | failed
    started_at: str = field(default_factory=_now)
    finished_at: str | None = None
    started_ns: int = field(default_factory=time.monotonic_ns)
    events: list[dict] = field(default_factory=list)
    result: dict | None = None
    meta: dict = field(default_factory=dict)
    decisions: dict[str, asyncio.Future] = field(default_factory=dict)

    def public(self) -> dict:
        return {"id": self.id, "service": self.service, "label": self.label, "scenario": self.scenario,
                "status": self.status, "started_at": self.started_at, "finished_at": self.finished_at,
                "meta": self.meta, "result": self.result if self.status != "running" else None}


_current: ContextVar[tuple["RunStore", str] | None] = ContextVar("studio_current_run", default=None)


class RunStore:
    """Runs persisted as metadata and an append-only event journal in the package's data volume."""

    def __init__(self, service: str, *, component: str, cache_dir: Path | None = None,
                 recordings_dir: Path | None = None, keep: int = 50):
        self.service = service
        self.component = component
        self.cache_dir = cache_dir
        self.recordings_dir = recordings_dir
        self.keep = keep
        self._runs: dict[str, Run] = {}
        self._restore()

    def _restore(self) -> None:
        if not self.cache_dir or not self.cache_dir.is_dir():
            return
        for path in sorted(self.cache_dir.glob("*.json"), key=lambda item: item.stat().st_mtime)[-self.keep:]:
            try:
                saved = json.loads(path.read_text()).get("run", {})
                if saved.get("service") != self.service or not RUN_ID.fullmatch(saved.get("id", "")):
                    continue
                journal = path.with_suffix(".jsonl")
                events = [json.loads(line) for line in journal.read_text().splitlines()] if journal.exists() else []
                run = Run(id=saved["id"], service=self.service, label=saved.get("label", ""),
                          scenario=saved.get("scenario"), status=saved.get("status", "failed"),
                          started_at=saved["started_at"], finished_at=saved.get("finished_at"),
                          meta=saved.get("meta") or {}, result=saved.get("result"), events=events[-MAX_EVENTS:])
                self._runs[run.id] = run
                if run.status == "running":
                    last_ns = max((event.get("ns", 0) for event in events), default=0)
                    run.started_ns = time.monotonic_ns() - last_ns
                    self.emit(run.id, "run", "Service restarted during this run", status="error")
                    self.finish(run.id, "failed")
            except (OSError, ValueError, TypeError, KeyError):
                continue

    def _persist(self, run: Run) -> None:
        if not self.cache_dir:
            return
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        destination = self.cache_dir / f"{run.id}.json"
        temporary = destination.with_suffix(".tmp")
        temporary.write_text(json.dumps({"v": SCHEMA_VERSION, "run": redact(run.public())}, default=str) + "\n")
        temporary.replace(destination)

    # ------------------------------------------------------------ lifecycle ----
    def open(self, run_id: str | None = None, *, label: str = "", scenario: str | None = None,
             meta: dict | None = None, prefix: str | None = None) -> Run:
        """Creates a run. A client-chosen id must be new and well formed; otherwise a fresh id is used."""
        if not run_id or not RUN_ID.fullmatch(run_id) or run_id in self._runs:
            run_id = new_run_id(prefix or self.service)
        run = Run(id=run_id, service=self.service, label=label[:200], scenario=scenario, meta=redact(meta or {}))
        self._runs[run_id] = run
        self._persist(run)
        while len(self._runs) > self.keep:
            oldest = next(iter(self._runs))
            if self._runs[oldest].status == "running" and oldest != run_id:
                break
            self._runs.pop(oldest)
        return run

    def get(self, run_id: str) -> Run | None:
        return self._runs.get(run_id)

    def runs(self) -> list[dict]:
        return [run.public() for run in reversed(self._runs.values())]

    def emit(self, run_id: str, kind: str, title: str, *, status: str = "info", lane: str | None = None,
             component: str | None = None, source: str | None = None, target: str | None = None,
             body: str | None = None, data: dict | None = None) -> dict | None:
        run = self._runs.get(run_id)
        if run is None or len(run.events) >= MAX_EVENTS:
            return None
        event = {
            "v": SCHEMA_VERSION,
            "id": str(uuid.uuid4()),
            "at": _now(),
            "ns": time.monotonic_ns() - run.started_ns,
            "run_id": run_id,
            "component": component or self.component,
            "kind": kind if kind in KINDS else "agent.message",
            "status": status if status in STATUSES else "info",
            "title": title[:300],
            "lane": lane if lane in LANES else _default_lane(kind),
            "source": source,
            "target": target,
            "body": redact(body) if isinstance(body, str) else None,
            "data": redact(data or {}),
        }
        run.events.append(event)
        self._mirror(run, event)
        self._persist(run)
        return event

    def finish(self, run_id: str, status: str = "completed", result: dict | None = None) -> None:
        run = self._runs.get(run_id)
        if run is None:
            return
        run.status = status if status in {"completed", "blocked", "failed"} else "completed"
        run.finished_at = _now()
        if result is not None:
            run.result = redact(result)
        self._persist(run)
        for future in run.decisions.values():
            if not future.done():
                future.cancel()

    @contextmanager
    def bind(self, run_id: str) -> Iterator[None]:
        """Makes emit_current() write to this run for the duration of the block."""
        token = _current.set((self, run_id))
        try:
            yield
        finally:
            _current.reset(token)

    def page(self, run_id: str, after: int = 0) -> dict | None:
        run = self._runs.get(run_id)
        if run is None:
            return None
        after = max(0, int(after))
        return {"run": run.public(), "events": run.events[after:], "total": len(run.events)}

    # ----------------------------------------------------------------- HITL ----
    async def wait_decision(self, run_id: str, request_id: str, *, timeout: float = 600) -> dict:
        """Waits for POST /runs/{id}/decision with this request_id. Emit a hitl.request first."""
        run = self._runs[run_id]
        future = run.decisions.setdefault(request_id, asyncio.get_running_loop().create_future())
        return await asyncio.wait_for(future, timeout)

    def decide(self, run_id: str, request_id: str, decision: dict) -> bool:
        run = self._runs.get(run_id)
        future = run.decisions.get(request_id) if run else None
        if future is None or future.done():
            return False
        clean = redact(decision)
        self.emit(run_id, "hitl.decision", f"{clean.get('by') or 'Reviewer'} · {clean.get('decision', 'decided')}",
                  status="ok" if clean.get("decision") in {"approve", "approved"} else "info",
                  data={"request_id": request_id, **clean})
        future.set_result(clean)
        return True

    # ----------------------------------------------------------- recordings ----
    def recordings(self) -> list[dict]:
        if not self.recordings_dir or not self.recordings_dir.is_dir():
            return []
        items = []
        for path in sorted(self.recordings_dir.glob("*.json")):
            doc = _read_json(path)
            if not doc:
                continue
            events = doc.get("events") or []
            items.append({
                "name": path.stem, "title": doc.get("title") or path.stem, "scenario": doc.get("scenario"),
                "recorded_at": doc.get("recorded_at"), "served_by": doc.get("served_by"),
                "events": len(events), "duration_ms": _duration_ms(events), "synthetic": bool(doc.get("synthetic")),
            })
        return items

    def recording(self, name: str) -> dict | None:
        if not self.recordings_dir or not RECORDING.fullmatch(name):
            return None
        return _read_json(self.recordings_dir / f"{name}.json")

    def record_golden(self, run_id: str, name: str, *, title: str = "", synthetic: bool = False) -> Path:
        """Copies a finished run into data/recorded/ after a person has reviewed it."""
        run = self._runs[run_id]
        if not self.recordings_dir or not RECORDING.fullmatch(name):
            raise ValueError("No recordings directory, or an invalid recording name.")
        served = next((e["data"].get("served_by") for e in reversed(run.events) if e["data"].get("served_by")), None)
        doc = {"v": SCHEMA_VERSION, "name": name, "title": title or run.label, "scenario": run.scenario,
               "recorded_at": run.finished_at or _now(), "served_by": served, "synthetic": synthetic,
               "run": run.public(), "events": run.events, "result": run.result}
        self.recordings_dir.mkdir(parents=True, exist_ok=True)
        path = self.recordings_dir / f"{name}.json"
        path.write_text(json.dumps(redact(doc), indent=1, default=str) + "\n", encoding="utf-8")
        return path

    def _mirror(self, run: Run, event: dict) -> None:
        if not self.cache_dir:
            return
        try:
            self.cache_dir.mkdir(parents=True, exist_ok=True)
            with (self.cache_dir / f"{run.id}.jsonl").open("a", encoding="utf-8") as handle:
                handle.write(json.dumps(event, default=str) + "\n")
        except OSError:
            pass


def _read_json(path: Path) -> dict | None:
    try:
        data = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return None
    return data if isinstance(data, dict) else None


def _duration_ms(events: list[dict]) -> int | None:
    stamps = [e.get("ns") for e in events if isinstance(e.get("ns"), int)]
    return round(max(stamps) / 1_000_000) if stamps else None


def emit_current(kind: str, title: str, **kwargs: Any) -> dict | None:
    """Emits into the run bound with store.bind(); a no-op outside a run."""
    bound = _current.get()
    if not bound:
        return None
    store, run_id = bound
    return store.emit(run_id, kind, title, **kwargs)


def emit_model_call(served_by: dict, *, title: str | None = None, latency_ms: int | None = None,
                    input_tokens: int | None = None, output_tokens: int | None = None, status: str = "ok") -> None:
    """A model.failover event when the chain fell back, then the llm.call itself."""
    label = served_by.get("label") or served_by.get("provider") or "model"
    if served_by.get("fallback"):
        emit_current("model.failover", f"Model fallback · answered by {label}", status="flagged",
                     body=served_by.get("reason") or None, data={"served_by": served_by})
    emit_current("llm.call", title or f"{served_by.get('model') or 'Model'} · {label}", status=status,
                 data={"served_by": served_by, "latency_ms": latency_ms,
                       "input_tokens": input_tokens, "output_tokens": output_tokens})


def current_run_id() -> str | None:
    bound = _current.get()
    return bound[1] if bound else None


StartHandler = Callable[[Run, dict], Awaitable[dict | None]]


def router(store: RunStore, prefix: str, start: StartHandler | None = None):
    """GET runs/{id}?after=n, GET recordings[/{name}], POST runs (when start is given), POST runs/{id}/decision."""
    from fastapi import APIRouter, HTTPException
    from pydantic import BaseModel, Field

    class StartRequest(BaseModel):
        scenario: str | None = Field(default=None, max_length=80)
        run_id: str | None = Field(default=None, max_length=90)
        label: str | None = Field(default=None, max_length=200)
        input: dict = Field(default_factory=dict)

    class DecisionRequest(BaseModel):
        request_id: str = Field(min_length=1, max_length=80)
        decision: str = Field(min_length=1, max_length=40)
        by: str | None = Field(default=None, max_length=80)
        note: str | None = Field(default=None, max_length=2000)

    api = APIRouter(prefix=prefix)

    @api.get("/runs")
    async def list_runs():
        return {"runs": store.runs()}

    @api.get("/runs/{run_id}")
    async def get_run(run_id: str, after: int = 0):
        page = store.page(run_id, after)
        if page is None:
            raise HTTPException(404, "Unknown run.")
        return page

    @api.post("/runs/{run_id}/decision")
    async def decide(run_id: str, request: DecisionRequest):
        if not store.decide(run_id, request.request_id, request.model_dump(exclude_none=True)):
            raise HTTPException(409, "Nothing is waiting for that decision.")
        return store.page(run_id, 0)["run"]

    @api.get("/recordings")
    async def list_recordings():
        return {"recordings": store.recordings()}

    @api.get("/recordings/{name}")
    async def get_recording(name: str):
        doc = store.recording(name)
        if doc is None:
            raise HTTPException(404, "Unknown recording.")
        return doc

    if start is not None:
        @api.post("/runs")
        async def start_run(request: StartRequest):
            run = store.open(request.run_id, label=request.label or request.scenario or "", scenario=request.scenario)

            async def work():
                with store.bind(run.id):
                    try:
                        result = await start(run, request.input)
                        if run.status == "running":
                            store.finish(run.id, "completed", result)
                    except Exception as exc:  # the timeline shows the failure; the service keeps serving
                        store.emit(run.id, "run", "Run failed", status="error", body=type(exc).__name__)
                        store.finish(run.id, "failed")

            asyncio.get_running_loop().create_task(work())
            return {"run_id": run.id, "run": run.public()}

    return api
