import { at, spans, consumers, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { infrastructureRoutes } from "./model-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "workload", cellId: "supervisor" }, { scopeId: "workload", cellId: "subagents" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  runExporter: "platform.briefing-export",
  inspectModelIO: true,
  infrastructureRoutes,
  callSources: ["platform.briefing-agent"],
  runtimeDetail: "The local FastAPI briefing service listens on port 8013 and orchestrates filing extraction, model calls, and grounding checks.",
  connections: { status: "implemented", inspection: "application", connections: [
    ...consumers(modelConsumers, at("defense", "guards"), ["platform.briefing-inspection"], "control"),
    spans(at("workload", "delivery"), at("observe", "in"), ["platform.briefing-trace"], "Run spans"),
  ] },
  applicationClients: [{ scopeId: "workload", id: "delivery", label: "Run telemetry adapter", detail: "The server collects briefing run spans and invokes the OTLP JSON exporter after execution.", source: "platform.briefing-trace" }],
  traceSource: "platform.briefing-trace",
};
