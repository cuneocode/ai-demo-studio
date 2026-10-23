import type { Catalog } from "../catalog.ts";
import { INTERBANK_GROUPS as G, projectInterbankSystem } from "../interbank-system.ts";
import type { SceneSpec } from "../scene-model.ts";
import type { DiagramCell, DiagramEdge, DiagramLayer, DiagramPage } from "./model.ts";

export function interbankDiagram(catalog: Catalog): { catalog: Catalog; pages: DiagramPage[] } {
  const scenes = { ...catalog.scenes };
  function projection(id: string, groups: string[]): SceneSpec {
    const implemented = projectInterbankSystem(groups, "implemented");
    const proposed = projectInterbankSystem(groups, "proposed");
    const sceneId = `interbank.drawio.${id}`;
    scenes[sceneId] = { ...implemented, id: sceneId, nodes: implemented.nodes.map((node) => ({
      ...node, supportingByMode: { implemented: node.supportingText ?? "", proposed: proposed.nodes.find((item) => item.instanceId === node.instanceId)?.supportingText ?? "" },
    })) };
    return scenes[sceneId];
  }
  function cell(scene: SceneSpec, instanceId: string, extra: Partial<DiagramCell> = {}): DiagramCell {
    const node = scene.nodes.find((item) => item.instanceId === instanceId)!;
    return { id: instanceId, label: node.displayLabel, caption: node.supportingText && node.supportingText.length < 66 ? node.supportingText : undefined, sceneId: scene.id, instanceId, x: 0, y: 0, width: 240, height: 112, ...extra };
  }
  function edges(scene: SceneSpec, cells: DiagramCell[]): DiagramEdge[] {
    const ids = new Set(cells.map((item) => item.id));
    return scene.relationships.filter((edge) => ids.has(edge.sourceInstanceId) && ids.has(edge.targetInstanceId)).map((edge) => ({
      id: edge.id, from: edge.sourceInstanceId, to: edge.targetInstanceId,
      label: edge.label ?? (edge.kind === "control" ? "Decision" : edge.kind === "return" ? "Return" : "Continue"), relationshipIds: edge.modelRelationshipIds,
      kind: edge.kind === "businessSequence" || edge.kind === "support" ? "request" : edge.kind,
    }));
  }
  const root = catalog.scenes[catalog.rootSceneId];
  const journeyCells = root.nodes.filter((node) => node.role === "activity").map((node) => cell(root, node.instanceId, { targetPageId: node.entityId === "investigate" ? "system" : undefined }));
  const system = projection("system", [G.investigation]);
  const platforms: [string, DiagramLayer, string][] = [["defense", "security", "inspection"], ["observe", "observability", "trace"], ["infra", "deployment", "hosting"]];
  const systemCells = [
    ...["kickoff", "exchange", "report"].map((id) => cell(system, `ib.stage.${id}`, { targetPageId: id })),
    ...platforms.map(([id, layer, targetPageId]) => cell(system, `ib.platform.${id}`, { layer, targetPageId })),
  ];
  const systemEdges = edges(system, systemCells);
  for (const [id, layer] of platforms) systemEdges.push({ id: `support.${id}`, from: "ib.stage.exchange", to: `ib.platform.${id}`, label: layer === "security" ? "Gateway inspection" : layer === "observability" ? "Spans + controls" : "Runtime + inference", relationshipIds: [`ib-sup-${id}`], kind: layer === "security" ? "control" : layer === "observability" ? "telemetry" : "hosting", layer });
  const pages: DiagramPage[] = [{ id: "journey", title: "Business journey", level: 0, purpose: root.purpose, layers: [], cells: journeyCells, edges: edges(root, journeyCells), flow: [journeyCells.map(item => item.id)], note: "Operations owns the remediation decision. Open the investigation to explore both banks." }, {
    id: "system", title: "System architecture", level: 1, parentId: "journey", purpose: "Admit and inspect the kickoff, investigate through both banks' gateways, then inspect the report before release.", layers: ["security", "observability", "deployment"], cells: systemCells, edges: systemEdges, autoLayout: true,
    note: "Each bank retains its own network, CA, agent, and records. Proposed mode describes deployment options.",
    flow: [["ib.stage.kickoff", "ib.stage.exchange", "ib.stage.report"]],
  }];
  function detail(id: string, title: string, groups: string[], ids: string[], options: Partial<DiagramPage> = {}, targets: Record<string, string> = {}) {
    const scene = projection(id, groups);
    const cells = ids.map((instanceId) => cell(scene, instanceId, { targetPageId: targets[instanceId] }));
    const page: DiagramPage = { id, title, level: 2, parentId: "system", purpose: scene.purpose, layers: [], cells, edges: edges(scene, cells), autoLayout: true, ...options };
    pages.push(page);
    return page;
  }
  const kickoff = detail("kickoff", "Open the case", [G.investigation, G.kickoff], ["ib.kickoff.console", "ib.kickoff.admit", "ib.kickoff.inspect", "ib.kickoff.forward", "ib.kickoff.stop"], { groups: [{ id: "gateway", label: "Bank A · console gateway" }] }, { "ib.kickoff.inspect": "inspection", "ib.kickoff.forward": "exchange" });
  kickoff.cells.forEach((item) => { if (item.id !== "ib.kickoff.console") item.boundaryId = "gateway"; });
  kickoff.flow = [["ib.kickoff.console", "ib.kickoff.admit", "ib.kickoff.inspect", "ib.kickoff.forward"], ["", "", "ib.kickoff.stop"]];
  for (const answer of [false, true]) {
    const prefix = answer ? "ib.report" : "ib.kickoff";
    const id = answer ? "report-inspection" : "inspection";
    const page = detail(id, answer ? "Inspect the report" : "Inspect the A2A text", [G.investigation, answer ? G.report : G.kickoff, answer ? G.reportInspection : G.kickoffInspection], [`${prefix}.inspect.call`, `${prefix}.inspect.api`, `${prefix}.inspect.apply`, `${prefix}.${answer ? "deliver" : "forward"}`, `${prefix}.stop`], {
      owner: { scopeId: answer ? "report" : "kickoff", cellId: `${prefix}.inspect` },
      purpose: "The gateway sends message text to AI Defense, then enforces the verdict. A violation returns 403; unavailable inspection returns 503.",
      flow: [[`${prefix}.inspect.call`, `${prefix}.inspect.api`, `${prefix}.inspect.apply`, `${prefix}.${answer ? "deliver" : "forward"}`], ["", "", `${prefix}.stop`]],
      groups: [{ id: "gateway-call", label: "Bank A · gateway request" }, { id: "defense", label: "Hosted AI Defense" }, { id: "gateway-enforce", label: "Bank A · enforcement" }],
    }, answer ? {} : { "ib.kickoff.forward": "exchange" });
    page.cells.forEach((item) => { item.boundaryId = item.id.endsWith(".api") ? "defense" : item.id.endsWith(".call") ? "gateway-call" : "gateway-enforce"; });
  }
  const exchangeScene = projection("exchange", [G.investigation, G.exchange]);
  const exchange = (instanceId: string, x: number, y: number, extra: Partial<DiagramCell> = {}) => cell(exchangeScene, instanceId, { x, y, width: 220, height: 120, ...extra });
  pages.push({
    id: "exchange", title: "Investigate across banks", level: 2, parentId: "system", layers: [],
    purpose: "Each agent reads its own bank's records. Agent Control gates the outbound tool; both gateways inspect the request and reply.",
    groups: [{ id: "bank-a", label: "Bank A · own network and CA" }, { id: "bank-b", label: "Bank B · own network and CA" }],
    flow: [["ib.a.coordinator", "ib.a.control", "ib.a.gateway", "ib.b.gateway", "ib.b.investigator"], ["ib.a.records", "ib.a.not-sent", "", "", "ib.b.records"]],
    cells: [
      exchange("ib.a.coordinator", 45, 110), exchange("ib.a.records", 335, 110),
      exchange("ib.a.control", 45, 320, { targetPageId: "control" }), exchange("ib.a.gateway", 335, 320),
      exchange("ib.a.not-sent", 45, 505, { height: 70 }), exchange("ib.b.gateway", 685, 320),
      exchange("ib.b.investigator", 970, 320), exchange("ib.b.records", 970, 110),
    ],
    edges: [
      { id: "tool", from: "ib.a.coordinator", to: "ib.a.control", label: "Partner tool", relationshipIds: ["ib-x-tool"], exit: [.5, 1], entry: [.5, 0] },
      { id: "records-a", from: "ib.a.coordinator", to: "ib.a.records", label: "Read", relationshipIds: ["ib-x-records-a"] },
      { id: "allow", from: "ib.a.control", to: "ib.a.gateway", label: "Allow", relationshipIds: ["ib-x-egress"], kind: "control" },
      { id: "deny", from: "ib.a.control", to: "ib.a.not-sent", label: "Deny", relationshipIds: ["ib-x-not-sent"], kind: "control", exit: [.5, 1], entry: [.5, 0] },
      { id: "mtls", from: "ib.a.gateway", to: "ib.b.gateway", label: "A2A / mTLS", relationshipIds: ["ib-x-boundary", "ib-x-reply"], bidirectional: true },
      { id: "ingress", from: "ib.b.gateway", to: "ib.b.investigator", label: "Message", relationshipIds: ["ib-x-ingress", "ib-x-reply"], bidirectional: true },
      { id: "records-b", from: "ib.b.investigator", to: "ib.b.records", label: "Read", relationshipIds: ["ib-x-records-b"], exit: [.5, 0], entry: [.5, 1] },
      { id: "reply", from: "ib.a.gateway", to: "ib.a.coordinator", label: "Inspected reply", relationshipIds: ["ib-x-reply"], kind: "return", exit: [.5, 0], entry: [1, .75], via: [[445, 275], [305, 275], [305, 200]] },
    ],
    note: "Select the control or a gateway for evidence. Return to System architecture for tracing, inspection, and deployment layers.",
  });
  pages.find(page => page.id === "exchange")!.cells.forEach(item => { item.boundaryId = item.id.startsWith("ib.a.") ? "bank-a" : "bank-b"; });
  const control = detail("control", "Check before sending", [G.investigation, G.exchange, G.outboundControl], ["ib.a.coordinator", "ib.a.control.evaluate", "ib.a.control.api", "ib.a.control.apply", "ib.a.gateway", "ib.a.not-sent"], {
    owner: { scopeId: "exchange", cellId: "ib.a.control" },
    purpose: "The partner tool names bank-a.send_a2a_message, calls Agent Control, and applies its verdict before egress.",
    flow: [["ib.a.coordinator", "ib.a.control.evaluate", "ib.a.control.api", "ib.a.control.apply", "ib.a.gateway"], ["", "", "", "ib.a.not-sent"]],
    groups: [{ id: "application", label: "Bank A · partner tool" }, { id: "hosted", label: "Hosted policy service" }, { id: "enforcement", label: "Bank A · enforcement" }],
  });
  control.cells.forEach((item) => {
    item.width = 220; item.height = 110;
    item.boundaryId = item.id.endsWith(".api") ? "hosted" : item.id.endsWith(".evaluate") || item.id === "ib.a.coordinator" ? "application" : "enforcement";
  });
  const report = detail("report", "Return the report", [G.investigation, G.report], ["ib.report.draft", "ib.report.inspect", "ib.report.deliver", "ib.report.stop", "ib.approve"], { groups: [{ id: "gateway", label: "Bank A · console gateway" }] }, { "ib.report.inspect": "report-inspection" });
  report.cells.forEach((item) => { if (item.id !== "ib.approve") item.boundaryId = "gateway"; });
  report.flow = [["ib.report.draft", "ib.report.inspect", "ib.report.deliver", "ib.approve"], ["", "ib.report.stop"]];
  const hosting = detail("hosting", "Runtime and inference", [G.investigation, G.exchange, G.hosting], ["ib.host.runtime", "ib.host.endpoint"], {
    purpose: "The local Docker lab separates each bank's agent, gateway, policy, and collector. Proposed mode shows the private inference option.",
    note: "Source evidence describes local configuration. Hosted deployment and inference remain proposed options.",
  });
  hosting.cells.find((item) => item.id === "ib.host.endpoint")!.labelByMode = { implemented: "Configured model endpoint", proposed: "Proposed private inference" };
  const trace = detail("trace", "One trace across both banks", [G.investigation, G.exchange, G.trace], ["ib.trace.agents", "ib.trace.gateways", "ib.trace.handoff"], {
    purpose: "Agent spans and gateway spans correlate through the session. The caller's span travels in A2A metadata and links to the receiving agent.",
    note: "Select a component for trace setup, exporter, and correlation evidence. Configured export is separate from confirmed delivery.",
  });
  trace.edges = [
    { id: "agents-handoff", from: "ib.trace.agents", to: "ib.trace.handoff", label: "Caller span link", relationshipIds: ["ib-trace-handoff"], kind: "telemetry" },
    { id: "gateways-handoff", from: "ib.trace.gateways", to: "ib.trace.handoff", label: "Session correlation", relationshipIds: ["ib-trace-gateways", "ib-trace-handoff"], kind: "telemetry" },
  ];
  return { catalog: { ...catalog, scenes }, pages };
}
