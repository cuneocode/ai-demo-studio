import type { CanvasDocument, CanvasItem, CanvasRect, DiagramLayer } from "./model.ts";
import type { Mode } from "../scene-model.ts";

export function canvasScopePath(doc: CanvasDocument, scopeId: string): string[] {
  const scope = doc.scopes[scopeId];
  if (!scope) return [];
  return [...(scope.parentScopeId ? canvasScopePath(doc, scope.parentScopeId) : []), scopeId];
}
export function canvasItemVisible(doc: CanvasDocument, item: CanvasItem, expanded: string[], mode: Mode, layers: DiagramLayer[]): boolean {
  if (item.modes && !item.modes.includes(mode)) return false;
  if (item.layer && !layers.includes(item.layer)) return false;
  const ownerId = doc.scopes[item.scopeId].ownerId;
  return !ownerId || (expanded.includes(item.scopeId) && canvasItemVisible(doc, doc.items[ownerId], expanded, mode, layers));
}
export const visibleCanvasItems = (doc: CanvasDocument, expanded: string[], mode: Mode, layers: DiagramLayer[]) => Object.values(doc.items).filter((item) => canvasItemVisible(doc, item, expanded, mode, layers));

/** Keep a call attached to its canonical component as owning groups fold. */
export function visibleCanvasEdges(doc: CanvasDocument, expanded: string[], mode: Mode, layers: DiagramLayer[], visibleIds: string[]) {
  const visible = new Set(visibleIds);
  const active = (item: { modes?: Mode[]; layer?: DiagramLayer }) => (!item.modes || item.modes.includes(mode)) && (!item.layer || layers.includes(item.layer));
  function terminal(id: string): string | undefined {
    let current: string | undefined = id, result: string | undefined;
    while (current) {
      const item: CanvasItem = doc.items[current];
      if (!active(item)) return;
      if (!result && visible.has(current)) result = current;
      current = doc.scopes[item.scopeId].ownerId;
    }
    return result;
  }
  function descendant(id: string, ancestor: string): boolean {
    let owner = doc.scopes[doc.items[id].scopeId].ownerId;
    while (owner) {
      if (owner === ancestor) return true;
      owner = doc.scopes[doc.items[owner].scopeId].ownerId;
    }
    return false;
  }
  const candidates = doc.edges.filter(edge => active(edge) && canvasScopePath(doc, edge.scopeId).slice(1).every(id => expanded.includes(id)))
    .map(edge => ({ ...edge, from: terminal(edge.from), to: terminal(edge.to), original: edge }))
    .filter((edge): edge is typeof edge & { from: string; to: string } => Boolean(edge.from && edge.to && edge.from !== edge.to));
  const labels = new Set<string>();
  return candidates.filter(edge => !candidates.some(inner => inner.id !== edge.id && inner.kind === edge.kind && (
    inner.to === edge.to && descendant(inner.original.from, edge.original.from)
    || inner.from === edge.from && descendant(inner.original.to, edge.original.to)
  ))).map(edge => {
    if (edge.layer !== "deployment" || edge.kind !== "request") return edge;
    const key = `${edge.to}:${edge.label}`;
    const label = labels.has(key) ? "" : edge.label;
    labels.add(key);
    return { ...edge, label };
  });
}
const overlaps = (a: CanvasRect, b: CanvasRect, gap = 32) => a.x < b.x + b.width + gap && b.x < a.x + a.width + gap && a.y < b.y + b.height + gap && b.y < a.y + a.height + gap;
const extent = (boxes: CanvasRect[]) => ({
  x: Math.min(...boxes.map((box) => box.x)), y: Math.min(...boxes.map((box) => box.y)),
  width: Math.max(...boxes.map((box) => box.x + box.width)) - Math.min(...boxes.map((box) => box.x)),
  height: Math.max(...boxes.map((box) => box.y + box.height)) - Math.min(...boxes.map((box) => box.y)),
});
export type CanvasLayout = { cells: Record<string, CanvasRect>; absolute: Record<string, CanvasRect>; anchors: Record<string, number>; boundaries: Record<string, CanvasRect>; visibleIds: string[] };

