import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function infrastructureRoutes({ describe }: ModelViewContext) {
  describe("infrastructure", "routing", "Studio model routing", "service", "The briefing adapter selects its Studio chain. If no backend resolves, its model settings fall back to the environment configuration.", ["platform.briefing-routing", "platform.model-routing"]);
}
