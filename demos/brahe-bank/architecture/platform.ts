import { at, inspect, consumers, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { existingModelRoutes } from "./model-views.ts";
import { customizePlatform } from "./platform-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "build", cellId: "supervisor" }, { scopeId: "build", cellId: "cards" }, { scopeId: "build", cellId: "score" }, { scopeId: "check", cellId: "judge" }, { scopeId: "return", cellId: "judge" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  customizePlatform,
  existingModelRoutes,
  connections: { status: "implemented", inspection: "application", connections: [
    ...["check", "return"].map(scope => inspect(at(scope, "inspect"), at("system", "defense"), ["brahe.chat.boundary"])),
    ...consumers(modelConsumers, at("system", "defense"), ["brahe.defense.hop"], "control"),
    ...consumers(modelConsumers, at("system", "trace"), ["brahe.galileo.call", "brahe.controls.judge"], "telemetry"),
  ] },
};
