import {
  portPoint,
  routeIssues,
  routeScene,
  type Point,
  type RoutedEdge,
  type SceneNode,
  type SceneSpec,
} from "./scene-model.ts";

export type LayoutResult = {
  nodes: SceneNode[];
  edges: RoutedEdge[];
  engine: "authored" | "elk";
  portAlong: Record<string, Record<string, number>>;
};

export type MeasuredNodeSizes = Record<string, { width: number; height: number }>;

const cache = new Map<string, LayoutResult>();

export function contentRevision(scene: SceneSpec) {
  const nodes = scene.nodes.map((node) => [
    node.instanceId,
    node.parentId,
    node.expandGroupId,
    node.expanded,
    node.compact,
    node.dense,
    node.suppressAttribution,
    node.entityId,
    ...(node.representedEntityIds ?? []),
    ...(node.bindingIds ?? []),
    ...(node.capabilityLines?.flatMap((line) => [line.id, line.text, ...line.bindingIds]) ?? []),
    ...(node.sources?.flatMap((source) => [source.id, source.label, source.facet, source.bindingId, source.evidenceSummary]) ?? []),
    node.displayLabel,
    node.supportingText,
    node.serviceLabel,
    node.x,
    node.y,
    node.width,
    node.height,
  ].join(":")).join("|");
  const edges = scene.relationships.map((edge) => [
    edge.id,
    edge.sourceInstanceId,
    edge.sourcePort,
    edge.targetInstanceId,
    edge.targetPort,
    edge.kind,
    edge.label,
    ...(edge.bindingIds ?? []),
    ...(edge.via?.flatMap((point) => [point.x, point.y]) ?? []),
    edge.labelOffset?.x,
    edge.labelOffset?.y,
  ].join(":")).join("|");
  return `${nodes}::${edges}`;
}

export function layoutKey(caseId: string, mode: string, sceneId: string, revision: string, sizeClass: string) {
  return `${caseId}:${mode}:${sceneId}:${revision}:${sizeClass}`;
}

export function authoredLayout(scene: SceneSpec): LayoutResult {
  return { nodes: scene.nodes, edges: routeScene(scene), engine: "authored", portAlong: {} };
}

/** Re-route authored geometry from the outer card sizes measured by the browser. */
export function measuredLayout(scene: SceneSpec, base: LayoutResult, sizes: MeasuredNodeSizes): LayoutResult {
  if (Object.keys(sizes).length === 0) return base;
  const nodes = base.nodes.map((node) => {
    const size = sizes[node.instanceId];
    // Width is an authored constraint. Browser measurement refines content height only;
    // carrying a previously expanded wrapper width into a summary creates a stale-size cycle.
    return size && !node.expanded ? { ...node, height: size.height } : node;
  });
  return { ...base, nodes, edges: routeScene({ ...scene, nodes }) };
}

const inflight = new Map<string, Promise<LayoutResult>>();

export function prepareScene(caseId: string, mode: string, scene: SceneSpec, sizeClass = "authored") {
  const key = layoutKey(caseId, mode, scene.id, contentRevision(scene), sizeClass);
  const cached = cache.get(key);
  if (cached) return Promise.resolve(cached);
  const pending = inflight.get(key);
  if (pending) return pending;
  const job = Promise.resolve(authoredLayout(scene)).then((laid) => {
    cache.set(key, laid);
    inflight.delete(key);
    return laid;
  });
  inflight.set(key, job);
  return job;
}

export async function prepareLayout(caseId: string, mode: string, scene: SceneSpec, sizeClass = "authored") {
  return prepareScene(caseId, mode, scene, sizeClass);
}