/** Route a platform call around visible components, from the caller's right to the provider's top. */
export function routeCanvasConnection(layout: CanvasLayout, doc: CanvasDocument, fromId: string, toId: string): [number, number][] {
  const from = layout.absolute[fromId], to = layout.absolute[toId], padding = 12;
  const start: [number, number] = [from.x + from.width + padding + 1, from.y + (layout.anchors[fromId] ?? from.height / 2)];
  const end: [number, number] = [to.x + to.width / 2, to.y - padding - 1];
  const obstacles = layout.visibleIds.filter(id => !doc.items[id].childScopeId || !layout.visibleIds.some(other => doc.scopes[doc.items[other].scopeId].ownerId === id))
    .map(id => { const box = layout.absolute[id]; return { x: box.x - padding, y: box.y - padding, right: box.x + box.width + padding, bottom: box.y + box.height + padding }; });
  const xs = [...new Set([start[0], end[0], ...obstacles.flatMap(box => [box.x, box.right])])].sort((a, b) => a - b);
  const ys = [...new Set([start[1], end[1], ...obstacles.flatMap(box => [box.y, box.bottom])])].sort((a, b) => a - b);
  const blocked = (a: [number, number], b: [number, number]) => obstacles.some(box => a[1] === b[1]
    ? a[1] > box.y && a[1] < box.bottom && Math.max(a[0], b[0]) > box.x && Math.min(a[0], b[0]) < box.right
    : a[0] > box.x && a[0] < box.right && Math.max(a[1], b[1]) > box.y && Math.min(a[1], b[1]) < box.bottom);
  type Step = { x: number; y: number; direction: number; cost: number; score: number; previous?: Step };
  const heap: Step[] = [], best = new Map<string, number>();
  function push(step: Step) {
    let index = heap.length;
    heap.push(step);
    while (index) { const parent = (index - 1) >> 1; if (heap[parent].score <= step.score) break; heap[index] = heap[parent]; index = parent; }
    heap[index] = step;
  }
  function pop() {
    const result = heap[0], last = heap.pop()!;
    if (heap.length) {
      let index = 0;
      while (index * 2 + 1 < heap.length) {
        let child = index * 2 + 1;
        if (child + 1 < heap.length && heap[child + 1].score < heap[child].score) child++;
        if (last.score <= heap[child].score) break;
        heap[index] = heap[child]; index = child;
      }
      heap[index] = last;
    }
    return result;
  }
  const key = (x: number, y: number, direction: number) => `${x}:${y}:${direction}`;
  const initial = { x: xs.indexOf(start[0]), y: ys.indexOf(start[1]), direction: 0, cost: 0, score: 0 };
  push(initial);
  best.set(key(initial.x, initial.y, 0), 0);
  while (heap.length) {
    const current = pop();
    if (current.cost !== best.get(key(current.x, current.y, current.direction))) continue;
    if (xs[current.x] === end[0] && ys[current.y] === end[1]) {
      const path: [number, number][] = [];
      let step: Step | undefined = current;
      while (step) { path.unshift([xs[step.x], ys[step.y]]); step = step.previous; }
      return path.filter((point, index) => !index || index === path.length - 1 || !((path[index - 1][0] === point[0] && point[0] === path[index + 1][0]) || (path[index - 1][1] === point[1] && point[1] === path[index + 1][1])));
    }
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const x = current.x + dx, y = current.y + dy, direction = dx ? 0 : 1;
      if (x < 0 || x >= xs.length || y < 0 || y >= ys.length || blocked([xs[current.x], ys[current.y]], [xs[x], ys[y]])) continue;
      const cost = current.cost + Math.abs(xs[x] - xs[current.x]) + Math.abs(ys[y] - ys[current.y]) + (direction !== current.direction ? 36 : 0);
      if (cost >= (best.get(key(x, y, direction)) ?? Infinity)) continue;
      best.set(key(x, y, direction), cost);
      push({ x, y, direction, cost, score: cost + Math.abs(xs[x] - end[0]) + Math.abs(ys[y] - end[1]), previous: current });
    }
  }
  return [];
}

