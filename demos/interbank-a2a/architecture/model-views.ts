import { diagramNode } from "../../../app/map/drawio/model.ts";
import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function existingModelRoutes({ catalog, system, cell, describe, link, platform }: ModelViewContext) {
    system.edges = system.edges.filter(edge => edge.id !== "support.infra");
    link({ scopeId: "system", cellId: "ib.stage.exchange" }, { scopeId: "hosting", cellId: "ib.host.endpoint" }, "Model calls", "request", "deployment");
    for (const consumer of platform.modelConsumers) {
  const item = cell(consumer.scopeId, consumer.cellId);
  const original = diagramNode(catalog, item);
  describe(consumer.scopeId, consumer.cellId, item.label, "agent", undefined, [...new Set([...(original.sourceRefIds ?? []), ...(original.sources ?? []).map(source => source.id), ...(platform.callSources ?? [])])]);
  link(consumer, { scopeId: "hosting", cellId: "ib.host.endpoint" }, "Model calls", "request", "deployment");
    }
}
