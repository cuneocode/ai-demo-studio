import { zoomMaps, type ZoomBox, type ZoomEdge, type ZoomKind, type ZoomMap } from "../architecture-zoom.ts";
import type {
  CaseScenes,
  ModelRelationship,
  Mode,
  Platform,
  PlatformId,
  SceneNode,
  SceneRelationship,
  SceneSourceAction,
  SceneSpec,
} from "./scene-model.ts";

const platforms: Platform[] = [
  { id: "cisco-ai-defense", name: "Cisco AI Defense", contribution: "Shows verified content and model-boundary protection for this use case." },
  { id: "splunk-agent-observability", name: "Splunk Agent Observability", contribution: "Shows verified tracing and configured runtime-control participation." },
  { id: "ai-infrastructure", name: "AI Infrastructure", contribution: "Shows current runtime/model placement and clearly marked proposed infrastructure." },
];

export const primaryGroupId = (caseId: string) => `${caseId}.group.system`;
export const coreGroupId = (caseId: string, coreId: string) => `${caseId}.group.core.${coreId}`;
const coreOccurrenceId = (caseId: string, coreId: string) => `${caseId}.core.${coreId}`;
const entityOccurrenceId = (caseId: string, coreId: string, entityId: string) => `${caseId}.core.${coreId}.${entityId}`;

function relationId(caseId: string, scope: string, index: number, edge: ZoomEdge) {
  return `${caseId}.system.${scope}.${index}.${edge.from}-${edge.to}`;
}

function relationshipRecords(caseId: string, map: ZoomMap): ModelRelationship[] {
  const records = map.coreEdges.map((edge, index) => ({
    id: relationId(caseId, "core", index, edge),
    fromEntityId: edge.from,
    toEntityId: edge.to,
    kind: relationKind(edge.kind),
    fact: edge.label,
  }));
  for (const [coreId, interior] of Object.entries(map.interiors)) {
    interior.edges.forEach((edge, index) => records.push({
      id: relationId(caseId, coreId, index, edge),
      fromEntityId: edge.from,
      toEntityId: edge.to,
      kind: relationKind(edge.kind),
      fact: edge.label,
    }));
  }
  return records;
}

export function enableContinuousCatalog(catalog: CaseScenes): CaseScenes {
  if (catalog.id === "brahe-bank" || catalog.id === "interbank-a2a") return catalog;
  const map = zoomMaps[catalog.id];
  if (!map) return catalog;
  const added = relationshipRecords(catalog.id, map);
  const existing = new Set(catalog.relationships.map((relationship) => relationship.id));
  return {
    ...catalog,
    platforms,
    relationships: [...catalog.relationships, ...added.filter((relationship) => !existing.has(relationship.id))],
    projectionRelationshipIds: added.map((relationship) => relationship.id),
  };
}

export function projectGenericSystem(catalog: CaseScenes, expandedGroupIds: readonly string[], mode: Mode): SceneSpec {
  const root = catalog.scenes[catalog.rootSceneId];
  const map = zoomMaps[catalog.id];
  if (!map) return root;
  const primaryId = primaryGroupId(catalog.id);
  if (!expandedGroupIds.includes(primaryId)) return overviewProjection(catalog, root, primaryId);
  const expandedCoreId = expandedGroupIds.find((id) => id.startsWith(`${catalog.id}.group.core.`))?.slice(`${catalog.id}.group.core.`.length);
  return systemProjection(catalog, root, map, mode, primaryId, expandedCoreId);
}

export function normalizeGenericExpansion(caseId: string, current: readonly string[], groupId: string) {
  const next = new Set(current);
  const primary = primaryGroupId(caseId);
  next.add(primary);
  if (groupId.startsWith(`${caseId}.group.core.`)) {
    for (const id of next) if (id.startsWith(`${caseId}.group.core.`) && id !== groupId) next.delete(id);
  }
  next.add(groupId);
  return [...next];
}

export function collapseGenericGroup(caseId: string, current: readonly string[], groupId: string) {
  if (groupId === primaryGroupId(caseId)) return [];
  return current.filter((id) => id !== groupId);
}

export function parentGenericGroup(caseId: string, groupId: string) {
  return groupId.startsWith(`${caseId}.group.core.`) ? primaryGroupId(caseId) : groupId;
}

export function genericGroupLabel(caseId: string, groupId: string) {
  if (groupId === primaryGroupId(caseId)) return "System";
  const coreId = groupId.slice(`${caseId}.group.core.`.length);
  return zoomMaps[caseId]?.cores.find((core) => core.id === coreId)?.title ?? coreId;
}