export function fitCanvasCamera(bounds: CanvasRect, width: number, height: number, overview = false) {
  const scale = Math.max(.01, Math.min(overview ? .9 : 1, Math.max(1, width - 144) / bounds.width, Math.max(1, height - 112) / bounds.height));
  return { scale, x: (width / scale - bounds.width) / 2 - bounds.x, y: (height / scale - bounds.height) / 2 - bounds.y, left: 0, top: 0 };
}

/** Shared workflow columns keep later stages ahead when a group grows. */
export function layoutFlow(flow: string[][], boxes: Record<string, CanvasRect>, anchors: Record<string, number> = {}): Record<string, CanvasRect> {
  const columns = Array.from({ length: Math.max(...flow.map(row => row.length)) }, (_, index) => Math.max(0, ...flow.map(row => boxes[row[index]]?.width ?? 0)));
  const anchor = (id: string) => anchors[id] ?? (boxes[id]?.height ?? 0) / 2;
  const above = flow.map(row => Math.max(0, ...row.filter(id => boxes[id]).map(anchor)));
  const below = flow.map(row => Math.max(0, ...row.filter(id => boxes[id]).map(id => boxes[id].height - anchor(id))));
  const result: Record<string, CanvasRect> = {};
  let y = 128;
  flow.forEach((row, index) => {
    let x = 32;
    columns.forEach((width, column) => {
      const id = row[column], box = boxes[id];
      if (box) result[id] = { ...box, x, y: y + above[index] - anchor(id) };
      if (width) x += width + 88;
    });
    if (above[index] + below[index]) y += above[index] + below[index] + 96;
  });
  return result;
}

