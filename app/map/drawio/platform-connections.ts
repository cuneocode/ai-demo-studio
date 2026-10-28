import type { Catalog } from "../catalog.ts";
import { evidence } from "../evidence.ts";
import type { SceneNode } from "../scene-model.ts";
import { modelConsumers } from "./implementation-views.ts";
import { diagramNode, type ComponentType, type DiagramPage } from "./model.ts";

type Endpoint = { scopeId: string; cellId: string };
type Connection = { from: Endpoint; to: Endpoint; label: string; kind: "control" | "telemetry"; sources: string[]; bidirectional?: boolean };
type Contract = { status: "implemented" | "proposed"; inspection: "application" | "gateway" | "disabled"; connections: Connection[] };
const at = (scopeId: string, cellId: string): Endpoint => ({ scopeId, cellId });
const inspect = (from: Endpoint, to: Endpoint, sources: string[], label = "Inspect / verdict"): Connection => ({ from, to, sources, label, kind: "control", bidirectional: true });
const spans = (from: Endpoint, to: Endpoint, sources: string[], label = "Spans"): Connection => ({ from, to, sources, label, kind: "telemetry" });
const consumers = (id: string, target: Endpoint, sources: string[], kind: "control" | "telemetry") => modelConsumers[id].map(from => kind === "control" ? inspect(from, target, sources, "Model I/O / verdict") : spans(from, target, sources));

