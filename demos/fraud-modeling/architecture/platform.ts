import { at, inspect, spans, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { infrastructureRoutes } from "./model-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "score", cellId: "agent" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  otlpStatusSource: "platform.fraud-otlp-status",
  routingSummary: "score",
  infrastructureRoutes,
  callSources: ["platform.fraud-agent"],
  runtimeDetail: "The local FastAPI service listens on port 8012. Its configured scorer endpoint supplies live GPU scores; training is a separate operation.",
  connections: { status: "implemented", inspection: "application", connections: [
    inspect(at("score", "screen"), at("defense", "guards"), ["platform.fraud-inspection"], "Note / verdict"),
    inspect(at("score", "agent"), at("defense", "guards"), ["platform.fraud-boundary", "platform.fraud-summary"], "Hosted prompt + summary / verdict"),
    spans(at("score", "agent"), at("observe", "in"), ["platform.fraud-trace"]),
  ] },
  applicationClients: [
    { scopeId: "score", id: "screen", label: "Screen dispute note", detail: "The application inspects an untrusted cardholder dispute note before the triage agent sees it.", source: "platform.fraud-inspection" },
  ],
  traceSource: "platform.fraud-trace",
  policyCaller: { scopeId: "score", label: "Action and note gates", detail: "Investigation tools evaluate action permissions and note PII before applying a case action or writing a note.", source: "platform.fraud-controls" },
};
