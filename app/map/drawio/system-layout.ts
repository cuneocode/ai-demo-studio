import type { DiagramEdge, DiagramPage } from "./model.ts";

export type SystemLayout = {
  order?: string[];
  edgeOverrides?: Record<string, Pick<DiagramEdge, "exit" | "entry" | "via">>;
  positions?: Record<string, [number, number]>;
  securityBelow?: boolean;
  spreadPipelineEdges?: boolean;
};

/** Shared compact system frame with optional services above and below the workflow. */
export function systemLayout(page: DiagramPage, layout: SystemLayout = {}): DiagramPage {
  const { positions = {}, securityBelow = false, spreadPipelineEdges = false } = layout;
  const order = layout.order ?? page.cells.filter(cell => !cell.layer).map(cell => cell.id);
  const cells = page.cells.map(cell => {
    const [x, y] = positions[cell.id] ?? (
      cell.layer === "security" ? (securityBelow ? [770, 450] : [400, 10])
        : cell.layer === "observability" ? [securityBelow ? 30 : 400, 450]
        : [30 + order.indexOf(cell.id) * 370, 220]
    );
    return { ...cell, x, y, width: 240, height: 130 };
  });
  let upper = 0;
  let lower = 0;
  let laneIndex = 0;
  return { ...page, autoLayout: false, cells, edges: page.edges.map((edge) => {
    const from = cells.find((cell) => cell.id === edge.from);
    const to = cells.find((cell) => cell.id === edge.to);
    if (edge.layer === "security" && !securityBelow) {
      if (!from || !to) return edge;
      const lane = 170 + upper++ * 22;
      return { ...edge, exit: [.75, 0], entry: [from.x > to.x ? .75 : .25, 1], via: [[from.x + 180, lane], [to.x + (from.x > to.x ? 180 : 60), lane]] };
    }
    if (edge.layer === "observability") {
      if (!from || !to) return edge;
      const reverse = Boolean(from.layer);
      const source = reverse ? to : from;
      const sink = reverse ? from : to;
      const lane = 395 + lower++ * 22;
      const via: [number, number][] = [[source.x + 60, lane], [sink.x + 60, lane]];
      return { ...edge, exit: [.25, reverse ? 0 : 1], entry: [.25, reverse ? 1 : 0], via: reverse ? via.reverse() : via };
    }
    const override = layout.edgeOverrides?.[edge.from + "." + edge.to] ?? layout.edgeOverrides?.[edge.from + ".*"];
    if (override) return { ...edge, ...override };
    if (spreadPipelineEdges) {
      if (!from || !to) return edge;
      // Adjacent pipeline stages connect directly; every longer edge takes its own lane
      // through the corridor between the pipeline row and the platform row.
      if (from.y === to.y) {
        if (Math.abs(from.x - to.x) <= 370) {
          const right = from.x < to.x;
          return { ...edge, exit: [right ? 1 : 0, .5], entry: [right ? 0 : 1, .5] };
        }
        const lane = 380 + laneIndex++ * 18;
        return { ...edge, exit: [.75, 1], entry: [.5, 1], via: [[from.x + 180, lane], [to.x + 120, lane]] };
      }
      if (Math.abs(from.x - to.x) < 40) return { ...edge, exit: [.5, 1], entry: [.5, 0] };
      const lane = 380 + laneIndex++ * 18;
      return { ...edge, exit: [.75, 1], entry: [.5, 0], via: [[from.x + 180, lane], [to.x + 120, lane]] };
    }
    if (!from || !to) return edge;
    if (from.y !== to.y) return { ...edge, exit: [.75, 1], entry: [.5, 0], via: [[from.x + 180, 380], [to.x + 120, 380]] };
    const right = from.x < to.x;
    return { ...edge, exit: [right ? 1 : 0, .5], entry: [right ? 0 : 1, .5] };
  }) };
}