function overviewProjection(catalog: CaseScenes, root: SceneSpec, primaryId: string): SceneSpec {
  const selected = primaryOccurrence(root);
  return {
    ...root,
    nodes: root.nodes.map((node) => node.instanceId === selected.instanceId
      ? { ...node, drillInto: undefined, expandGroupId: primaryId }
      : { ...node, drillInto: undefined }),
  };
}

function systemProjection(
  catalog: CaseScenes,
  root: SceneSpec,
  map: ZoomMap,
  mode: Mode,
  primaryId: string,
  expandedCoreId?: string,
): SceneSpec {
  const selected = primaryOccurrence(root);
  const selectedInteriorHeight = expandedCoreId ? interiorGroupHeight(map, expandedCoreId) : 0;
  const grid = coreGrid(map);
  const coreLaneBase = expandedCoreId ? 55 + selectedInteriorHeight + 28 : grid.bottom + 30;
  const compactCoreCount = Math.max(0, map.cores.length - 1);
  const expandedWidth = Math.max(980, 760 + compactCoreCount * 195 + 20);
  const primary = {
    ...selected,
    role: "group" as const,
    drillInto: undefined,
    expandGroupId: primaryId,
    expanded: true,
    x: 220,
    y: 20,
    width: expandedCoreId ? expandedWidth : Math.max(740, grid.columns * 180 + 20),
    height: expandedCoreId
      ? coreLaneBase + map.coreEdges.length * 30 + 24
      : grid.rows > 1 ? grid.bottom + 24 : coreLaneBase + map.coreEdges.length * 30 + 24,
  };
  const nodes: SceneNode[] = [];
  const rootOrder = root.nodes.filter((node) => node.role === "activity");
  const selectedIndex = rootOrder.findIndex((node) => node.instanceId === selected.instanceId);
  rootOrder.forEach((node, index) => {
    if (node.instanceId === selected.instanceId) {
      nodes.push(primary);
      return;
    }
    if (index < selectedIndex) nodes.push({ ...node, drillInto: undefined, compact: true, x: 0, y: 100 + index * 120, width: 210, height: 100 });
    else nodes.push({ ...node, drillInto: undefined, compact: true, x: primary.x + primary.width + 40, y: 100 + (index - selectedIndex - 1) * 120, width: 210, height: 100 });
  });

  map.cores.forEach((core, index) => {
    const isExpanded = core.id === expandedCoreId;
    const row = Math.floor(index / grid.columns);
    const position = expandedCoreId
      ? (isExpanded ? { x: 20, y: 55, width: 720, height: selectedInteriorHeight } : { x: 760 + compactCoreIndex(map, core.id, expandedCoreId) * 195, y: 55, width: 180, height: 105 })
      : { x: 20 + (index % grid.columns) * 180, y: grid.tops[row], width: CORE_CARD_WIDTH, height: 125 };
    nodes.push({
      instanceId: coreOccurrenceId(catalog.id, core.id),
      entityId: core.id,
      parentId: selected.instanceId,
      role: map.interiors[core.id] ? "group" : roleFor(core.kind),
      displayLabel: core.title,
      supportingText: core.subtitle,
      detail: isExpanded ? undefined : core.detail,
      compact: Boolean(expandedCoreId && !isExpanded),
      dense: !isExpanded,
      expandGroupId: map.interiors[core.id] ? coreGroupId(catalog.id, core.id) : undefined,
      expanded: isExpanded,
      platformFocus: platformFor(core),
      x: position.x,
      y: position.y,
      width: position.width,
      height: position.height,
      ...sourceFor(catalog.id, core.id),
    });
  });

  if (expandedCoreId) addInteriorNodes(catalog.id, selected.instanceId, map, expandedCoreId, nodes);

  const relationships: SceneRelationship[] = [
    ...root.relationships.map((relationship) => ({ ...relationship })),
    ...map.coreEdges.map((edge, index) => {
      const source = nodes.find((node) => node.instanceId === coreOccurrenceId(catalog.id, edge.from))!;
      const target = nodes.find((node) => node.instanceId === coreOccurrenceId(catalog.id, edge.to))!;
      const lanes = !expandedCoreId && grid.rows > 1;
      const laneY = lanes ? primary.y + grid.tops[0] + grid.heights[0] + 12 + index * 24 : primary.y + coreLaneBase + index * 30;
      const sourceX = primary.x + source.x + source.width / 2;
      const targetX = primary.x + target.x + target.width / 2;
      const sourceTopRow = source.y === grid.tops[0];
      const targetTopRow = target.y === grid.tops[0];
      return {
        id: `${catalog.id}.visible.core.${index}.${edge.from}-${edge.to}`,
        sourceInstanceId: coreOccurrenceId(catalog.id, edge.from),
        targetInstanceId: coreOccurrenceId(catalog.id, edge.to),
        kind: relationKind(edge.kind),
        label: edge.label,
        sourcePort: lanes && !sourceTopRow ? "out-t" : "out-b",
        targetPort: lanes && !targetTopRow ? "in-t" : "in-b",
        via: [{ x: sourceX, y: laneY }, { x: targetX, y: laneY }],
        modelRelationshipIds: [relationId(catalog.id, "core", index, edge)],
      };
    }),
  ];
  if (expandedCoreId) {
    const interior = map.interiors[expandedCoreId];
    const coreNode = nodes.find((node) => node.instanceId === coreOccurrenceId(catalog.id, expandedCoreId))!;
    interior.edges.forEach((edge, index) => {
      const source = nodes.find((node) => node.instanceId === entityOccurrenceId(catalog.id, expandedCoreId, edge.from))!;
      const target = nodes.find((node) => node.instanceId === entityOccurrenceId(catalog.id, expandedCoreId, edge.to))!;
      const routeY = primary.y + coreNode.y + 56 + index * 28;
      const sourceX = primary.x + coreNode.x + source.x + source.width / 2;
      const targetX = primary.x + coreNode.x + target.x + target.width / 2;
      relationships.push({
        id: `${catalog.id}.visible.${expandedCoreId}.${index}.${edge.from}-${edge.to}`,
        sourceInstanceId: source.instanceId,
        targetInstanceId: target.instanceId,
        kind: relationKind(edge.kind),
        label: edge.label,
        sourcePort: "out-t",
        targetPort: "in-t",
        via: [{ x: sourceX, y: routeY }, { x: targetX, y: routeY }],
        modelRelationshipIds: [relationId(catalog.id, expandedCoreId, index, edge)],
      });
    });
  }
  return {
    ...root,
    id: root.id,
    title: expandedCoreId ? map.interiors[expandedCoreId]?.title ?? primary.displayLabel : primary.displayLabel,
    purpose: expandedCoreId ? map.interiors[expandedCoreId]?.note ?? map.note : map.note,
    nodes,
    relationships,
    modes: root.modes,
  };
}

