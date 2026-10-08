export type SceneKind = "businessJourney" | "agentWorkflow" | "controlInteraction" | "hosting";

export type NodeRole = "activity" | "agent" | "checkpoint" | "service" | "decision" | "input" | "output" | "group";

export type RelationshipKind = "businessSequence" | "support" | "request" | "return" | "control" | "telemetry" | "hosting";

export type Mode = "implemented" | "proposed";

export type PlatformId = "cisco-ai-defense" | "splunk-agent-observability" | "ai-infrastructure";

export type CapabilityId =
  | "content-inspection"
  | "model-call-inspection"
  | "agent-tracing"
  | "runtime-control"
  | "runtime-hosting"
  | "model-serving";

export type Platform = {
  id: PlatformId;
  name: string;
  contribution: string;
};

/**
 * One canonical record per platform capability. Card attribution, focus emphasis,
 * and evidence links are all resolved from these, never from labels or scene ids.
 */
export type IntegrationBinding = {
  id: string;
  platformId: PlatformId;
  capability: CapabilityId;
  /** Presentation modes in which this binding is relevant. */
  modes: Mode[];
  /** The platform component that delivers the capability. */
  providerEntityIds: string[];
  /** Application-owned code that calls the provider and acts on its result. */
  applicationIntegrationEntityIds: string[];
  /** Agents, tools, and anchors needed to read the integration in context. */
  workloadEntityIds: string[];
  stageIds: string[];
  mechanismLabel: string;
  applicationEffect: string;
  evidenceRefIds: string[];
  implementationState: Mode | "unknown";
  evidenceLevel: "source-linked" | "configured" | "observed" | "unknown";
};

export type BindingRole = "provider" | "integration" | "workload";
export type FocusRelevance = "active" | "context" | "secondary";
export type EvidenceFacet = "Call" | "Decision" | "Setup" | "Trace correlation" | "Full context";

export type CapabilityLine = {
  id: string;
  text: string;
  bindingIds: string[];
};

export type SceneSourceAction = {
  id: string;
  label: string;
  facet?: EvidenceFacet;
  bindingId?: string;
  /** Occurrence-specific explanation shown before this evidence excerpt. */
  evidenceSummary?: string;
};

export type SelectedDisclosure = {
  purpose: string;
  workflowStage: string;
  owner?: string;
  data?: string;
  destination?: string;
  evidenceStatus: string;
};

export type SceneNode = {
  instanceId: string;
  /** React Flow subflow parent. Positions are parent-relative when present. */
  parentId?: string;
  /** Stable presentation group expanded by this occurrence. */
  expandGroupId?: string;
  /** Group occurrences keep one identity in summary and expanded representations. */
  expanded?: boolean;
  entityId?: string;
  /** Additional canonical entities represented by a grouped scene occurrence. */
  representedEntityIds?: string[];
  /** Canonical integrations represented by this occurrence. Roles are derived from entity identity. */
  bindingIds?: string[];
  /** Grouped stage occurrences may surface child platform participation. */
  showPlatformAttribution?: boolean;
  /** Capability lines already carry full platform identity for compact mixed-stage cards. */
  suppressAttribution?: boolean;
  /** Context-only summary: retain identity and actions while minimizing explanatory density. */
  compact?: boolean;
  /** Focused execution card with reduced chrome but unchanged semantic content. */
  dense?: boolean;
  role: NodeRole;
  displayLabel: string;
  supportingText?: string;
  capabilityLines?: CapabilityLine[];
  disclosure?: SelectedDisclosure;
  technicalLabel?: string;
  serviceLabel?: string;
  drillInto?: string;
  sourceRefIds?: string[];
  sources?: SceneSourceAction[];
  detail?: string;
  supportingByMode?: Partial<Record<Mode, string>>;
  drillByMode?: Partial<Record<Mode, string>>;
  platformFocus?: PlatformId;
  emphasis?: "customer" | "assisted";
  modes?: Mode[];
  x: number;
  y: number;
  width: number;
  height: number;
};

export type StageGuide = { label: string; x: number; width: number };

