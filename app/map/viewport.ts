import { absoluteSceneNodes, labelAnchor, type Point, type RoutedEdge, type SceneNode, type StageGuide } from "./scene-model.ts";

export type Viewport = { x: number; y: number; zoom: number };
export type Bounds = { x: number; y: number; width: number; height: number };

export function sceneBounds(nodes: SceneNode[], edges: RoutedEdge[], guides?: StageGuide[]): Bounds {
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  const include = (point: Point) => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  };
  for (const node of absoluteSceneNodes(nodes)) {
    include({ x: node.x, y: node.y });
    include({ x: node.x + node.width, y: node.y + node.height });
  }
  for (const edge of edges) {
    for (const point of edge.points) include(point);
    if (edge.label) {
      const anchor = labelAnchor(edge.points);
      const width = Math.max(36, edge.label.length * 8.8 + 14);
      const height = 24;
      const x = anchor.x + (edge.labelOffset?.x ?? 0);
      const y = anchor.y + (edge.labelOffset?.y ?? 0);
      include({ x: x - width / 2, y: y - height / 2 });
      include({ x: x + width / 2, y: y + height / 2 });
    }
  }
  if (guides?.length) minY -= 28;
  if (!Number.isFinite(minX)) return { x: 0, y: 0, width: 1, height: 1 };
  return { x: minX, y: minY, width: Math.max(1, maxX - minX), height: Math.max(1, maxY - minY) };
}

/** Frame a scene inside the measured canvas. Automatic zoom stays in the readable resting range. */
export function frameScene(
  nodes: SceneNode[],
  edges: RoutedEdge[],
  guides: StageGuide[] | undefined,
  width: number,
  height: number,
  options: { minZoom?: number; maxZoom?: number; pad?: number } = {},
): Viewport {
  const bounds = sceneBounds(nodes, edges, guides);
  const pad = options.pad ?? 56;
  const availW = Math.max(1, width - pad);
  const availH = Math.max(1, height - pad);
  const fitted = Math.min(availW / bounds.width, availH / bounds.height);
  const zoom = Math.min(options.maxZoom ?? 1.05, Math.max(options.minZoom ?? 0.9, fitted));
  const contentW = bounds.width * zoom;
  const contentH = bounds.height * zoom;
  const x = contentW <= availW ? (width - contentW) / 2 - bounds.x * zoom : 28 - bounds.x * zoom;
  const y = contentH <= availH ? (height - contentH) / 2 - bounds.y * zoom : 28 - bounds.y * zoom;
  return { x, y, zoom };
}

export function panIntoView(viewport: Viewport, node: SceneNode, canvasWidth: number, canvasHeight: number, obstructedRight: number, obstructedBottom = 0): Viewport {
  return panBoundsIntoView(viewport, node, canvasWidth, canvasHeight, obstructedRight, obstructedBottom);
}

/** Preserve zoom while moving a selected local-story box into the unobscured canvas. */
export function panBoundsIntoView(viewport: Viewport, bounds: Bounds, canvasWidth: number, canvasHeight: number, obstructedRight = 0, obstructedBottom = 0): Viewport {
  const zoom = viewport.zoom;
  let { x, y } = viewport;
  const usableRight = canvasWidth - obstructedRight - 28;
  const usableBottom = canvasHeight - obstructedBottom - 24;
  const shift = (horizontal: number, vertical: number) => {
    x += horizontal;
    y += vertical;
  };
  const right = () => (bounds.x + bounds.width) * zoom + x;
  const left = () => bounds.x * zoom + x;
  const bottom = () => (bounds.y + bounds.height) * zoom + y;
  const top = () => bounds.y * zoom + y;
  if (right() > usableRight) shift(usableRight - right(), 0);
  if (left() < 24) shift(24 - left(), 0);
  if (bottom() > usableBottom) shift(0, usableBottom - bottom());
  if (top() < 24) shift(0, 24 - top());
  return { x, y, zoom };
}
