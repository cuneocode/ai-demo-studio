import type { Catalog } from "../catalog.ts";
import { evidence } from "../evidence.ts";
import type { SceneNode } from "../scene-model.ts";
import { diagramNode, type ComponentType, type DiagramCell, type DiagramPage } from "./model.ts";

import { at, inspect, spans, type Connection, type Contract, type Endpoint } from "./platform-contract.ts";
import { platformDefinitions } from "./platform-registry.ts";

/** Every demo declares its callers, enforcement points and exporters in its package. */
export const platformConnections: Record<string, Contract> = Object.fromEntries(
  Object.entries(platformDefinitions).map(([id, platform]) => [id, platform.connections]),
);

export type PlatformViewContext = {
  page: (id: string) => DiagramPage;
  cell: (endpoint: Endpoint) => DiagramCell;
  describe: (endpoint: Endpoint, label: string, type: ComponentType, detail: string, sources: string[]) => void;
  add: (endpoint: Endpoint, label: string, type: ComponentType, detail: string, sources: string[], boundaryId?: string) => void;
  connect: (connection: Connection) => void;
};

/** Root-owned edges project to collapsed owners and keep their real terminals on expansion. */
export function connectPlatformComponents(input: { catalog: Catalog; pages: DiagramPage[] }) {
  const platform = platformDefinitions[input.catalog.id];
  if (!platform) throw new Error(`Missing platform connection contract: ${input.catalog.id}`);
  const contract = platform.connections;
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
  if (platform.customizePlatform) {
    platform.customizePlatform({ page, cell, describe, add, connect: addConnection });
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
        const policy = platform.policyCaller;
        if (!policy) throw new Error(`${catalog.id}: Agent Control needs an explicit application caller`);
        add(at(policy.scopeId, "policy-check"), policy.label, "control", policy.detail, [policy.source], "owner");
        describe(at("defense", "controls"), "Agent Control", "control", "The application submits typed verdicts to the hosted policy service and applies the returned decision before proceeding. Trace export is a separate path.", [policy.source]);
        addConnection(inspect(at(policy.scopeId, "policy-check"), at("defense", "controls"), [policy.source], "Evaluate / decision"));
      }
    }
    if (platform.securityOwnsExportEdge) page("security").edges = page("security").edges.filter(edge => edge.to !== "export");
    const additions = platform.applicationClients ?? [];
    for (const item of additions) add(at(item.scopeId, item.id), item.label, "service", item.detail, [item.source], "owner");
    const traceSource = platform.traceSource;
    if (traceSource) {
      const ingress = observe.cells.find(item => ["span", "in", "trace"].includes(item.id))!;
      describe(at("observe", ingress.id), Boolean(platform.runExporter) ? "Briefing run spans" : "Agent trace callbacks", "telemetry", Boolean(platform.runExporter) ? "The briefing adapter exports run spans as OTLP JSON when a destination is configured." : "Instrumented model and tool calls feed the configured agent trace exporter. Export status is reported separately from execution.", [traceSource]);
      observe.groups = [{ id: "application", label: "Application telemetry" }, { id: "destination", label: "Configured telemetry destination" }];
      observe.edges = [];
      if (!platform.runExporter) {
        add(at("observe", "ao"), "Splunk Agent Observability", "telemetry", "The agent trace SDK exports to the configured project and stream. Credentials and a successful run are needed to confirm delivery.", [traceSource], "destination");
        addConnection(spans(at("observe", ingress.id), at("observe", "ao"), [traceSource], "SDK export"));
      } else {
        describe(at("system", "observe"), "Configured OTLP destination", "telemetry", "The briefing service exports run spans through its configured OTLP HTTP endpoint.", [traceSource, platform.runExporter]);
        describe(at("observe", "otlp"), "Configured OTLP destination", "telemetry", "The run telemetry adapter posts OTLP JSON to the configured HTTP destination and reports the result.", [platform.runExporter]);
        cell(at("observe", "otlp")).boundaryId = "destination";
        addConnection(spans(at("observe", ingress.id), at("observe", "otlp"), [platform.runExporter], "OTLP JSON"));
      }
      if (platform.genAIExporter) {
        const source = platform.genAIExporter;
        describe(at("observe", "otlp"), "Splunk GenAI instrumentation", "telemetry", "LangChain instrumentation supplies spans to the OpenTelemetry processor independently of the Galileo agent callbacks.", [source]);
        add(at("observe", "otlp-destination"), "Configured OTLP destination", "telemetry", "The OpenTelemetry exporters use explicit trace and metric endpoints or the configured Splunk realm. Delivery is reported separately.", [source], "destination");
        addConnection(spans(at("observe", "otlp"), at("observe", "otlp-destination"), [source], "OTLP export"));
      }
      if (platform.otlpStatusSource) describe(at("observe", "otlp"), "OTLP status only", "telemetry", "The adapter reports OTLP configuration presence. This status helper sends no spans. The implemented agent trace path uses the Galileo SDK.", [platform.otlpStatusSource]);
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
