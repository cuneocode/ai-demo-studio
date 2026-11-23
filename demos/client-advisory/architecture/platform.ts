import { at, inspect, consumers, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { infrastructureRoutes } from "./model-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "workload", cellId: "agent" }, { scopeId: "workload", cellId: "planner" }, { scopeId: "workload", cellId: "critic" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  genAIExporter: "platform.wealth-otlp",
  inspectModelIO: true,
  infrastructureRoutes,
  callSources: ["platform.advisory-agents"],
  runtimeDetail: "The Advisor Prep container exposes port 8017 and orchestrates client context, deterministic suitability checks, and meeting briefs. Its run volume is separate from Market Research.",
  connections: { status: "implemented", inspection: "application", connections: [
    inspect(at("context", "screen"), at("defense", "guards"), ["platform.wealth-screen"], "CRM note / verdict"),
    ...consumers(modelConsumers, at("defense", "guards"), ["platform.advisory-inspection"], "control"),
    ...consumers(modelConsumers, at("observe", "in"), ["platform.wealth-trace"], "telemetry"),
    ...consumers(modelConsumers, at("observe", "otlp"), ["platform.wealth-otlp"], "telemetry"),
  ] },
  applicationClients: [{ scopeId: "context", id: "screen", label: "Screen CRM notes", detail: "The context loader screens untrusted CRM notes before drafting and masks detected personal information.", source: "platform.wealth-screen" }],
  traceSource: "platform.wealth-trace",
  policyCaller: { scopeId: "workload", label: "Brief release gate", detail: "The application evaluates suitability, grounding and approval verdicts before releasing the brief.", source: "platform.advisory-controls" },
};
