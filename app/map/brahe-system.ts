import { braheScenes } from "./brahe-scenes.ts";
import type { Mode, SceneNode, SceneRelationship, SceneSpec } from "./scene-model.ts";

export const BRAHE_GROUPS = {
  assistant: "group.assistant",
  check: "group.check",
  requestInspection: "group.request-inspection",
  build: "group.build",
  hosting: "group.hosting",
  return: "group.return",
  answerInspection: "group.answer-inspection",
} as const;

export type BraheGroupId = typeof BRAHE_GROUPS[keyof typeof BRAHE_GROUPS];

const sourceNode = (sceneId: string, instanceId: string, next: Partial<SceneNode>): SceneNode => {
  const original = braheScenes.scenes[sceneId].nodes.find((node) => node.instanceId === instanceId);
  if (!original) throw new Error(`Missing Brahe occurrence ${sceneId}/${instanceId}`);
  return { ...original, ...next } as SceneNode;
};

const edge = (
  id: string,
  sourceInstanceId: string,
  targetInstanceId: string,
  kind: SceneRelationship["kind"],
  sourcePort: string,
  targetPort: string,
  modelRelationshipIds: string[],
  options: Pick<SceneRelationship, "label" | "bindingIds" | "via" | "labelOffset"> = {},
): SceneRelationship => ({ id, sourceInstanceId, targetInstanceId, kind, sourcePort, targetPort, modelRelationshipIds, ...options });

const group = (
  instanceId: string,
  displayLabel: string,
  expandGroupId: BraheGroupId,
  expanded: boolean,
  x: number,
  y: number,
  width: number,
  height: number,
  next: Partial<SceneNode> = {},
): SceneNode => ({
  instanceId,
  entityId: next.entityId,
  role: "group",
  displayLabel,
  expandGroupId,
  expanded,
  x,
  y,
  width,
  height,
  ...next,
});

function rootContext(nodes: SceneNode[], relationships: SceneRelationship[], assistant: SceneNode, mode: Mode) {
  nodes.push(
    sourceNode("brahe.journey", "ask", { instanceId: "brahe.ask", x: 0, y: assistant.expanded ? 250 : 20, width: 220 }),
    assistant,
    sourceNode("brahe.journey", "review", { instanceId: "brahe.review", x: assistant.expanded ? assistant.x + assistant.width + 30 : 640, y: assistant.expanded ? 250 : 20, width: 220 }),
    sourceNode("brahe.journey", "defense", { instanceId: "brahe.platform.defense", x: 0, y: assistant.expanded ? assistant.y + assistant.height + 70 : 250, width: 260, drillInto: undefined, expandGroupId: BRAHE_GROUPS.assistant }),
    sourceNode("brahe.journey", "observe", { instanceId: "brahe.platform.observe", x: 330, y: assistant.expanded ? assistant.y + assistant.height + 70 : 250, width: 280, drillInto: undefined, expandGroupId: BRAHE_GROUPS.assistant }),
    sourceNode("brahe.journey", "infra", { instanceId: "brahe.platform.infra", x: 680, y: assistant.expanded ? assistant.y + assistant.height + 70 : 250, width: 270, drillInto: undefined, expandGroupId: BRAHE_GROUPS.assistant }),
  );
  const assistantInput = assistant.expanded ? "brahe.stage.check" : assistant.instanceId;
  const assistantOutput = assistant.expanded ? "brahe.stage.return" : assistant.instanceId;
  const supportY = assistant.y + assistant.height + 35;
  relationships.push(
    edge("rel.business.ask-assistant", "brahe.ask", assistantInput, "businessSequence", "out-r", "in-l", ["biz-ask-prepare"]),
    edge("rel.business.assistant-review", assistantOutput, "brahe.review", "businessSequence", "out-r", "in-l", ["biz-prepare-review"]),
    edge("rel.support.defense", "brahe.platform.defense", assistant.instanceId, "support", "out-t", "in-b@0.2", ["sup-defense"], { label: "Content inspection", via: assistant.expanded ? [{ x: 130, y: supportY }, { x: 240, y: supportY }, { x: assistant.x + assistant.width * .2, y: supportY }] : undefined, bindingIds: ["defense.question", "defense.answer", "defense.model-hop"] }),
    edge("rel.support.observe", "brahe.platform.observe", assistant.instanceId, "support", "out-t", "in-b@0.5", ["sup-observe"], { label: "Tracing + controls", via: assistant.expanded ? [{ x: 470, y: supportY }, { x: assistant.x + assistant.width * .5, y: supportY }] : undefined, bindingIds: ["observe.tracing", "observe.scope-control", "observe.answer-control"] }),
    edge("rel.support.infrastructure", "brahe.platform.infra", assistant.instanceId, "support", "out-t", "in-b@0.8", ["sup-host"], { label: mode === "implemented" ? "External inference" : "Proposed private inference", via: assistant.expanded ? [{ x: 815, y: supportY }, { x: assistant.x + assistant.width * .8, y: supportY }] : undefined, bindingIds: ["infra.model-serving", "infra.private-model-serving"] }),
  );
}