export type SceneRelationship = {
  id: string;
  sourceInstanceId: string;
  targetInstanceId: string;
  kind: RelationshipKind;
  label?: string;
  sourcePort: string;
  targetPort: string;
  /** Optional authored corridor points between the source and target ports. */
  via?: Point[];
  /** Optional label-only offset from the routed anchor. */
  labelOffset?: Point;
  /** Canonical integrations that establish this relationship. Empty means shared workflow context. */
  bindingIds?: string[];
  modelRelationshipIds: string[];
};

export type SceneSpec = {
  id: string;
  kind: SceneKind;
  businessStepId: string;
  title: string;
  purpose: string;
  entryInstanceIds: string[];
  exitInstanceIds: string[];
  modes: Mode[];
  guides?: StageGuide[];
  nodes: SceneNode[];
  relationships: SceneRelationship[];
};

export type Point = { x: number; y: number };

export type RoutedEdge = SceneRelationship & {
  points: Point[];
};

export type ModelRelationship = {
  id: string;
  fromEntityId: string;
  toEntityId: string;
  kind: RelationshipKind;
  fact: string;
};

export type CaseScenes = {
  id: string;
  rootSceneId: string;
  businessStepIds: string[];
  environment: string[];
  relationships: ModelRelationship[];
  platforms?: Platform[];
  bindings?: IntegrationBinding[];
  /** Canonical relationships consumed by a dynamic continuous projection rather than a static scene. */
  projectionRelationshipIds?: string[];
  scenes: Record<string, SceneSpec>;
};

export type ResolvedAttribution = {
  platformId: PlatformId;
  platformName: string;
  role: BindingRole;
  mechanismLabel: string;
  applicationEffect: string;
  bindingId: string;
  evidenceRefIds: string[];
  relevance: FocusRelevance;
};

export type ResolvedNodeBinding = {
  binding: IntegrationBinding;
  platform: Platform;
  role: BindingRole;
};

function representedIds(node: SceneNode) {
  return new Set([node.entityId, ...(node.representedEntityIds ?? [])].filter((id): id is string => Boolean(id)));
}

function bindingRole(binding: IntegrationBinding, node: SceneNode): BindingRole | null {
  const ids = representedIds(node);
  if ([...ids].some((id) => binding.providerEntityIds.includes(id))) return "provider";
  if ([...ids].some((id) => binding.applicationIntegrationEntityIds.includes(id))) return "integration";
  if ([...ids].some((id) => binding.workloadEntityIds.includes(id) || binding.stageIds.includes(id))) return "workload";
  return null;
}

/** Resolve a scene occurrence through canonical bindings and entity identity. */
export function resolveNodeBindings(item: CaseScenes, node: SceneNode, mode: Mode): ResolvedNodeBinding[] {
  const platforms = new Map((item.platforms ?? []).map((platform) => [platform.id, platform]));
  const bindings = new Map((item.bindings ?? []).map((binding) => [binding.id, binding]));
  return (node.bindingIds ?? []).flatMap((id) => {
    const binding = bindings.get(id);
    const platform = binding && platforms.get(binding.platformId);
    const role = binding && bindingRole(binding, node);
    if (!binding || !platform || !role || !binding.modes.includes(mode)) return [];
    return [{ binding, platform, role }];
  });
}

export function relevanceForBindingIds(
  item: CaseScenes,
  bindingIds: string[] | undefined,
  platformId: PlatformId | null,
  mode: Mode,
): FocusRelevance {
  if (!platformId) return "context";
  const bindings = new Map((item.bindings ?? []).map((binding) => [binding.id, binding]));
  const active = (bindingIds ?? []).flatMap((id) => {
    const binding = bindings.get(id);
    return binding?.modes.includes(mode) ? [binding] : [];
  });
  if (active.length === 0) return "context";
  return active.some((binding) => binding.platformId === platformId) ? "active" : "secondary";
}

export function nodeRelevanceFor(item: CaseScenes, node: SceneNode, platformId: PlatformId | null, mode: Mode): FocusRelevance {
  if (!platformId) return "context";
  if (node.platformFocus) return node.platformFocus === platformId ? "active" : "secondary";
  const resolved = resolveNodeBindings(item, node, mode);
  if (resolved.some(({ binding, role }) => binding.platformId === platformId && (role === "provider" || role === "integration"))) return "active";
  if (resolved.some(({ binding }) => binding.platformId === platformId)) return "context";
  return resolved.length ? "secondary" : "context";
}

