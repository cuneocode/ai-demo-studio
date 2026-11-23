import { at, inspect, spans, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "workload", cellId: "case" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  endpointLabel: "Proposed document model",
  inspectModelIO: true,

  connections: { status: "proposed", inspection: "application", connections: [
    inspect(at("workload", "case"), at("defense", "guards"), [], "Proposed inspection"),
    spans(at("workload", "case"), at("observe", "in"), [], "Proposed spans"),
  ] },
};
