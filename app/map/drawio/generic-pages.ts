import { zoomMaps, type ZoomBox, type ZoomEdge } from "../../architecture-zoom.ts";
import type { Catalog } from "../catalog.ts";
import { coreGroupId, primaryGroupId, projectGenericSystem } from "../generic-system.ts";
import { systemLayout } from "./system-layout.ts";
import type { DiagramCell, DiagramEdge, DiagramLayer, DiagramPage } from "./model.ts";

const layerFor = (id: string): DiagramLayer | undefined => id === "defense" ? "security" : id === "observe" ? "observability" : undefined;
const edgeKind = (kind?: ZoomEdge["kind"]): DiagramEdge["kind"] => kind === "data" || !kind ? "request" : kind === "placement" ? "hosting" : kind;
const compactCaption = (text: string) => text.length <= 66 ? text : undefined;

/** Reuse each use case's own topology and canonical source occurrences. */
export function genericDiagram(catalog: Catalog): { catalog: Catalog; pages: DiagramPage[] } {
  const map = zoomMaps[catalog.id];
  const root = catalog.scenes[catalog.rootSceneId];
  const mode = root.modes[0];
  const sceneId = `${catalog.id}.drawio.system`;
  const system = { ...projectGenericSystem(catalog, [primaryGroupId(catalog.id)], mode), id: sceneId };
  const scenes = { ...catalog.scenes, [sceneId]: system };
  const role = (kind?: ZoomBox["kind"]): DiagramCell["role"] => kind === "ai" ? "agent" : kind === "human" ? "activity" : kind === "failure" ? "output" : "service";
  const primary = root.nodes.find((node) => node.drillInto) ?? root.nodes.find((node) => node.emphasis === "assisted") ?? root.nodes[1];
  const cell = (id: string, label: string, scene: string, instanceId: string, extra: Partial<DiagramCell> = {}): DiagramCell => ({
    id, label, sceneId: scene, instanceId, x: 0, y: 0, width: 240, height: 112, ...extra,
  });
  const connection = (scope: string, edge: ZoomEdge, index: number): DiagramEdge => ({
    id: `${scope}.${index}`, from: edge.from, to: edge.to, label: edge.label,
    relationshipIds: [`${catalog.id}.system.${scope}.${index}.${edge.from}-${edge.to}`], kind: edgeKind(edge.kind),
  });
  const pages: DiagramPage[] = [{
    id: "journey", title: "Business journey", level: 0, purpose: root.purpose, layers: [], autoLayout: true,
    cells: root.nodes.filter((node) => node.role === "activity").map((node) => cell(node.instanceId, node.displayLabel, root.id, node.instanceId, {
      caption: compactCaption(node.supportingText ?? ""), targetPageId: node.instanceId === primary.instanceId ? "system" : undefined,
    })),
    edges: root.relationships.map((edge) => ({ id: edge.id, from: edge.sourceInstanceId, to: edge.targetInstanceId, label: edge.label ?? "Next", relationshipIds: edge.modelRelationshipIds, kind: "request" })),
    note: mode === "proposed" ? "Proposed workflow. This use case has no running service in Studio." : "Select the assisted step to explore the system and its components.",
  }, {
    id: "system", title: "System architecture", level: 1, parentId: "journey", purpose: map.summary ?? map.note, autoLayout: true,
    layers: [...new Set(map.cores.map((core) => layerFor(core.id)).filter((layer): layer is DiagramLayer => Boolean(layer)))],
    cells: map.cores.map((core) => cell(core.id, core.title, sceneId, `${catalog.id}.core.${core.id}`, {
      role: role(core.kind), caption: compactCaption(core.subtitle), targetPageId: map.interiors[core.id] ? core.id : undefined, layer: layerFor(core.id),
    })),
    edges: map.coreEdges.map((edge, index) => ({ ...connection("core", edge, index), layer: layerFor(edge.from) ?? layerFor(edge.to) })),
    note: "Open a component for its boundary and controls. Security and Observability add the connected platform services.",
  }];
  for (const [coreId, interior] of Object.entries(map.interiors)) {
    const id = `${catalog.id}.drawio.${coreId}`;
    const projected = projectGenericSystem(catalog, [primaryGroupId(catalog.id), coreGroupId(catalog.id, coreId)], mode);
    const boxes = [...interior.entities, ...interior.stubs.filter((stub) => interior.edges.some((edge) => edge.from === stub.id || edge.to === stub.id))]
      .filter((box) => !(coreId === "observe" && box.id === "controls" && box.chips?.some((chip) => chip.id === "none")));
    const boxIds = new Set(boxes.map((box) => box.id));
    scenes[id] = { ...projected, id, nodes: projected.nodes.map((node) => {
      const box = boxes.find((item) => node.instanceId === `${catalog.id}.core.${coreId}.${item.id}`);
      return box?.chips?.length ? { ...node, detail: [node.detail, ...box.chips.map((chip) => `${chip.title}: ${chip.detail}`)].filter(Boolean).join("\n\n") } : node;
    }) };
    const core = map.cores.find((item) => item.id === coreId)!;
    const owner = (box: ZoomBox) => coreId === "defense" ? box.id === "guards" ? "hosted" : "application" : coreId === "observe" ? box.id === "controls" ? "hosted" : "application" : interior.stubs.includes(box) ? undefined : "owner";
    const groups = coreId === "defense"
      ? [{ id: "application", label: "Application enforcement" }, { id: "hosted", label: "Hosted AI Defense inspection" }]
      : coreId === "observe" ? [{ id: "application", label: "Application telemetry" }, { id: "hosted", label: "Hosted policy service" }]
      : [{ id: "owner", label: core.title }];
    pages.push({
      id: coreId, title: interior.title, level: 2, parentId: "system", purpose: interior.note, layers: [], autoLayout: true, groups,
      relatedPageIds: interior.stubs.filter((stub) => map.interiors[stub.id] && !boxes.includes(stub)).map((stub) => stub.id),
      cells: boxes.map((box) => cell(box.id, coreId === "observe" && box.id === "controls" ? "Agent Control" : box.title, id, `${catalog.id}.core.${coreId}.${box.id}`, {
        role: role(box.kind), caption: compactCaption(box.subtitle), boundaryId: owner(box),
        targetPageId: interior.stubs.includes(box) && map.interiors[box.id] && box.id !== coreId ? box.id : undefined,
      })),
      edges: interior.edges.map((edge, index) => connection(coreId, edge, index)).filter((edge) => boxIds.has(edge.from) && boxIds.has(edge.to)),
      note: root.modes.length === 1 && mode === "proposed" ? "Proposed design. Select a component for its intended behavior." : "Select a component for implementation details and available source evidence.",
    });
  }
  pages[1] = systemLayout(pages[1], map.layout);
  return { catalog: { ...catalog, scenes }, pages };
}
