import { at, spans } from "../../../app/map/drawio/platform-contract.ts";
import type { PlatformViewContext } from "../../../app/map/drawio/platform-connections.ts";

export function customizePlatform({ page, cell, describe, add, connect }: PlatformViewContext) {
  cell(at("system", "ib.platform.defense")).targetPageId = undefined;
  describe(at("system", "ib.platform.defense"), "Cisco AI Defense", "service", "Gateways invoke their local ExtProc policy service. The policy service calls the hosted Inspection API; each gateway enforces the returned verdict.", ["interbank.extproc.verdict"]);
  for (const scope of ["inspection", "report-inspection"]) {
    const id = scope === "inspection" ? "ib.kickoff.inspect.api" : "ib.report.inspect.api";
    page(scope).aliases![id] = at("system", "ib.platform.defense");
  }
  for (const bank of ["a", "b"]) add(at("exchange", `policy-${bank}`), `Bank ${bank.toUpperCase()} policy service`, "service", "Local ExtProc service sends buffered request and response text to AI Defense. The gateway applies allow, 403 denial, or 503 inspection failure.", ["interbank.extproc.verdict"], `bank-${bank}`);
  page("exchange").flow = [page("exchange").flow![0], page("exchange").flow![1], ["", "", "policy-a", "policy-b"]];
  describe(at("trace", "ib.trace.agents"), "GenAI span exporter", "telemetry", "Agents, console and policy services use the native Splunk AO span processor. Handoff metadata links the calling and receiving agents.", ["interbank.telemetry.setup", "interbank.telemetry.handoff"]);
  describe(at("trace", "ib.trace.gateways"), "Bank A collector", "telemetry", "Bank A's gateway sends OTLP spans to its local collector, which forwards them to Splunk Agent Observability.", ["interbank.gw.tracing", "interbank.collector"]);
  describe(at("trace", "ib.trace.handoff"), "Splunk Agent Observability", "telemetry", "Agent and gateway export paths converge at the configured Splunk AO destination. Session IDs and A2A handoff links correlate the investigation.", ["interbank.collector", "interbank.telemetry.session"]);
  add(at("trace", "collector-b"), "Bank B collector", "telemetry", "Bank B's gateway sends OTLP spans through its own collector to Splunk Agent Observability.", ["interbank.collector"]);
  page("trace").flow = [["ib.trace.agents", "ib.trace.handoff"], ["ib.trace.gateways", "collector-b"]];
  page("trace").edges = [];
  for (const id of ["ib.trace.agents", "ib.trace.gateways", "collector-b"]) connect(spans(at("trace", id), at("trace", "ib.trace.handoff"), [id === "ib.trace.agents" ? "interbank.telemetry.setup" : "interbank.collector"], id === "ib.trace.agents" ? "GenAI spans" : "OTLP export"));
}