export async function layoutScene(scene: SceneSpec): Promise<LayoutResult> {
  const authored = authoredLayout(scene);
  const ids = new Set(scene.nodes.map((node) => node.instanceId));
  if (!ids.has("supervisor") || !ids.has("cards") || !ids.has("score")) return authored;
  try {
    const elk = await import("elkjs/lib/elk.bundled.js");
    const Elk = elk.default;
    const engine = new Elk();
    const supervisor = scene.nodes.find((node) => node.instanceId === "supervisor");
    const cards = scene.nodes.find((node) => node.instanceId === "cards");
    const score = scene.nodes.find((node) => node.instanceId === "score");
    if (!supervisor || !cards || !score) return authored;
    const graph = await engine.layout({
      id: "specialists",
      layoutOptions: {
        "elk.algorithm": "layered",
        "elk.direction": "DOWN",
        "elk.edgeRouting": "ORTHOGONAL",
        "elk.spacing.nodeNode": "40",
        "elk.layered.spacing.nodeNodeBetweenLayers": "72",
        "elk.portConstraints": "FIXED_ORDER",
      },
      children: [
        {
          id: "supervisor",
          width: supervisor.width,
          height: supervisor.height,
          layoutOptions: { "elk.layered.layering.layerConstraint": "FIRST", "elk.portConstraints": "FIXED_ORDER" },
          ports: [
            { id: "sup-score", layoutOptions: { "elk.port.side": "SOUTH", "elk.port.index": "0" } },
            { id: "sup-cards", layoutOptions: { "elk.port.side": "SOUTH", "elk.port.index": "1" } },
          ],
        },
        {
          id: "cards",
          width: cards.width,
          height: cards.height,
          layoutOptions: { "elk.layered.layering.layerConstraint": "LAST", "elk.portConstraints": "FIXED_ORDER" },
          ports: [{ id: "cards-in", layoutOptions: { "elk.port.side": "NORTH", "elk.port.index": "0" } }],
        },
        {
          id: "score",
          width: score.width,
          height: score.height,
          layoutOptions: { "elk.layered.layering.layerConstraint": "LAST", "elk.portConstraints": "FIXED_ORDER" },
          ports: [{ id: "score-in", layoutOptions: { "elk.port.side": "NORTH", "elk.port.index": "0" } }],
        },
      ],
      edges: [
        { id: "to-cards", sources: ["sup-cards"], targets: ["cards-in"] },
        { id: "to-score", sources: ["sup-score"], targets: ["score-in"] },
      ],
    });
    const placed = new Map((graph.children ?? []).map((child) => [child.id, child]));
    const elkSupervisor = placed.get("supervisor");
    if (!elkSupervisor || elkSupervisor.x == null || elkSupervisor.y == null) return authored;
    const dx = supervisor.x - elkSupervisor.x;
    const dy = supervisor.y - elkSupervisor.y;
    const nodes = scene.nodes.map((node) => {
      const hit = placed.get(node.instanceId);
      if (!hit || hit.x == null || hit.y == null) return node;
      return { ...node, x: round(hit.x + dx), y: round(hit.y + dy) };
    });
    const elkEdges = new Map<string, Point[]>();
    const portAlong: Record<string, Record<string, number>> = {};
    for (const edge of graph.edges ?? []) {
      const section = edge.sections?.[0];
      if (!section) continue;
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => ({
        x: round(point.x + dx),
        y: round(point.y + dy),
      }));
      elkEdges.set(edge.id, points);
    }
    const supPorts = elkSupervisor.ports ?? [];
    for (const port of supPorts) {
      if (port.x == null || !supervisor.width) continue;
      const along = port.x / supervisor.width;
      if (port.id === "sup-cards") portAlong.supervisor = { ...portAlong.supervisor, "out-b-l": along };
      if (port.id === "sup-score") portAlong.supervisor = { ...portAlong.supervisor, "out-b-r": along };
    }
    const nextScene = { ...scene, nodes };
    const routed = routeScene(nextScene).map((edge) => {
      const points = elkEdges.get(edge.id);
      return points ? { ...edge, points } : edge;
    });
    if (routeIssues(nextScene, routed).length > 0) return authored;
    for (const edge of routed) {
      if (!elkEdges.has(edge.id)) continue;
      const source = nodes.find((node) => node.instanceId === edge.sourceInstanceId);
      const target = nodes.find((node) => node.instanceId === edge.targetInstanceId);
      if (!source || !target || edge.points.length < 2) continue;
      const start = edge.points[0];
      const end = edge.points[edge.points.length - 1];
      remember(portAlong, source, edge.sourcePort, start);
      remember(portAlong, target, edge.targetPort, end);
    }
    return { nodes, edges: routed, engine: "elk", portAlong };
  } catch {
    return authored;
  }
}

function remember(portAlong: Record<string, Record<string, number>>, node: SceneNode, port: string, point: Point) {
  const authored = portPoint(node, port);
  if (Math.hypot(authored.x - point.x, authored.y - point.y) < 1) return;
  const along = port.includes("l") || port.includes("r")
    ? (point.y - node.y) / node.height
    : (point.x - node.x) / node.width;
  portAlong[node.instanceId] = { ...portAlong[node.instanceId], [port]: along };
}

function round(value: number) {
  return Math.round(value * 10) / 10;
}
