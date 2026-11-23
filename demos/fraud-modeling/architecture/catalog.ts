import type { Catalog } from "../../../app/map/journey.ts";
import { buildBusinessJourneyScene } from "../../../app/map/scene-model.ts";
import { buildAgentWorkflowScene, buildControlInteractionScene } from "../../../app/map/templates.ts";

const fraudWorkflow = buildAgentWorkflowScene({
  id: "fraud.score",
  businessStepId: "score",
  title: "Score and investigate",
  purpose: "The probability is produced first and never touches an LLM. The triage agent works on top of it; its prompt and summary are the text sent to inspection.",
  entryInstanceIds: ["payment"],
  exitInstanceIds: ["probability"],
  modes: ["implemented", "proposed"],
  guides: [
    { label: "Open the alert", x: 0, width: 240 },
    { label: "Score the queue", x: 320, width: 280 },
    { label: "Investigate", x: 680, width: 240 },
  ],
  nodes: [
    { instanceId: "payment", entityId: "select", role: "input", displayLabel: "Alert queue", x: 20, y: 36, width: 190, height: 64 },
    { instanceId: "entry", entityId: "entry", role: "service", displayLabel: "Triage API", supportingText: "Scores before any model call", technicalLabel: "POST /api/fraud/runs", sourceRefIds: ["fraud.score"], x: 0, y: 160, width: 230, height: 108 },
    { instanceId: "model", entityId: "model", role: "service", displayLabel: "GraphSAGE + XGBoost", supportingText: "Exact TreeSHAP · no LLM", x: 330, y: 160, width: 250, height: 108 },
    { instanceId: "probability", entityId: "score", role: "output", displayLabel: "Score + reasons", x: 680, y: 182, width: 190, height: 64 },
    { instanceId: "narrative", entityId: "narrative", role: "checkpoint", displayLabel: "Fraud triage agent", supportingText: "Prompt and summary inspected", serviceLabel: "Cisco AI Defense", drillInto: "fraud.narrative", sourceRefIds: ["fraud.narrative"], x: 330, y: 340, width: 250, height: 118 },
    { instanceId: "trace", entityId: "trace", role: "service", displayLabel: "Agent trace", supportingText: "Does not block the run", serviceLabel: "Splunk", x: 0, y: 340, width: 230, height: 96 },
  ],
  relationships: [
    { id: "pay", sourceInstanceId: "payment", targetInstanceId: "entry", kind: "request", label: "scenario", sourcePort: "out-b", targetPort: "in-t", modelRelationshipIds: ["f-api-model"] },
    { id: "score-edge", sourceInstanceId: "entry", targetInstanceId: "model", kind: "request", label: "score", sourcePort: "out-r", targetPort: "in-l", modelRelationshipIds: ["f-api-model"] },
    { id: "prob", sourceInstanceId: "model", targetInstanceId: "probability", kind: "return", sourcePort: "out-r", targetPort: "in-l", modelRelationshipIds: ["f-model-prob"] },
    { id: "narr", sourceInstanceId: "model", targetInstanceId: "narrative", kind: "request", label: "evidence tools", sourcePort: "out-b", targetPort: "in-t", modelRelationshipIds: ["f-api-narrative"] },
    { id: "span", sourceInstanceId: "entry", targetInstanceId: "trace", kind: "telemetry", label: "records", sourcePort: "out-b", targetPort: "in-t", modelRelationshipIds: ["f-api-trace"] },
  ],
});

const fraudNarrative = buildControlInteractionScene({
  id: "fraud.narrative",
  businessStepId: "score",
  title: "Inspect the triage agent's text",
  purpose: "Inspection applies to the dispute note, the agent prompt, and its summary, never to the score. A blocked dispute note is withheld from the agent.",
  inputLabel: "Agent prompt",
  inputEdge: "narrative",
  evaluation: { label: "Prompt inspection call", supportingText: "The score stays either way.", technicalLabel: "agent_input", sources: [{ id: "fraud.narrative", label: "Inspect the agent prompt" }] },
  service: { label: "Inspection service", supportingText: "Returns is_safe for the text.", serviceLabel: "Cisco AI Defense", callLabel: "agent_input", returnLabel: "is_safe", sources: [{ id: "fraud.narrative", label: "Inspect the agent prompt" }] },
  decision: { label: "Application decision", supportingText: "Run the agent, or investigate scripted.", sources: [{ id: "fraud.narrative", label: "Inspect the agent prompt" }] },
  permit: { label: "Run the triage agent", condition: "is_safe" },
  block: { label: "Scripted investigation", condition: "stopped" },
  modelIds: { request: "f-narr-inspect", verdict: "f-narr-verdict", permit: "f-narr-verdict", block: "f-narr-omit" },
});

