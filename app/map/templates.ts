import type { Mode, SceneNode, SceneRelationship, SceneSourceAction, SceneSpec, SelectedDisclosure, StageGuide } from "./scene-model.ts";

export function buildAgentWorkflowScene(input: Omit<SceneSpec, "kind"> & { guides?: StageGuide[] }): SceneSpec {
  return { ...input, kind: "agentWorkflow" };
}

export type ControlParticipant = {
  label: string;
  supportingText?: string;
  technicalLabel?: string;
  serviceLabel?: string;
  entityId?: string;
  representedEntityIds?: string[];
  bindingIds?: string[];
  sources: SceneSourceAction[];
  disclosure?: SelectedDisclosure;
};

/** Application decision with two outcomes. A permit node never points at the rejection. */
export function buildControlInteractionScene(input: {
  id: string;
  businessStepId: string;
  title: string;
  purpose: string;
  inputLabel: string;
  inputEdge: string;
  evaluation: ControlParticipant;
  service?: ControlParticipant & { callLabel: string; returnLabel: string };
  decision: ControlParticipant;
  permit: { label: string; condition: string };
  block: { label: string; condition: string };
  modelIds: { request: string; verdict: string; permit: string; block: string };
}): SceneSpec {
  const nodes: SceneNode[] = [
    { instanceId: "incoming", role: "input", displayLabel: input.inputLabel, x: 0, y: 48, width: 150, height: 64 },
    {
      instanceId: "evaluation",
      role: "checkpoint",
      displayLabel: input.evaluation.label,
      supportingText: input.evaluation.supportingText,
      technicalLabel: input.evaluation.technicalLabel,
      serviceLabel: input.evaluation.serviceLabel,
      entityId: input.evaluation.entityId,
      representedEntityIds: input.evaluation.representedEntityIds,
      bindingIds: input.evaluation.bindingIds,
      sources: input.evaluation.sources,
      sourceRefIds: input.evaluation.sources.map((item) => item.id),
      disclosure: input.evaluation.disclosure,
      x: 250,
      y: 16,
      width: 220,
      height: 128,
    },
    {
      instanceId: "decision",
      role: "decision",
      displayLabel: input.decision.label,
      supportingText: input.decision.supportingText,
      technicalLabel: input.decision.technicalLabel,
      entityId: input.decision.entityId,
      representedEntityIds: input.decision.representedEntityIds,
      bindingIds: input.decision.bindingIds,
      sources: input.decision.sources,
      sourceRefIds: input.decision.sources.map((item) => item.id),
      disclosure: input.decision.disclosure,
      x: 510,
      y: 16,
      width: 210,
      height: 190,
    },
    // Both outcomes leave the decision on straight, separated lines so their labels never sit over a card.
    { instanceId: "permit", role: "output", displayLabel: input.permit.label, x: 810, y: 0, width: 190, height: 64 },
    { instanceId: "block", role: "output", displayLabel: input.block.label, x: 810, y: 150, width: 200, height: 72 },
  ];
  const relationships: SceneRelationship[] = [
    { id: `${input.id}-in`, sourceInstanceId: "incoming", targetInstanceId: "evaluation", kind: "request", label: input.inputEdge, sourcePort: "out-r", targetPort: "in-l", bindingIds: input.evaluation.bindingIds, modelRelationshipIds: [input.modelIds.request] },
  ];
  if (input.service) {
    nodes.splice(2, 0, {
      instanceId: "service",
      role: "service",
      displayLabel: input.service.label,
      supportingText: input.service.supportingText,
      serviceLabel: input.service.serviceLabel,
      technicalLabel: input.service.technicalLabel,
      entityId: input.service.entityId,
      representedEntityIds: input.service.representedEntityIds,
      bindingIds: input.service.bindingIds,
      sources: input.service.sources,
      sourceRefIds: input.service.sources.map((item) => item.id),
      disclosure: input.service.disclosure,
      x: 250,
      y: 280,
      width: 220,
      height: 100,
    });
    relationships.push(
      { id: `${input.id}-call`, sourceInstanceId: "evaluation", targetInstanceId: "service", kind: "request", label: input.service.callLabel, sourcePort: "out-b", targetPort: "in-t", bindingIds: input.service.bindingIds, modelRelationshipIds: [input.modelIds.request] },
      { id: `${input.id}-verdict`, sourceInstanceId: "service", targetInstanceId: "decision", kind: "return", label: input.service.returnLabel, sourcePort: "out-r", targetPort: "in-b", bindingIds: input.service.bindingIds, modelRelationshipIds: [input.modelIds.verdict] },
    );
  } else {
    relationships.push({ id: `${input.id}-verdict`, sourceInstanceId: "evaluation", targetInstanceId: "decision", kind: "return", label: input.service ? "" : "result", sourcePort: "out-r", targetPort: "in-l", bindingIds: input.evaluation.bindingIds, modelRelationshipIds: [input.modelIds.verdict] });
  }
  relationships.push(
    { id: `${input.id}-permit`, sourceInstanceId: "decision", targetInstanceId: "permit", kind: "control", label: input.permit.condition, sourcePort: "out-r@0.084", targetPort: "in-l", bindingIds: input.decision.bindingIds, modelRelationshipIds: [input.modelIds.permit] },
    { id: `${input.id}-block`, sourceInstanceId: "decision", targetInstanceId: "block", kind: "control", label: input.block.condition, sourcePort: "out-r@0.895", targetPort: "in-l", bindingIds: input.decision.bindingIds, modelRelationshipIds: [input.modelIds.block] },
  );
  return {
    id: input.id,
    kind: "controlInteraction",
    businessStepId: input.businessStepId,
    title: input.title,
    purpose: input.purpose,
    entryInstanceIds: ["incoming"],
    exitInstanceIds: ["permit", "block"],
    modes: ["implemented", "proposed"],
    nodes,
    relationships,
  };
}

export function buildHostingScene(input: {
  id: string;
  businessStepId: string;
  title: string;
  purpose: string;
  modes: Mode[];
  runtime: string;
  runtimeSupport: string;
  endpoint: string;
  endpointSupport: string;
  modelId: string;
  runtimeEntityId: string;
  endpointEntityId: string;
  bindingIds: string[];
}): SceneSpec {
  return {
    id: input.id,
    kind: "hosting",
    businessStepId: input.businessStepId,
    title: input.title,
    purpose: input.purpose,
    entryInstanceIds: ["runtime"],
    exitInstanceIds: ["endpoint"],
    modes: input.modes,
    nodes: [
      { instanceId: "runtime", entityId: input.runtimeEntityId, bindingIds: input.bindingIds, role: "service", displayLabel: "Application process", supportingText: input.runtimeSupport, x: 0, y: 48, width: 280, height: 140 },
      { instanceId: "endpoint", entityId: input.endpointEntityId, bindingIds: input.bindingIds, role: "service", displayLabel: input.endpoint, supportingText: input.endpointSupport, x: 400, y: 48, width: 300, height: 140 },
    ],
    relationships: [
      { id: `${input.id}-host`, sourceInstanceId: "runtime", targetInstanceId: "endpoint", kind: "hosting", label: "inference", sourcePort: "out-r", targetPort: "in-l", bindingIds: input.bindingIds, modelRelationshipIds: [input.modelId] },
    ],
  };
}
