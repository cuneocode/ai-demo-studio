"""Local studio adapter for the MIT Galileo banking example.

Production identity, persistence, frontend and backend may evolve; preserve the
studio's ink/navy/cobalt/violet theme. No credentials or raw provider errors leave
this service. AI Defense guards model boundaries; Splunk export requires an
explicit destination. Neither health configuration nor export implies dashboard visibility.
"""
import asyncio
import os
import re
import sys
import time
import uuid
import truststore
truststore.inject_into_ssl()
from pathlib import Path

from dotenv import load_dotenv
from fastapi import FastAPI, HTTPException
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field
from langchain_core.callbacks import AsyncCallbackHandler
from langchain_core.messages import HumanMessage

load_dotenv(Path(os.getenv("BANKING_ENV_FILE", next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / ".env")))
os.environ.setdefault("MODEL_NAME", "gpt-4o-mini")
from security import defense, security_run, SecurityRun, DefenseBlocked, DefenseUnavailable
from telemetry import banking_telemetry
from observability_status import stream_status
from runtime_controls import runtime_controls, ControlRun, ControlsBlocked, ControlsUnavailable
import model_backend
sys.path.append(str(next(parent for parent in Path(__file__).resolve().parents if (parent / "config" / "studio-models.default.json").is_file()) / "services" / "common"))
from runs import RunStore  # noqa: E402
# Recorded scripted-prompt turns (scripts/record_golden.py); served read-only for replay.
recordings = RunStore("banking", component="brahe-bank", recordings_dir=Path(__file__).resolve().parent / "data" / "recorded")
app = FastAPI(docs_url=None, redoc_url=None)
graph = None
graph_signature = None
sessions = {}
startup_error = None
RETRIEVED_DOCUMENT = re.compile(r"^Document \d+ — (.+?):\n", re.M)


class Request(BaseModel):
    message: str = Field(min_length=1, max_length=4000)
    session_id: uuid.UUID | None = None


class ExecutionTrace(AsyncCallbackHandler):
    def __init__(self):
        self.events = []
        self.sources = []
        self.tool_runs = {}
        self.llm_calls = 0
        self.tokens = None

    async def on_llm_end(self, response, **kwargs):
        # Graph model calls only; Agent Control's judge runs outside these callbacks.
        self.llm_calls += 1
        for generation in [item for group in response.generations for item in group]:
            usage = getattr(getattr(generation, "message", None), "usage_metadata", None)
            if usage:
                self.tokens = self.tokens or {"input_tokens": 0, "output_tokens": 0}
                self.tokens["input_tokens"] += int(usage.get("input_tokens") or 0)
                self.tokens["output_tokens"] += int(usage.get("output_tokens") or 0)

    def usage(self):
        return {"llm_calls": self.llm_calls, **(self.tokens or {"input_tokens": None, "output_tokens": None})}

    async def on_tool_start(self, serialized, input_str, *, run_id=None, **kwargs):
        name = serialized.get("name", "tool")
        self.tool_runs[run_id] = name
        self.events.append({"name": name, "kind": "handoff" if "transfer" in name else "tool"})

    async def on_tool_end(self, output, *, run_id=None, **kwargs):
        # Only retrieval results are sources; handoff outputs carry whole conversations that quote them.
        if self.tool_runs.pop(run_id, None) != "pinecone_retrieval":
            return
        parts = RETRIEVED_DOCUMENT.split(str(getattr(output, "content", output)))
        for title, body in zip(parts[1::2], parts[2::2]):
            self.sources.append({"title": title.strip(), "text": body.strip()[:1600]})


def ensure_graph():
    """Rebuild the agents when the studio's model backend for Brahe changes."""
    global graph, graph_signature
    signature = model_backend.signature()
    if graph is not None and graph_signature in (None, signature):
        return
    from src.galileo_langgraph_fsi_agent.agents.supervisor_agent import create_supervisor_agent
    graph = create_supervisor_agent()
    graph_signature = signature
    # Conversations live in the old graph's checkpointer.
    sessions.clear()


