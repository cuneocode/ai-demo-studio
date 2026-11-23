import { at, inspect, spans, type Endpoint, type PlatformDefinition } from "../../../app/map/drawio/platform-contract.ts";
import { existingModelRoutes } from "./model-views.ts";
import { customizePlatform } from "./platform-views.ts";

const modelConsumers: Endpoint[] = [{ scopeId: "exchange", cellId: "ib.a.coordinator" }, { scopeId: "exchange", cellId: "ib.b.investigator" }];

export const platform: PlatformDefinition = {
  modelConsumers,
  customizePlatform,
  existingModelRoutes,
  callSources: ["platform.interbank-agent"],
  connections: { status: "implemented", inspection: "gateway", connections: [
    ...["a", "b"].flatMap(bank => [
      inspect(at("exchange", `ib.${bank}.gateway`), at("exchange", `policy-${bank}`), [`interbank.gw-${bank}.${bank === "a" ? "egress" : "ingress"}-extproc`], "ExtProc / verdict"),
      inspect(at("exchange", `policy-${bank}`), at("system", "ib.platform.defense"), ["interbank.extproc.verdict"], "Inspect / verdict"),
      spans(at("exchange", `ib.${bank}.${bank === "a" ? "coordinator" : "investigator"}`), at("trace", "ib.trace.agents"), ["interbank.telemetry.setup"]),
      spans(at("exchange", `ib.${bank}.gateway`), at("trace", bank === "a" ? "ib.trace.gateways" : "collector-b"), ["interbank.gw.tracing", "interbank.collector"], "OTLP gateway spans"),
      spans(at("exchange", `policy-${bank}`), at("trace", "ib.trace.agents"), ["interbank.telemetry.setup"], "Policy spans"),
    ]),
    spans(at("kickoff", "ib.kickoff.console"), at("trace", "ib.trace.agents"), ["interbank.telemetry.setup"], "Console spans"),
  ] },
};