/** Local deterministic reflow keeps sibling order and real group containment. */
export function layoutCanvas(doc: CanvasDocument, expanded: string[], mode: Mode, layers: DiagramLayer[]): CanvasLayout {
  const cells: Record<string, CanvasRect> = {};
  const boundaries: Record<string, CanvasRect> = {};
  const anchors: Record<string, number> = {};
  const active = (item: CanvasItem) => (!item.layer || layers.includes(item.layer)) && (!item.modes || item.modes.includes(mode));
  function arrange(scopeId: string): { width: number; height: number; anchor?: number } {
    const scope = doc.scopes[scopeId];
    const all = scope.cellIds.map((id) => doc.items[id]);
    const primary = all.filter((item) => !item.layer);
    const minX = Math.min(...(primary.length ? primary : all).map((item) => item.x));
    const minY = Math.min(...(primary.length ? primary : all).map((item) => item.y));
    const base: Record<string, CanvasRect> = {};
    for (const item of all) {
      const nested = item.childScopeId && expanded.includes(item.childScopeId) ? arrange(item.childScopeId) : null;
      base[item.id] = {
        x: item.x - minX + 32, y: item.y - minY + 128,
        width: item.childScopeId ? nested?.width ?? 180 : item.width,
        height: item.childScopeId ? nested?.height ?? 128 : Math.max(120, item.height),
      };
      cells[item.id] = { ...base[item.id] };
      anchors[item.id] = nested?.anchor ?? cells[item.id].height / 2;
    }
    const showing = primary.filter(active);
    // Expandable system boundaries begin as one short workflow row.
    if (scope.flow) Object.assign(cells, layoutFlow(scope.flow, Object.fromEntries(showing.map(item => [item.id, cells[item.id]])), anchors));
    else if (scopeId === "system") {
      const row = showing.filter((item) => item.y <= Math.min(...showing.map((entry) => entry.y)) + 160);
      const rest = showing.filter((item) => !row.includes(item));
      row.sort((a, b) => a.x - b.x);
      let x = 32;
      for (const item of row) { cells[item.id].x = x; cells[item.id].y = 128; x += cells[item.id].width + 72; }
      for (const item of rest) { cells[item.id].x = 32 + Math.max(0, row.findIndex((entry) => entry.x === item.x)) * 252; cells[item.id].y = 128 + Math.max(...row.map((entry) => cells[entry.id].height)) + 100; }
    }
    // Reflow only local neighbours that intersect the growing component.
    const ordered = showing.toSorted((a, b) => cells[a.id].y - cells[b.id].y || cells[a.id].x - cells[b.id].x);
    for (let pass = 0; pass < ordered.length * 2; pass++) {
      let moved = false;
      for (let i = 0; i < ordered.length; i++) for (let j = i + 1; j < ordered.length; j++) {
        const a = ordered[i], b = ordered[j], left = cells[a.id], right = cells[b.id];
        if (!overlaps(left, right)) continue;
        if (Math.abs(a.y - b.y) < Math.min(a.height, b.height) * .7 && b.x >= a.x) right.x = left.x + left.width + 48;
        else right.y = left.y + left.height + 64;
        moved = true;
      }
      if (!moved) break;
    }
    const mainBottom = showing.length ? Math.max(...showing.map((item) => cells[item.id].y + cells[item.id].height)) : 64;
    const overlayGap = Math.max(120, 96 + doc.edges.filter((edge) => edge.scopeId === scopeId && edge.layer).length * 24);
    const overlaySlots = new Map<string, number>();
    for (const item of all.filter((entry) => entry.layer)) {
      const key = `${item.layer}:${item.x}:${item.y}`;
      if (!overlaySlots.has(key)) overlaySlots.set(key, overlaySlots.size);
      const index = overlaySlots.get(key)!;
      const nested = item.childScopeId && expanded.includes(item.childScopeId) ? cells[item.id] : null;
      cells[item.id] = { ...cells[item.id], x: 32 + (index % 3) * 280, y: mainBottom + overlayGap + Math.floor(index / 3) * 220, width: nested?.width ?? 240, height: nested?.height ?? 120 };
    }
    // Expanded overlay groups also make room for their neighbouring overlays.
    const overlays = all.filter((item) => item.layer && active(item));
    for (let i = 0; i < overlays.length; i++) for (let j = i + 1; j < overlays.length; j++) {
      const a = cells[overlays[i].id], b = cells[overlays[j].id];
      if (overlaps(a, b)) b.x = a.x + a.width + 48;
    }
    for (const box of doc.boundaries.filter((item) => item.scopeId === scopeId)) {
      const members = box.members.map((id) => doc.items[id]).filter(active);
      if (!members.length || members.some((item) => item.childScopeId && expanded.includes(item.childScopeId))) continue;
      const bounds = extent(members.map((item) => cells[item.id]));
      const top = scope.flow ? 72 : 44;
      boundaries[box.id] = { x: bounds.x - 18, y: bounds.y - top, width: bounds.width + 36, height: bounds.height + top + 18 };
    }
    const content = [...all.filter(active).map((item) => cells[item.id]), ...doc.boundaries.filter((box) => box.scopeId === scopeId && boundaries[box.id]).map((box) => boundaries[box.id])];
    const bounds = content.length ? extent(content) : { x: 0, y: 0, width: 240, height: 100 };
    const first = scope.flow?.[0].find(id => cells[id] && all.some(item => item.id === id && active(item)));
    return { width: Math.max(260, bounds.x + bounds.width + 32), height: Math.max(150, bounds.y + bounds.height + 32), anchor: first ? cells[first].y + anchors[first] : undefined };
  }
  arrange(doc.rootScopeId);
  // Hidden descendants still retain their initial geometry in the exported model.
  for (const item of Object.values(doc.items)) if (!cells[item.id]) cells[item.id] = { x: item.x + 32, y: item.y + 128, width: item.childScopeId ? 180 : item.width, height: item.childScopeId ? 128 : Math.max(120, item.height) };
  const absolute: Record<string, CanvasRect> = {};
  function absoluteBox(id: string): CanvasRect {
    if (absolute[id]) return absolute[id];
    const box = cells[id];
    const ownerId = doc.scopes[doc.items[id].scopeId].ownerId;
    const parent = ownerId ? absoluteBox(ownerId) : { x: 0, y: 0 };
    return absolute[id] = { ...box, x: box.x + parent.x, y: box.y + parent.y };
  }
  Object.keys(doc.items).forEach(absoluteBox);
  return { cells, absolute, anchors, boundaries, visibleIds: visibleCanvasItems(doc, expanded, mode, layers).map((item) => item.id) };
}
