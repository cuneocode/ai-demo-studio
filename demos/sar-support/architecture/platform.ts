import { at, inspect, spans, consumers, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "workload", cellId: "agent" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  genAIExporter: "platform.sar-otlp",
  inspectModelIO: true,

  callSources: ["platform.sar-agent"],
  runtimeDetail: "The local FastAPI SAR service listens on port 8015. It assembles synthetic evidence and a draft for investigator and QA review.",
  connections: { status: "implemented", inspection: "application", connections: [
    inspect(at("workload", "screen"), at("defense", "guards"), ["platform.sar-inspection"], "Segment / verdict"),
    ...consumers(modelConsumers, at("defense", "guards"), ["platform.sar-model-inspection"], "control"),
    spans(at("workload", "agent"), at("observe", "trace"), ["platform.sar-trace"]),
    spans(at("workload", "agent"), at("observe", "otlp"), ["platform.sar-otlp"], "GenAI spans"),
  ] },
  applicationClients: [{ scopeId: "workload", id: "screen", label: "Screen evidence segments", detail: "The application screens untrusted documents, memos and referral notes before they reach the model.", source: "platform.sar-inspection" }],
  traceSource: "platform.sar-trace",
  policyCaller: { scopeId: "workload", label: "Investigation gates", detail: "The application evaluates deterministic SAR control verdicts before controlled actions.", source: "platform.sar-controls" },
};
