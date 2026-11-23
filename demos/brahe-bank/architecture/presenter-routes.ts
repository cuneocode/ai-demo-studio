export type PresenterRoute = {
  audience: "Line of business" | "AI engineering" | "Platform engineering" | "Risk and governance" | "Cybersecurity";
  route: string[];
  leadWith: string;
  reveal: string[];
  unresolved: string[];
};

/** Optional presenter notes. These routes never create or alter diagram scenes. */
export const brahePresenterRoutes: PresenterRoute[] = [
  {
    audience: "Line of business",
    route: ["Business journey", "System architecture"],
    leadWith: "From separate product and score lookups to one explanation for “Which card options fit my circumstances?”",
    reveal: ["The assistant provides guidance.", "The customer retains the next-step decision.", "The assistant does not approve or submit an application."],
    unresolved: [],
  },
  {
    audience: "AI engineering",
    route: ["System architecture", "Build the explanation", "Bank supervisor source"],
    leadWith: "Supervisor delegation, specialist tools, protected model calls, and the draft answer.",
    reveal: ["Model input/output wrapper", "Product and score lookup behavior", "Narrow call and decision evidence"],
    unresolved: ["No explicit tool-execution authorization integration is implemented."],
  },
  {
    audience: "Platform engineering",
    route: ["System architecture", "Deployment layer", "Observability layer"],
    leadWith: "Application/model placement, external inference, primary Galileo tracing, and the separate optional OTLP path.",
    reveal: ["Configured destinations", "Failure and delivery status", "Missing target-design inputs"],
    unresolved: ["Application deployment location", "Approved private-host compute, network, storage, and capacity"],
  },
  {
    audience: "Risk and governance",
    route: ["System architecture", "Check the question", "Check and return"],
    leadWith: "The application evaluator produces a verdict; Agent Control applies configured deny policies; the application enforces the outcome.",
    reveal: ["Scope and answer objectives", "Policy call sites", "Evidence status and accountable owners"],
    unresolved: ["No compliance or certification claim", "No captured control run is included in the explorer evidence"],
  },
  {
    audience: "Cybersecurity",
    route: ["System architecture", "Security layer", "Check the question", "Check and return"],
    leadWith: "The application sends specific payloads to the Inspection API and stops on deny or unavailable behavior according to configuration.",
    reveal: ["Covered request/model/answer payloads", "Fail-open/fail-closed setup", "Async-only protected model path"],
    unresolved: ["Tool arguments and tool results are context inside model messages, not a separate tool-execution interception point."],
  },
];
