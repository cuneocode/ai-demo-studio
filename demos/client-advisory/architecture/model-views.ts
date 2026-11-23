import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function infrastructureRoutes({ page, add, link, platform }: ModelViewContext) {
  page("workload").purpose = "The meeting-prep supervisor and its planner and compliance reviewer draft against deterministic suitability findings. The advisor and supervisor own release.";
  add("workload", "agent", "Meeting-prep supervisor", "agent", "The meeting-prep Deep Agent uses a planner and compliance reviewer with the same selected model. It drafts and submits a brief against deterministic findings and actions.", platform.callSources);
  add("workload", "planner", "Planner subagent", "agent", "The planner ranks suitable actions using next-best actions, suitability findings, and the household profile.", platform.callSources);
  add("workload", "critic", "Compliance reviewer", "agent", "The compliance reviewer calls the brief verifier and issuer policy tools. Human approval remains a separate step.", platform.callSources);
  page("workload").edges = page("workload").edges.filter(edge => !(edge.from === "nba" && edge.to === "grounding"));
  link({ scopeId: "workload", cellId: "nba" }, { scopeId: "workload", cellId: "agent" }, "Findings and actions");
  link({ scopeId: "workload", cellId: "agent" }, { scopeId: "workload", cellId: "planner" }, "Delegate");
  link({ scopeId: "workload", cellId: "agent" }, { scopeId: "workload", cellId: "critic" }, "Review draft");
  link({ scopeId: "workload", cellId: "critic" }, { scopeId: "workload", cellId: "grounding" }, "Verify claims");
  page("workload").flow = [["suitability", "nba", "agent", "grounding", "gate"], ["", "", "planner", "critic"]];
}
