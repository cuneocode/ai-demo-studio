import type { DiagramCell, ComponentType } from "./model.ts";
import type { SceneNode } from "../scene-model.ts";

// Explicit authored identities distinguish model inference from autonomous agents,
// and tool operations from the databases or documents they access.
const generic: Record<string, Record<string, ComponentType>> = {
  system: { model: "model", graph: "model", defense: "service", observe: "telemetry", evidence: "data", context: "data", filings: "data", market: "data", registry: "data", reference: "data", exception: "agent" },
  workload: { supervisor: "agent", subagents: "agent", agent: "agent", scan: "agent", patch: "agent", assessment: "model", xbrl: "tool", grounding: "tool", check: "tool", verifier: "tool", suitability: "tool", nba: "tool", rules: "tool", verify: "tool", gate: "human", review: "human" },
  model: { inference: "model", chat: "model", model: "model", chain: "model", nim: "model", ocr: "model", extract: "model", route: "service", schema: "data" },
  graph: { gnn: "model", shap: "tool", client: "tool", train: "workflow" },
  score: { route: "service", band: "data" },
  defense: { guards: "model", accepted: "data", call: "control", inspect: "control", segments: "data", hops: "control" },
  observe: { controls: "control", in: "telemetry", otlp: "telemetry", trace: "telemetry", span: "telemetry", export: "telemetry" },
  review: { evidence: "human", approve: "human" },
  hec: { ledger: "data", envelope: "tool", preview: "human" },
  pipeline: { validate: "tool", publish: "service", exception: "agent" },
  exception: { agent: "agent" },
};
const brahe: Record<string, ComponentType> = {
  "system/model": "model", "system/private": "model", "system/trace": "telemetry", "system/defense": "service",
  "check/judge": "model", "return/judge": "model", "check/control": "control", "return/control": "control",
  "build/supervisor": "agent", "build/cards": "agent", "build/score": "agent", "build/products": "tool", "build/score-tool": "tool",
};
const interbank: Record<string, ComponentType> = {
  "ib.a.coordinator": "agent", "ib.b.investigator": "agent", "ib.a.gateway": "gateway", "ib.b.gateway": "gateway",
  "ib.a.records": "database", "ib.b.records": "database", "ib.a.control": "control", "ib.a.control.api": "control", "ib.a.control.evaluate": "control",
  "ib.host.endpoint": "model", "ib.host.runtime": "infrastructure", "ib.platform.infra": "infrastructure", "ib.platform.observe": "telemetry",
  "ib.trace.agents": "telemetry", "ib.trace.gateways": "telemetry", "ib.trace.handoff": "telemetry", "ib.approve": "human",
};

export function componentTypeFor(caseId: string, scopeId: string, cell: DiagramCell, node: SceneNode, hasChildren: boolean): ComponentType {
  if (cell.componentType) return cell.componentType;
  if (caseId === "brahe-bank" && brahe[`${scopeId}/${cell.id}`]) return brahe[`${scopeId}/${cell.id}`];
  if (caseId === "interbank-a2a" && interbank[cell.id]) return interbank[cell.id];
  if (caseId !== "brahe-bank" && caseId !== "interbank-a2a") {
    if (caseId === "code-vulnerability" && scopeId === "system" && cell.id === "model") return "workflow";
    if (generic[scopeId]?.[cell.id]) return generic[scopeId][cell.id];
    if (["filings", "market", "context", "evidence", "registry", "reference"].includes(scopeId)) return "data";
  }
  if (hasChildren || scopeId === "journey") return "workflow";
  const role = cell.role ?? node.role;
  return role === "agent" ? "agent" : role === "checkpoint" || role === "decision" ? "control" : role === "input" ? "data" : role === "output" ? "outcome" : role === "activity" ? "human" : "service";
}