export function edgeRelevanceFor(item: CaseScenes, edge: SceneRelationship, platformId: PlatformId | null, mode: Mode): FocusRelevance {
  if (edge.kind === "businessSequence") return "context";
  return relevanceForBindingIds(item, edge.bindingIds, platformId, mode);
}

/** Resolve the platform names a node occurrence should display from canonical bindings. */
export function attributionFor(item: CaseScenes, node: SceneNode, mode: Mode, platformFocus: PlatformId | null = null): ResolvedAttribution[] {
  const seen = new Set<string>();
  const out: ResolvedAttribution[] = [];
  for (const { binding, platform, role } of resolveNodeBindings(item, node, mode)) {
    const key = `${platform.id}:${role}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({
      platformId: platform.id,
      platformName: platform.name,
      role,
      mechanismLabel: binding.mechanismLabel,
      applicationEffect: binding.applicationEffect,
      bindingId: binding.id,
      evidenceRefIds: binding.evidenceRefIds,
      relevance: relevanceForBindingIds(item, [binding.id], platformFocus, mode),
    });
  }
  return out;
}

/** Emphasis for a platform focus, resolved through bindings rather than a per-scene id list. */
export function focusRoleFor(item: CaseScenes, node: SceneNode, platformId: PlatformId | null, mode: Mode): BindingRole | "unrelated" {
  if (!platformId) return "workload";
  if (node.platformFocus === platformId) return "provider";
  let best: BindingRole | "unrelated" = "unrelated";
  for (const { binding, role } of resolveNodeBindings(item, node, mode)) {
    if (!binding || binding.platformId !== platformId) continue;
    if (role === "provider") return "provider";
    if (role === "integration") best = "integration";
    else if (best === "unrelated") best = "workload";
  }
  return best;
}

/** Under a focus, a scene must keep something emphasised; otherwise the whole view reads as unrelated. */
export function focusResolves(item: CaseScenes, scene: SceneSpec, platformId: PlatformId | null, mode: Mode) {
  if (!platformId) return true;
  return scene.nodes.some((node) => focusRoleFor(item, node, platformId, mode) !== "unrelated");
}

/** A scene entered directly from a platform card must name that platform's provider or its application integration. */
export function focusNamesPlatform(item: CaseScenes, scene: SceneSpec, platformId: PlatformId, mode: Mode) {
  return scene.nodes.some((node) => {
    const role = focusRoleFor(item, node, platformId, mode);
    return role === "provider" || role === "integration";
  });
}

/** Explicit occurrence evidence only. Canonical capability bindings drive attribution, not an inherited source menu. */
export function sourceRefsForNode(item: CaseScenes, node: SceneNode, mode: Mode) {
  void item;
  void mode;
  const refs = node.sources?.map((source) => source.id) ?? node.sourceRefIds ?? [];
  return [...new Set(refs)];
}

export function sourceActionsForNode(item: CaseScenes, node: SceneNode, mode: Mode): SceneSourceAction[] {
  void item;
  void mode;
  const explicit = node.sources ?? [];
  if (explicit.length) return explicit;
  return (node.sourceRefIds ?? []).map((id, index, refs) => ({
    id,
    label: refs.length === 1 ? "Source" : `Source ${index + 1}`,
  }));
}

const ACTIVITY_W = 260;
const ACTIVITY_H = 124;
const JOURNEY_GAP = 80;

export function buildBusinessJourneyScene(input: {
  id: string;
  businessStepId: string;
  title: string;
  purpose: string;
  modes?: Mode[];
  steps: {
    instanceId: string;
    entityId: string;
    displayLabel: string;
    supportingText?: string;
    role: "activity";
    emphasis?: "customer" | "assisted";
    drillInto?: string;
    modelRelationshipId: string;
  }[];
}): SceneSpec {
  const nodes: SceneNode[] = input.steps.map((step, index) => ({
    instanceId: step.instanceId,
    entityId: step.entityId,
    role: "activity",
    emphasis: step.emphasis,
    displayLabel: step.displayLabel,
    supportingText: step.supportingText,
    drillInto: step.drillInto,
    x: index * (ACTIVITY_W + JOURNEY_GAP),
    y: 40,
    width: ACTIVITY_W,
    height: ACTIVITY_H,
  }));
  const relationships: SceneRelationship[] = input.steps.slice(1).map((step, index) => ({
    id: `${input.steps[index].instanceId}-${step.instanceId}`,
    sourceInstanceId: input.steps[index].instanceId,
    targetInstanceId: step.instanceId,
    kind: "businessSequence",
    sourcePort: "out-r",
    targetPort: "in-l",
    modelRelationshipIds: [step.modelRelationshipId],
  }));
  return {
    id: input.id,
    kind: "businessJourney",
    businessStepId: input.businessStepId,
    title: input.title,
    purpose: input.purpose,
    entryInstanceIds: [input.steps[0]?.instanceId ?? ""],
    exitInstanceIds: [input.steps.at(-1)?.instanceId ?? ""],
    modes: input.modes ?? ["implemented", "proposed"],
    nodes,
    relationships,
  };
}

export function validateCase(item: CaseScenes, evidenceIds: Set<string>) {
  const errors: string[] = [];
  const relIds = new Set(item.relationships.map((rel) => rel.id));
  const bindingIds = new Set((item.bindings ?? []).map((binding) => binding.id));
  if (!item.scenes[item.rootSceneId]) errors.push(`${item.id} missing root`);
  for (const scene of Object.values(item.scenes)) {
    const ids = new Set(scene.nodes.map((node) => node.instanceId));
    if (ids.size !== scene.nodes.length) errors.push(`${scene.id} duplicate instances`);
    for (const rel of scene.relationships) {
      if (!ids.has(rel.sourceInstanceId) || !ids.has(rel.targetInstanceId)) errors.push(`${scene.id} ${rel.id} endpoint`);
      if (!renderablePort(rel.sourcePort, "out") || !renderablePort(rel.targetPort, "in")) errors.push(`${scene.id} ${rel.id} port`);
      for (const modelId of rel.modelRelationshipIds) {
        if (!relIds.has(modelId)) errors.push(`${scene.id} ${rel.id} missing model ${modelId}`);
      }
      for (const bindingId of rel.bindingIds ?? []) {
        if (!bindingIds.has(bindingId)) errors.push(`${scene.id} ${rel.id} binding ${bindingId}`);
      }
    }
    for (const node of scene.nodes) {
      if (node.drillInto && !item.scenes[node.drillInto]) errors.push(`${scene.id} ${node.instanceId} drill`);
      for (const sourceId of [...(node.sourceRefIds ?? []), ...(node.sources?.map((source) => source.id) ?? [])]) {
        if (!evidenceIds.has(sourceId)) errors.push(`${scene.id} ${node.instanceId} source ${sourceId}`);
      }
      for (const line of node.capabilityLines ?? []) {
        for (const bindingId of line.bindingIds) {
          if (!bindingIds.has(bindingId)) errors.push(`${scene.id} ${node.instanceId} capability ${line.id} binding ${bindingId}`);
        }
      }
      for (const source of node.sources ?? []) {
        if (source.bindingId && !bindingIds.has(source.bindingId)) errors.push(`${scene.id} ${node.instanceId} source ${source.id} binding ${source.bindingId}`);
      }
    }
    const routed = routeScene(scene);
    for (const hit of crossingRoutes(scene, routed)) errors.push(`${scene.id} route crosses ${hit}`);
    for (const hit of labelOverlaps(scene, routed)) errors.push(`${scene.id} label overlaps ${hit}`);
  }
  const cited = new Set([
    ...Object.values(item.scenes).flatMap((scene) => scene.relationships.flatMap((rel) => rel.modelRelationshipIds)),
    ...(item.projectionRelationshipIds ?? []),
  ]);
  for (const rel of item.relationships) {
    if (!cited.has(rel.id)) errors.push(`${item.id} omits relationship ${rel.id}`);
  }
  errors.push(...bindingErrors(item, evidenceIds));
  return errors;
}

function bindingErrors(item: CaseScenes, evidenceIds: Set<string>) {
  const errors: string[] = [];
  const platformList = (item.platforms ?? []).map((platform) => platform.id);
  const platformIds = new Set(platformList);
  if (platformIds.size !== platformList.length) errors.push(`${item.id} duplicate platforms`);
  const bindingIds = new Set<string>();
  for (const binding of item.bindings ?? []) {
    if (bindingIds.has(binding.id)) errors.push(`${item.id} duplicate binding ${binding.id}`);
    bindingIds.add(binding.id);
    if (!platformIds.has(binding.platformId)) errors.push(`${item.id} binding ${binding.id} platform`);
    if (binding.providerEntityIds.length === 0) errors.push(`${item.id} binding ${binding.id} provider`);
    if (binding.applicationIntegrationEntityIds.length === 0) errors.push(`${item.id} binding ${binding.id} integration`);
    if (binding.workloadEntityIds.length === 0) errors.push(`${item.id} binding ${binding.id} workload`);
    if (binding.modes.length === 0) errors.push(`${item.id} binding ${binding.id} modes`);
    const provider = new Set(binding.providerEntityIds);
    const integration = new Set(binding.applicationIntegrationEntityIds);
    const workload = new Set(binding.workloadEntityIds);
    for (const id of provider) {
      if (integration.has(id) || workload.has(id)) errors.push(`${item.id} binding ${binding.id} entity ${id} has conflicting roles`);
    }
    for (const id of integration) {
      if (workload.has(id)) errors.push(`${item.id} binding ${binding.id} entity ${id} has conflicting roles`);
    }
    for (const ref of binding.evidenceRefIds) {
      if (!evidenceIds.has(ref)) errors.push(`${item.id} binding ${binding.id} evidence ${ref}`);
    }
    if (binding.evidenceLevel === "source-linked" && binding.evidenceRefIds.length === 0) {
      errors.push(`${item.id} binding ${binding.id} claims source-linked without evidence`);
    }
  }
  const used = new Set<string>();
  for (const scene of Object.values(item.scenes)) {
    for (const node of scene.nodes) {
      for (const id of node.bindingIds ?? []) {
        if (!bindingIds.has(id)) errors.push(`${scene.id} ${node.instanceId} binding ${id}`);
        used.add(id);
        for (const mode of scene.modes) {
          const binding = (item.bindings ?? []).find((entry) => entry.id === id);
          if (binding?.modes.includes(mode) && !bindingRole(binding, node)) {
            errors.push(`${scene.id} ${node.instanceId} binding ${id} has no canonical role`);
          }
        }
      }
    }
  }
  for (const id of bindingIds) {
    if (!used.has(id)) errors.push(`${item.id} binding ${id} never appears in a scene`);
  }
  // Entering a platform card, or a detail below it, must never leave every node unrelated.
  for (const scene of Object.values(item.scenes)) {
    for (const node of scene.nodes) {
      const platformId = node.platformFocus;
      if (!platformId || !node.drillInto) continue;
      if (!platformIds.has(platformId)) errors.push(`${scene.id} ${node.instanceId} focus ${platformId}`);
      for (const mode of scene.modes) {
        const destinationId = node.drillByMode?.[mode] ?? node.drillInto;
        const destination = item.scenes[destinationId];
        if (destination?.modes.includes(mode) && !focusNamesPlatform(item, destination, platformId, mode)) {
          errors.push(`${scene.id} ${node.instanceId} focus ${platformId} names nothing in ${destinationId} (${mode})`);
        }
      }
    }
  }
  for (const platformId of platformIds) {
    for (const scene of Object.values(item.scenes)) {
      for (const mode of scene.modes) {
        const claims = scene.nodes.some((node) => resolveNodeBindings(item, node, mode).some(({ binding }) => binding.platformId === platformId));
        if (claims && !focusResolves(item, scene, platformId as PlatformId, mode)) {
          errors.push(`${scene.id} focus ${platformId} resolves nothing (${mode})`);
        }
      }
    }
  }
  return errors;
}

export function routeScene(scene: SceneSpec): RoutedEdge[] {
  const absolute = absoluteSceneNodes(scene.nodes);
  const byId = new Map(absolute.map((node) => [node.instanceId, node]));
  return scene.relationships.flatMap((rel) => {
    const source = byId.get(rel.sourceInstanceId);
    const target = byId.get(rel.targetInstanceId);
    if (!source || !target) return [];
    const start = portPoint(source, rel.sourcePort);
    const end = portPoint(target, rel.targetPort);
    return [{ ...rel, points: rel.via?.length ? [start, ...rel.via, end] : orthogonalPoints(source, target, rel.sourcePort, rel.targetPort) }];
  });
}

/** Resolve parent-relative subflow positions into diagram coordinates for routing and bounds. */
export function absoluteSceneNodes(nodes: SceneNode[]): SceneNode[] {
  const byId = new Map(nodes.map((node) => [node.instanceId, node]));
  const cache = new Map<string, { x: number; y: number }>();
  const position = (node: SceneNode, seen = new Set<string>()): { x: number; y: number } => {
    const saved = cache.get(node.instanceId);
    if (saved) return saved;
    if (!node.parentId || seen.has(node.instanceId)) return { x: node.x, y: node.y };
    const parent = byId.get(node.parentId);
    if (!parent) return { x: node.x, y: node.y };
    const nextSeen = new Set(seen).add(node.instanceId);
    const origin = position(parent, nextSeen);
    const resolved = { x: origin.x + node.x, y: origin.y + node.y };
    cache.set(node.instanceId, resolved);
    return resolved;
  };
  return nodes.map((node) => ({ ...node, ...position(node) }));
}

/** A port is only valid when the node component can render a handle with that exact id. */
export function renderablePort(port: string | undefined, direction: "in" | "out") {
  if (!port || !port.startsWith(`${direction}-`)) return false;
  if (port === `${direction}-b-l` || port === `${direction}-b-r`) return true;
  const match = /^(?:in|out)-([lrbt])(?:@([\d.]+))?$/.exec(port);
  if (!match) return false;
  if (!match[2]) return true;
  const along = Number(match[2]);
  return Number.isFinite(along) && along > 0 && along < 1;
}

export function portPoint(node: SceneNode, port: string): Point {
  if (port === "out-b-l" || port === "in-b-l") return { x: node.x + node.width * 0.32, y: node.y + node.height };
  if (port === "out-b-r" || port === "in-b-r") return { x: node.x + node.width * 0.68, y: node.y + node.height };
  const match = /^(?:in|out)-([lrbt])(?:@([\d.]+))?$/.exec(port);
  const side = match?.[1] ?? "b";
  const along = match?.[2] ? Number(match[2]) : 0.5;
  if (side === "l") return { x: node.x, y: node.y + node.height * along };
  if (side === "r") return { x: node.x + node.width, y: node.y + node.height * along };
  if (side === "t") return { x: node.x + node.width * along, y: node.y };
  return { x: node.x + node.width * along, y: node.y + node.height };
}

function portSide(port: string) {
  if (port === "out-b-l" || port === "in-b-l" || port === "out-b-r" || port === "in-b-r") return "b";
  return /^(?:in|out)-([lrbt])/.exec(port)?.[1] ?? "b";
}

function orthogonalPoints(source: SceneNode, target: SceneNode, sourcePort: string, targetPort: string): Point[] {
  const start = portPoint(source, sourcePort);
  const end = portPoint(target, targetPort);
  if (Math.abs(start.y - end.y) < 8 || Math.abs(start.x - end.x) < 8) return [start, end];
  const side = portSide(sourcePort);
  if (side === "b" && end.y < start.y) {
    const y = source.y + source.height + 36;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  if (side === "t" && end.y > start.y) {
    const y = source.y - 36;
    return [start, { x: start.x, y }, { x: end.x, y }, end];
  }
  if (side === "r" && end.x < start.x) {
    const x = start.x + 40;
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  if (side === "l" && end.x > start.x) {
    const x = start.x - 40;
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  if (side === "r" || side === "l") {
    const x = side === "r" ? Math.min(start.x + 40, (start.x + end.x) / 2) : Math.max(start.x - 40, (start.x + end.x) / 2);
    return [start, { x, y: start.y }, { x, y: end.y }, end];
  }
  const y = side === "b" ? Math.min(start.y + 32, (start.y + end.y) / 2) : Math.max(start.y - 32, (start.y + end.y) / 2);
  return [start, { x: start.x, y }, { x: end.x, y }, end];
}

export function routeIssues(scene: SceneSpec, routed: RoutedEdge[]) {
  return [...crossingRoutes(scene, routed), ...labelOverlaps(scene, routed)];
}

function crossingRoutes(scene: SceneSpec, routed: RoutedEdge[]) {
  const hits: string[] = [];
  const nodes = absoluteSceneNodes(scene.nodes);
  for (const edge of routed) {
    for (let index = 1; index < edge.points.length; index += 1) {
      const a = edge.points[index - 1];
      const b = edge.points[index];
      for (const node of nodes) {
        const attachmentAtSource = node.instanceId === edge.sourceInstanceId && index === 1;
        const attachmentAtTarget = node.instanceId === edge.targetInstanceId && index === edge.points.length - 1;
        if (attachmentAtSource || attachmentAtTarget) continue;
        if (node.role === "group" && (
          isAncestor(scene.nodes, node.instanceId, edge.sourceInstanceId)
          || isAncestor(scene.nodes, node.instanceId, edge.targetInstanceId)
        )) continue;
        if (segmentHitsNode(a, b, node)) hits.push(`${edge.id}:${node.instanceId}`);
      }
    }
  }
  return hits;
}

function segmentHitsNode(a: Point, b: Point, node: SceneNode) {
  const pad = 3;
  const left = node.x + pad;
  const right = node.x + node.width - pad;
  const top = node.y + pad;
  const bottom = node.y + node.height - pad;
  if (Math.abs(a.y - b.y) < 0.5) {
    const y = a.y;
    if (y <= top || y >= bottom) return false;
    const minX = Math.min(a.x, b.x);
    const maxX = Math.max(a.x, b.x);
    return minX < right && maxX > left;
  }
  if (Math.abs(a.x - b.x) < 0.5) {
    const x = a.x;
    if (x <= left || x >= right) return false;
    const minY = Math.min(a.y, b.y);
    const maxY = Math.max(a.y, b.y);
    return minY < bottom && maxY > top;
  }
  return false;
}

function labelOverlaps(scene: SceneSpec, routed: RoutedEdge[]) {
  const hits: string[] = [];
  const nodes = absoluteSceneNodes(scene.nodes);
  const boxes = routed.filter((edge) => edge.label).map((edge) => ({ id: edge.id, box: labelBox(edge) }));
  for (const item of boxes) {
    for (const node of nodes) {
      if (node.role === "group") continue;
      if (intersects(item.box, { x: node.x, y: node.y, width: node.width, height: node.height })) hits.push(`${item.id}:${node.instanceId}`);
    }
  }
  for (let index = 0; index < boxes.length; index += 1) {
    for (let other = index + 1; other < boxes.length; other += 1) {
      if (intersects(boxes[index].box, boxes[other].box)) hits.push(`${boxes[index].id}:${boxes[other].id}`);
    }
  }
  return hits;
}

function isAncestor(nodes: SceneNode[], ancestorId: string, instanceId: string) {
  const byId = new Map(nodes.map((node) => [node.instanceId, node]));
  let current = byId.get(instanceId);
  const seen = new Set<string>();
  while (current?.parentId && !seen.has(current.instanceId)) {
    if (current.parentId === ancestorId) return true;
    seen.add(current.instanceId);
    current = byId.get(current.parentId);
  }
  return false;
}

function intersects(a: { x: number; y: number; width: number; height: number }, b: { x: number; y: number; width: number; height: number }) {
  return a.x < b.x + b.width && a.x + a.width > b.x && a.y < b.y + b.height && a.y + a.height > b.y;
}

/**
 * Labels sit on the corridor between the endpoints rather than the longest run,
 * so a route that leaves a card vertically does not print its label over that card.
 */
export function labelAnchor(points: Point[]): Point {
  if (points.length === 0) return { x: 0, y: 0 };
  if (points.length >= 4) {
    const a = points[Math.floor((points.length - 1) / 2) - 0];
    const b = points[Math.floor((points.length - 1) / 2) + 1];
    if (a && b) return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
  }
  let best = points[0];
  let length = -1;
  for (let index = 1; index < points.length; index += 1) {
    const a = points[index - 1];
    const b = points[index];
    const span = Math.hypot(b.x - a.x, b.y - a.y);
    if (span >= length) {
      length = span;
      best = { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
    }
  }
  return best;
}

function labelBox(edge: RoutedEdge) {
  const best = labelAnchor(edge.points);
  // Matches the rendered .map-edge-label: 16px semibold plus 6px padding and a 1px border.
  const width = Math.max(36, (edge.label?.length ?? 0) * 8.8 + 14);
  const height = 24;
  return { x: best.x + (edge.labelOffset?.x ?? 0) - width / 2, y: best.y + (edge.labelOffset?.y ?? 0) - height / 2, width, height };
}
