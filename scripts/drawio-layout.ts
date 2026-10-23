import ELK from "elkjs/lib/elk.bundled.js";
import type { ElkNode } from "elkjs/lib/elk-api.js";
import type { DiagramPage } from "../app/map/drawio/model.ts";
import { layoutFlow } from "../app/map/drawio/canvas-layout.ts";

const elk = new ELK();
const round = (value: number) => Math.round(value * 100) / 100;
export function labelLines(text: string, limit = 24): string[] {
  const lines: string[] = [];
  for (const word of text.split(/\s+/)) {
    if (!lines.length || lines.at(-1)!.length + word.length + 1 > limit) lines.push(word);
    else lines[lines.length - 1] += ` ${word}`;
  }
  return lines;
}

/** Layout runs during asset generation. Browsers load the resulting draw.io XML. */
export async function layoutDiagram(page: DiagramPage): Promise<DiagramPage> {
  const sized = () => page.cells.map((cell) => ({ ...cell, height: Math.max(120,
    60 + labelLines(cell.label, Math.floor((cell.width - 24) / 8.5)).length * 23 + (cell.targetPageId ? 22 : 0)),
  }));
  if (page.flow) {
    const measured = sized();
    const positions = layoutFlow(page.flow, Object.fromEntries(measured.filter(cell => !cell.layer).map(cell => [cell.id, cell])));
    const cells = measured.map(cell => ({ ...cell, ...positions[cell.id] }));
    const groups = page.groups ?? [];
    return { ...page, cells, boundaries: groups.map(group => {
      const members = cells.filter(cell => cell.boundaryId === group.id);
      const x = Math.min(...members.map(cell => cell.x)) - 20, y = Math.min(...members.map(cell => cell.y)) - 72;
      return { id: group.id, label: group.label, x, y, width: Math.max(...members.map(cell => cell.x + cell.width)) - x + 20, height: Math.max(...members.map(cell => cell.y + cell.height)) - y + 20 };
    }), edges: page.edges.map(edge => ({ ...edge, via: undefined, routed: false, exit: undefined, entry: undefined })) };
  }
  if (!page.autoLayout) return page;
  const cells = sized();
  const groups = (page.groups ?? []).filter((group) => cells.some((cell) => cell.boundaryId === group.id));
  if (!page.edges.length) {
    const positioned = cells.map((cell, index) => ({ ...cell, x: 32 + (index % 2) * 288, y: 80 + Math.floor(index / 2) * (Math.max(...cells.map((item) => item.height)) + 48) }));
    return { ...page, cells: positioned, boundaries: groups.map((group) => {
      const members = positioned.filter((cell) => cell.boundaryId === group.id);
      const x = Math.min(...members.map((cell) => cell.x)) - 20;
      const y = Math.min(...members.map((cell) => cell.y)) - 50;
      return { id: group.id, label: group.label, x, y, width: Math.max(...members.map((cell) => cell.x + cell.width)) - x + 20, height: Math.max(...members.map((cell) => cell.y + cell.height)) - y + 20 };
    }) };
  }
  const node = (cell: typeof cells[number]): ElkNode => ({ id: cell.id, width: cell.width, height: cell.height });
  const graph: ElkNode = {
    id: "root", layoutOptions: {
      "elk.algorithm": "layered", "elk.direction": "RIGHT", "elk.edgeRouting": "ORTHOGONAL",
      "elk.hierarchyHandling": "INCLUDE_CHILDREN", "elk.aspectRatio": "1.8", "elk.randomSeed": "1",
      "elk.layered.wrapping.strategy": "OFF", "elk.spacing.nodeNode": "48",
      "elk.layered.spacing.nodeNodeBetweenLayers": "48", "elk.spacing.edgeNode": "24",
      "elk.spacing.edgeLabel": "8", "elk.padding": "[top=28,left=28,bottom=28,right=28]",
    },
    children: [
      ...cells.filter((cell) => !cell.boundaryId).map(node),
      ...groups.map((group) => ({ id: `boundary.${group.id}`, layoutOptions: { "elk.padding": "[top=58,left=24,bottom=24,right=24]", "elk.layered.wrapping.strategy": "OFF" }, children: cells.filter((cell) => cell.boundaryId === group.id).map(node) })),
    ],
    edges: page.edges.filter(edge => !edge.fromScopeId && !edge.toScopeId).map((edge) => {
      const lines = labelLines(edge.label);
      return { id: edge.id, sources: [edge.from], targets: [edge.to], labels: [{ text: edge.label, width: Math.max(...lines.map((line) => line.length)) * 7.4 + 12, height: lines.length * 18 + 6 }] };
    }),
  };
  const result = await elk.layout(graph);
  const positions = new Map<string, { x: number; y: number; width: number; height: number }>();
  function collect(item: ElkNode, x = 0, y = 0) {
    const position = { x: x + (item.x ?? 0), y: y + (item.y ?? 0), width: item.width ?? 0, height: item.height ?? 0 };
    positions.set(item.id, position);
    item.children?.forEach((child) => collect(child, position.x, position.y));
  }
  collect(result);
  return {
    ...page,
    cells: cells.map((cell) => ({ ...cell, ...positions.get(cell.id)! })),
    boundaries: groups.map((group) => ({ id: group.id, label: group.label, ...positions.get(`boundary.${group.id}`)! })),
    edges: page.edges.map((edge) => {
      if (edge.fromScopeId || edge.toScopeId) return edge;
      const routed = result.edges!.find((item) => item.id === edge.id)!;
      const section = routed.sections?.[0];
      if (!section) throw new Error(`Missing draw.io route: ${page.id}/${edge.id}`);
      const offset = positions.get(routed.container ?? "root")!;
      const points = [section.startPoint, ...(section.bendPoints ?? []), section.endPoint].map((point) => [round(point.x + offset.x), round(point.y + offset.y)] as [number, number]);
      const from = positions.get(edge.from)!;
      const to = positions.get(edge.to)!;
      const lengths = points.slice(1).map((point, index) => Math.abs(point[0] - points[index][0]) + Math.abs(point[1] - points[index][1]));
      let remaining = lengths.reduce((sum, length) => sum + length, 0) / 2;
      let center = points[0];
      for (let i = 0; i < lengths.length; i++) {
        if (remaining <= lengths[i]) {
          const ratio = lengths[i] ? remaining / lengths[i] : 0;
          center = [points[i][0] + (points[i + 1][0] - points[i][0]) * ratio, points[i][1] + (points[i + 1][1] - points[i][1]) * ratio];
          break;
        }
        remaining -= lengths[i];
      }
      const label = routed.labels![0];
      return { ...edge, routed: true, via: points.slice(1, -1),
        exit: [round((points[0][0] - from.x) / from.width), round((points[0][1] - from.y) / from.height)],
        entry: [round((points.at(-1)![0] - to.x) / to.width), round((points.at(-1)![1] - to.y) / to.height)],
        labelOffset: [round(label.x! + offset.x + label.width! / 2 - center[0]), round(label.y! + offset.y + label.height! / 2 - center[1])],
      };
    }),
  };
}