function addInteriorNodes(caseId: string, primaryOccurrence: string, map: ZoomMap, coreId: string, nodes: SceneNode[]) {
  const interior = map.interiors[coreId];
  const coreOccurrence = coreOccurrenceId(caseId, coreId);
  const boxes = [...interior.entities, ...interior.stubs];
  const rows = interiorRows(interior);
  boxes.forEach((box, index) => {
    const row = Math.floor(index / 3);
    const source = sourceFor(caseId, `${coreId}.${box.id}`);
    nodes.push({
      instanceId: entityOccurrenceId(caseId, coreId, box.id),
      entityId: box.id,
      parentId: coreOccurrence,
      role: roleFor(box.kind),
      displayLabel: box.title,
      supportingText: box.subtitle,
      detail: box.detail,
      dense: true,
      platformFocus: platformFor(box),
      x: 20 + (index % 3) * 235,
      y: rows.tops[row],
      width: INTERIOR_CARD_WIDTH,
      height: 135,
      ...source,
    });
  });
  void primaryOccurrence;
}

function primaryOccurrence(root: SceneSpec) {
  return root.nodes.find((node) => node.drillInto)
    ?? root.nodes.find((node) => node.emphasis === "assisted")
    ?? root.nodes[Math.min(1, root.nodes.length - 1)]!;
}

const CORE_CARD_WIDTH = 170;
const INTERIOR_CARD_WIDTH = 215;

/** Lines a string wraps to at an average glyph width; cards size to their text, so rows must too. */
function wrappedLines(text: string, width: number, glyph: number) {
  if (!text) return 0;
  const perLine = Math.max(1, Math.floor(width / glyph));
  let lines = 1;
  let used = 0;
  for (const word of text.split(/\s+/)) {
    const length = word.length;
    if (used === 0) used = length;
    else if (used + 1 + length <= perLine) used += 1 + length;
    else { lines += 1; used = length; }
    while (used > perLine) { lines += 1; used -= perLine; }
  }
  return lines;
}

