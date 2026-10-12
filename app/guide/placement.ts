export type Rect = { x: number; y: number; w: number; h: number };
export type PlacementMode = "right" | "left" | "below" | "above" | "dock" | "strip" | "center" | "sheet";
export type Placement = { x: number; y: number; w: number; mode: PlacementMode };

export type PlaceInput = {
  /** Spotlight holes in viewport coordinates. */
  targets: Rect[];
  viewport: { w: number; h: number };
  /** Card height at full width, and at the compact sidebar-dock width. */
  card: { h: number; dockH?: number };
  /** Other things the card must not cover, such as the presenter bar. */
  obstacles?: Rect[];
  /** The visible sidebar column, if any; the last-resort dock. */
  sidebar?: Rect | null;
  /** Height of the fixed top bar (0 in Present mode). */
  top?: number;
  hint?: "auto" | "right" | "left" | "below" | "above";
};

export const GAP = 16;
export const EDGE = 12;
export const NARROW = 900;
export const STRIP_H = 48;

export function cardWidth(viewportWidth: number) {
  if (viewportWidth < NARROW) return viewportWidth - 2 * 8;
  return viewportWidth >= 1280 ? 360 : 320;
}

export function union(rects: Rect[]): Rect | null {
  if (!rects.length) return null;
  const x = Math.min(...rects.map((r) => r.x));
  const y = Math.min(...rects.map((r) => r.y));
  const right = Math.max(...rects.map((r) => r.x + r.w));
  const bottom = Math.max(...rects.map((r) => r.y + r.h));
  return { x, y, w: right - x, h: bottom - y };
}

export function intersects(a: Rect, b: Rect) {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Overlapping holes merge into their union, so an even-odd clip path never re-fills an overlap. */
export function mergeRects(rects: Rect[]): Rect[] {
  const out = rects.map((rect) => ({ ...rect }));
  let merged = true;
  while (merged) {
    merged = false;
    outer: for (let i = 0; i < out.length; i += 1) {
      for (let j = i + 1; j < out.length; j += 1) {
        if (intersects(out[i], out[j])) {
          out[i] = union([out[i], out[j]])!;
          out.splice(j, 1);
          merged = true;
          break outer;
        }
      }
    }
  }
  return out;
}

const clamp = (value: number, low: number, high: number) => Math.max(low, Math.min(high, value));

/**
 * Places the step card so it never covers a target: beside the targets, then
 * below or above, then docked in the sidebar column, then as a strip over the
 * top bar. Below the narrow breakpoint the card is a bottom sheet.
 */
export function place(input: PlaceInput): Placement {
  const { targets, viewport, card, obstacles = [], sidebar, top = 0, hint = "auto" } = input;
  const { w: vw, h: vh } = viewport;
  const w = cardWidth(vw);
  const h = card.h;

  if (vw < NARROW) return { x: 8, y: Math.max(top + 8, vh - h - 8), w, mode: "sheet" };

  const blockers = [...targets, ...obstacles];
  const clear = (rect: Rect) =>
    rect.x >= EDGE - 0.5 && rect.x + rect.w <= vw - EDGE + 0.5 &&
    rect.y >= top + EDGE - 0.5 && rect.y + rect.h <= vh - EDGE + 0.5 &&
    !blockers.some((blocker) => intersects(rect, blocker));

  const area = union(targets);
  if (!area) {
    // With nothing to point at, a wider card keeps recap steps short.
    const wide = Math.min(460, vw - 2 * EDGE);
    const candidate = { x: Math.round((vw - wide) / 2), y: Math.round(Math.max(top + EDGE, (vh - h) / 2)), w: wide, mode: "center" as const };
    if (clear({ ...candidate, h }) || !obstacles.length) return candidate;
    const above = Math.min(...obstacles.map((o) => o.y)) - GAP - h;
    return { ...candidate, y: Math.max(top + EDGE, above) };
  }

  const yBeside = clamp(area.y, top + EDGE, vh - h - EDGE);
  const xBelow = clamp(area.x, EDGE, vw - w - EDGE);
  const candidates: Record<"right" | "left" | "below" | "above", Placement> = {
    right: { x: area.x + area.w + GAP, y: yBeside, w, mode: "right" },
    left: { x: area.x - GAP - w, y: yBeside, w, mode: "left" },
    below: { x: xBelow, y: area.y + area.h + GAP, w, mode: "below" },
    above: { x: xBelow, y: area.y - GAP - h, w, mode: "above" },
  };
  const order: ("right" | "left" | "below" | "above")[] = ["right", "left", "below", "above"];
  if (hint !== "auto") order.unshift(...order.splice(order.indexOf(hint), 1));
  for (const side of order) {
    const candidate = candidates[side];
    if (clear({ x: candidate.x, y: candidate.y, w, h })) return candidate;
  }

  if (sidebar && sidebar.w >= 200) {
    const dockW = sidebar.w - 20;
    const dockH = card.dockH ?? h;
    const dock = { x: sidebar.x + 10, y: clamp(area.y, top + EDGE, vh - dockH - EDGE), w: dockW, mode: "dock" as const };
    if (!blockers.some((blocker) => intersects({ x: dock.x, y: dock.y, w: dockW, h: dockH }, blocker))) return dock;
  }

  const stripW = Math.min(760, vw - 2 * EDGE);
  return { x: Math.round((vw - stripW) / 2), y: Math.max(8, Math.round((top - STRIP_H) / 2)), w: stripW, mode: "strip" };
}

/** Where to scroll so the targets sit in the visible band, or null when they already do. */
export function scrollDelta(targets: Rect[], band: { top: number; bottom: number }, align: "center" | "start" = "center"): number | null {
  const area = union(targets);
  if (!area) return null;
  const room = band.bottom - band.top;
  const primary = targets[0];
  if (area.y >= band.top && area.y + area.h <= band.bottom) return null;
  if (area.h > room || align === "start") {
    const anchor = area.h > room ? primary : area;
    if (anchor.y >= band.top && anchor.y + Math.min(anchor.h, room) <= band.bottom) return null;
    return anchor.y - band.top;
  }
  return area.y + area.h / 2 - (band.top + room / 2);
}