const fraudJourney = buildBusinessJourneyScene({
  id: "fraud.journey",
  businessStepId: "overview",
  title: "Card fraud triage",
  purpose: "An analyst triages the alert queue, compares rules with the graph model, reads plain-English reasons, and decides under policy. Card actions are simulated.",
  steps: [
    { instanceId: "select", entityId: "select", displayLabel: "Triage the alert queue", supportingText: "Analyst activity", emphasis: "customer", role: "activity", modelRelationshipId: "f-select-score" },
    { instanceId: "score", entityId: "score", displayLabel: "Score and investigate", supportingText: "Graph model score, then the triage agent.", emphasis: "assisted", role: "activity", drillInto: "fraud.score", modelRelationshipId: "f-select-score" },
    { instanceId: "read", entityId: "read", displayLabel: "Read rules vs graph", supportingText: "Analyst activity", emphasis: "customer", role: "activity", modelRelationshipId: "f-score-read" },
    { instanceId: "decide", entityId: "decide", displayLabel: "Decide the disposition", supportingText: "Policy-gated analyst decision", emphasis: "customer", role: "activity", modelRelationshipId: "f-read-decide" },
  ],
});

export const fraud: Catalog = {
  id: "fraud-modeling",
  rootSceneId: fraudJourney.id,
  businessStepIds: ["select", "score", "read", "decide"],
  environment: [
    "A triage run scores a synthetic alert queue. It does not start training and it does not decide fraud.",
    "GraphSAGE and XGBoost produce the probability. That path does not call an LLM or AI Defense.",
  ],
  relationships: [
    { id: "f-select-score", fromEntityId: "select", toEntityId: "score", kind: "businessSequence", fact: "The analyst starts a triage run for a scenario." },
    { id: "f-score-read", fromEntityId: "score", toEntityId: "read", kind: "businessSequence", fact: "The analyst compares the rules verdict with the graph model and reads the reasons." },
    { id: "f-read-decide", fromEntityId: "read", toEntityId: "decide", kind: "businessSequence", fact: "The analyst owns the disposition; Agent Control gates irreversible actions." },
    { id: "f-api-model", fromEntityId: "entry", toEntityId: "model", kind: "request", fact: "The triage API scores each queued payment with GraphSAGE and XGBoost." },
    { id: "f-model-prob", fromEntityId: "model", toEntityId: "score", kind: "return", fact: "The model returns a probability and TreeSHAP contributions before any model call." },
    { id: "f-api-narrative", fromEntityId: "model", toEntityId: "narrative", kind: "request", fact: "The triage agent reads the score and reasons through its tools." },
    { id: "f-api-trace", fromEntityId: "entry", toEntityId: "trace", kind: "telemetry", fact: "The agent trace records tool spans and does not block the run." },
    { id: "f-narr-inspect", fromEntityId: "narrative", toEntityId: "defense", kind: "request", fact: "The agent prompt is inspected before it leaves for a hosted model." },
    { id: "f-narr-verdict", fromEntityId: "defense", toEntityId: "narrative", kind: "return", fact: "Inspection returns is_safe for the agent text." },
    { id: "f-narr-omit", fromEntityId: "narrative", toEntityId: "narrative", kind: "control", fact: "A block withholds the text; the investigation continues scripted and keeps the score." },
  ],
  scenes: {
    [fraudJourney.id]: fraudJourney,
    [fraudWorkflow.id]: fraudWorkflow,
    [fraudNarrative.id]: fraudNarrative,
  },
};
