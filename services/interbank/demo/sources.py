"""Source and configuration excerpts the dashboard shows when a component is clicked.

Every excerpt is read from the running files at request time and located by symbol
or pattern, never by hard-coded line numbers, so the panel always shows real code.
Each highlighted range names the integration it implements, so a reader can find
where the Deep Agents, A2A, Splunk Agent Observability, Splunk Agent Control, and
Cisco AI Defense integrations live.

Standard library only: `python3 demo/sources.py <id>` prints one excerpt as JSON, so
the studio can show code without the lab's containers running.
"""

from __future__ import annotations

import ast
import json
import re
import sys
from pathlib import Path
from typing import NamedTuple

ROOT = Path(__file__).resolve().parent.parent

INTEGRATIONS = {
    "deepagents": "LangChain Deep Agents",
    "a2a": "A2A protocol",
    "observability": "Splunk Agent Observability",
    "agent-control": "Splunk Agent Control",
    "ai-defense": "Cisco AI Defense",
    "identity": "Identity and transport",
    "data": "Bank records",
    "deployment": "Containers and networks",
}


class Focus(NamedTuple):
    """`match`: a top-level Python symbol, or `re:<regex>` for any line in the file."""

    match: str
    label: str
    integration: str


class Source(NamedTuple):
    path: str
    title: str
    focus: list[Focus]


def _name(bank: str) -> str:
    return "Bank " + bank.rsplit("-", 1)[1].upper()


def _agent(bank: str, partner: str, agents: list[tuple[str, str]], prompts: list[str]) -> Source:
    tool = f"to_{partner.replace('-', '_')}"
    return Source(f"{bank.replace('-', '_')}/agent.py",
                  f"{_name(bank)} Deep Agent: prompts, tools, tracing, A2A server", [
        Focus("re:^setup_telemetry\\(", "Splunk AO tracing + LangChain instrumentation",
              "observability"),
        *(Focus(p, "Deep Agent system prompt", "deepagents") for p in prompts),
        Focus(tool, f"A2A tool to {_name(partner)} (through this bank's gateway)", "a2a"),
        *(Focus(name, f"create_deep_agent: {role}", "deepagents") for name, role in agents),
        Focus("handle", "A2A message in, Deep Agent turn out", "a2a"),
        Focus("app", "A2A server that admits only this bank's gateway", "identity"),
    ])


def _gateway(bank: str) -> Source:
    return Source(f"gateways/{bank}.yaml", f"{_name(bank)} agentgateway configuration", [
        Focus("re:^  tracing:", "Gateway spans to Splunk AO (GenAI attributes)", "observability"),
        Focus("re:^    tls:", "Listener mTLS, TLS 1.3, pinned client CA", "identity"),
        Focus("re:jwtAuth:", "JWT admission of the caller", "identity"),
        Focus("re:extProc:", "Cisco AI Defense on request and response, fail closed",
              "ai-defense"),
        Focus("re:backendTLS:", "mTLS to the next hop", "identity"),
        Focus("re:backendAuth:", f"Token re-signed by the gateway; caller token stays at {_name(bank)}",
              "identity"),
    ])


