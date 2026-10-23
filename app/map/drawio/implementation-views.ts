import type { Catalog } from "../catalog.ts";
import type { SceneNode } from "../scene-model.ts";
import { diagramNode, type ComponentType, type DiagramPage } from "./model.ts";

type Occurrence = { scopeId: string; cellId: string };
export const modelConsumers: Record<string, Occurrence[]> = {
  "code-vulnerability": [{ scopeId: "model", cellId: "inference" }],
  "fraud-modeling": [{ scopeId: "score", cellId: "agent" }],
  "company-briefing": [{ scopeId: "workload", cellId: "supervisor" }, { scopeId: "workload", cellId: "subagents" }],
  "market-research": [{ scopeId: "workload", cellId: "assessment" }],
  "client-advisory": [{ scopeId: "workload", cellId: "agent" }, { scopeId: "workload", cellId: "planner" }, { scopeId: "workload", cellId: "critic" }],
  "sar-support": [{ scopeId: "workload", cellId: "agent" }],
  "kyc-processing": [{ scopeId: "workload", cellId: "case" }],
  "transaction-llm": [{ scopeId: "pipeline", cellId: "extract" }, { scopeId: "exception", cellId: "agent" }],
  "brahe-bank": [{ scopeId: "build", cellId: "supervisor" }, { scopeId: "build", cellId: "cards" }, { scopeId: "build", cellId: "score" }, { scopeId: "check", cellId: "judge" }, { scopeId: "return", cellId: "judge" }],
  "interbank-a2a": [{ scopeId: "exchange", cellId: "ib.a.coordinator" }, { scopeId: "exchange", cellId: "ib.b.investigator" }],
};
const callSources: Record<string, string[]> = {
  "code-vulnerability": ["platform.vulnerability-profile", "vulnerability.scan"],
  "fraud-modeling": ["platform.fraud-agent"],
  "company-briefing": ["platform.briefing-agent"],
  "market-research": ["platform.research-calls"],
  "client-advisory": ["platform.advisory-agents"],
  "sar-support": ["platform.sar-agent"],
  "interbank-a2a": ["platform.interbank-agent"],
};

