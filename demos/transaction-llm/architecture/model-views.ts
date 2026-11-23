import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function infrastructureRoutes({ page, add, link }: ModelViewContext) {
  add("pipeline", "extract", "Proposed extraction client", "service", "A proposed application client would call the extraction endpoint before deterministic schema validation. This use case has no running extraction service.");
  link({ scopeId: "pipeline", cellId: "extract" }, { scopeId: "pipeline", cellId: "validate" }, "Proposed fields");
  page("pipeline").flow = [["extract", "validate", "publish"], ["", "exception"]];
}
