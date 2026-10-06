"""OpenTelemetry export to Splunk Agent Observability.

Follows Splunk's "Distributed Tracing with OpenTelemetry" guide: every process
adds a SplunkAOSpanProcessor to its TracerProvider, and W3C `traceparent` plus
`baggage` headers carry the trace and session across A2A hops and gateways, so
one investigation is one Splunk trace and one Splunk session.
"""

from __future__ import annotations

import json
from collections.abc import Iterator
from contextlib import contextmanager
from typing import Any

from openinference.instrumentation.langchain import LangChainInstrumentor
from opentelemetry import baggage, context, propagate, trace
from opentelemetry.sdk.resources import Resource
from opentelemetry.sdk.trace import TracerProvider
from opentelemetry.trace import SpanKind, Status, StatusCode
from splunk_ao.otel import SplunkAOOTLPExporter, SplunkAOSpanProcessor, add_splunk_ao_span_processor

from lab.config import ORGANIZATION, SERVICE_NAME, env
from lab.genai import GenAIExporter

SESSION_KEY = "gen_ai.conversation.id"
_provider: TracerProvider | None = None


def setup_telemetry(*, instrument_langchain: bool = False,
                    agent_names: tuple[str, ...] = ()) -> TracerProvider:
    """`agent_names`: Deep Agent graph names, so their root spans are typed as agents."""
    global _provider
    if _provider is None:
        _provider = TracerProvider(
            resource=Resource.create(
                {
                    "service.name": SERVICE_NAME,
                    "service.namespace": "interbank-a2a-demo",
                    "organization.name": ORGANIZATION,
                }
            )
        )
        exporter = SplunkAOOTLPExporter(project=env("SPLUNK_AO_PROJECT"),
                                        agentstream=env("SPLUNK_AO_AGENT_STREAM"))
        add_splunk_ao_span_processor(
            _provider, SplunkAOSpanProcessor(_exporter=GenAIExporter(exporter, agent_names))
        )
        trace.set_tracer_provider(_provider)
    if instrument_langchain and not LangChainInstrumentor().is_instrumented_by_opentelemetry:
        LangChainInstrumentor().instrument(tracer_provider=_provider)
    return _provider


def flush() -> None:
    if _provider is not None:
        _provider.force_flush(timeout_millis=5000)


def text(value: Any) -> str:
    return value if isinstance(value, str) else json.dumps(value, ensure_ascii=False, default=str)


# Splunk AO reads OpenTelemetry GenAI semantic conventions: the operation name picks
# the span type, and content travels as gen_ai.* message or tool-call attributes.
# Its OTLP endpoint rejects `control` spans not produced by Agent Control itself, so
# guardrail checks are recorded as tool executions of the inspection API.
OPERATION = {"workflow": "invoke_workflow", "agent": "invoke_agent", "tool": "execute_tool"}
NAME_KEY = {"workflow": "gen_ai.workflow.name", "agent": "gen_ai.agent.name",
            "tool": "gen_ai.tool.name"}


def _messages(role: str, value: Any) -> str:
    message = {"role": role, "parts": [{"type": "text", "content": text(value)}]}
    if role == "assistant":
        message["finish_reason"] = "stop"
    return json.dumps([message], ensure_ascii=False)


@contextmanager
def span(
    name: str,
    *,
    kind: str,
    input: Any = None,
    label: str | None = None,
    attributes: dict[str, Any] | None = None,
    span_kind: SpanKind = SpanKind.INTERNAL,
) -> Iterator[trace.Span]:
    """A span Splunk renders with readable input and output.

    `kind` is workflow, agent, or tool; `label` names the workflow, agent, or tool
    (defaults to the span name). Call `set_output` before exit.
    """
    tracer = trace.get_tracer("interbank-a2a-demo")
    with tracer.start_as_current_span(
        name,
        kind=span_kind,
        record_exception=False,
        set_status_on_exception=False,
    ) as current:
        current.set_attribute("gen_ai.operation.name", OPERATION[kind])
        current.set_attribute(NAME_KEY[kind], label or name)
        if input is not None:
            current.set_attribute(
                "gen_ai.tool.call.arguments" if kind == "tool" else "gen_ai.input.messages",
                text(input) if kind == "tool" else _messages("user", input),
            )
        for key, value in (attributes or {}).items():
            if value is not None:
                current.set_attribute(key, value)
        try:
            yield current
        except Exception as exc:
            current.set_status(Status(StatusCode.ERROR, type(exc).__name__))
            current.set_attribute("error.type", type(exc).__name__)
            raise


def set_output(current: trace.Span, value: Any) -> None:
    operation = (getattr(current, "attributes", None) or {}).get("gen_ai.operation.name")
    if operation == "execute_tool":
        current.set_attribute("gen_ai.tool.call.result", text(value))
    else:
        current.set_attribute("gen_ai.output.messages", _messages("assistant", value))


def inject_headers(headers: dict[str, str]) -> dict[str, str]:
    """Add W3C traceparent and baggage (carrying the Splunk session ID)."""
    propagate.inject(headers)
    return headers


@contextmanager
def continue_from(headers: dict[str, str]) -> Iterator[None]:
    """Continue the caller's trace and Splunk session for an inbound request."""
    token = context.attach(propagate.extract(headers))
    try:
        yield
    finally:
        context.detach(token)


@contextmanager
def session(session_id: str) -> Iterator[None]:
    token = context.attach(baggage.set_baggage(SESSION_KEY, session_id))
    try:
        yield
    finally:
        context.detach(token)


def current_ids() -> dict[str, str]:
    ctx = trace.get_current_span().get_span_context()
    if not ctx.is_valid:
        return {}
    return {"trace_id": format(ctx.trace_id, "032x"), "span_id": format(ctx.span_id, "016x")}