/** One endpoint per inference service, with calls from the actual application roles. */
export function connectImplementationViews(input: { catalog: Catalog; pages: DiagramPage[] }) {
  const catalog = { ...input.catalog, scenes: { ...input.catalog.scenes }, relationships: [...input.catalog.relationships] };
  let pages = input.pages.map(page => ({ ...page, groups: page.groups?.map(group => ({ ...group })), cells: page.cells.map(cell => ({ ...cell })), edges: page.edges.map(edge => ({ ...edge })) }));
  const system = pages.find(page => page.id === "system")!;
  const page = (id: string) => pages.find(item => item.id === id)!;
  const cell = (scope: string, id: string) => page(scope).cells.find(item => item.id === id)!;
  function describe(scope: string, id: string, label: string, type: ComponentType, detail?: string, sources?: string[]) {
    const item = cell(scope, id);
    item.label = label;
    item.componentType = type;
    const original = catalog.scenes[item.sceneId];
    catalog.scenes[item.sceneId] = { ...original, nodes: original.nodes.map(node => node.instanceId !== item.instanceId ? node : {
      ...node, displayLabel: label, ...(detail ? { supportingText: detail, detail, supportingByMode: undefined } : {}),
      ...(sources ? { sourceRefIds: sources, sources: undefined } : {}),
    }) };
  }
  function add(scope: string, id: string, label: string, type: ComponentType, detail: string, sources?: string[]) {
    const owner = page(scope), template = owner.cells[0], sceneId = `${catalog.id}.drawio.calls.${scope}.${id}`;
    const node: SceneNode = { instanceId: id, entityId: `${catalog.id}.calls.${scope}.${id}`, role: type === "agent" ? "agent" : "service", displayLabel: label, supportingText: detail, sourceRefIds: sources, x: 0, y: 0, width: 240, height: 120 };
    catalog.scenes[sceneId] = { ...catalog.scenes[template.sceneId], id: sceneId, title: label, purpose: detail, entryInstanceIds: [id], exitInstanceIds: [id], guides: undefined, nodes: [node], relationships: [] };
    owner.cells.push({ id, label, sceneId, instanceId: id, componentType: type, boundaryId: template.boundaryId, x: 0, y: 0, width: 240, height: 120 });
  }
  function link(from: Occurrence, to: Occurrence, label: string, kind: "request" | "hosting" | "telemetry" | "control" = "request", layer?: "deployment" | "observability" | "security", modes?: ("implemented" | "proposed")[]) {
    const source = cell(from.scopeId, from.cellId), target = cell(to.scopeId, to.cellId);
    const id = `${catalog.id}.calls.${from.scopeId}.${from.cellId}.${to.scopeId}.${to.cellId}.${kind}`;
    catalog.relationships.push({ id, fromEntityId: diagramNode(catalog, source).entityId!, toEntityId: diagramNode(catalog, target).entityId!, kind, fact: label });
    page(from.scopeId).edges.push({ id, from: source.id, to: target.id, toScopeId: from.scopeId !== to.scopeId ? to.scopeId : undefined, label, kind, layer, modes, relationshipIds: [id] });
  }

  const infrastructure = pages.find(item => item.id === "infrastructure");
  if (infrastructure) {
    const legacy = page("model");
    if (catalog.id !== "code-vulnerability") {
      // The old model scope and the infrastructure scope describe the same service.
      // Keep its evidence on the canonical endpoint and remove the second occurrence.
      const endpoint = cell("infrastructure", "endpoint");
      const refs = [...new Set([...legacy.cells.flatMap(item => {
        const node = diagramNode(catalog, item);
        return [...(node.sourceRefIds ?? []), ...(node.sources ?? []).map(source => source.id)];
      }), ...(callSources[catalog.id] ?? []), "platform.model-routing", "platform.egress"])];
      describe("infrastructure", "endpoint", catalog.id === "kyc-processing" ? "Proposed document model" : catalog.id === "transaction-llm" ? "Proposed extraction model" : "Configured model endpoint", "model", undefined, refs);
      endpoint.labelByMode = { proposed: catalog.id === "kyc-processing" ? "Proposed document model" : catalog.id === "transaction-llm" ? "Proposed extraction model" : "Proposed inference endpoint" };
      const previous = cell("system", "model");
      const canonical = diagramNode(catalog, endpoint);
      const scene = catalog.scenes[endpoint.sceneId];
      catalog.scenes[endpoint.sceneId] = { ...scene, nodes: scene.nodes.map(node => node.instanceId === canonical.instanceId ? { ...node, entityId: diagramNode(catalog, previous).entityId } : node) };
      system.cells = system.cells.filter(item => item.id !== "model");
      system.flow = system.flow?.map(row => row.filter(id => id !== "model"));
      system.edges = system.edges.filter(edge => edge.from !== "model" && edge.to !== "model");
      pages = pages.filter(item => item.id !== "model");
    } else {
      describe("model", "route", "Build role profile", "tool", "The worker writes a Visa profile that assigns discovery, verification, and remediation roles to the selected provider using the DeepAgents backend.", ["platform.vulnerability-profile"]);
      describe("model", "inference", "Visa DeepAgents", "agent", "Visa scan and remediation run model-driven roles through DeepAgents on LangGraph. Every role uses the selected endpoint from the generated profile.", callSources[catalog.id]);
      describe("workload", "scan", "Isolated scan operation", "workflow");
      describe("workload", "patch", "Reviewed patch operation", "workflow");
      page("model").title = "Visa DeepAgents runtime";
      page("model").purpose = "A generated profile binds every model-driven Visa role to the selected endpoint. Scan and remediation execute in isolated workers.";
      page("model").edges = [];
      link({ scopeId: "model", cellId: "route" }, { scopeId: "model", cellId: "inference" }, "Role profile");
      const observe = page("observe");
      observe.cells = observe.cells.filter(item => item.id !== "controls");
      observe.edges = observe.edges.filter(edge => edge.from !== "controls" && edge.to !== "controls");
      system.edges = system.edges.filter(edge => !(edge.from === "observe" && edge.kind === "control"));
      describe("security", "gates", "Agent Control gates", "control");
      link({ scopeId: "security", cellId: "gates" }, { scopeId: "observe", cellId: "export" }, "Control events", "telemetry", "observability");
    }
    infrastructure.edges = infrastructure.edges.filter(edge => edge.from !== "runtime");
    link({ scopeId: "infrastructure", cellId: "runtime" }, { scopeId: "infrastructure", cellId: "routing" }, "Hosts routing", "hosting");
    system.edges = system.edges.filter(edge => edge.id !== "platform.deployment.participation");
    const summary = catalog.id === "code-vulnerability" ? "model" : catalog.id === "fraud-modeling" ? "score" : catalog.id === "transaction-llm" ? "pipeline" : "workload";
    link({ scopeId: "system", cellId: summary }, { scopeId: "infrastructure", cellId: "routing" }, "Model calls", "request", "deployment");
    // Inspection is performed by the application client, before and after inference.
    if (["company-briefing", "client-advisory", "sar-support", "kyc-processing", "transaction-llm"].includes(catalog.id)) {
      link({ scopeId: "system", cellId: summary }, { scopeId: "system", cellId: "defense" }, "Inspect model I/O", "control", "security");
    }
    if (catalog.id === "company-briefing") describe("infrastructure", "routing", "Studio model routing", "service", "The briefing adapter selects its Studio chain. If no backend resolves, its model settings fall back to the environment configuration.", ["platform.briefing-routing", "platform.model-routing"]);
    if (catalog.id === "fraud-modeling") {
      describe("system", "graph", "Graph scoring service", "service");
      add("score", "agent", "Triage Deep Agent", "agent", "The triage Deep Agent receives scored evidence, calls investigation tools, and drafts an analyst summary. GraphSAGE and XGBoost scoring use a separate scorer service.", callSources[catalog.id]);
      link({ scopeId: "score", cellId: "band" }, { scopeId: "score", cellId: "agent" }, "Scored alert");
      add("infrastructure", "scorer", "Configured scorer runtime", "infrastructure", "The scorer chain supplies the separate GraphSAGE and XGBoost service. Recorded or sample scores can answer when live scoring is unavailable. It does not use the language model endpoint.", ["fraud.score"]);
      cell("infrastructure", "scorer").boundaryId = "scorer";
      infrastructure.groups!.push({ id: "scorer", label: "Separate scoring service" });
      infrastructure.flow!.push(["scorer"]);
      link({ scopeId: "system", cellId: "graph" }, { scopeId: "infrastructure", cellId: "scorer" }, "Scorer placement", "hosting", "deployment");
      link({ scopeId: "graph", cellId: "gnn" }, { scopeId: "infrastructure", cellId: "scorer" }, "Served by scorer", "hosting", "deployment");
    }
    if (catalog.id === "client-advisory") {
      page("workload").purpose = "The meeting-prep supervisor and its planner and compliance reviewer draft against deterministic suitability findings. The advisor and supervisor own release.";
      add("workload", "agent", "Meeting-prep supervisor", "agent", "The meeting-prep Deep Agent uses a planner and compliance reviewer with the same selected model. It drafts and submits a brief against deterministic findings and actions.", callSources[catalog.id]);
      add("workload", "planner", "Planner subagent", "agent", "The planner ranks suitable actions using next-best actions, suitability findings, and the household profile.", callSources[catalog.id]);
      add("workload", "critic", "Compliance reviewer", "agent", "The compliance reviewer calls the brief verifier and issuer policy tools. Human approval remains a separate step.", callSources[catalog.id]);
      page("workload").edges = page("workload").edges.filter(edge => !(edge.from === "nba" && edge.to === "grounding"));
      link({ scopeId: "workload", cellId: "nba" }, { scopeId: "workload", cellId: "agent" }, "Findings and actions");
      link({ scopeId: "workload", cellId: "agent" }, { scopeId: "workload", cellId: "planner" }, "Delegate");
      link({ scopeId: "workload", cellId: "agent" }, { scopeId: "workload", cellId: "critic" }, "Review draft");
      link({ scopeId: "workload", cellId: "critic" }, { scopeId: "workload", cellId: "grounding" }, "Verify claims");
      page("workload").flow = [["suitability", "nba", "agent", "grounding", "gate"], ["", "", "planner", "critic"]];
    }
    if (catalog.id === "market-research") describe("workload", "assessment", "Structured model calls", "service", "The application makes an Assessment call with one repair attempt, then an Outlook call if rejected facts require a revised opinion. These are structured LangChain calls.", callSources[catalog.id]);
    if (catalog.id === "transaction-llm") {
      add("pipeline", "extract", "Proposed extraction client", "service", "A proposed application client would call the extraction endpoint before deterministic schema validation. This use case has no running extraction service.");
      link({ scopeId: "pipeline", cellId: "extract" }, { scopeId: "pipeline", cellId: "validate" }, "Proposed fields");
      page("pipeline").flow = [["extract", "validate", "publish"], ["", "exception"]];
    }
    for (const consumer of modelConsumers[catalog.id]) {
      const item = cell(consumer.scopeId, consumer.cellId);
      const sources = callSources[catalog.id];
      if (sources) describe(consumer.scopeId, consumer.cellId, item.label, item.componentType ?? "agent", undefined, sources);
      link(consumer, { scopeId: "infrastructure", cellId: "routing" }, "Model calls", "request", "deployment");
    }
  } else if (catalog.id === "brahe-bank") {
    for (const edge of system.edges.filter(edge => edge.id.startsWith("system.model."))) edge.kind = "request";
    for (const consumer of modelConsumers[catalog.id]) {
      if (consumer.cellId === "judge") describe(consumer.scopeId, consumer.cellId, cell(consumer.scopeId, consumer.cellId).label, "service");
      for (const mode of ["implemented", "proposed"] as const) link(consumer, { scopeId: "system", cellId: mode === "implemented" ? "model" : "private" }, "Model calls", "request", "deployment", [mode]);
    }
    for (const scope of ["check", "return"]) for (const mode of ["implemented", "proposed"] as const) link({ scopeId: "system", cellId: scope === "return" ? "release" : "check" }, { scopeId: "system", cellId: mode === "implemented" ? "model" : "private" }, "Judge model calls", "request", "deployment", [mode]);
  } else if (catalog.id === "interbank-a2a") {
    system.edges = system.edges.filter(edge => edge.id !== "support.infra");
    link({ scopeId: "system", cellId: "ib.stage.exchange" }, { scopeId: "hosting", cellId: "ib.host.endpoint" }, "Model calls", "request", "deployment");
    for (const consumer of modelConsumers[catalog.id]) {
      const item = cell(consumer.scopeId, consumer.cellId);
      const original = diagramNode(catalog, item);
      describe(consumer.scopeId, consumer.cellId, item.label, "agent", undefined, [...new Set([...(original.sourceRefIds ?? []), ...(original.sources ?? []).map(source => source.id), ...callSources[catalog.id]])]);
      link(consumer, { scopeId: "hosting", cellId: "ib.host.endpoint" }, "Model calls", "request", "deployment");
    }
  }
  for (const detail of pages) if (detail.id === "defense" && detail.cells.some(item => item.id === "guards")) describe("defense", "guards", "AI Defense Inspection API", "service", "The application sends text to the configured AI Defense Inspection API and reads the verdict. The API's internal model deployment is outside this application's implementation.");
  return { catalog, pages };
}