/** Every new use case must declare verified callers, enforcement points and exporters. */
export const platformConnections: Record<string, Contract> = {
  "code-vulnerability": { status: "implemented", inspection: "disabled", connections: [
    { from: at("workload", "scan"), to: at("security", "gates"), kind: "control", label: "Scan admission", sources: ["platform.vulnerability-controls"] },
    { from: at("workload", "patch"), to: at("security", "gates"), kind: "control", label: "Review admission", sources: ["platform.vulnerability-controls"] },
    spans(at("model", "inference"), at("observe", "span"), ["vulnerability.trace"]),
    spans(at("security", "gates"), at("observe", "export"), ["platform.vulnerability-controls", "vulnerability.trace"], "Control events"),
  ] },
  "brahe-bank": { status: "implemented", inspection: "application", connections: [
    ...["check", "return"].map(scope => inspect(at(scope, "inspect"), at("system", "defense"), ["brahe.chat.boundary"])),
    ...consumers("brahe-bank", at("system", "defense"), ["brahe.defense.hop"], "control"),
    ...consumers("brahe-bank", at("system", "trace"), ["brahe.galileo.call", "brahe.controls.judge"], "telemetry"),
  ] },
  "fraud-modeling": { status: "implemented", inspection: "application", connections: [
    inspect(at("score", "screen"), at("defense", "guards"), ["platform.fraud-inspection"], "Note / verdict"),
    inspect(at("score", "agent"), at("defense", "guards"), ["platform.fraud-boundary", "platform.fraud-summary"], "Hosted prompt + summary / verdict"),
    spans(at("score", "agent"), at("observe", "in"), ["platform.fraud-trace"]),
  ] },
  "company-briefing": { status: "implemented", inspection: "application", connections: [
    ...consumers("company-briefing", at("defense", "guards"), ["platform.briefing-inspection"], "control"),
    spans(at("workload", "delivery"), at("observe", "in"), ["platform.briefing-trace"], "Run spans"),
  ] },
  "market-research": { status: "implemented", inspection: "application", connections: [
    inspect(at("market", "screen"), at("defense", "guards"), ["platform.wealth-screen"], "Article / verdict"),
    ...consumers("market-research", at("defense", "guards"), ["platform.advisory-inspection"], "control"),
    spans(at("workload", "assessment"), at("observe", "in"), ["platform.wealth-trace", "platform.research-calls"]),
    spans(at("workload", "assessment"), at("observe", "otlp"), ["platform.wealth-otlp"], "GenAI spans"),
  ] },
  "client-advisory": { status: "implemented", inspection: "application", connections: [
    inspect(at("context", "screen"), at("defense", "guards"), ["platform.wealth-screen"], "CRM note / verdict"),
    ...consumers("client-advisory", at("defense", "guards"), ["platform.advisory-inspection"], "control"),
    ...consumers("client-advisory", at("observe", "in"), ["platform.wealth-trace"], "telemetry"),
    ...consumers("client-advisory", at("observe", "otlp"), ["platform.wealth-otlp"], "telemetry"),
  ] },
  "sar-support": { status: "implemented", inspection: "application", connections: [
    inspect(at("workload", "screen"), at("defense", "guards"), ["platform.sar-inspection"], "Segment / verdict"),
    ...consumers("sar-support", at("defense", "guards"), ["platform.sar-model-inspection"], "control"),
    spans(at("workload", "agent"), at("observe", "trace"), ["platform.sar-trace"]),
    spans(at("workload", "agent"), at("observe", "otlp"), ["platform.sar-otlp"], "GenAI spans"),
  ] },
  "kyc-processing": { status: "proposed", inspection: "application", connections: [
    inspect(at("workload", "case"), at("defense", "guards"), [], "Proposed inspection"),
    spans(at("workload", "case"), at("observe", "in"), [], "Proposed spans"),
  ] },
  "transaction-llm": { status: "proposed", inspection: "application", connections: [
    ...consumers("transaction-llm", at("defense", "guards"), [], "control"),
    ...consumers("transaction-llm", at("observe", "in"), [], "telemetry"),
  ] },
  "interbank-a2a": { status: "implemented", inspection: "gateway", connections: [
    ...["a", "b"].flatMap(bank => [
      inspect(at("exchange", `ib.${bank}.gateway`), at("exchange", `policy-${bank}`), [`interbank.gw-${bank}.${bank === "a" ? "egress" : "ingress"}-extproc`], "ExtProc / verdict"),
      inspect(at("exchange", `policy-${bank}`), at("system", "ib.platform.defense"), ["interbank.extproc.verdict"], "Inspect / verdict"),
      spans(at("exchange", `ib.${bank}.${bank === "a" ? "coordinator" : "investigator"}`), at("trace", "ib.trace.agents"), ["interbank.telemetry.setup"]),
      spans(at("exchange", `ib.${bank}.gateway`), at("trace", bank === "a" ? "ib.trace.gateways" : "collector-b"), ["interbank.gw.tracing", "interbank.collector"], "OTLP gateway spans"),
      spans(at("exchange", `policy-${bank}`), at("trace", "ib.trace.agents"), ["interbank.telemetry.setup"], "Policy spans"),
    ]),
    spans(at("kickoff", "ib.kickoff.console"), at("trace", "ib.trace.agents"), ["interbank.telemetry.setup"], "Console spans"),
  ] },
};

