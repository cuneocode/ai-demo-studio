import { box, defenseInterior, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const transactions: ZoomMap = {
  summary: "The payment pipeline validates proposed fields while an exception agent handles uncertain cases. Operations accepts the enrichment.",
  layout: { order: ["reference", "pipeline", "model"], positions: { exception: [400, 450] }, securityBelow: true },
    implemented: false,
    note: "Proposed. Deterministic validation publishes the payment path. AI Defense is not on authorization.",
    cores: [
      box("pipeline", "Payment pipeline", "Validate and publish", "Schema checks gate the volume path. No model in authorization."),
      box("reference", "Reference data", "Codes and counterparties", "The system of record for entities and purpose codes.", "store"),
      box("model", "Extraction model", "Payment text", "Proposed batched extraction. Exceptions only need an agent.", "ai"),
      box("observe", "Splunk Agent Observability", "Proposed spans", "Not connected. No control models.", "cisco"),
      box("exception", "Exception agent", "Low confidence only", "Optional. Not on the authorization path.", "ai", { optional: true }),
      box("defense", "Cisco AI Defense", "Exception hop only", "Optional. The payment authorization path does not enter Inspection.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "pipeline", to: "reference", label: "lookup" },
      { from: "pipeline", to: "model", label: "extract" },
      { from: "pipeline", to: "exception", label: "low confidence", kind: "control" },
      { from: "pipeline", to: "observe", label: "proposed spans", kind: "telemetry" },
      { from: "exception", to: "defense", label: "inspect exception", kind: "control" },
    ],
    interiors: {
      pipeline: {
        title: "Payment pipeline",
        note: "Proposed. Invalid schema quarantines the record.",
        entities: [
          box("validate", "Schema validation", "Before publish", "Deterministic. Low confidence routes aside.", "service"),
          box("publish", "Publish", "Governed fields", "The authorization path has no LLM.", "service"),
        ],
        edges: [{ from: "validate", to: "publish", label: "valid rows" }, { from: "validate", to: "exception", label: "low confidence", kind: "control" }],
        stubs: [box("exception", "Exception agent", "Low confidence", "Not authorization.")],
      },
      reference: {
        title: "Reference data",
        note: "Proposed versioned codes and counterparties.",
        entities: [box("codes", "Code sets", "Entities and purpose", "Lookup stays structured.", "store")],
        edges: [],
        stubs: [box("pipeline", "Payment pipeline", "Matches", "Before publish.")],
      },
      model: {
        title: "Extraction model",
        note: "Proposed. Benchmark a CPU path before assuming a GPU.",
        entities: [box("extract", "Payment extraction", "Text to fields", "Proposed fields still pass schema validation.", "ai")],
        edges: [],
        stubs: [],
      },
      observe: observeInterior("Proposed pipeline spans. No control models.", false),
      exception: {
        title: "Exception agent",
        note: "Proposed and optional. Not on the payment authorization path.",
        entities: [box("agent", "Resolution agent", "Low confidence", "Proposes fields with evidence. Operations decides.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect", "This hop only.")],
      },
      defense: defenseInterior("a proposed exception-agent hop", "The payment authorization path never enters Inspection."),
    },
  };
