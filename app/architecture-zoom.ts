import { vulnerability } from "../demos/code-vulnerability/architecture/system-map.ts";
import { brahe } from "../demos/brahe-bank/architecture/system-map.ts";
import { fraud } from "../demos/fraud-modeling/architecture/system-map.ts";
import { briefing } from "../demos/company-briefing/architecture/system-map.ts";
import { research } from "../demos/market-research/architecture/system-map.ts";
import { advisory } from "../demos/client-advisory/architecture/system-map.ts";
import { kyc } from "../demos/kyc-processing/architecture/system-map.ts";
import { sar } from "../demos/sar-support/architecture/system-map.ts";
import { transactions } from "../demos/transaction-llm/architecture/system-map.ts";
import type { ZoomBox, ZoomChip, ZoomEdge, ZoomInterior, ZoomKind, ZoomMap } from "./map/system-map.ts";
export type { ZoomBox, ZoomChip, ZoomEdge, ZoomInterior, ZoomKind, ZoomMap } from "./map/system-map.ts";

export const zoomMaps: Record<string, ZoomMap> = {
  "code-vulnerability": vulnerability,
  "brahe-bank": brahe,
  "fraud-modeling": fraud,
  "company-briefing": briefing,
  "market-research": research,
  "client-advisory": advisory,
  "kyc-processing": kyc,
  "sar-support": sar,
  "transaction-llm": transactions,
};

export const zoomCaseIds = Object.keys(zoomMaps);

export type SceneNode = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind: ZoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: 0 | 1 | 2;
  titleSize: number;
  optional?: boolean;
  zoomable: boolean;
  targetId?: string;
};

export type SceneEdge = {
  from: string;
  to: string;
  label: string;
  depth: 0 | 1 | 2;
  kind?: ZoomEdge["kind"];
};

export type ZoomScene = {
  width: number;
  height: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
};

const CORE_W = 320;
const CORE_H = 176;
const CORE_GAP = 48;
const STEP_GAP = 56;
const CARD_W = 168;
const CARD_H = 96;
const CARD_GAP = 22;

type LocalNode = { id: string; x: number; y: number; w: number; h: number; box: ZoomBox | ZoomChip; stub?: boolean };
type Rect = { x: number; y: number; w: number; h: number };

function gridShape(count: number) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: Math.ceil(count / 3) };
}

function sharesSide(a: Pick<SceneNode, "x" | "y" | "w" | "h">, b: Pick<SceneNode, "x" | "y" | "w" | "h">) {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  const beside = gapX > 2 && gapX < Math.max(a.w, b.w) && overlapY > Math.min(a.h, b.h) * 0.55;
  const stacked = gapY > 2 && gapY < Math.max(a.h, b.h) && overlapX > Math.min(a.w, b.w) * 0.55;
  return beside || stacked;
}

function layoutInterior(interior: ZoomInterior) {
  const nodes: LocalNode[] = [];
  interior.entities.forEach((entity, column) => {
    const x = column * (CARD_W + CARD_GAP);
    nodes.push({ id: entity.id, x, y: 0, w: CARD_W, h: CARD_H, box: entity });
    (entity.chips ?? []).forEach((item, index) => {
      nodes.push({
        id: `${entity.id}:${item.id}`,
        x,
        y: (index + 1) * (CARD_H + CARD_GAP),
        w: CARD_W,
        h: CARD_H,
        box: item,
      });
    });
  });
  const stubCount = new Map<string, number>();
  interior.stubs.forEach((stub) => {
    const source = stub.from ?? interior.entities[0]?.id ?? "";
    const column = Math.max(0, interior.entities.findIndex((entity) => entity.id === source));
    const entity = interior.entities[column];
    const used = stubCount.get(source) ?? 0;
    stubCount.set(source, used + 1);
    const chipCount = entity?.chips?.length ?? 0;
    nodes.push({
      id: `stub:${stub.id}`,
      x: column * (CARD_W + CARD_GAP),
      y: (chipCount + 1 + used) * (CARD_H + CARD_GAP),
      w: CARD_W,
      h: CARD_H,
      box: stub,
      stub: true,
    });
  });
  const edges: { from: string; to: string; label: string; kind?: ZoomEdge["kind"] }[] = [
    ...interior.edges,
    ...interior.entities.flatMap((entity) => (entity.chips ?? []).map((item, index, list) => ({
      from: index === 0 ? entity.id : `${entity.id}:${list[index - 1].id}`,
      to: `${entity.id}:${item.id}`,
      label: index === 0 ? "includes" : "and",
    }))),
    ...interior.stubs.flatMap((stub) => {
      const from = stub.from ?? interior.entities[0]?.id;
      if (!from) return [];
      return [{ from, to: `stub:${stub.id}`, label: stub.subtitle }];
    }),
  ];
  const columns = Math.max(interior.entities.length, 1);
  const stack = Math.max(1, ...nodes.map((node) => Math.round(node.y / (CARD_H + CARD_GAP)) + 1));
  const width = Math.max(CARD_W, columns * CARD_W + Math.max(0, columns - 1) * CARD_GAP);
  const height = Math.max(CARD_H, stack * CARD_H + Math.max(0, stack - 1) * CARD_GAP);
  return { nodes, edges, width, height };
}

