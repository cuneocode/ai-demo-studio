import type { CaseScenes, Mode, NodeRole, SceneNode } from "../scene-model.ts";

export type DiagramLayer = "security" | "observability" | "deployment";
export type ComponentType = "agent" | "tool" | "gateway" | "model" | "database" | "service" | "control" | "human" | "data" | "workflow" | "telemetry" | "infrastructure" | "outcome";
export type DiagramCell = {
  id: string;
  label: string;
  caption?: string;
  labelByMode?: Partial<Record<Mode, string>>;
  captionByMode?: Partial<Record<Mode, string>>;
  boundaryId?: string;
  role?: NodeRole;
  componentType?: ComponentType;
  sceneId: string;
  instanceId: string;
  targetPageId?: string;
  layer?: DiagramLayer;
  modes?: Mode[];
  x: number;
  y: number;
  width: number;
  height: number;
};
export type DiagramEdge = {
  id: string;
  from: string;
  to: string;
  /** Cross-scope terminals reference canonical components in the same canvas. */
  fromScopeId?: string;
  toScopeId?: string;
  label: string;
  relationshipIds: string[];
  kind?: "request" | "control" | "return" | "telemetry" | "hosting";
  layer?: DiagramLayer;
  modes?: Mode[];
  exit?: [number, number];
  entry?: [number, number];
  via?: [number, number][];
  bidirectional?: boolean;
  labelOffset?: [number, number];
  /** Separate parallel branch routes within the gap between workflow rows. */
  laneOffset?: number;
  routed?: boolean;
};
export type DiagramPage = {
  id: string;
  title: string;
  level: 0 | 1 | 2;
  parentId?: string;
  owner?: { scopeId: string; cellId: string };
  aliases?: Record<string, { scopeId: string; cellId: string }>;
  purpose: string;
  layers: DiagramLayer[];
  cells: DiagramCell[];
  edges: DiagramEdge[];
  boundaries?: { id: string; label: string; x: number; y: number; width: number; height: number }[];
  note?: string;
  autoLayout?: boolean;
  /** Ordered workflow columns, with supporting functions in additional rows. */
  flow?: string[][];
  relatedPageIds?: string[];
  groups?: { id: string; label: string; layer?: DiagramLayer }[];
};

/** Resolve evidence and ownership through the existing architecture catalog. */
export function diagramNode(catalog: CaseScenes, cell: DiagramCell): SceneNode {
  const node = catalog.scenes[cell.sceneId]?.nodes.find((item) => item.instanceId === cell.instanceId);
  if (!node) throw new Error(`Unresolved diagram occurrence: ${cell.sceneId}/${cell.instanceId}`);
  return node;
}

export type CanvasItem = DiagramCell & {
  localId: string;
  scopeId: string;
  childScopeId?: string;
  aliases?: DiagramCell[];
};
export type CanvasScope = {
  id: string;
  title: string;
  level: number;
  purpose: string;
  note?: string;
  ownerId?: string;
  parentScopeId?: string;
  cellIds: string[];
  flow?: string[][];
};
export type CanvasBoundary = {
  id: string;
  scopeId: string;
  label: string;
  members: string[];
};
export type CanvasDocument = {
  rootScopeId: string;
  scopes: Record<string, CanvasScope>;
  items: Record<string, CanvasItem>;
  edges: (DiagramEdge & { scopeId: string })[];
  boundaries: CanvasBoundary[];
};
export type CanvasRect = { x: number; y: number; width: number; height: number };
