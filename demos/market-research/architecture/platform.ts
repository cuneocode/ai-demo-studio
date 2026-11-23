import { at, inspect, spans, consumers, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { infrastructureRoutes } from "./model-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "workload", cellId: "assessment" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  genAIExporter: "platform.wealth-otlp",
  infrastructureRoutes,
  callSources: ["platform.research-calls"],
  runtimeDetail: "The local FastAPI wealth service listens on port 8014 and prepares evidence packets, screened articles, and verified recommendations.",
  connections: { status: "implemented", inspection: "application", connections: [
    inspect(at("market", "screen"), at("defense", "guards"), ["platform.wealth-screen"], "Article / verdict"),
    ...consumers(modelConsumers, at("defense", "guards"), ["platform.advisory-inspection"], "control"),
    spans(at("workload", "assessment"), at("observe", "in"), ["platform.wealth-trace", "platform.research-calls"]),
    spans(at("workload", "assessment"), at("observe", "otlp"), ["platform.wealth-otlp"], "GenAI spans"),
  ] },
  applicationClients: [{ scopeId: "market", id: "screen", label: "Screen article text", detail: "The evidence loader screens each article before structured assessment. Flagged or uninspected required evidence is withheld.", source: "platform.wealth-screen" }],
  traceSource: "platform.wealth-trace",
  policyCaller: { scopeId: "workload", label: "Research precheck", detail: "The application submits deterministic precheck verdicts before screening evidence and calling the assessment model.", source: "platform.research-controls" },
};
