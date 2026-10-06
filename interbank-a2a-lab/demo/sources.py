"""Source and configuration excerpts the dashboard shows when a component is clicked.

Every excerpt is read from the running files at request time and located by symbol
or pattern, never by hard-coded line numbers, so the panel always shows real code.
"""

from __future__ import annotations

import ast
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# id -> (file, title, focus). focus: python symbol names, or regexes for other files.
SOURCES: dict[str, tuple[str, str, list[str]]] = {
    "bank-a-agent": ("bank_a/agent.py", "Bank A Deep Agent: prompt, tools, A2A receive handler",
                     ["COORDINATOR_PROMPT", "to_bank_b", "coordinator", "handle", "app"]),
    "bank-b-agent": ("bank_b/agent.py", "Bank B Deep Agent: prompt, tools, A2A receive handler",
                     ["INVESTIGATOR_PROMPT", "to_bank_a", "investigator", "handle", "app"]),
    "deep-agent-builder": ("lab/agents.py", "create_deep_agent on the local Nemotron model",
                           ["local_model", "build_deep_agent", "run_turn"]),
    "a2a-send": ("lab/a2a_peer.py", "A2A SDK client: send a message through our own gateway",
                 ["send_message"]),
    "a2a-receive": ("lab/a2a_peer.py", "A2A SDK server: AgentExecutor + JSON-RPC routes",
                    ["BankAgentExecutor", "a2a_server"]),
    "partner-tool": ("lab/partner.py", "The send_message_to_<bank> tool (Agent Control, then A2A)",
                     ["partner_message_tool"]),
    "agent-control": ("lab/controls.py", "Splunk Agent Control on the outbound A2A step",
                      ["OutboundControls"]),
    "records": ("lab/records.py", "Read-only SQLite tool", ["BankRecords"]),
    "bank-a-records": ("bank_a/records.sql", "Bank A settlement database (seed)", [r"CREATE TABLE"]),
    "bank-b-records": ("bank_b/records.sql", "Bank B settlement database (seed)", [r"CREATE TABLE"]),
    "bank-a-gateway": ("gateways/bank-a.yaml", "Bank A agentgateway configuration",
                       [r"- name: bank-a-", r"extProc:", r"tracing:"]),
    "bank-b-gateway": ("gateways/bank-b.yaml", "Bank B agentgateway configuration",
                       [r"- name: bank-b-", r"extProc:", r"tracing:"]),
    "ai-defense-extproc": ("policy/extproc.py", "ExtProc service: Cisco AI Defense at the gateway",
                           ["HOPS", "a2a_text", "AIDefenseProcessor"]),
    "ai-defense-api": ("policy/ai_defense.py", "Cisco AI Defense Inspection API call",
                       ["inspect_chat"]),
    "telemetry": ("lab/telemetry.py", "OpenTelemetry to Splunk Agent Observability",
                  ["setup_telemetry", "inject_headers", "continue_from"]),
    "collector": ("otel/collector.yaml", "Gateway spans to Splunk Agent Observability",
                  [r"otlphttp/splunk_ao:"]),
    "console": ("demo/server.py", "Operations console kickoff (A2A through Bank A's gateway)",
                ["investigate"]),
    "compose": ("compose.yaml", "Containers and networks", [r"^  [a-z0-9-]+:$"]),
}


def excerpt(source_id: str) -> dict:
    path, title, focus = SOURCES[source_id]
    code = (ROOT / path).read_text(encoding="utf-8")
    ranges = _python_ranges(code, focus) if path.endswith(".py") else _pattern_ranges(code, focus)
    language = {"py": "python", "yaml": "yaml", "sql": "sql"}[path.rsplit(".", 1)[1]]
    return {"id": source_id, "path": path, "title": title, "language": language,
            "code": code, "focus": ranges}


def _python_ranges(code: str, names: list[str]) -> list[dict]:
    found = []
    for node in ast.parse(code).body:
        name = getattr(node, "name", None)
        if isinstance(node, (ast.Assign, ast.AnnAssign)):
            targets = node.targets if isinstance(node, ast.Assign) else [node.target]
            name = next((t.id for t in targets if isinstance(t, ast.Name)), None)
        if name in names:
            start = min([node.lineno, *(d.lineno for d in getattr(node, "decorator_list", []))])
            found.append({"label": name, "start": start, "end": node.end_lineno})
    return sorted(found, key=lambda r: r["start"])


def _pattern_ranges(code: str, patterns: list[str]) -> list[dict]:
    lines = code.splitlines()
    found = []
    for pattern in patterns:
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
                found.append({"label": line.strip()[:60], "start": index + 1, "end": end + 1})
    return sorted(found, key=lambda r: r["start"])