function fitInterior(local: ReturnType<typeof layoutInterior>, area: Rect) {
  if (!local.nodes.length) return [];
  const scale = Math.min(area.w / local.width, area.h / local.height);
  const ox = area.x + (area.w - local.width * scale) / 2;
  const oy = area.y + (area.h - local.height * scale) / 2;
  return local.nodes.map((item) => ({
    ...item,
    x: ox + item.x * scale,
    y: oy + item.y * scale,
    w: item.w * scale,
    h: item.h * scale,
  }));
}

function titleFont(text: string, cardW: number, preferred: number) {
  const fitted = (cardW * 0.9) / (Math.max(text.length, 1) * 0.48);
  return Math.min(preferred, fitted);
}

export function buildZoomScene(map: ZoomMap, steps: { title: string; detail: string }[]): ZoomScene {
  const measured = map.cores.map((core) => layoutInterior(map.interiors[core.id] ?? { title: core.title, note: "", entities: [], edges: [], stubs: [] }));
  const { cols: coreCols, rows: coreRows } = gridShape(Math.max(map.cores.length, 1));
  const stepW = 56 + coreCols * CORE_W + Math.max(0, coreCols - 1) * CORE_GAP;
  const stepH = 78 + coreRows * CORE_H + Math.max(0, coreRows - 1) * CORE_GAP;
  const sceneW = 64 + Math.max(steps.length, 1) * stepW + Math.max(0, steps.length - 1) * STEP_GAP;
  const sceneH = 80 + stepH;
  const homeScale = Math.min(1100 / sceneW, 640 / sceneH);
  const stepScale = Math.min(1100 / (stepW * 1.2), 640 / (stepH * 1.24));
  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const seen = new Set<string>();
  const keep = (from: SceneNode, to: SceneNode, label: string, kind: SceneEdge["kind"], depth: 0 | 1 | 2) => {
    if (!sharesSide(from, to)) return;
    const key = [from.id, to.id].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: from.id, to: to.id, label, kind, depth });
  };
  steps.forEach((step, index) => {
    const stepNode: SceneNode = {
      id: `p${index}`,
      title: step.title,
      subtitle: step.detail,
      detail: step.detail,
      kind: "human",
      x: 32 + index * (stepW + STEP_GAP),
      y: 40,
      w: stepW,
      h: stepH,
      depth: 0,
      titleSize: titleFont(step.title, stepW, 22 / homeScale),
      zoomable: true,
    };
    nodes.push(stepNode);
    if (index > 0) {
      const previous = nodes.find((node) => node.id === `p${index - 1}`);
      if (previous) keep(previous, stepNode, "next step", undefined, 0);
    }
    const body: Rect = { x: stepNode.x + 28, y: stepNode.y + 70, w: stepW - 56, h: stepH - 92 };
    map.cores.forEach((core, coreIndex) => {
      const column = coreIndex % coreCols;
      const row = Math.floor(coreIndex / coreCols);
      const cellW = (body.w - CORE_GAP * (coreCols - 1)) / coreCols;
      const cellH = (body.h - CORE_GAP * (coreRows - 1)) / coreRows;
      const rect = {
        x: body.x + column * (cellW + CORE_GAP),
        y: body.y + row * (cellH + CORE_GAP),
        w: cellW,
        h: cellH,
      };
      const interior = map.interiors[core.id];
      const local = measured[coreIndex];
      const coreId = `${stepNode.id}:${core.id}`;
      const coreNode: SceneNode = {
        id: coreId,
        title: core.title,
        subtitle: core.subtitle,
        detail: core.detail,
        kind: core.kind ?? "service",
        ...rect,
        depth: 1,
        titleSize: titleFont(core.title, rect.w, Math.min(rect.h * 0.2, 18 / stepScale)),
        optional: core.optional,
        zoomable: Boolean(interior && (interior.entities.length || interior.stubs.length)),
      };
      nodes.push(coreNode);
      const content: Rect = { x: rect.x + 16, y: rect.y + rect.h * 0.28, w: rect.w - 32, h: rect.h * 0.66 };
      const placed = fitInterior(local, content);
      const coreFrame = Math.min(1100 / (rect.w * 1.2), 640 / (rect.h * 1.24));
      for (const item of placed) {
        const targetId = item.stub && map.interiors[item.box.id] ? `${stepNode.id}:${item.box.id}` : undefined;
        nodes.push({
          id: `${coreId}:${item.id}`,
          title: item.box.title,
          subtitle: item.box.subtitle,
          detail: item.box.detail,
          kind: item.box.kind ?? "service",
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          depth: 2,
          titleSize: Math.min(titleFont(item.box.title, item.w, item.h * 0.34), 10 / stepScale, Math.max(14 / coreFrame, 1)),
          optional: "optional" in item.box ? item.box.optional : undefined,
          zoomable: Boolean(targetId),
          targetId,
        });
      }
      const localNodes = nodes.filter((node) => node.depth === 2 && node.id.startsWith(`${coreId}:`));
      for (const edge of local.edges) {
        const from = localNodes.find((node) => node.id === `${coreId}:${edge.from}`);
        const to = localNodes.find((node) => node.id === `${coreId}:${edge.to}`);
        if (from && to) keep(from, to, edge.label, edge.kind, 2);
      }
    });
    const coreNodes = nodes.filter((node) => node.depth === 1 && node.id.startsWith(`${stepNode.id}:`));
    for (const edge of map.coreEdges) {
      const from = coreNodes.find((node) => node.id === `${stepNode.id}:${edge.from}`);
      const to = coreNodes.find((node) => node.id === `${stepNode.id}:${edge.to}`);
      if (from && to) keep(from, to, edge.label, edge.kind, 1);
    }
  });
  return { width: sceneW, height: sceneH, nodes, edges };
}

export function routeSceneEdge(from: SceneNode, to: SceneNode) {
  if (!sharesSide(from, to)) return null;
  const overlapY = Math.min(from.y + from.h, to.y + to.h) - Math.max(from.y, to.y);
  const overlapX = Math.min(from.x + from.w, to.x + to.w) - Math.max(from.x, to.x);
  if (overlapY > overlapX) {
    const y = Math.max(from.y, to.y) + overlapY / 2;
    const x1 = from.x < to.x ? from.x + from.w : from.x;
    const x2 = from.x < to.x ? to.x : to.x + to.w;
    return { d: `M${x1},${y} L${x2},${y}`, label: [(x1 + x2) / 2, y] as [number, number] };
  }
  const x = Math.max(from.x, to.x) + overlapX / 2;
  const y1 = from.y < to.y ? from.y + from.h : from.y;
  const y2 = from.y < to.y ? to.y : to.y + to.h;
  return { d: `M${x},${y1} L${x},${y2}`, label: [x, (y1 + y2) / 2] as [number, number] };
}