/** Root-owned edges project to collapsed owners and keep their real terminals on expansion. */
export function connectPlatformComponents(input: { catalog: Catalog; pages: DiagramPage[] }) {
  const contract = platformConnections[input.catalog.id];
  if (!contract) throw new Error(`Missing platform connection contract: ${input.catalog.id}`);
  const catalog = { ...input.catalog, scenes: { ...input.catalog.scenes }, relationships: [...input.catalog.relationships] };
  const pages = input.pages.map(page => ({ ...page, aliases: { ...page.aliases }, groups: page.groups?.map(group => ({ ...group })), flow: page.flow?.map(row => [...row]), cells: page.cells.map(cell => ({ ...cell })), edges: page.edges.map(edge => ({ ...edge })) }));
  const page = (id: string) => { const result = pages.find(item => item.id === id); if (!result) throw new Error(`${catalog.id}: missing scope ${id}`); return result; };
  const cell = (endpoint: Endpoint) => { const result = page(endpoint.scopeId).cells.find(item => item.id === endpoint.cellId); if (!result) throw new Error(`${catalog.id}: missing terminal ${endpoint.scopeId}/${endpoint.cellId}`); return result; };
  function describe(endpoint: Endpoint, label: string, type: ComponentType, detail: string, sources: string[]) {
    const item = cell(endpoint), scene = catalog.scenes[item.sceneId];
    item.label = label; item.caption = undefined; item.componentType = type;
    catalog.scenes[item.sceneId] = { ...scene, nodes: scene.nodes.map(node => node.instanceId === item.instanceId ? { ...node, displayLabel: label, supportingText: detail, supportingByMode: undefined, detail, sourceRefIds: sources, sources: undefined } : node) };
  }
  function add(endpoint: Endpoint, label: string, type: ComponentType, detail: string, sources: string[], boundaryId?: string) {
    const owner = page(endpoint.scopeId), template = owner.cells[0], sceneId = `${catalog.id}.drawio.platform.${endpoint.scopeId}.${endpoint.cellId}`;
    const node: SceneNode = { instanceId: endpoint.cellId, entityId: sceneId, role: type === "control" ? "decision" : "service", displayLabel: label, supportingText: detail, detail, sourceRefIds: sources, x: 0, y: 0, width: 240, height: 112 };
    catalog.scenes[sceneId] = { ...catalog.scenes[template.sceneId], id: sceneId, title: label, purpose: detail, entryInstanceIds: [node.instanceId], exitInstanceIds: [node.instanceId], nodes: [node], relationships: [], guides: undefined };
    owner.cells.push({ id: endpoint.cellId, label, sceneId, instanceId: endpoint.cellId, componentType: type, boundaryId, x: 0, y: 0, width: 240, height: 112 });
    if (owner.flow) owner.flow.push([endpoint.cellId]);
  }
  const system = page("system");
  system.edges = system.edges.filter(edge => !["security", "observability"].includes(edge.layer ?? ""));
  if (catalog.id === "brahe-bank") {
    for (const scope of ["check", "return"]) page(scope).edges = page(scope).edges.filter(edge => !edge.id.endsWith(".inspection"));
  } else if (catalog.id === "interbank-a2a") {
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
    for (const id of ["ib.trace.agents", "ib.trace.gateways", "collector-b"]) addConnection(spans(at("trace", id), at("trace", "ib.trace.handoff"), [id === "ib.trace.agents" ? "interbank.telemetry.setup" : "interbank.collector"], id === "ib.trace.agents" ? "GenAI spans" : "OTLP export"));
  } else {
    const defense = pages.find(item => item.id === "defense"), observe = page("observe");
    if (defense) {
      if (!defense.cells.some(item => item.id === "guards")) add(at("defense", "guards"), "AI Defense Inspection API", "service", "The application sends text to the hosted Inspection API, then applies the verdict locally.", contract.connections.filter(item => item.kind === "control").flatMap(item => item.sources), "hosted");
      // The application owns denial. Inspection returns a verdict to its caller.
      defense.edges = defense.edges.filter(edge => edge.from !== "guards");
      const callers = defense.cells.filter(item => ["call", "inspect", "segments", "hops"].includes(item.id));
      for (const caller of callers) {
        defense.edges = defense.edges.filter(edge => !(edge.from === caller.id && edge.to === "guards"));
        addConnection(inspect(at("defense", caller.id), at("defense", "guards"), contract.connections.filter(item => item.kind === "control").flatMap(item => item.sources)));
        if (defense.cells.some(item => item.id === "stop")) addConnection({ from: at("defense", caller.id), to: at("defense", "stop"), kind: "control", label: "Deny / unavailable", sources: contract.connections.filter(item => item.kind === "control").flatMap(item => item.sources) });
      }
      const controls = observe.cells.find(item => item.id === "controls");
      if (controls) {
        observe.cells = observe.cells.filter(item => item.id !== "controls");
        observe.edges = observe.edges.filter(edge => edge.from !== "controls" && edge.to !== "controls");
        defense.cells.push({ ...controls, componentType: "control", boundaryId: "policy" });
        defense.groups!.push({ id: "policy", label: "Hosted Agent Control" });
        const policy = policyCallers[catalog.id];
        if (!policy) throw new Error(`${catalog.id}: Agent Control needs an explicit application caller`);
        add(at(policy.scopeId, "policy-check"), policy.label, "control", policy.detail, [policy.source], "owner");
        describe(at("defense", "controls"), "Agent Control", "control", "The application submits typed verdicts to the hosted policy service and applies the returned decision before proceeding. Trace export is a separate path.", [policy.source]);
        addConnection(inspect(at(policy.scopeId, "policy-check"), at("defense", "controls"), [policy.source], "Evaluate / decision"));
      }
    }
    if (catalog.id === "code-vulnerability") page("security").edges = page("security").edges.filter(edge => edge.to !== "export");
    const additions = applicationClients[catalog.id] ?? [];
    for (const item of additions) add(at(item.scopeId, item.id), item.label, "service", item.detail, [item.source], "owner");
    const traceSource = traceSources[catalog.id];
    if (traceSource) {
      const ingress = observe.cells.find(item => ["span", "in", "trace"].includes(item.id))!;
      describe(at("observe", ingress.id), catalog.id === "company-briefing" ? "Briefing run spans" : "Agent trace callbacks", "telemetry", catalog.id === "company-briefing" ? "The briefing adapter exports run spans as OTLP JSON when a destination is configured." : "Instrumented model and tool calls feed the configured agent trace exporter. Export status is reported separately from execution.", [traceSource]);
      observe.groups = [{ id: "application", label: "Application telemetry" }, { id: "destination", label: "Configured telemetry destination" }];
      observe.edges = [];
      if (catalog.id !== "company-briefing") {
        add(at("observe", "ao"), "Splunk Agent Observability", "telemetry", "The agent trace SDK exports to the configured project and stream. Credentials and a successful run are needed to confirm delivery.", [traceSource], "destination");
        addConnection(spans(at("observe", ingress.id), at("observe", "ao"), [traceSource], "SDK export"));
      } else {
        describe(at("system", "observe"), "Configured OTLP destination", "telemetry", "The briefing service exports run spans through its configured OTLP HTTP endpoint.", [traceSource, "platform.briefing-export"]);
        describe(at("observe", "otlp"), "Configured OTLP destination", "telemetry", "The run telemetry adapter posts OTLP JSON to the configured HTTP destination and reports the result.", ["platform.briefing-export"]);
        cell(at("observe", "otlp")).boundaryId = "destination";
        addConnection(spans(at("observe", ingress.id), at("observe", "otlp"), ["platform.briefing-export"], "OTLP JSON"));
      }
      if (["market-research", "client-advisory", "sar-support"].includes(catalog.id)) {
        const source = catalog.id === "sar-support" ? "platform.sar-otlp" : "platform.wealth-otlp";
        describe(at("observe", "otlp"), "Splunk GenAI instrumentation", "telemetry", "LangChain instrumentation supplies spans to the OpenTelemetry processor independently of the Galileo agent callbacks.", [source]);
        add(at("observe", "otlp-destination"), "Configured OTLP destination", "telemetry", "The OpenTelemetry exporters use explicit trace and metric endpoints or the configured Splunk realm. Delivery is reported separately.", [source], "destination");
        addConnection(spans(at("observe", "otlp"), at("observe", "otlp-destination"), [source], "OTLP export"));
      }
      if (catalog.id === "fraud-modeling") describe(at("observe", "otlp"), "OTLP status only", "telemetry", "The adapter reports OTLP configuration presence. This status helper sends no spans. The implemented agent trace path uses the Galileo SDK.", ["platform.fraud-otlp-status"]);
    }
  }
  function addConnection(connection: Connection) {
    const source = cell(connection.from), target = cell(connection.to);
    for (const id of connection.sources) if (!evidence[id]) throw new Error(`${catalog.id}: unknown platform evidence ${id}`);
    if (contract.status === "implemented" && !connection.sources.length) throw new Error(`${catalog.id}: implemented platform connection needs source evidence`);
    for (const item of [source, target]) {
      const scene = catalog.scenes[item.sceneId];
      catalog.scenes[item.sceneId] = { ...scene, nodes: scene.nodes.map(node => node.instanceId === item.instanceId ? {
        ...node, sourceRefIds: [...new Set([...(node.sourceRefIds ?? []), ...connection.sources])],
        sources: node.sources?.length ? [...node.sources, ...connection.sources.filter(id => !node.sources!.some(source => source.id === id)).map(id => ({ id, label: evidence[id].label ?? evidence[id].symbol }))] : node.sources,
      } : node) };
    }
    const id = `${catalog.id}.platform-link.${connection.from.scopeId}.${source.id}.${connection.to.scopeId}.${target.id}.${connection.kind}`;
    if (system.edges.some(edge => edge.id === id)) return;
    catalog.relationships.push({ id, fromEntityId: diagramNode(catalog, source).entityId!, toEntityId: diagramNode(catalog, target).entityId!, kind: connection.kind, fact: connection.label });
    system.edges.push({ id, from: source.id, fromScopeId: connection.from.scopeId, to: target.id, toScopeId: connection.to.scopeId, kind: connection.kind, layer: connection.kind === "telemetry" ? "observability" : "security", label: contract.status === "proposed" ? `Proposed ${connection.label.replace(/^Proposed /, "")}` : connection.label, modes: contract.status === "proposed" ? ["proposed"] : undefined, relationshipIds: [id], bidirectional: connection.bidirectional });
  }
  for (const connection of contract.connections) addConnection(connection);
  return { catalog, pages };
}