function stageSummary(sceneId: string, oldId: string, instanceId: string, parentId: string, groupId: BraheGroupId, x: number, y: number, width = 200): SceneNode {
  return sourceNode(sceneId, oldId, {
    instanceId,
    parentId,
    role: "group",
    expanded: false,
    expandGroupId: groupId,
    drillInto: undefined,
    x,
    y,
    width,
    height: 110,
    compact: true,
  });
}

function assistantSummary(mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const assistant = group("brahe.assistant", "Bank assistant", BRAHE_GROUPS.assistant, false, 280, 8, 300, 140, {
    entityId: "prepare",
    supportingText: "Prepare card guidance",
    detail: "Retrieve relevant facts and explain product requirements.",
  });
  rootContext(nodes, relationships, assistant, mode);
  return makeScene(nodes, relationships, "Card guidance", "From separate product and score lookups to a single explanation.");
}

function assistantExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  if (expanded.has(BRAHE_GROUPS.check)) return checkExpanded(expanded, mode);
  if (expanded.has(BRAHE_GROUPS.build)) return buildExpanded(expanded, mode);
  if (expanded.has(BRAHE_GROUPS.return)) return returnExpanded(expanded, mode);
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const assistant = group("brahe.assistant", "Bank assistant", BRAHE_GROUPS.assistant, true, 250, 20, 680, 310, { entityId: "prepare" });
  rootContext(nodes, relationships, assistant, mode);
  nodes.push(
    stageSummary("brahe.prepare", "check", "brahe.stage.check", assistant.instanceId, BRAHE_GROUPS.check, 30, 70),
    stageSummary("brahe.prepare", "build", "brahe.stage.build", assistant.instanceId, BRAHE_GROUPS.build, 250, 70),
    stageSummary("brahe.prepare", "return-stage", "brahe.stage.return", assistant.instanceId, BRAHE_GROUPS.return, 470, 70),
  );
  relationships.push(
    edge("rel.workflow.check-build", "brahe.stage.check", "brahe.stage.build", "businessSequence", "out-r", "in-l", ["ctrl-scope"]),
    edge("rel.workflow.build-return", "brahe.stage.build", "brahe.stage.return", "businessSequence", "out-r", "in-l", ["req-inspect-out"]),
  );
  return makeScene(nodes, relationships, "Bank assistant", "Check the question, build the explanation, then check and return the answer.");
}

function checkExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const inspectionOpen = expanded.has(BRAHE_GROUPS.requestInspection);
  const assistant = group("brahe.assistant", "Bank assistant", BRAHE_GROUPS.assistant, true, 250, 20, inspectionOpen ? 1020 : 1050, inspectionOpen ? 640 : 520, { entityId: "prepare" });
  rootContext(nodes, relationships, assistant, mode);
  const check = group("brahe.stage.check", "Check the question", BRAHE_GROUPS.check, true, 20, 56, inspectionOpen ? 780 : 740, inspectionOpen ? 550 : 440, {
    parentId: assistant.instanceId,
    entityId: "check",
    bindingIds: ["defense.question", "observe.scope-control"],
  });
  nodes.push(
    check,
    sourceNode("brahe.check", "question", { instanceId: "brahe.check.question", parentId: check.instanceId, x: inspectionOpen ? 10 : 20, y: inspectionOpen ? 95 : 90, width: 120 }),
    group("brahe.check.inspect", "Inspect the question", BRAHE_GROUPS.requestInspection, inspectionOpen, inspectionOpen ? 135 : 165, 56, inspectionOpen ? 520 : 175, inspectionOpen ? 246 : 130, {
      parentId: check.instanceId,
      entityId: "question-inspection-call",
      bindingIds: ["defense.question"],
      sourceRefIds: ["brahe.chat.request-inspect"],
    }),
    sourceNode("brahe.scope-control", "evaluation", { instanceId: "brahe.scope.evaluate", parentId: check.instanceId, x: inspectionOpen ? 135 : 165, y: inspectionOpen ? 318 : 220, width: inspectionOpen ? 165 : 175, height: inspectionOpen ? 155 : 200, dense: inspectionOpen, serviceLabel: "Application", suppressAttribution: true, supportingText: "Produces the in-scope result." }),
    sourceNode("brahe.scope-control", "service", { instanceId: "brahe.scope.control", parentId: check.instanceId, x: inspectionOpen ? 310 : 355, y: inspectionOpen ? 318 : 270, width: inspectionOpen ? 165 : 175, height: inspectionOpen ? 175 : 214, dense: inspectionOpen, supportingText: "Applies the configured allow or deny policy." }),
    sourceNode("brahe.scope-control", "decision", { instanceId: "brahe.scope.decision", parentId: check.instanceId, x: inspectionOpen ? 485 : 365, y: inspectionOpen ? 318 : 56, width: inspectionOpen ? 150 : 175, height: inspectionOpen ? 160 : 200, dense: inspectionOpen, serviceLabel: "Application", suppressAttribution: true, supportingText: "Stops the turn on deny." }),
    sourceNode("brahe.scope-control", "block", { instanceId: "brahe.scope.stop", parentId: check.instanceId, displayLabel: "Stop the turn", x: inspectionOpen ? 650 : 590, y: inspectionOpen ? 418 : 186, width: inspectionOpen ? 120 : 140, height: inspectionOpen ? 80 : 72, dense: inspectionOpen }),
    stageSummary("brahe.prepare", "build", "brahe.stage.build", assistant.instanceId, BRAHE_GROUPS.build, inspectionOpen ? 820 : 790, inspectionOpen ? 300 : 80, inspectionOpen ? 180 : 220),
    stageSummary("brahe.prepare", "return-stage", "brahe.stage.return", assistant.instanceId, BRAHE_GROUPS.return, inspectionOpen ? 820 : 790, inspectionOpen ? 430 : 300, inspectionOpen ? 180 : 220),
  );
  if (inspectionOpen) {
    nodes.push(
      sourceNode("brahe.inspect-request", "evaluation", { instanceId: "brahe.inspect.request.call", parentId: "brahe.check.inspect", x: 15, y: 50, width: 155, height: 180, dense: true, serviceLabel: "Application", suppressAttribution: true, supportingText: "Sends the question before controls.", sourceRefIds: ["brahe.chat.request-inspect"], sources: [{ id: "brahe.chat.request-inspect", label: "Call", facet: "Call", bindingId: "defense.question" }, { id: "brahe.chat.defense-enforce", label: "Decision", facet: "Decision", bindingId: "defense.question" }, { id: "brahe.defense.setup", label: "Setup", facet: "Setup", bindingId: "defense.question" }, { id: "brahe.defense.inspect", label: "Full context", facet: "Full context", bindingId: "defense.question" }] }),
      sourceNode("brahe.inspect-request", "service", { instanceId: "brahe.service.ai-defense", parentId: "brahe.check.inspect", displayLabel: "Inspection API", supportingText: "Returns a verdict.", x: 185, y: 50, width: 145, height: 160, dense: true }),
      sourceNode("brahe.inspect-request", "decision", { instanceId: "brahe.inspect.request.apply", parentId: "brahe.check.inspect", serviceLabel: "Application", suppressAttribution: true, supportingText: "Stops on deny; continues on allow.", x: 345, y: 50, width: 150, height: 180, dense: true }),
    );
    relationships.push(
      edge("rel.inspect.request.summary", "brahe.check.question", "brahe.inspect.request.call", "request", "out-r", "in-l", ["req-inspect-in"], { bindingIds: ["defense.question"] }),
      edge("rel.inspect.request.call", "brahe.inspect.request.call", "brahe.service.ai-defense", "request", "out-r", "in-l", ["req-inspect-in"], { bindingIds: ["defense.question"] }),
      edge("rel.inspect.request.verdict", "brahe.service.ai-defense", "brahe.inspect.request.apply", "return", "out-r", "in-l", ["ret-inspect-in"], { bindingIds: ["defense.question"] }),
      edge("rel.inspect.request.stop", "brahe.inspect.request.apply", "brahe.scope.stop", "control", "out-r@0.75", "in-t", ["ctrl-block"], {
        label: "Inspection denied",
        via: [{ x: 1275, y: 317 }, { x: 1275, y: 534 }],
        labelOffset: { x: 0, y: 160 },
        bindingIds: ["defense.question"],
      }),
    );
  } else {
    relationships.push(
      edge("rel.inspect.request.summary", "brahe.check.question", "brahe.check.inspect", "request", "out-r", "in-l", ["req-inspect-in"], { bindingIds: ["defense.question"] }),
      edge("rel.inspect.request.stop", "brahe.check.inspect", "brahe.scope.stop", "control", "out-t@0.8", "in-t", ["ctrl-block"], {
        label: "Inspection denied",
        via: [{ x: 575, y: 124 }, { x: 930, y: 124 }, { x: 930, y: 246 }],
        bindingIds: ["defense.question"],
      }),
    );
  }
  relationships.push(
    edge("rel.scope.evaluate", inspectionOpen ? "brahe.inspect.request.apply" : "brahe.check.inspect", "brahe.scope.evaluate", "control", "out-b", "in-t", ["ret-inspect-in"]),
    edge("rel.scope.control-call", "brahe.scope.evaluate", "brahe.scope.control", "request", "out-r", "in-l", ["ctrl-scope"], { bindingIds: ["observe.scope-control"] }),
    edge("rel.scope.verdict", "brahe.scope.control", "brahe.scope.decision", "return", inspectionOpen ? "out-r" : "out-t", inspectionOpen ? "in-l" : "in-b", ["ctrl-scope"], { bindingIds: ["observe.scope-control"] }),
    edge("rel.scope.allow", "brahe.scope.decision", "brahe.stage.build", "control", "out-r@0.25", "in-l@0.5", ["ctrl-permit"], inspectionOpen
      ? { label: "Allowed", labelOffset: { x: 0, y: -54 }, bindingIds: ["observe.scope-control"] }
      : { bindingIds: ["observe.scope-control"] }),
    edge("rel.scope.stop", "brahe.scope.decision", "brahe.scope.stop", "control", "out-r@0.75", "in-l", ["ctrl-block"], inspectionOpen
      ? { label: "Scope denied", labelOffset: { x: 0, y: 80 }, bindingIds: ["observe.scope-control"] }
      : { bindingIds: ["observe.scope-control"] }),
    edge("rel.workflow.build-return", "brahe.stage.build", "brahe.stage.return", "businessSequence", "out-b", "in-t", ["req-inspect-out"]),
  );
  return makeScene(nodes, relationships, "Check the question", "Inspect the question and enforce scope before the supervisor runs.");
}

function buildExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const hostingOpen = expanded.has(BRAHE_GROUPS.hosting);
  const assistant = group("brahe.assistant", "Bank assistant", BRAHE_GROUPS.assistant, true, 250, 20, 1620, hostingOpen ? 780 : 620, { entityId: "prepare" });
  rootContext(nodes, relationships, assistant, mode);
  nodes.push(
    stageSummary("brahe.prepare", "check", "brahe.stage.check", assistant.instanceId, BRAHE_GROUPS.check, 20, 70, 180),
    group("brahe.stage.build", "Build the explanation", BRAHE_GROUPS.build, true, 220, 56, 1150, hostingOpen ? 700 : 520, { parentId: assistant.instanceId, entityId: "build", bindingIds: ["defense.model-hop", "observe.tracing", "infra.model-serving", "infra.private-model-serving"] }),
    stageSummary("brahe.prepare", "return-stage", "brahe.stage.return", assistant.instanceId, BRAHE_GROUPS.return, 1390, 70, 200),
    sourceNode("brahe.build", "question", { instanceId: "brahe.build.question", parentId: "brahe.stage.build", x: 20, y: 70, width: 120 }),
    sourceNode("brahe.build", "supervisor", { instanceId: "brahe.build.supervisor", parentId: "brahe.stage.build", x: 170, y: 56, width: 200 }),
    sourceNode("brahe.build", "draft", { instanceId: "brahe.build.draft", parentId: "brahe.stage.build", x: 420, y: 70, width: 150 }),
    sourceNode("brahe.build", "cards", { instanceId: "brahe.build.cards", parentId: "brahe.stage.build", x: 40, y: 300, width: 160, height: 200 }),
    sourceNode("brahe.build", "card-tool", { instanceId: "brahe.build.card-tool", parentId: "brahe.stage.build", x: 220, y: 300, width: 170 }),
    sourceNode("brahe.build", "card-docs", { instanceId: "brahe.build.card-docs", parentId: "brahe.stage.build", x: 410, y: 300, width: 150 }),
    sourceNode("brahe.build", "score", { instanceId: "brahe.build.score", parentId: "brahe.stage.build", x: 600, y: hostingOpen ? 480 : 300, width: 160 }),
    sourceNode("brahe.build", "score-tool", { instanceId: "brahe.build.score-tool", parentId: "brahe.stage.build", x: 780, y: hostingOpen ? 480 : 300, width: 170 }),
    sourceNode("brahe.build", "score-value", { instanceId: "brahe.build.score-value", parentId: "brahe.stage.build", x: 970, y: hostingOpen ? 500 : 320, width: 150 }),
    group("brahe.build.host", "Runtime + model inference", BRAHE_GROUPS.hosting, hostingOpen, 600, 56, hostingOpen ? 420 : 220, hostingOpen ? 320 : 150, {
      parentId: "brahe.stage.build",
      entityId: mode === "implemented" ? "openai" : "private",
      bindingIds: ["infra.model-serving", "infra.private-model-serving"],
    }),
  );
  if (hostingOpen) {
    nodes.push(
      sourceNode(mode === "implemented" ? "brahe.hosting" : "brahe.hosting-proposed", "runtime", {
        instanceId: "brahe.host.runtime",
        parentId: "brahe.build.host",
        x: 15,
        y: 55,
        width: 185,
        height: 210,
        dense: true,
        supportingText: "Studio application process. External deployment location is not established.",
        sourceRefIds: ["brahe.application-runtime"],
        sources: [{ id: "brahe.application-runtime", label: "Runtime setup", facet: "Setup", evidenceSummary: "Initializes the agent graph, telemetry, and runtime controls in the application process." }],
      }),
      sourceNode(mode === "implemented" ? "brahe.hosting" : "brahe.hosting-proposed", "endpoint", {
        instanceId: "brahe.host.endpoint",
        parentId: "brahe.build.host",
        x: 220,
        y: 55,
        width: 185,
        height: 250,
        dense: true,
        sourceRefIds: mode === "implemented" ? ["brahe.supervisor"] : [],
        sources: mode === "implemented" ? [{ id: "brahe.supervisor", label: "Model client setup", facet: "Setup", bindingId: "infra.model-serving" }] : [],
      }),
    );
  }
  relationships.push(
    edge("rel.workflow.check-build", "brahe.stage.check", "brahe.build.question", "businessSequence", "out-r", "in-l", ["ctrl-scope"]),
    edge("rel.build.in", "brahe.build.question", "brahe.build.supervisor", "request", "out-r", "in-l", ["req-cards"]),
    edge("rel.build.out", "brahe.build.supervisor", "brahe.build.draft", "return", "out-r", "in-l", ["ret-specialists"]),
    edge("rel.build.cards", "brahe.build.supervisor", "brahe.build.cards", "request", "out-b-l", "in-t", ["req-cards"]),
    edge("rel.build.card-tool", "brahe.build.cards", "brahe.build.card-tool", "request", "out-r", "in-l", ["req-cards"]),
    edge("rel.build.card-docs", "brahe.build.card-tool", "brahe.build.card-docs", "return", "out-r", "in-l", ["ret-specialists"]),
    edge("rel.build.score", "brahe.build.supervisor", "brahe.build.score", "request", "out-b-r", "in-t", ["req-score"], { via: hostingOpen
      ? [{ x: 776, y: 340 }, { x: 450, y: 340 }, { x: 450, y: 600 }, { x: 1040, y: 600 }, { x: 1040, y: 540 }, { x: 1150, y: 540 }]
      : [{ x: 776, y: 340 }, { x: 1150, y: 340 }] }),
    edge("rel.build.score-tool", "brahe.build.score", "brahe.build.score-tool", "request", "out-r", "in-l", ["req-score"]),
    edge("rel.build.score-value", "brahe.build.score-tool", "brahe.build.score-value", "return", "out-r", "in-l", ["ret-specialists"]),
    edge("rel.build.model", "brahe.build.supervisor", "brahe.build.host", "request", "out-t", "in-t", ["req-model-host"], { bindingIds: ["infra.model-serving", "infra.private-model-serving"] }),
    edge("rel.workflow.build-return", "brahe.build.draft", "brahe.stage.return", "businessSequence", "out-t", "in-l", ["req-inspect-out"], { via: [{ x: 965, y: 40 }, { x: 1610, y: 40 }, { x: 1610, y: 165 }] }),
  );
  if (hostingOpen) {
    relationships.push(edge("rel.hosting.inference", "brahe.host.runtime", "brahe.host.endpoint", "hosting", "out-r", "in-l", [mode === "implemented" ? "host-openai" : "host-private"], { bindingIds: [mode === "implemented" ? "infra.model-serving" : "infra.private-model-serving"] }));
  }
  return makeScene(nodes, relationships, "Build the explanation", "Agents, tools, returned facts, and model dependencies expand inside the same assistant.");
}

function returnExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const inspectionOpen = expanded.has(BRAHE_GROUPS.answerInspection);
  const assistant = group("brahe.assistant", "Bank assistant", BRAHE_GROUPS.assistant, true, 250, 20, 950, inspectionOpen ? 640 : 520, { entityId: "prepare" });
  rootContext(nodes, relationships, assistant, mode);
  const reviewIndex = nodes.findIndex((node) => node.instanceId === "brahe.review");
  if (reviewIndex >= 0) nodes[reviewIndex] = { ...nodes[reviewIndex], width: inspectionOpen ? 120 : 140, compact: true };
  nodes.push(
    stageSummary("brahe.prepare", "check", "brahe.stage.check", assistant.instanceId, BRAHE_GROUPS.check, 10, 80, 140),
    stageSummary("brahe.prepare", "build", "brahe.stage.build", assistant.instanceId, BRAHE_GROUPS.build, 10, 240, 140),
    group("brahe.stage.return", "Check and return", BRAHE_GROUPS.return, true, inspectionOpen ? 160 : 180, 56, inspectionOpen ? 780 : 740, inspectionOpen ? 550 : 440, { parentId: assistant.instanceId, entityId: "return-stage", bindingIds: ["defense.answer", "observe.answer-control"] }),
    sourceNode("brahe.return-stage", "answer", { instanceId: "brahe.return.answer", parentId: "brahe.stage.return", x: inspectionOpen ? 10 : 20, y: inspectionOpen ? 95 : 90, width: 120 }),
    group("brahe.return.inspect", "Inspect the answer", BRAHE_GROUPS.answerInspection, inspectionOpen, inspectionOpen ? 135 : 165, 56, inspectionOpen ? 520 : 175, inspectionOpen ? 246 : 130, { parentId: "brahe.stage.return", entityId: "answer-inspection-call", bindingIds: ["defense.answer"] }),
    sourceNode("brahe.answer-control", "evaluation", { instanceId: "brahe.answer.evaluate", parentId: "brahe.stage.return", x: inspectionOpen ? 135 : 165, y: inspectionOpen ? 318 : 220, width: inspectionOpen ? 165 : 175, height: inspectionOpen ? 175 : 223, dense: inspectionOpen, serviceLabel: "Application", suppressAttribution: true, supportingText: "Reviews grounding and approval claims." }),
    sourceNode("brahe.answer-control", "service", { instanceId: "brahe.answer.control", parentId: "brahe.stage.return", x: inspectionOpen ? 310 : 355, y: inspectionOpen ? 318 : 300, width: inspectionOpen ? 165 : 175, height: inspectionOpen ? 175 : 214, dense: inspectionOpen, supportingText: "Applies the configured response policy." }),
    sourceNode("brahe.answer-control", "decision", { instanceId: "brahe.answer.decision", parentId: "brahe.stage.return", x: inspectionOpen ? 500 : 365, y: inspectionOpen ? 318 : 56, width: inspectionOpen ? 150 : 175, height: inspectionOpen ? 180 : 223, dense: inspectionOpen, serviceLabel: "Application", suppressAttribution: true, supportingText: "Returns guidance only on allow." }),
    sourceNode("brahe.answer-control", "block", { instanceId: "brahe.answer.stop", parentId: "brahe.stage.return", displayLabel: inspectionOpen ? "Stop the turn" : "Stop and return an error", x: inspectionOpen ? 680 : 575, y: inspectionOpen ? 418 : 350, width: inspectionOpen ? 120 : 150, height: inspectionOpen ? 80 : 72, dense: inspectionOpen }),
  );
  if (inspectionOpen) {
    nodes.push(
      sourceNode("brahe.inspect-response", "evaluation", { instanceId: "brahe.inspect.answer.call", parentId: "brahe.return.inspect", x: 15, y: 50, width: 155, height: 180, dense: true, serviceLabel: "Application", suppressAttribution: true, supportingText: "Sends the answer before release.", sourceRefIds: ["brahe.chat.answer-inspect"], sources: [{ id: "brahe.chat.answer-inspect", label: "Call", facet: "Call", bindingId: "defense.answer" }, { id: "brahe.chat.defense-enforce", label: "Decision", facet: "Decision", bindingId: "defense.answer" }, { id: "brahe.defense.setup", label: "Setup", facet: "Setup", bindingId: "defense.answer" }, { id: "brahe.defense.inspect", label: "Full context", facet: "Full context", bindingId: "defense.answer" }] }),
      sourceNode("brahe.inspect-response", "service", { instanceId: "brahe.service.ai-defense", parentId: "brahe.return.inspect", displayLabel: "Inspection API", supportingText: "Returns a verdict.", x: 185, y: 50, width: 145, height: 160, dense: true }),
      sourceNode("brahe.inspect-response", "decision", { instanceId: "brahe.inspect.answer.apply", parentId: "brahe.return.inspect", serviceLabel: "Application", suppressAttribution: true, supportingText: "Stops on deny; continues on allow.", x: 345, y: 50, width: 150, height: 180, dense: true }),
    );
    relationships.push(
      edge("rel.inspect.answer.call", "brahe.inspect.answer.call", "brahe.service.ai-defense", "request", "out-r", "in-l", ["req-inspect-out"], { bindingIds: ["defense.answer"] }),
      edge("rel.inspect.answer.verdict", "brahe.service.ai-defense", "brahe.inspect.answer.apply", "return", "out-r", "in-l", ["ret-inspect-out"], { bindingIds: ["defense.answer"] }),
      edge("rel.inspect.answer.stop", "brahe.inspect.answer.apply", "brahe.answer.stop", "control", "out-r@0.75", "in-t", ["ctrl-block"], {
        label: "Inspection denied",
        via: [{ x: 1055, y: 317 }, { x: 1055, y: 124 }, { x: 1250, y: 124 }, { x: 1250, y: 478 }, { x: 1150, y: 478 }],
        labelOffset: { x: -90, y: 120 },
        bindingIds: ["defense.answer"],
      }),
    );
  } else {
    relationships.push(edge("rel.inspect.answer.stop", "brahe.return.inspect", "brahe.answer.stop", "control", "out-t@0.8", "in-t", ["ctrl-block"], {
      label: "Inspection denied",
      via: [{ x: 735, y: 124 }, { x: 1080, y: 124 }, { x: 1080, y: 410 }],
      bindingIds: ["defense.answer"],
    }));
  }
  relationships.push(
    edge("rel.workflow.check-build", "brahe.stage.check", "brahe.stage.build", "businessSequence", "out-b", "in-t", ["ctrl-scope"]),
    edge("rel.workflow.build-return", "brahe.stage.build", "brahe.return.answer", "businessSequence", "out-r", "in-l", ["req-inspect-out"]),
    edge("rel.answer.inspect", "brahe.return.answer", inspectionOpen ? "brahe.inspect.answer.call" : "brahe.return.inspect", "request", "out-r", "in-l", ["req-inspect-out"], { bindingIds: ["defense.answer"] }),
    edge("rel.answer.evaluate", inspectionOpen ? "brahe.inspect.answer.apply" : "brahe.return.inspect", "brahe.answer.evaluate", "control", "out-b", "in-t", ["ret-inspect-out"]),
    edge("rel.answer.control", "brahe.answer.evaluate", "brahe.answer.control", "request", "out-r", "in-l", ["ctrl-answer"], { bindingIds: ["observe.answer-control"] }),
    edge("rel.answer.verdict", "brahe.answer.control", "brahe.answer.decision", "return", inspectionOpen ? "out-r" : "out-t", inspectionOpen ? "in-l" : "in-b", ["ctrl-answer"], { bindingIds: ["observe.answer-control"] }),
    edge("rel.answer.release", "brahe.answer.decision", "brahe.review", "control", inspectionOpen ? "out-r@0.1" : "out-r", "in-l", ["ctrl-answer"], inspectionOpen
      ? { label: "Allowed", via: [{ x: 1080, y: 412 }, { x: 1080, y: 458 }, { x: 1200, y: 458 }, { x: 1200, y: 304 }], bindingIds: ["observe.answer-control"] }
      : { bindingIds: ["observe.answer-control"] }),
    edge("rel.answer.stop", "brahe.answer.decision", "brahe.answer.stop", "control", inspectionOpen ? "out-r@0.75" : "out-b@0.8", inspectionOpen ? "in-l" : "in-t", ["ctrl-block"], inspectionOpen
      ? { label: "Policy denied", labelOffset: { x: 0, y: 80 }, bindingIds: ["observe.answer-control"] }
      : { via: [{ x: 990, y: 322 }, { x: 990, y: 410 }, { x: 1080, y: 410 }], bindingIds: ["observe.answer-control"] }),
  );
  return makeScene(nodes, relationships, "Check and return", "Inspect the answer and enforce response policy before release.");
}