@app.on_event("startup")
async def startup():
    global startup_error
    try:
        banking_telemetry.start()
        ensure_graph()
        try:
            await asyncio.to_thread(runtime_controls.start)
        except Exception:
            runtime_controls.ready = False  # Expose unavailable; requests fail closed.
    except Exception as exc:
        startup_error = type(exc).__name__


@app.on_event("shutdown")
async def shutdown():
    import agent_control
    await agent_control.shutdown_observability()
    await asyncio.to_thread(banking_telemetry.shutdown)


@app.get("/api/banking/health")
async def health():
    backend = model_backend.describe()
    return {"ready": graph is not None, "model": (backend.get("answering") or {}).get("model"), "backend": backend,
            "retrieval": "Pinecone" if os.getenv("PINECONE_API_KEY") else "Local document search", "galileo": "configured" if os.getenv("GALILEO_API_KEY") else "disabled",
            "security": defense.health(), "splunk": banking_telemetry.health(), "controls": runtime_controls.health(),
            "error": "Banking dependencies are unavailable." if startup_error else None}


@app.get("/api/banking/observability")
async def observability():
    return {**await stream_status(), "controls": runtime_controls.health()}


@app.get("/api/banking/recordings")
async def list_recordings():
    return {"recordings": recordings.recordings()}


@app.get("/api/banking/recordings/{name}")
async def get_recording(name: str):
    doc = recordings.recording(name)
    if doc is None:
        raise HTTPException(404, "Unknown recording.")
    return doc


