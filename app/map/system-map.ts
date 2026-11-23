import type { SystemLayout } from "./drawio/system-layout.ts";
import type { SceneSourceAction } from "./scene-model.ts";

/**
 * One map, three altitudes. Regions are system boundaries for that use case.
 * Tools, SDKs, judges, and guardrail models appear only inside their parent.
 */
export type ZoomKind = "service" | "ai" | "store" | "human" | "cisco" | "failure";

export type ZoomChip = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind?: ZoomKind;
};

export type ZoomBox = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind?: ZoomKind;
  optional?: boolean;
  from?: string;
  chips?: ZoomChip[];
};

export type ZoomEdge = {
  from: string;
  to: string;
  label: string;
  kind?: "data" | "control" | "telemetry" | "placement";
};

export type ZoomInterior = {
  title: string;
  note: string;
  entities: ZoomBox[];
  edges: ZoomEdge[];
  stubs: ZoomBox[];
};

export type ZoomMap = {
  summary?: string;
  layout?: SystemLayout;
  sourcesFor?: (occurrence: string) => { sourceRefIds?: string[]; sources?: SceneSourceAction[] };
  implemented: boolean;
  note: string;
  cores: ZoomBox[];
  coreEdges: ZoomEdge[];
  interiors: Record<string, ZoomInterior>;
  /** Optional grid width for the system projection. Wide pipelines read best on one row. */
  coreColumns?: number;
};

export const chip = (id: string, title: string, subtitle: string, detail = subtitle, kind?: ZoomKind): ZoomChip => ({ id, title, subtitle, detail, kind });
export const box = (id: string, title: string, subtitle: string, detail: string, kind: ZoomKind = "service", extra: Partial<ZoomBox> = {}): ZoomBox => ({ id, title, subtitle, detail, kind, ...extra });

export function defenseInterior(hops: string, never: string): ZoomInterior {
  return {
    title: "Cisco AI Defense",
    note: `Guardrail models inspect only ${hops}. ${never}`,
    entities: [
      box("call", "Inspection call", "App calls the API", `The workload sends ${hops}. ${never}`, "cisco"),
      box("guards", "Guardrail models", "Runtime inspection", "These models live in AI Defense. They are not peers of the application.", "ai", {
        chips: [
          chip("in", "Request inspect", "When this use case sends a question"),
          chip("hop", "Model-hop inspect", hops),
          chip("out", "Answer inspect", "Deny or unavailability fails closed"),
        ],
      }),
      box("stop", "Fail closed", "No release", "A deny or an unavailable inspection stops the model output. It does not invent a fallback answer.", "failure"),
    ],
    edges: [
      { from: "call", to: "guards", label: "inspect", kind: "control" },
      { from: "guards", to: "stop", label: "deny / unavailable", kind: "control" },
    ],
    stubs: [],
  };
}

export function observeInterior(incoming: string, controls: boolean | string[]): ZoomInterior {
  const policies = Array.isArray(controls) ? controls : [];
  return {
    title: "Splunk Agent Observability",
    note: controls === true
      ? "Brahe records Agent Control verdicts on the same trace. Evaluators are not verified."
      : policies.length
        ? "The service computes each verdict in code; hosted Agent Control enforces it when the controls are bound, otherwise the same rule runs in-process and is labelled a local check. No eval models."
        : "Traces only. This use case does not run Agent Control or eval models.",
    entities: [
      box("in", "Incoming traces", "From the workload", incoming, "service"),
      box("controls", "Control models", controls === true ? "Agent Control" : policies.length ? "Agent Control · hosted when bound" : "Not used here", controls === true
        ? "Hosted controls enforce brahe-banking-scope, evidence grounding, and no-approval claims. These are not Luna evaluators."
        : policies.length
          ? "Only verdict booleans reach Agent Control, never client or case data. A deny from either side denies."
          : "No control models are drawn because this use case does not call Agent Control.", controls === true || policies.length ? "cisco" : "service", {
        chips: controls === true ? [
          chip("scope", "Banking scope", "Step brahe-banking-scope"),
          chip("ground", "Evidence grounding", "brahe-bank-evidence-grounding-v1"),
          chip("approval", "No approval claims", "brahe-bank-no-approval-claims-v1"),
        ] : policies.length ? policies.map((name) => chip(name.replace(/\W/g, "-"), name, "Deterministic verdict")) : [chip("none", "No control models", "Traces only")],
      }),
      box("otlp", "OTLP export", "Only when configured", "A separate exporter sends spans only when SPLUNK_REALM and SPLUNK_ACCESS_TOKEN, or an OTLP endpoint, are set.", "service"),
    ],
    edges: [
      { from: "in", to: "controls", label: controls ? "verdict booleans" : "spans", kind: "telemetry" },
      { from: "in", to: "otlp", label: "optional export", kind: "telemetry" },
    ],
    stubs: [],
  };
}
