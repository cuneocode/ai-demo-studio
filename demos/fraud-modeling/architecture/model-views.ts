import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function infrastructureRoutes({ cell, page, add, describe, link, platform }: ModelViewContext) {
  describe("system", "graph", "Graph scoring service", "service");
  add("score", "agent", "Triage Deep Agent", "agent", "The triage Deep Agent receives scored evidence, calls investigation tools, and drafts an analyst summary. GraphSAGE and XGBoost scoring use a separate scorer service.", platform.callSources);
  link({ scopeId: "score", cellId: "band" }, { scopeId: "score", cellId: "agent" }, "Scored alert");
  add("infrastructure", "scorer", "Configured scorer runtime", "infrastructure", "The scorer chain supplies the separate GraphSAGE and XGBoost service. Recorded or sample scores can answer when live scoring is unavailable. It does not use the language model endpoint.", ["fraud.score"]);
  cell("infrastructure", "scorer").boundaryId = "scorer";
  page("infrastructure").groups!.push({ id: "scorer", label: "Separate scoring service" });
  page("infrastructure").flow!.push(["scorer"]);
  link({ scopeId: "system", cellId: "graph" }, { scopeId: "infrastructure", cellId: "scorer" }, "Scorer placement", "hosting", "deployment");
  link({ scopeId: "graph", cellId: "gnn" }, { scopeId: "infrastructure", cellId: "scorer" }, "Served by scorer", "hosting", "deployment");
}
