import type { ModelViewContext } from "../../../app/map/drawio/implementation-views.ts";

export function infrastructureRoutes({ describe, platform }: ModelViewContext) {
  describe("workload", "assessment", "Structured model calls", "service", "The application makes an Assessment call with one repair attempt, then an Outlook call if rejected facts require a revised opinion. These are structured LangChain calls.", platform.callSources);
}
