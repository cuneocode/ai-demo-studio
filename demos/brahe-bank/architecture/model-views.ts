import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function existingModelRoutes({ cell, system, describe, link, platform }: ModelViewContext) {
    for (const edge of system.edges.filter(edge => edge.id.startsWith("system.model."))) edge.kind = "request";
    for (const consumer of platform.modelConsumers) {
  if (consumer.cellId === "judge") describe(consumer.scopeId, consumer.cellId, cell(consumer.scopeId, consumer.cellId).label, "service");
  for (const mode of ["implemented", "proposed"] as const) link(consumer, { scopeId: "system", cellId: mode === "implemented" ? "model" : "private" }, "Model calls", "request", "deployment", [mode]);
    }
    for (const scope of ["check", "return"]) for (const mode of ["implemented", "proposed"] as const) link({ scopeId: "system", cellId: scope === "return" ? "release" : "check" }, { scopeId: "system", cellId: mode === "implemented" ? "model" : "private" }, "Judge model calls", "request", "deployment", [mode]);
}