function makeScene(nodes: SceneNode[], relationships: SceneRelationship[], title: string, purpose: string): SceneSpec {
  return {
    id: "brahe.journey",
    kind: "businessJourney",
    businessStepId: "overview",
    title,
    purpose,
    entryInstanceIds: ["brahe.ask"],
    exitInstanceIds: ["brahe.review"],
    modes: ["implemented", "proposed"],
    nodes,
    relationships,
  };
}

const GROUP_HEADER = 44;
const GROUP_GAP = 16;

/** Expanded bounds have one owner: current direct children plus the reserved header/content padding. */
function fitExpandedGroupBounds(scene: SceneSpec): SceneSpec {
  const nodes = scene.nodes.map((node) => ({ ...node }));
  const depth = (node: SceneNode) => {
    let current = node;
    let value = 0;
    const seen = new Set<string>();
    while (current.parentId && !seen.has(current.instanceId)) {
      seen.add(current.instanceId);
      const parent = nodes.find((candidate) => candidate.instanceId === current.parentId);
      if (!parent) break;
      value += 1;
      current = parent;
    }
    return value;
  };
  for (const groupNode of nodes.filter((node) => node.role === "group" && node.expanded).sort((a, b) => depth(b) - depth(a))) {
    const children = nodes.filter((node) => node.parentId === groupNode.instanceId);
    const requiredWidth = Math.max(1, ...children.map((child) => child.x + child.width + GROUP_GAP));
    const requiredHeight = Math.max(GROUP_HEADER, ...children.map((child) => child.y + child.height + GROUP_GAP));
    groupNode.width = Math.max(groupNode.width, requiredWidth);
    groupNode.height = Math.max(groupNode.height, requiredHeight);
  }
  const assistant = nodes.find((node) => node.instanceId === "brahe.assistant" && node.expanded);
  if (!assistant) return { ...scene, nodes };
  for (const id of ["brahe.platform.defense", "brahe.platform.observe", "brahe.platform.infra"]) {
    const platform = nodes.find((node) => node.instanceId === id);
    if (platform) platform.y = assistant.y + assistant.height + 70;
  }
  const review = nodes.find((node) => node.instanceId === "brahe.review");
  if (review) review.x = assistant.x + assistant.width + 30;
  const supportY = assistant.y + assistant.height + 35;
  const relationships = scene.relationships.map((relationship) => {
    if (relationship.id === "rel.support.defense") return { ...relationship, via: [{ x: 130, y: supportY }, { x: 240, y: supportY }, { x: assistant.x + assistant.width * .2, y: supportY }] };
    if (relationship.id === "rel.support.observe") return { ...relationship, via: [{ x: 470, y: supportY }, { x: assistant.x + assistant.width * .5, y: supportY }] };
    if (relationship.id === "rel.support.infrastructure") return { ...relationship, via: [{ x: 815, y: supportY }, { x: assistant.x + assistant.width * .8, y: supportY }] };
    return relationship;
  });
  return { ...scene, nodes, relationships };
}

