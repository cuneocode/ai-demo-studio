import type { DiagramPage } from "./model.ts";

/** Shared compact system frame with optional services above and below the workflow. */
export function systemLayout(caseId: string, page: DiagramPage): DiagramPage {
  const primary = page.cells.filter((cell) => !cell.layer);
  const order = caseId === "fraud-modeling" ? ["graph", "score", "model"]
    : caseId === "kyc-processing" ? ["registry", "workload", "model"]
    : caseId === "code-vulnerability" ? ["review", "workload", "model"]
    : caseId === "transaction-llm" ? ["reference", "pipeline", "model"] : primary.map((cell) => cell.id);
  const cells = page.cells.map((cell) => ({ ...cell,
    x: cell.id === "hec" ? 770 : cell.id === "exception" ? 400 : cell.layer === "security" ? caseId === "transaction-llm" ? 770 : 400 : cell.layer === "observability" ? caseId === "transaction-llm" ? 30 : 400 : 30 + order.indexOf(cell.id) * 370,
    y: cell.id === "hec" || cell.id === "exception" || cell.layer === "observability" || (caseId === "transaction-llm" && cell.layer === "security") ? 450 : cell.layer === "security" ? 10 : 220,
    width: 240, height: 130,
  }));
  let upper = 0;
  let lower = 0;
  return { ...page, autoLayout: false, cells, edges: page.edges.map((edge) => {
    const from = cells.find((cell) => cell.id === edge.from)!;
    const to = cells.find((cell) => cell.id === edge.to)!;
    if (edge.layer === "security" && caseId !== "transaction-llm") {
      const lane = 170 + upper++ * 22;
      return { ...edge, exit: [.75, 0], entry: [from.x > to.x ? .75 : .25, 1], via: [[from.x + 180, lane], [to.x + (from.x > to.x ? 180 : 60), lane]] };
    }
    if (edge.layer === "observability") {
      const reverse = Boolean(from.layer);
      const source = reverse ? to : from;
      const sink = reverse ? from : to;
      const lane = 395 + lower++ * 22;
      const via: [number, number][] = [[source.x + 60, lane], [sink.x + 60, lane]];
      return { ...edge, exit: [.25, reverse ? 0 : 1], entry: [.25, reverse ? 1 : 0], via: reverse ? via.reverse() : via };
    }
    if (caseId === "code-vulnerability" && edge.from === "review" && edge.to === "workload") return { ...edge, exit: [.5, 1], entry: [.5, 1], via: [[150, 380], [520, 380]] };
    if (edge.from === "hec") return { ...edge, exit: [0, .5], entry: [.5, 1], via: [[680, 515], [680, 405], [150, 405]] };
    if (from.y !== to.y) return { ...edge, exit: [.75, 1], entry: [.5, 0], via: [[from.x + 180, 380], [to.x + 120, 380]] };
    const right = from.x < to.x;
    return { ...edge, exit: [right ? 1 : 0, .5], entry: [right ? 0 : 1, .5] };
  }) };
}
