import { box, defenseInterior, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const kyc: ZoomMap = {
  summary: "Document models suggest fields, registry checks supply context, and an analyst owns the onboarding decision.",
  layout: { order: ["registry", "workload", "model"] },
    implemented: false,
    note: "Proposed. Analysts still approve onboarding. Registry checks stay deterministic.",
    cores: [
      box("workload", "Onboarding workload", "Case workflow", "Intake, exception summary, and the analyst gate. Proposed.", "service"),
      box("model", "Document model", "Extract fields", "Proposed OCR and field extraction. Not running in this studio.", "ai"),
      box("registry", "Registry and sanctions", "External checks", "Identity and screening stay outside the model.", "store"),
      box("defense", "Cisco AI Defense", "Proposed inspection", "Would inspect model hops only. Not connected to the local demo.", "cisco"),
      box("observe", "Splunk Agent Observability", "Proposed traces", "Not connected. No control models are claimed.", "cisco"),
    ],
    coreEdges: [
      { from: "workload", to: "model", label: "extract" },
      { from: "registry", to: "workload", label: "screen" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "proposed traces", kind: "telemetry" },
    ],
    interiors: {
      workload: {
        title: "Onboarding workload",
        note: "Proposed. An LLM does not approve onboarding.",
        entities: [
          box("case", "Case workflow", "Intake and exceptions", "Documents in, cited discrepancies out.", "service"),
          box("gate", "Analyst gate", "Approval stays human", "The analyst owns onboarding.", "human"),
        ],
        edges: [{ from: "case", to: "gate", label: "review" }],
        stubs: [
          box("model", "Document model", "Extract", "Proposed."),
          box("registry", "Registry and sanctions", "Screen", "Deterministic."),
        ],
      },
      model: {
        title: "Document model",
        note: "Proposed. Not a live extractor.",
        entities: [box("ocr", "Field extraction", "Proposed model", "Would return fields and evidence locations.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect", "Proposed model hop.")],
      },
      registry: {
        title: "Registry and sanctions",
        note: "Proposed external systems. Authorization stays here.",
        entities: [box("lists", "Screening sources", "Registry and lists", "The model does not approve a match.", "store")],
        edges: [],
        stubs: [box("workload", "Onboarding workload", "Results", "Cited discrepancies.")],
      },
      defense: defenseInterior("a proposed document-model hop", "Registry results and the analyst decision never enter Inspection."),
      observe: observeInterior("Proposed case spans. No control models.", false),
    },
  };
