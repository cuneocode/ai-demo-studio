import { at, consumers, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { infrastructureRoutes } from "./model-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "pipeline", cellId: "extract" }, { scopeId: "exception", cellId: "agent" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  routingSummary: "pipeline",
  endpointLabel: "Proposed extraction model",
  inspectModelIO: true,
  infrastructureRoutes,
  connections: { status: "proposed", inspection: "application", connections: [
    ...consumers(modelConsumers, at("defense", "guards"), [], "control"),
    ...consumers(modelConsumers, at("observe", "in"), [], "telemetry"),
  ] },
};