export function projectBraheSystem(expandedGroupIds: readonly string[], mode: Mode): SceneSpec {
  const expanded = new Set(expandedGroupIds);
  if (!expanded.has(BRAHE_GROUPS.assistant)) return assistantSummary(mode);
  return fitExpandedGroupBounds(assistantExpanded(expanded, mode));
}

export function normalizeBraheExpansion(current: readonly string[], groupId: string) {
  const next = new Set(current);
  next.add(BRAHE_GROUPS.assistant);
  const stageGroups: readonly string[] = [BRAHE_GROUPS.check, BRAHE_GROUPS.build, BRAHE_GROUPS.return];
  if (stageGroups.includes(groupId as BraheGroupId)) {
    for (const id of stageGroups) if (id !== groupId) next.delete(id);
    next.delete(BRAHE_GROUPS.requestInspection);
    next.delete(BRAHE_GROUPS.answerInspection);
    next.delete(BRAHE_GROUPS.hosting);
  }
  if (groupId === BRAHE_GROUPS.requestInspection) next.add(BRAHE_GROUPS.check);
  if (groupId === BRAHE_GROUPS.answerInspection) next.add(BRAHE_GROUPS.return);
  if (groupId === BRAHE_GROUPS.hosting) next.add(BRAHE_GROUPS.build);
  next.add(groupId);
  return [...next];
}

export function collapseBraheGroup(current: readonly string[], groupId: string) {
  const remove = new Set<string>([groupId]);
  if (groupId === BRAHE_GROUPS.assistant) Object.values(BRAHE_GROUPS).forEach((id) => remove.add(id));
  if (groupId === BRAHE_GROUPS.check) remove.add(BRAHE_GROUPS.requestInspection);
  if (groupId === BRAHE_GROUPS.build) remove.add(BRAHE_GROUPS.hosting);
  if (groupId === BRAHE_GROUPS.return) remove.add(BRAHE_GROUPS.answerInspection);
  return current.filter((id) => !remove.has(id));
}