SOURCES: dict[str, Source] = {
    "bank-a-agent": _agent("bank-a", "bank-b",
                           [("coordinator", "coordinator"), ("responder", "responder")],
                           ["COORDINATOR_PROMPT", "RESPONDER_PROMPT"]),
    "bank-b-agent": _agent("bank-b", "bank-a", [("investigator", "investigator")],
                           ["INVESTIGATOR_PROMPT"]),
    "deep-agent-builder": Source("lab/agents.py", "create_deep_agent on the OpenAI Responses API", [
        Focus("re:^register_harness_profile\\(", "Deep Agents harness profile", "deepagents"),
        Focus("chat_model", "Model with reasoning summaries", "deepagents"),
        Focus("build_deep_agent", "create_deep_agent", "deepagents"),
        Focus("run_turn", "Streams thinking, tool calls, and results", "deepagents"),
    ]),
    "telemetry": Source("lab/telemetry.py", "OpenTelemetry to Splunk Agent Observability", [
        Focus("setup_telemetry", "SplunkAOSpanProcessor + OpenInference LangChain",
              "observability"),
        Focus("span", "GenAI-typed workflow, agent, and tool spans", "observability"),
        Focus("inject_headers", "W3C traceparent + baggage out", "observability"),
        Focus("continue_from", "Continue the caller's trace in", "observability"),
        Focus("handoff_metadata", "Calling agent's span in A2A metadata (splunk-ao-a2a)",
              "observability"),
        Focus("handoff_link", "agent_handoff link from the calling agent", "observability"),
        Focus("session", "One investigation = one Splunk session", "observability"),
    ]),
    "genai": Source("lab/genai.py", "OpenInference spans to GenAI semantic conventions", [
        Focus("_output_reasoning", "Reasoning summaries into the trace", "observability"),
        Focus("translate", "Typed LLM, tool, agent, and workflow spans", "observability"),
        Focus("GenAIExporter", "Applied at export", "observability"),
    ]),
    "agent-control": Source("lab/controls.py", "Splunk Agent Control on the outbound A2A step", [
        Focus("_register_event_sinks", "Control executions to the server and the trace",
              "agent-control"),
        Focus("OutboundControls", "Server-side controls bound to the Agent Stream",
              "agent-control"),
    ]),
    "controls-setup": Source("tools/setup_controls.py", "Agent Control controls registered by labctl up", [
        Focus("CONTROLS", "One outbound confidentiality control per bank", "agent-control"),
        Focus("definition", "execution: server · step <bank>.send_a2a_message · stage pre",
              "agent-control"),
        Focus("main", "Create or update, then bind to the Agent Stream", "agent-control"),
    ]),
    "pki": Source("labctl.py", "labctl up: settings, PKI, tokens, egress trust", [
        Focus("import_vendor_env", "Studio .env into 0600 files; key names only", "deployment"),
        Focus("bank_ca", "Per-bank P-256 CA, SHA-256, one year", "identity"),
        Focus("leaf", "90-day workload certificates", "identity"),
        Focus("token", "ES256 bearer tokens", "identity"),
        Focus("generate_credentials", "Role directories per workload", "identity"),
        Focus("write_egress_bundle", "Public roots + TLS-inspecting proxy root", "identity"),
        Focus("up", "Order of operations", "deployment"),
    ]),
    "partner-tool": Source("lab/partner.py", "send_message_to_<bank>: Agent Control, then A2A", [
        Focus("partner_message_tool", "Control check before anything leaves the bank",
              "agent-control"),
    ]),
    "a2a-send": Source("lab/a2a_peer.py", "A2A SDK client: send through this bank's gateway", [
        Focus("mtls_context", "mTLS, TLS 1.3 only", "identity"),
        Focus("send_message", "Agent Card, SendMessage, trace headers", "a2a"),
        Focus("set_task_state", "a2a.task.* attributes Splunk's A2A ingest expects",
              "observability"),
    ]),
    "a2a-receive": Source("lab/a2a_peer.py", "A2A SDK server: AgentExecutor + JSON-RPC routes", [
        Focus("BankAgentExecutor", "Continues the trace, runs the Deep Agent", "a2a"),
        Focus("a2a_server", "JSON-RPC routes behind gateway-token admission", "identity"),
    ]),
    "records": Source("lab/records.py", "Read-only SQLite tool", [
        Focus("BankRecords", "query_settlement_records", "data"),
    ]),
    "bank-a-records": Source("bank_a/records.sql", "Bank A settlement database (seed)", [
        Focus("re:CREATE TABLE", "Table", "data"),
    ]),
    "bank-b-records": Source("bank_b/records.sql", "Bank B settlement database (seed)", [
        Focus("re:CREATE TABLE", "Table", "data"),
    ]),
    "bank-a-gateway": _gateway("bank-a"),
    "bank-b-gateway": _gateway("bank-b"),
    "ai-defense-extproc": Source("policy/extproc.py", "ExtProc service: Cisco AI Defense at the gateway", [
        Focus("HOPS", "One port per gateway hop", "ai-defense"),
        Focus("a2a_text", "A2A text the policy inspects", "ai-defense"),
        Focus("AIDefenseProcessor", "Verdict, 403 on violation, 503 when unavailable",
              "ai-defense"),
    ]),
    "ai-defense-api": Source("policy/ai_defense.py", "Cisco AI Defense Inspection API call", [
        Focus("inspect_chat", "Chat inspection request and verdict", "ai-defense"),
    ]),
    "collector": Source("otel/collector.yaml", "Gateway spans to Splunk Agent Observability", [
        Focus("re:^  otlp_http/splunk_ao:", "OTLP export to Splunk AO", "observability"),
        Focus("re:^  pipelines:", "Traces pipeline", "observability"),
    ]),
    "console": Source("demo/server.py", "Operations console kickoff (A2A through Bank A's gateway)", [
        Focus("investigate", "Root span and Splunk session for the investigation",
              "observability"),
    ]),
    "compose": Source("compose.yaml", "Containers and networks", [
        Focus("re:^  [a-z0-9-]+:$", "Service", "deployment"),
    ]),
}