@app.post("/api/banking/chat")
async def chat(request: Request):
    if not graph:
        raise HTTPException(503, "Banking dependencies are unavailable. Check local service configuration.")
    if not any(entry[1].locked() for entry in sessions.values()):
        try:
            ensure_graph()
        except model_backend.EgressDenied as exc:
            raise HTTPException(403, str(exc)) from None
    if not request.message.strip():
        raise HTTPException(422, "Enter a message.")
    now = time.monotonic()
    for key, entry in list(sessions.items()):
        if now - entry[0] > 3600 and not entry[1].locked():
            sessions.pop(key)
            await graph.checkpointer.adelete_thread(key)
    sid = str(request.session_id) if request.session_id else str(uuid.uuid4())
    if request.session_id and sid not in sessions:
        raise HTTPException(404, "Conversation expired. Start a new conversation.")
    if sid not in sessions:
        if len(sessions) >= 100:
            raise HTTPException(429, "Session capacity reached. Try again later.")
        sessions[sid] = [now, asyncio.Lock()]
    if sessions[sid][1].locked():
        raise HTTPException(409, "A response is already in progress.")
    trace = ExecutionTrace()
    callbacks = [trace]
    galileo_logger = None
    telemetry = "disabled"
    if os.getenv("GALILEO_API_KEY"):
        try:
            from galileo.handlers.langchain import GalileoAsyncCallback
            from galileo import GalileoLogger
            galileo_logger = GalileoLogger()
            galileo_logger.start_trace(input=request.message, name="Brahe Bank · guarded request")
            callbacks.append(GalileoAsyncCallback(galileo_logger=galileo_logger, start_new_trace=False, flush_on_chain_end=False))
            telemetry = "enabled"
        except Exception:
            telemetry = "unavailable"
    security = SecurityRun()
    controls = ControlRun()
    context_token = security_run.set(security)
    failure = None
    try:
        with banking_telemetry.span() as span:
            trace_id = format(span.get_span_context().trace_id, "032x")
            async with sessions[sid][1]:
                try:
                    # Reject unsafe input before it enters the in-memory checkpoint.
                    await defense.inspect([{"role": "user", "content": request.message}], "request_input")
                    history = []
                    if request.session_id:
                        state = await graph.aget_state({"configurable": {"thread_id": sid}})
                        history = [{"role": m.type, "content": m.content} for m in state.values.get("messages", []) if m.type in {"human", "ai"} and m.content]
                    await runtime_controls.check("pre", request.message, controls, history=history, logger=galileo_logger)
                    result = await asyncio.wait_for(graph.ainvoke(
                        {"messages": [HumanMessage(content=request.message)]},
                        config={"configurable": {"thread_id": sid}, "metadata": {"workflow_name": "brahe-bank"}, "callbacks": callbacks, "recursion_limit": 40}), 100)
                    answer = result["messages"][-1].content
                    if not isinstance(answer, str) or not answer.strip():
                        raise ValueError("Empty response")
                    # Explicit final safety check precedes quality, even if graph/model
                    # internals change. Complete tool results, never UI-truncated excerpts.
                    await defense.inspect([{"role": "assistant", "content": answer}], "response_output")
                    evidence = [{"tool": getattr(m, "name", ""), "content": m.content} for m in result["messages"] if getattr(m, "type", None) == "tool" and getattr(m, "name", "") in {"pinecone_retrieval", "credit_score_retrieval"}]
                    await runtime_controls.check("post", request.message, controls, answer=answer, evidence=evidence, logger=galileo_logger)
                except DefenseBlocked:
                    failure = (403, "AI Defense blocked this interaction. No answer was released.")
                except DefenseUnavailable:
                    failure = (503, "AI Defense inspection is unavailable. No answer was released.")
                except ControlsBlocked:
                    failure = (422, "Agent Control blocked this response: " + ", ".join(c["name"] for c in controls.checks if c["status"] == "blocked") + ". Ask about Brahe products, mock scores, or illustrative eligibility.")
                except ControlsUnavailable:
                    failure = (503, "Agent Control quality checks are unavailable. No answer was released.")
                except asyncio.TimeoutError:
                    failure = (504, "The assistant timed out. Please try again.")
                except Exception as exc:
                    model_backend.mark_failed(exc)
                    failure = (502, "The assistant could not complete this request. Please try again.")
                finally:
                    sessions[sid][0] = time.monotonic()
                    if failure:
                        # A rejected output must not become evidence for a later turn.
                        if hasattr(graph, "checkpointer"):
                            await graph.checkpointer.adelete_thread(sid)
                        sessions.pop(sid, None)
            span.set_attribute("cisco.ai_defense.checks", security.checks)
            span.set_attribute("cisco.ai_defense.blocked", security.blocked)
            span.set_attribute("cisco.ai_defense.errors", security.errors)
            if failure:
                from opentelemetry.trace import Status, StatusCode
                span.set_status(Status(StatusCode.ERROR, "Request not completed"))
        splunk = await asyncio.to_thread(banking_telemetry.delivery, trace_id)
    finally:
        security_run.reset(context_token)
    if galileo_logger:
        try:
            galileo_logger.conclude(output=failure[1] if failure else answer, status_code=failure[0] if failure else 200)
            uploaded = await asyncio.wait_for(galileo_logger.async_flush(), 8)
            telemetry = "recorded" if uploaded else "no trace recorded"
        except Exception:
            telemetry = "delivery unavailable"
        finally:
            galileo_logger.disable_agent_control()
    if failure:
        return JSONResponse(status_code=failure[0], content={"detail": failure[1],
            "security": security.summary(), "controls": controls.summary(), "session_reset": True,
            "trace": trace.events, "duration_ms": round((time.monotonic() - now) * 1000),
            "telemetry": {"splunk": splunk, "galileo": telemetry}, "usage": trace.usage(), "served_by": model_backend.served_by()})
    return {"session_id": sid, "answer": answer, "trace": trace.events,
            "sources": trace.sources, "security": security.summary(), "controls": controls.summary(), "telemetry": {"galileo": telemetry, "splunk": splunk},
            "usage": trace.usage(), "served_by": model_backend.served_by(), "duration_ms": round((time.monotonic() - now) * 1000)}