const applicationClients: Record<string, { scopeId: string; id: string; label: string; detail: string; source: string }[]> = {
  "fraud-modeling": [
    { scopeId: "score", id: "screen", label: "Screen dispute note", detail: "The application inspects an untrusted cardholder dispute note before the triage agent sees it.", source: "platform.fraud-inspection" },
  ],
  "company-briefing": [{ scopeId: "workload", id: "delivery", label: "Run telemetry adapter", detail: "The server collects briefing run spans and invokes the OTLP JSON exporter after execution.", source: "platform.briefing-trace" }],
  "market-research": [{ scopeId: "market", id: "screen", label: "Screen article text", detail: "The evidence loader screens each article before structured assessment. Flagged or uninspected required evidence is withheld.", source: "platform.wealth-screen" }],
  "client-advisory": [{ scopeId: "context", id: "screen", label: "Screen CRM notes", detail: "The context loader screens untrusted CRM notes before drafting and masks detected personal information.", source: "platform.wealth-screen" }],
  "sar-support": [{ scopeId: "workload", id: "screen", label: "Screen evidence segments", detail: "The application screens untrusted documents, memos and referral notes before they reach the model.", source: "platform.sar-inspection" }],
};
const traceSources: Record<string, string> = { "fraud-modeling": "platform.fraud-trace", "company-briefing": "platform.briefing-trace", "market-research": "platform.wealth-trace", "client-advisory": "platform.wealth-trace", "sar-support": "platform.sar-trace" };
const policyCallers: Record<string, { scopeId: string; label: string; detail: string; source: string }> = {
  "fraud-modeling": { scopeId: "score", label: "Action and note gates", detail: "Investigation tools evaluate action permissions and note PII before applying a case action or writing a note.", source: "platform.fraud-controls" },
  "market-research": { scopeId: "workload", label: "Research precheck", detail: "The application submits deterministic precheck verdicts before screening evidence and calling the assessment model.", source: "platform.research-controls" },
  "client-advisory": { scopeId: "workload", label: "Brief release gate", detail: "The application evaluates suitability, grounding and approval verdicts before releasing the brief.", source: "platform.advisory-controls" },
  "sar-support": { scopeId: "workload", label: "Investigation gates", detail: "The application evaluates deterministic SAR control verdicts before controlled actions.", source: "platform.sar-controls" },
};