def catalog() -> dict:
    return {"integrations": INTEGRATIONS,
            "sources": {k: {"path": s.path, "title": s.title} for k, s in SOURCES.items()}}


def excerpt(source_id: str) -> dict:
    source = SOURCES[source_id]
    code = (ROOT / source.path).read_text(encoding="utf-8")
    python = source.path.endswith(".py")
    ranges = []
    for focus in source.focus:
        if focus.match.startswith("re:"):
            spans = (_statement_ranges if python else _block_ranges)(code, focus.match[3:])
        else:
            spans = _symbol_ranges(code, focus.match)
        ranges += [{"label": focus.label, "integration": focus.integration,
                    "start": start, "end": end} for start, end in spans]
    language = {"py": "python", "yaml": "yaml", "sql": "sql"}[source.path.rsplit(".", 1)[1]]
    return {"id": source_id, "path": f"services/interbank/{source.path}", "title": source.title,
            "language": language, "code": code, "integrations": INTEGRATIONS,
            "focus": sorted(ranges, key=lambda r: r["start"])}


def _symbol_ranges(code: str, name: str) -> list[tuple[int, int]]:
    for node in ast.parse(code).body:
        found = getattr(node, "name", None)
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            found = next((t.id for t in targets if isinstance(t, ast.Name)), None)
        if found == name:
            start = min([node.lineno, *(d.lineno for d in getattr(node, "decorator_list", []))])
            return [(start, node.end_lineno or start)]
    return []


def _statement_ranges(code: str, pattern: str) -> list[tuple[int, int]]:
    """The top-level statements whose first line matches."""
    lines = code.splitlines()
    return [(node.lineno, node.end_lineno or node.lineno) for node in ast.parse(code).body
            if re.search(pattern, lines[node.lineno - 1])]


def _block_ranges(code: str, pattern: str) -> list[tuple[int, int]]:
    """Each matching line plus the lines indented beneath it."""
    lines = code.splitlines()
    found = []
    for index, line in enumerate(lines):
        if re.search(pattern, line):
            indent = len(line) - len(line.lstrip())
            end = index
            while end + 1 < len(lines) and (
                not lines[end + 1].strip()
                or len(lines[end + 1]) - len(lines[end + 1].lstrip()) > indent
            ):
                end += 1
            while end > index and not lines[end].strip():
                end -= 1
            found.append((index + 1, end + 1))
    return found


if __name__ == "__main__":
    if len(sys.argv) != 2 or (sys.argv[1] != "--catalog" and sys.argv[1] not in SOURCES):
        sys.exit(f"usage: sources.py --catalog | <{'|'.join(SOURCES)}>")
    print(json.dumps(catalog() if sys.argv[1] == "--catalog" else excerpt(sys.argv[1])))