/** Height of a dense map card (map.css .map-node.is-dense: 17px title, 14px body, Explore button). */
function denseCardHeight(box: ZoomBox, width: number, expandable: boolean) {
  const inner = width - 26;
  const title = wrappedLines(box.title, inner, 9.0) * 21.5;
  const subtitle = wrappedLines(box.subtitle, inner, 6.6) * 18.5;
  const detail = box.detail ? 4 + wrappedLines(box.detail, inner, 6.6) * 18.5 : 0;
  return Math.ceil(24 + title + 4 + subtitle + detail + (expandable ? 40 : 6));
}

function rowLayout(heights: number[], columns: number, top: number, gap: number, min: number) {
  const rows = Math.max(1, Math.ceil(heights.length / columns));
  const rowHeights = Array.from({ length: rows }, (_, row) => Math.max(min, ...heights.slice(row * columns, row * columns + columns)));
  const tops: number[] = [];
  let y = top;
  for (const height of rowHeights) {
    tops.push(y);
    y += height + gap;
  }
  return { rows, tops, heights: rowHeights, bottom: tops[rows - 1] + rowHeights[rows - 1] };
}

function coreGrid(map: ZoomMap) {
  const columns = map.cores.length > 4 ? 3 : Math.max(1, map.cores.length);
  const heights = map.cores.map((core) => denseCardHeight(core, CORE_CARD_WIDTH, Boolean(map.interiors[core.id])));
  return { columns, ...rowLayout(heights, columns, 60, 25 + map.coreEdges.length * 24, 125) };
}

function interiorRows(interior: ZoomMap["interiors"][string]) {
  const heights = [...interior.entities, ...interior.stubs].map((box) => denseCardHeight(box, INTERIOR_CARD_WIDTH, true));
  return rowLayout(heights, 3, 72 + interior.edges.length * 28, 20, 135);
}

function interiorGroupHeight(map: ZoomMap, coreId: string) {
  return interiorRows(map.interiors[coreId]).bottom + 24;
}

function compactCoreIndex(map: ZoomMap, coreId: string, expandedCoreId: string) {
  return map.cores.filter((core) => core.id !== expandedCoreId).findIndex((core) => core.id === coreId);
}

function roleFor(kind?: ZoomKind): SceneNode["role"] {
  if (kind === "human") return "activity";
  if (kind === "ai") return "agent";
  if (kind === "failure") return "output";
  return "service";
}

function relationKind(kind?: ZoomEdge["kind"]): SceneRelationship["kind"] {
  if (kind === "control") return "control";
  if (kind === "telemetry") return "telemetry";
  if (kind === "placement") return "hosting";
  return "request";
}

function platformFor(item: Pick<ZoomBox, "id" | "title" | "kind">): PlatformId | undefined {
  const text = `${item.id} ${item.title}`.toLowerCase();
  if (text.includes("defense")) return "cisco-ai-defense";
  if (text.includes("observ") || text.includes("splunk")) return "splunk-agent-observability";
  if (text.includes("infrastructure") || text.includes("ucs") || text.includes("nexus") || text.includes("compute")) return "ai-infrastructure";
  return undefined;
}

function sourceFor(caseId: string, occurrence: string): { sourceRefIds?: string[]; sources?: SceneSourceAction[] } {
  if (caseId === "code-vulnerability") {
    const ids = occurrence === "hec" || occurrence.startsWith("hec.") ? ["vulnerability.hec"]
      : occurrence === "observe" || occurrence.startsWith("observe.") ? ["vulnerability.trace", "vulnerability.publish"]
      : occurrence === "review" || occurrence.startsWith("review.") ? ["vulnerability.publish"]
      : occurrence === "workload.check" ? ["vulnerability.citations", "vulnerability.validator"]
      : ["vulnerability.scan"];
    return { sourceRefIds: ids, sources: ids.map((id) => ({ id, label: id.split(".").at(-1)!, facet: "Full context" as const })) };
  }
  if (caseId !== "fraud-modeling") return {};
  if (occurrence === "score" || occurrence.endsWith(".api") || occurrence.endsWith(".route")) {
    return { sourceRefIds: ["fraud.score"], sources: [{ id: "fraud.score", label: "Score implementation", facet: "Call" }] };
  }
  if (occurrence === "defense" || occurrence.startsWith("defense.")) {
    return { sourceRefIds: ["fraud.narrative"], sources: [{ id: "fraud.narrative", label: "Narrative protection", facet: "Call" }] };
  }
  return {};
}
