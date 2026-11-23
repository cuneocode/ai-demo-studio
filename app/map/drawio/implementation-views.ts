import type { Catalog } from "../catalog.ts";
import type { SceneNode } from "../scene-model.ts";
import { diagramNode, type ComponentType, type DiagramCell, type DiagramPage } from "./model.ts";

import type { Endpoint, PlatformDefinition } from "./platform-contract.ts";
import { platformDefinitions } from "./platform-registry.ts";

export const modelConsumers: Record<string, Endpoint[]> = Object.fromEntries(
  Object.entries(platformDefinitions).map(([id, platform]) => [id, platform.modelConsumers]),
);

export type ModelViewContext = {
  catalog: Catalog;
  system: DiagramPage;
  page: (id: string) => DiagramPage;
  cell: (scope: string, id: string) => DiagramCell;
  describe: (scope: string, id: string, label: string, type: ComponentType, detail?: string, sources?: string[]) => void;
  add: (scope: string, id: string, label: string, type: ComponentType, detail: string, sources?: string[]) => void;
  link: (from: Endpoint, to: Endpoint, label: string, kind?: "request" | "hosting" | "telemetry" | "control", layer?: "deployment" | "observability" | "security", modes?: ("implemented" | "proposed")[]) => void;
  platform: PlatformDefinition;
};

/** One endpoint per inference service, with calls from the actual application roles. */
export function connectImplementationViews(input: { catalog: Catalog; pages: DiagramPage[] }) {
  const catalog = { ...input.catalog, scenes: { ...input.catalog.scenes }, relationships: [...input.catalog.relationships] };
  const platform = platformDefinitions[catalog.id];
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
  function link(from: Endpoint, to: Endpoint, label: string, kind: "request" | "hosting" | "telemetry" | "control" = "request", layer?: "deployment" | "observability" | "security", modes?: ("implemented" | "proposed")[]) {
    const source = cell(from.scopeId, from.cellId), target = cell(to.scopeId, to.cellId);
    const id = `${catalog.id}.calls.${from.scopeId}.${from.cellId}.${to.scopeId}.${to.cellId}.${kind}`;
    catalog.relationships.push({ id, fromEntityId: diagramNode(catalog, source).entityId!, toEntityId: diagramNode(catalog, target).entityId!, kind, fact: label });
    page(from.scopeId).edges.push({ id, from: source.id, to: target.id, toScopeId: from.scopeId !== to.scopeId ? to.scopeId : undefined, label, kind, layer, modes, relationshipIds: [id] });
  }

  const context = { catalog, system, page, cell, describe, add, link, platform };
  const infrastructure = pages.find(item => item.id === "infrastructure");
  if (infrastructure) {
    if (platform.mergeModelScope !== false) {
      const legacy = page("model");
      // The old model scope and the infrastructure scope describe the same service.
      // Keep its evidence on the canonical endpoint and remove the second occurrence.
      const endpoint = cell("infrastructure", "endpoint");
      const refs = [...new Set([...legacy.cells.flatMap(item => {
        const node = diagramNode(catalog, item);
        return [...(node.sourceRefIds ?? []), ...(node.sources ?? []).map(source => source.id)];
      }), ...(platform.callSources ?? []), "platform.model-routing", "platform.egress"])];
      describe("infrastructure", "endpoint", platform.endpointLabel ?? "Configured model endpoint", "model", undefined, refs);
      endpoint.labelByMode = { proposed: platform.endpointLabel ?? "Proposed inference endpoint" };
      const previous = cell("system", "model");
      const canonical = diagramNode(catalog, endpoint);
      const scene = catalog.scenes[endpoint.sceneId];
      catalog.scenes[endpoint.sceneId] = { ...scene, nodes: scene.nodes.map(node => node.instanceId === canonical.instanceId ? { ...node, entityId: diagramNode(catalog, previous).entityId } : node) };
      system.cells = system.cells.filter(item => item.id !== "model");
      system.flow = system.flow?.map(row => row.filter(id => id !== "model"));
      system.edges = system.edges.filter(edge => edge.from !== "model" && edge.to !== "model");
      pages = pages.filter(item => item.id !== "model");
    }
    platform.beforeRouting?.(context);
    infrastructure.edges = infrastructure.edges.filter(edge => edge.from !== "runtime");
    link({ scopeId: "infrastructure", cellId: "runtime" }, { scopeId: "infrastructure", cellId: "routing" }, "Hosts routing", "hosting");
    if (platform.mergeModelScope === false) platform.infrastructureRoutes?.(context);
    system.edges = system.edges.filter(edge => edge.id !== "platform.deployment.participation");
    const summary = platform.routingSummary ?? "workload";
    const modelCall = platform.modelCallLabel ?? "Model calls";
    link({ scopeId: "system", cellId: summary }, { scopeId: "infrastructure", cellId: "routing" }, modelCall, "request", "deployment");
    // Inspection is performed by the application client, before and after inference.
    if (platform.inspectModelIO) {
      link({ scopeId: "system", cellId: summary }, { scopeId: "system", cellId: "defense" }, "Inspect model I/O", "control", "security");
    }
    if (platform.mergeModelScope !== false) platform.infrastructureRoutes?.(context);
    for (const consumer of platform.modelConsumers) {
      const item = cell(consumer.scopeId, consumer.cellId);
      const sources = platform.callSources;
      if (sources) describe(consumer.scopeId, consumer.cellId, item.label, item.componentType ?? "agent", undefined, sources);
      link(consumer, { scopeId: "infrastructure", cellId: "routing" }, platform.modelCallLabel ?? "Model calls", "request", "deployment");
    }
  } else {
    platform.existingModelRoutes?.(context);
  }
  for (const detail of pages) if (detail.id === "defense" && detail.cells.some(item => item.id === "guards")) describe("defense", "guards", "AI Defense Inspection API", "service", "The application sends text to the configured AI Defense Inspection API and reads the verdict. The API's internal model deployment is outside this application's implementation.");
  return { catalog, pages };
}
