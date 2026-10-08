import type { Mode, SceneNode, SceneRelationship, SceneSourceAction, SceneSpec } from "./scene-model.ts";

export const INTERBANK_GROUPS = {
  investigation: "ib.group.investigation",
  kickoff: "ib.group.kickoff",
  kickoffInspection: "ib.group.kickoff-inspection",
  exchange: "ib.group.exchange",
  outboundControl: "ib.group.outbound-control",
  hosting: "ib.group.hosting",
  trace: "ib.group.trace",
  report: "ib.group.report",
  reportInspection: "ib.group.report-inspection",
} as const;

export type InterbankGroupId = typeof INTERBANK_GROUPS[keyof typeof INTERBANK_GROUPS];

const G = INTERBANK_GROUPS;
const STAGES: string[] = [G.kickoff, G.exchange, G.report];
const SUBGROUPS: Record<string, string> = {
  [G.kickoffInspection]: G.kickoff,
  [G.outboundControl]: G.exchange,
  [G.hosting]: G.exchange,
  [G.trace]: G.exchange,
  [G.reportInspection]: G.report,
};

const INV = { x: 250, y: 20 };

type Box = { x: number; y: number; width: number; height: number };

const node = (instanceId: string, role: SceneNode["role"], displayLabel: string, box: Box, next: Partial<SceneNode> = {}): SceneNode => ({
  instanceId,
  role,
  displayLabel,
  ...box,
  ...next,
});

const group = (instanceId: string, displayLabel: string, expandGroupId: string | undefined, expanded: boolean, box: Box, next: Partial<SceneNode> = {}): SceneNode => ({
  instanceId,
  role: "group",
  displayLabel,
  expandGroupId,
  expanded,
  ...box,
  ...next,
});

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

const box = (x: number, y: number, width: number, height: number): Box => ({ x, y, width, height });

/** Port along a side, chosen so a vertical or horizontal route lands at an exact coordinate. */
const along = (direction: "in" | "out", side: "t" | "b", owner: Box, x: number) => `${direction}-${side}@${((x - owner.x) / owner.width).toFixed(4)}`;

const src = (id: string, label: string, facet?: SceneSourceAction["facet"], bindingId?: string): SceneSourceAction => ({ id, label, facet, bindingId });

const DEFENSE_SOURCES = (bindingId: string, hop: string): SceneSourceAction[] => [
  src(hop, "Gateway filter", "Setup", bindingId),
  src("interbank.extproc.text", "Text sent", "Call", bindingId),
  src("interbank.extproc.verdict", "Verdict", "Decision", bindingId),
  src("interbank.defense.inspect", "Inspection API call", "Full context", bindingId),
];

function rootContext(nodes: SceneNode[], relationships: SceneRelationship[], investigation: SceneNode, mode: Mode, inputId: string, outputId: string | null) {
  const open = investigation.expanded;
  const platformY = open ? investigation.y + investigation.height + 70 : 250;
  nodes.push(
    node("ib.open", "activity", "Open the failed settlement", box(0, open ? 250 : 20, 220, 108), { entityId: "open", emphasis: "customer", supportingText: "Ops desk activity" }),
    investigation,
    node("ib.approve", "activity", "Approve the remediation", box(open ? investigation.x + investigation.width + 30 : 640, open ? 250 : 20, 220, 108), { entityId: "approve", emphasis: "customer", supportingText: "Named ops teams decide" }),
    node("ib.platform.defense", "service", "Cisco AI Defense", box(0, platformY, 260, 140), {
      entityId: "defense",
      platformFocus: "cisco-ai-defense",
      expandGroupId: G.investigation,
      supportingText: "Inspects A2A traffic at every gateway.",
      bindingIds: ["defense.kickoff", "defense.boundary", "defense.report"],
    }),
    node("ib.platform.observe", "service", "Splunk Agent Observability", box(330, platformY, 280, 140), {
      entityId: "trace",
      representedEntityIds: ["controls"],
      platformFocus: "splunk-agent-observability",
      expandGroupId: G.investigation,
      supportingText: "One trace across both banks, plus Agent Control.",
      bindingIds: ["observe.tracing", "observe.agent-control"],
    }),
    node("ib.platform.infra", "service", "AI Infrastructure", box(680, platformY, 270, 140), {
      entityId: mode === "implemented" ? "model" : "private-model",
      representedEntityIds: ["runtime"],
      platformFocus: "ai-infrastructure",
      expandGroupId: G.investigation,
      supportingByMode: {
        implemented: "Containers per bank, and the selected model.",
        proposed: "Private inference per bank.",
      },
      bindingIds: ["infra.runtime", "infra.model-serving", "infra.private-model-serving"],
    }),
  );
  relationships.push(edge("ib.rel.business.open", "ib.open", inputId, "businessSequence", "out-r", "in-l", ["ib-biz-open"]));
  if (outputId) relationships.push(edge("ib.rel.business.approve", outputId, "ib.approve", "businessSequence", "out-r", "in-l", ["ib-biz-approve"]));
  relationships.push(
    edge("ib.rel.support.defense", "ib.platform.defense", investigation.instanceId, "support", "out-t", "in-b@0.2", ["ib-sup-defense"], { label: "Content inspection", bindingIds: ["defense.kickoff", "defense.boundary", "defense.report"] }),
    edge("ib.rel.support.observe", "ib.platform.observe", investigation.instanceId, "support", "out-t", "in-b@0.5", ["ib-sup-observe"], { label: "Tracing + controls", bindingIds: ["observe.tracing", "observe.agent-control"] }),
    edge("ib.rel.support.infra", "ib.platform.infra", investigation.instanceId, "support", "out-t", "in-b@0.8", ["ib-sup-infra"], {
      label: mode === "implemented" ? "Runtime + inference" : "Proposed private inference",
      bindingIds: ["infra.runtime", "infra.model-serving", "infra.private-model-serving"],
    }),
  );
}

function investigationGroup(expanded: boolean, b: Box): SceneNode {
  return group("ib.investigation", "Joint investigation", G.investigation, expanded, b, {
    entityId: "investigate",
    supportingText: expanded ? undefined : "Two banks' agents, one case",
  });
}

const STAGE_SUMMARY = {
  kickoff: { label: "Open the case", entityId: "kickoff", bindingIds: ["defense.kickoff", "observe.tracing"], supportingText: "Admit, inspect, and forward the kickoff." },
  exchange: { label: "Investigate across banks", entityId: "exchange", bindingIds: ["defense.boundary", "observe.agent-control", "observe.tracing", "infra.runtime", "infra.model-serving", "infra.private-model-serving"], supportingText: "Two Deep Agents, two gateways, one trace." },
  report: { label: "Return the report", entityId: "report", bindingIds: ["defense.report", "observe.tracing"], supportingText: "Inspect the joint report before the ops desk sees it." },
} as const;

function stageSummary(stage: keyof typeof STAGE_SUMMARY, groupId: string, b: Box): SceneNode {
  const spec = STAGE_SUMMARY[stage];
  return group(`ib.stage.${stage}`, spec.label, groupId, false, b, {
    parentId: "ib.investigation",
    entityId: spec.entityId,
    bindingIds: [...spec.bindingIds],
    showPlatformAttribution: true,
    supportingText: spec.supportingText,
    compact: true,
  });
}

function stageGroup(stage: keyof typeof STAGE_SUMMARY, groupId: string, b: Box): SceneNode {
  const spec = STAGE_SUMMARY[stage];
  return group(`ib.stage.${stage}`, spec.label, groupId, true, b, { parentId: "ib.investigation", entityId: spec.entityId, bindingIds: [...spec.bindingIds] });
}

/** Call, Inspection API, verdict: the same ExtProc sequence on every listener. */
function inspectionChildren(parentId: string, prefix: string, bindingId: string, hopRef: string): SceneNode[] {
  return [
    node(`${prefix}.call`, "service", "Send the A2A text", box(15, 56, 160, 200), {
      parentId,
      entityId: "extproc-a",
      serviceLabel: "Bank A policy service",
      supportingText: "Message parts only, no trace metadata.",
      dense: true,
      suppressAttribution: true,
      sources: DEFENSE_SOURCES(bindingId, hopRef),
    }),
    node(`${prefix}.api`, "service", "Inspection API", box(190, 66, 150, 180), {
      parentId,
      entityId: "defense",
      serviceLabel: "Cisco AI Defense",
      bindingIds: [bindingId],
      supportingText: "Returns is_safe and the classifications.",
      dense: true,
      sources: [src("interbank.defense.inspect", "Inspection API call", "Call", bindingId)],
    }),
    node(`${prefix}.apply`, "decision", "Apply the verdict", box(355, 56, 160, 200), {
      parentId,
      entityId: "gw-a-console",
      serviceLabel: "Bank A gateway",
      supportingText: "403 on a violation. 503 if AI Defense is unreachable.",
      dense: true,
      suppressAttribution: true,
      sources: [src("interbank.extproc.verdict", "Verdict", "Decision", bindingId), src(hopRef, "failClosed filter", "Setup", bindingId)],
    }),
  ];
}

function inspectionEdges(prefix: string, bindingId: string): SceneRelationship[] {
  return [
    edge(`${prefix}.rel.call`, `${prefix}.call`, `${prefix}.api`, "request", "out-r", "in-l", ["ib-inspect-call"], { bindingIds: [bindingId] }),
    edge(`${prefix}.rel.verdict`, `${prefix}.api`, `${prefix}.apply`, "return", "out-r", "in-l", ["ib-inspect-verdict"], { bindingIds: [bindingId] }),
  ];
}

/** An open three-step group; its children share one horizontal center line. */
const INSPECT_OPEN = { width: 535, height: 276 };
const INSPECT_CENTER = 156;

function overview(mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  rootContext(nodes, relationships, investigationGroup(false, box(280, 8, 300, 140)), mode, "ib.investigation", "ib.investigation");
  return makeScene(nodes, relationships, "Settlement investigation", "From two banks emailing spreadsheets to one inspected, traced, agent-to-agent investigation.");
}

function stagesOnly(mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  rootContext(nodes, relationships, investigationGroup(true, box(INV.x, INV.y, 680, 310)), mode, "ib.stage.kickoff", "ib.stage.report");
  nodes.push(
    stageSummary("kickoff", G.kickoff, box(30, 70, 200, 110)),
    stageSummary("exchange", G.exchange, box(250, 70, 200, 110)),
    stageSummary("report", G.report, box(470, 70, 200, 110)),
  );
  relationships.push(
    edge("ib.rel.stage.kickoff-exchange", "ib.stage.kickoff", "ib.stage.exchange", "businessSequence", "out-r", "in-l", ["ib-stage-kickoff-exchange"]),
    edge("ib.rel.stage.exchange-report", "ib.stage.exchange", "ib.stage.report", "businessSequence", "out-r", "in-l", ["ib-stage-exchange-report"]),
  );
  return makeScene(nodes, relationships, "Joint investigation", "Open the case, investigate across both banks, then inspect and return the report.");
}

function kickoffExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const inspectOpen = expanded.has(G.kickoffInspection);
  const rowH = 172;
  const inspect = inspectOpen ? box(410, 56, INSPECT_OPEN.width, INSPECT_OPEN.height) : box(410, 56, 190, rowH);
  const rowY = inspectOpen ? 56 + INSPECT_CENTER - rowH / 2 : 56;
  const forward = box(inspect.x + inspect.width + 40, rowY, 200, rowH);
  const stop = inspectOpen ? box(inspect.x + 355, inspect.y + inspect.height + 40, 160, 72) : box(inspect.x, inspect.y + inspect.height + 40, 190, 72);
  const stage = box(20, 56, forward.x + forward.width + 20, stop.y + stop.height + 16);
  const summaryX = stage.x + stage.width + 30;
  const investigation = investigationGroup(true, box(INV.x, INV.y, summaryX + 220 + 16, stage.y + stage.height + 16));
  rootContext(nodes, relationships, investigation, mode, "ib.kickoff.console", "ib.stage.report");
  nodes.push(
    stageGroup("kickoff", G.kickoff, stage),
    node("ib.kickoff.console", "service", "Operations console", box(20, rowY, 140, rowH), {
      parentId: "ib.stage.kickoff",
      entityId: "console",
      serviceLabel: "A2A client",
      bindingIds: ["observe.tracing"],
      suppressAttribution: true,
      supportingText: "Starts the session trace.",
      dense: true,
      sources: [src("interbank.console.kickoff", "A2A client", "Call", "observe.tracing")],
    }),
    node("ib.kickoff.admit", "checkpoint", "Admit the console", box(190, rowY, 190, rowH), {
      parentId: "ib.stage.kickoff",
      entityId: "gw-a-console",
      serviceLabel: "Bank A gateway",
      supportingText: "TLS 1.3, Bank A's CA, and a console-only token.",
      dense: true,
      sources: [src("interbank.gw-a.console-admission", "Admission", "Setup"), src("interbank.gw-a.console-listener", "Listener", "Full context")],
    }),
    group("ib.kickoff.inspect", "Inspect the kickoff", G.kickoffInspection, inspectOpen, inspect, {
      parentId: "ib.stage.kickoff",
      entityId: "extproc-a",
      bindingIds: ["defense.kickoff"],
      supportingText: inspectOpen ? undefined : "Fails closed",
      dense: !inspectOpen,
      sourceRefIds: ["interbank.gw-a.console-extproc"],
    }),
    node("ib.kickoff.forward", "service", "Forward to Bank A's agent", forward, {
      parentId: "ib.stage.kickoff",
      entityId: "gw-a-console",
      serviceLabel: "Bank A gateway",
      supportingText: "Re-signs a two-minute token for the agent.",
      dense: true,
      sources: [src("interbank.gw-a.console-forward", "Token swap", "Setup")],
    }),
    node("ib.kickoff.stop", "output", "Blocked: 403 or 503", stop, { parentId: "ib.stage.kickoff", entityId: "blocked", dense: inspectOpen }),
    stageSummary("exchange", G.exchange, box(summaryX, 80, 220, 110)),
    stageSummary("report", G.report, box(summaryX, 300, 220, 110)),
  );
  relationships.push(edge("ib.rel.kickoff.send", "ib.kickoff.console", "ib.kickoff.admit", "request", "out-r", "in-l", ["ib-kick-send"], { bindingIds: ["observe.tracing"] }));
  if (inspectOpen) {
    nodes.push(...inspectionChildren("ib.kickoff.inspect", "ib.kickoff.inspect", "defense.kickoff", "interbank.gw-a.console-extproc"));
    relationships.push(
      edge("ib.rel.kickoff.admit", "ib.kickoff.admit", "ib.kickoff.inspect.call", "control", "out-r", "in-l", ["ib-kick-admit"], { bindingIds: ["defense.kickoff"] }),
      ...inspectionEdges("ib.kickoff.inspect", "defense.kickoff"),
      edge("ib.rel.kickoff.permit", "ib.kickoff.inspect.apply", "ib.kickoff.forward", "control", "out-r", "in-l", ["ib-inspect-permit"], { bindingIds: ["defense.kickoff"] }),
      edge("ib.rel.kickoff.block", "ib.kickoff.inspect.apply", "ib.kickoff.stop", "control", "out-b", "in-t", ["ib-inspect-block"], { label: "Blocked", bindingIds: ["defense.kickoff"] }),
    );
  } else {
    relationships.push(
      edge("ib.rel.kickoff.admit", "ib.kickoff.admit", "ib.kickoff.inspect", "control", "out-r", "in-l", ["ib-kick-admit"], { bindingIds: ["defense.kickoff"] }),
      edge("ib.rel.kickoff.permit", "ib.kickoff.inspect", "ib.kickoff.forward", "control", "out-r", "in-l", ["ib-inspect-permit"], { bindingIds: ["defense.kickoff"] }),
      edge("ib.rel.kickoff.block", "ib.kickoff.inspect", "ib.kickoff.stop", "control", "out-b", "in-t", ["ib-inspect-block"], { label: "Blocked", bindingIds: ["defense.kickoff"] }),
    );
  }
  relationships.push(
    edge("ib.rel.kickoff.forward", "ib.kickoff.forward", "ib.stage.exchange", "businessSequence", "out-r", "in-l", ["ib-kick-forward"]),
    edge("ib.rel.stage.exchange-report", "ib.stage.exchange", "ib.stage.report", "businessSequence", "out-b", "in-t", ["ib-stage-exchange-report"]),
  );
  return makeScene(nodes, relationships, "Open the case", "The console is an A2A client of Bank A's gateway. It never calls the agent directly.");
}

function exchangeExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const controlOpen = expanded.has(G.outboundControl);
  const hostOpen = expanded.has(G.hosting);
  const traceOpen = expanded.has(G.trace);

  // Bank A, relative to its boundary group.
  const rowH = 180;
  const rowY = controlOpen ? 56 + INSPECT_CENTER - rowH / 2 : 56;
  const coordinator = box(20, rowY, 210, rowH);
  const control = controlOpen ? box(270, 56, INSPECT_OPEN.width, INSPECT_OPEN.height) : box(270, rowY, 190, rowH);
  const notSent = controlOpen ? box(control.x + 355, control.y + control.height + 40, 160, 72) : box(control.x, rowY + rowH + 40, 190, 72);
  const gatewayA = box(control.x + control.width + 40, rowY, 200, rowH);
  const recordsA = box(20, rowY + rowH + 40, 210, 140);
  const bankHeight = Math.max(recordsA.y + recordsA.height, notSent.y + notSent.height) + 16;
  const bankGap = 160;
  const bankA = box(20, 76, gatewayA.x + gatewayA.width + 20, bankHeight);
  const bankB = box(bankA.x + bankA.width + bankGap, 76, 490, bankHeight);
  const gatewayB = box(20, rowY, 200, rowH);
  const investigator = box(260, rowY, 210, rowH);
  const recordsB = box(260, rowY + rowH + 40, 210, 140);

  // Shared dependencies below both banks, relative to the stage.
  const bottomY = bankA.y + bankA.height + 70;
  const gap = bankA.x + bankA.width + bankGap / 2;
  const hostSize = hostOpen ? { width: 525, height: 295 } : { width: 400, height: 150 };
  const host = box(gap - hostSize.width / 2, bottomY, hostSize.width, hostSize.height);
  const trace = box(host.x + host.width + 60, bottomY, traceOpen ? 655 : 300, traceOpen ? 265 : 150);
  const corridorY = bottomY + Math.max(host.height, trace.height) + 30;
  const stage = box(220, 56, Math.max(bankB.x + bankB.width, trace.x + trace.width) + 20, corridorY + 20);
  const reportX = stage.x + stage.width + 20;
  const investigation = investigationGroup(true, box(INV.x, INV.y, reportX + 200 + 16, stage.y + stage.height + 16));
  rootContext(nodes, relationships, investigation, mode, "ib.stage.kickoff", "ib.stage.report");

  const stageAbs = { x: INV.x + stage.x, y: INV.y + stage.y };
  const bankAAbs = { x: stageAbs.x + bankA.x, y: stageAbs.y + bankA.y };
  const bankBAbs = { x: stageAbs.x + bankB.x, y: stageAbs.y + bankB.y };
  const coordinatorTop = { x: bankAAbs.x + coordinator.x + coordinator.width / 2, y: bankAAbs.y + coordinator.y };
  const investigatorTop = { x: bankBAbs.x + investigator.x + investigator.width / 2, y: bankBAbs.y + investigator.y };
  const replyCorridor = stageAbs.y + 60;
  const reportAbsX = INV.x + reportX;

  nodes.push(
    stageSummary("kickoff", G.kickoff, box(20, 70, 180, 110)),
    stageGroup("exchange", G.exchange, stage),
    stageSummary("report", G.report, box(reportX, 70, 200, 110)),
    group("ib.a.bank", "Bank A", undefined, true, bankA, { parentId: "ib.stage.exchange", supportingText: "Own network, own CA" }),
    node("ib.a.coordinator", "agent", "Bank A coordinator", coordinator, {
      parentId: "ib.a.bank",
      entityId: "coordinator",
      representedEntityIds: ["model-client"],
      technicalLabel: "Deep Agent",
      supportingText: "Plans, queries Bank A, and asks Bank B.",
      dense: true,
      bindingIds: ["observe.tracing", "infra.model-serving", "infra.private-model-serving"],
      sources: [src("interbank.bank-a.coordinator", "Instructions", "Full context"), src("interbank.agents.build", "Deep Agent", "Setup"), src("interbank.agents.model", "Model client", "Setup", "infra.model-serving")],
    }),
    node("ib.a.records", "service", "Bank A records", recordsA, {
      parentId: "ib.a.bank",
      entityId: "records-a",
      supportingText: "Read-only SELECTs over settlement data.",
      dense: true,
      sources: [src("interbank.records", "Records tool", "Full context")],
    }),
    group("ib.a.control", "Check before sending", G.outboundControl, controlOpen, control, {
      parentId: "ib.a.bank",
      entityId: "partner-tool",
      bindingIds: ["observe.agent-control"],
      supportingText: controlOpen ? undefined : "Splunk Agent Control",
      dense: !controlOpen,
      sourceRefIds: ["interbank.partner-tool"],
    }),
    node("ib.a.not-sent", "output", "Not sent", notSent, { parentId: "ib.a.bank", entityId: "not-sent", dense: controlOpen }),
    node("ib.a.gateway", "checkpoint", "Bank A gateway", gatewayA, {
      parentId: "ib.a.bank",
      entityId: "gw-a-egress",
      representedEntityIds: ["extproc-a"],
      bindingIds: ["defense.boundary"],
      supportingText: "Egress: inspects the message and the reply.",
      dense: true,
      sources: [...DEFENSE_SOURCES("defense.boundary", "interbank.gw-a.egress-extproc"), src("interbank.gw-a.egress-token", "Partner token", "Setup")],
    }),
    group("ib.b.bank", "Bank B", undefined, true, bankB, { parentId: "ib.stage.exchange", supportingText: "Own network, own CA" }),
    node("ib.b.gateway", "checkpoint", "Bank B gateway", gatewayB, {
      parentId: "ib.b.bank",
      entityId: "gw-b-ingress",
      representedEntityIds: ["extproc-b"],
      bindingIds: ["defense.boundary"],
      supportingText: "Ingress: inspects again, then signs a Bank B token.",
      dense: true,
      sources: [src("interbank.gw-b.ingress-extproc", "Gateway filter", "Setup", "defense.boundary"), src("interbank.gw-b.ingress", "Listener", "Full context")],
    }),
    node("ib.b.investigator", "agent", "Bank B investigator", investigator, {
      parentId: "ib.b.bank",
      entityId: "investigator",
      representedEntityIds: ["model-client"],
      technicalLabel: "Deep Agent",
      supportingText: "Answers from Bank B's records only.",
      dense: true,
      bindingIds: ["observe.tracing", "infra.model-serving", "infra.private-model-serving"],
      sources: [src("interbank.bank-b.investigator", "Instructions", "Full context"), src("interbank.a2a.receive", "A2A executor", "Call"), src("interbank.a2a.server", "Token check", "Setup")],
    }),
    node("ib.b.records", "service", "Bank B records", recordsB, {
      parentId: "ib.b.bank",
      entityId: "records-b",
      supportingText: "Read-only SELECTs over settlement data.",
      dense: true,
      sources: [src("interbank.records", "Records tool", "Full context")],
    }),
    group("ib.exchange.host", "Runtime + model inference", G.hosting, hostOpen, host, {
      parentId: "ib.stage.exchange",
      entityId: mode === "implemented" ? "model" : "private-model",
      bindingIds: ["infra.model-serving", "infra.private-model-serving"],
      supportingByMode: hostOpen ? undefined : { implemented: "Chosen in Model backends", proposed: "Private inference per bank" },
    }),
    group("ib.exchange.trace", "One trace across both banks", G.trace, traceOpen, trace, {
      parentId: "ib.stage.exchange",
      entityId: "trace",
      bindingIds: ["observe.tracing"],
      supportingText: traceOpen ? undefined : "Splunk Agent Observability",
    }),
  );

  if (controlOpen) {
    nodes.push(
      node("ib.a.control.evaluate", "service", "Name the step", box(15, 56, 160, 200), {
        parentId: "ib.a.control",
        entityId: "partner-tool",
        serviceLabel: "Partner tool",
        supportingText: "Evaluates bank-a.send_a2a_message before sending.",
        dense: true,
        suppressAttribution: true,
        sources: [src("interbank.partner-tool", "Partner tool", "Call", "observe.agent-control")],
      }),
      node("ib.a.control.api", "service", "Agent Control", box(190, 66, 150, 180), {
        parentId: "ib.a.control",
        entityId: "controls",
        serviceLabel: "Splunk Agent Observability",
        bindingIds: ["observe.agent-control"],
        supportingText: "Server-side confidentiality control.",
        dense: true,
        sources: [src("interbank.controls.outbound", "Evaluation", "Call", "observe.agent-control"), src("interbank.controls.setup", "Control definition", "Setup", "observe.agent-control")],
      }),
      node("ib.a.control.apply", "decision", "Apply the verdict", box(355, 56, 160, 200), {
        parentId: "ib.a.control",
        entityId: "partner-tool",
        serviceLabel: "Partner tool",
        supportingText: "A deny returns a refusal to the agent.",
        dense: true,
        suppressAttribution: true,
        sources: [src("interbank.controls.outbound", "Verdict", "Decision", "observe.agent-control")],
      }),
    );
    relationships.push(
      edge("ib.rel.x.tool", "ib.a.coordinator", "ib.a.control.evaluate", "request", "out-r", "in-l", ["ib-x-tool"]),
      edge("ib.rel.x.control", "ib.a.control.evaluate", "ib.a.control.api", "control", "out-r", "in-l", ["ib-x-control"], { bindingIds: ["observe.agent-control"] }),
      edge("ib.rel.x.control-verdict", "ib.a.control.api", "ib.a.control.apply", "return", "out-r", "in-l", ["ib-x-control-verdict"], { bindingIds: ["observe.agent-control"] }),
      edge("ib.rel.x.egress", "ib.a.control.apply", "ib.a.gateway", "request", "out-r", "in-l", ["ib-x-egress"], { bindingIds: ["observe.agent-control"] }),
      edge("ib.rel.x.not-sent", "ib.a.control.apply", "ib.a.not-sent", "control", "out-b", "in-t", ["ib-x-not-sent"], { label: "Denied", bindingIds: ["observe.agent-control"] }),
    );
  } else {
    relationships.push(
      edge("ib.rel.x.tool", "ib.a.coordinator", "ib.a.control", "request", "out-r", "in-l", ["ib-x-tool", "ib-x-control", "ib-x-control-verdict"], { bindingIds: ["observe.agent-control"] }),
      edge("ib.rel.x.egress", "ib.a.control", "ib.a.gateway", "request", "out-r", "in-l", ["ib-x-egress"], { bindingIds: ["observe.agent-control"] }),
      edge("ib.rel.x.not-sent", "ib.a.control", "ib.a.not-sent", "control", "out-b", "in-t", ["ib-x-not-sent"], { label: "Denied", bindingIds: ["observe.agent-control"] }),
    );
  }

  if (hostOpen) {
    nodes.push(
      node("ib.host.runtime", "service", "Containers per bank", box(15, 55, 230, 200), {
        parentId: "ib.exchange.host",
        entityId: "runtime",
        serviceLabel: "Docker on this machine",
        bindingIds: ["infra.runtime"],
        supportingText: "Agent, gateway, policy, and collector per bank.",
        dense: true,
        sources: [src("interbank.compose", "Containers and networks", "Setup", "infra.runtime"), src("interbank.labctl.pki", "Per-bank CAs", "Setup", "infra.runtime")],
      }),
      node("ib.host.endpoint", "service", mode === "implemented" ? "Model endpoint" : "Private inference", box(265, 55, 240, 220), {
        parentId: "ib.exchange.host",
        entityId: mode === "implemented" ? "model" : "private-model",
        bindingIds: ["infra.model-serving", "infra.private-model-serving"],
        supportingByMode: {
          implemented: "OpenAI API or Sparky's vLLM, chosen in Model backends. Not inspected by AI Defense.",
          proposed: "A private endpoint per bank. Not called today.",
        },
        dense: true,
        sources: mode === "implemented" ? [src("interbank.agents.model", "Model client", "Setup", "infra.model-serving")] : [],
      }),
    );
    relationships.push(edge("ib.rel.host.inference", "ib.host.runtime", "ib.host.endpoint", "hosting", "out-r", "in-l", [mode === "implemented" ? "ib-host-model" : "ib-host-private"], {
      bindingIds: [mode === "implemented" ? "infra.model-serving" : "infra.private-model-serving"],
    }));
  }

  if (traceOpen) {
    nodes.push(
      node("ib.trace.agents", "service", "Agent spans", box(15, 55, 195, 190), {
        parentId: "ib.exchange.trace",
        entityId: "telemetry-adapter",
        bindingIds: ["observe.tracing"],
        supportingText: "SplunkAOSpanProcessor in each agent. GenAI-typed spans.",
        dense: true,
        sources: [src("interbank.telemetry.setup", "Tracer setup", "Setup", "observe.tracing"), src("interbank.genai.exporter", "GenAI exporter", "Full context", "observe.tracing")],
      }),
      node("ib.trace.gateways", "service", "Gateway spans", box(225, 55, 195, 190), {
        parentId: "ib.exchange.trace",
        entityId: "collector",
        bindingIds: ["observe.tracing"],
        supportingText: "Each gateway exports through its bank's collector.",
        dense: true,
        sources: [src("interbank.gw.tracing", "Gateway tracing", "Setup", "observe.tracing"), src("interbank.collector", "Collector", "Setup", "observe.tracing")],
      }),
      node("ib.trace.handoff", "service", "Agent handoff", box(435, 55, 200, 190), {
        parentId: "ib.exchange.trace",
        entityId: "handoff",
        bindingIds: ["observe.tracing"],
        supportingText: "The caller's span rides in A2A metadata and becomes a link.",
        dense: true,
        sources: [src("interbank.telemetry.handoff", "Handoff metadata", "Trace correlation", "observe.tracing"), src("interbank.telemetry.session", "Continue the session", "Trace correlation", "observe.tracing")],
      }),
    );
  }

  const hostAbs = box(stageAbs.x + host.x, stageAbs.y + host.y, host.width, host.height);
  const traceAbs = box(stageAbs.x + trace.x, stageAbs.y + trace.y, trace.width, trace.height);
  const bankAAbsBox = box(bankAAbs.x, bankAAbs.y, bankA.width, bankA.height);
  const bankBAbsBox = box(bankBAbs.x, bankBAbs.y, bankB.width, bankB.height);
  const aToHost = gap - 150;
  const bToHost = gap + 150;
  const bToTrace = trace.x + 80;
  const aToTrace = bankA.x + 60;
  const traceEntry = trace.x + trace.width - 60;
  relationships.push(
    edge("ib.rel.kickoff.forward", "ib.stage.kickoff", "ib.a.coordinator", "businessSequence", "out-r", "in-l", ["ib-kick-forward"]),
    edge("ib.rel.x.records-a", "ib.a.coordinator", "ib.a.records", "request", "out-b", "in-t", ["ib-x-records-a"]),
    edge("ib.rel.x.boundary", "ib.a.gateway", "ib.b.gateway", "request", "out-r", "in-l", ["ib-x-boundary"], { label: "A2A over mTLS", bindingIds: ["defense.boundary"] }),
    edge("ib.rel.x.ingress", "ib.b.gateway", "ib.b.investigator", "request", "out-r", "in-l", ["ib-x-ingress"], { bindingIds: ["defense.boundary"] }),
    edge("ib.rel.x.records-b", "ib.b.investigator", "ib.b.records", "request", "out-b", "in-t", ["ib-x-records-b"]),
    edge("ib.rel.x.reply", "ib.b.investigator", "ib.a.coordinator", "return", "out-t", "in-t", ["ib-x-reply"], {
      label: "Reply, inspected by both gateways",
      via: [{ x: investigatorTop.x, y: replyCorridor }, { x: coordinatorTop.x, y: replyCorridor }],
      bindingIds: ["defense.boundary"],
    }),
    edge("ib.rel.x.report", "ib.a.coordinator", "ib.stage.report", "return", "out-t@0.3", "in-l", ["ib-rep-draft"], {
      via: [
        { x: bankAAbs.x + coordinator.x + coordinator.width * 0.3, y: INV.y + 20 },
        { x: reportAbsX - 10, y: INV.y + 20 },
        { x: reportAbsX - 10, y: INV.y + 70 + 55 },
      ],
    }),
    edge("ib.rel.x.model-a", "ib.a.bank", "ib.exchange.host", "request", along("out", "b", bankAAbsBox, stageAbs.x + aToHost), along("in", "t", hostAbs, stageAbs.x + aToHost), ["ib-model"], {
      label: "Model calls",
      bindingIds: ["infra.model-serving", "infra.private-model-serving"],
    }),
    edge("ib.rel.x.model-b", "ib.b.bank", "ib.exchange.host", "request", along("out", "b", bankBAbsBox, stageAbs.x + bToHost), along("in", "t", hostAbs, stageAbs.x + bToHost), ["ib-model"], {
      bindingIds: ["infra.model-serving", "infra.private-model-serving"],
    }),
    edge("ib.rel.x.trace-b", "ib.b.bank", "ib.exchange.trace", "telemetry", along("out", "b", bankBAbsBox, stageAbs.x + bToTrace), along("in", "t", traceAbs, stageAbs.x + bToTrace), ["ib-trace-agents", "ib-trace-gateways"], {
      label: "Spans",
      bindingIds: ["observe.tracing"],
    }),
    edge("ib.rel.x.trace-a", "ib.a.bank", "ib.exchange.trace", "telemetry", along("out", "b", bankAAbsBox, stageAbs.x + aToTrace), along("in", "b", traceAbs, stageAbs.x + traceEntry), ["ib-trace-agents", "ib-trace-gateways", "ib-trace-handoff"], {
      via: [{ x: stageAbs.x + aToTrace, y: stageAbs.y + corridorY }, { x: stageAbs.x + traceEntry, y: stageAbs.y + corridorY }],
      bindingIds: ["observe.tracing"],
    }),
  );
  return makeScene(nodes, relationships, "Investigate across banks", "Each bank's agent reads only its own records. Only the gateways connect the banks, and both inspect every message.");
}

function reportExpanded(expanded: ReadonlySet<string>, mode: Mode): SceneSpec {
  const nodes: SceneNode[] = [];
  const relationships: SceneRelationship[] = [];
  const inspectOpen = expanded.has(G.reportInspection);
  const inspect = inspectOpen ? box(200, 56, INSPECT_OPEN.width, INSPECT_OPEN.height) : box(200, 56, 190, 178);
  const center = inspectOpen ? 56 + INSPECT_CENTER : 56 + 89;
  const deliver = box(inspect.x + inspect.width + 40, center - 32, 180, 64);
  const stop = inspectOpen ? box(inspect.x + 355, inspect.y + inspect.height + 40, 160, 72) : box(inspect.x, inspect.y + inspect.height + 56, 190, 72);
  const stage = box(210, 56, deliver.x + deliver.width + 20, stop.y + stop.height + 16);
  const investigation = investigationGroup(true, box(INV.x, INV.y, stage.x + stage.width + 16, stage.y + stage.height + 16));
  rootContext(nodes, relationships, investigation, mode, "ib.stage.kickoff", null);
  const approve = nodes.find((item) => item.instanceId === "ib.approve");
  if (approve) Object.assign(approve, { y: INV.y + stage.y + center - 54, width: 180, compact: true });
  nodes.push(
    stageSummary("kickoff", G.kickoff, box(10, 70, 170, 150)),
    stageSummary("exchange", G.exchange, box(10, 250, 170, 170)),
    stageGroup("report", G.report, stage),
    node("ib.report.draft", "input", "Joint report draft", box(20, center - 32, 150, 64), { parentId: "ib.stage.report", entityId: "report-draft" }),
    group("ib.report.inspect", "Inspect the report", G.reportInspection, inspectOpen, inspect, {
      parentId: "ib.stage.report",
      entityId: "extproc-a",
      bindingIds: ["defense.report"],
      supportingText: inspectOpen ? undefined : "Fails closed",
      dense: !inspectOpen,
      sourceRefIds: ["interbank.gw-a.console-extproc"],
    }),
    node("ib.report.deliver", "output", "Report to the ops desk", deliver, { parentId: "ib.stage.report", entityId: "joint-report" }),
    node("ib.report.stop", "output", "Withheld: 403 or 503", stop, { parentId: "ib.stage.report", entityId: "blocked", dense: inspectOpen }),
  );
  if (inspectOpen) {
    nodes.push(...inspectionChildren("ib.report.inspect", "ib.report.inspect", "defense.report", "interbank.gw-a.console-extproc"));
    relationships.push(
      edge("ib.rel.report.inspect", "ib.report.draft", "ib.report.inspect.call", "request", "out-r", "in-l", ["ib-rep-inspect"], { bindingIds: ["defense.report"] }),
      ...inspectionEdges("ib.report.inspect", "defense.report"),
      edge("ib.rel.report.deliver", "ib.report.inspect.apply", "ib.report.deliver", "return", "out-r", "in-l", ["ib-rep-deliver"], { bindingIds: ["defense.report"] }),
      edge("ib.rel.report.block", "ib.report.inspect.apply", "ib.report.stop", "control", "out-b", "in-t", ["ib-inspect-block"], { label: "Withheld", bindingIds: ["defense.report"] }),
    );
  } else {
    relationships.push(
      edge("ib.rel.report.inspect", "ib.report.draft", "ib.report.inspect", "request", "out-r", "in-l", ["ib-rep-inspect"], { bindingIds: ["defense.report"] }),
      edge("ib.rel.report.deliver", "ib.report.inspect", "ib.report.deliver", "return", "out-r", "in-l", ["ib-rep-deliver"], { bindingIds: ["defense.report"] }),
      edge("ib.rel.report.block", "ib.report.inspect", "ib.report.stop", "control", "out-b", "in-t", ["ib-inspect-block"], { label: "Withheld", bindingIds: ["defense.report"] }),
    );
  }
  relationships.push(
    edge("ib.rel.stage.kickoff-exchange", "ib.stage.kickoff", "ib.stage.exchange", "businessSequence", "out-b", "in-t", ["ib-stage-kickoff-exchange"]),
    edge("ib.rel.report.draft", "ib.stage.exchange", "ib.report.draft", "businessSequence", "out-r", "in-l", ["ib-rep-draft"]),
    edge("ib.rel.report.approve", "ib.report.deliver", "ib.approve", "businessSequence", "out-r", "in-l", ["ib-rep-approve"]),
  );
  return makeScene(nodes, relationships, "Return the report", "The report returns through the same console listener, and AI Defense inspects it before the ops desk sees it.");
}

function makeScene(nodes: SceneNode[], relationships: SceneRelationship[], title: string, purpose: string): SceneSpec {
  return {
    id: "interbank.journey",
    kind: "businessJourney",
    businessStepId: "overview",
    title,
    purpose,
    entryInstanceIds: ["ib.open"],
    exitInstanceIds: ["ib.approve"],
    modes: ["implemented", "proposed"],
    nodes,
    relationships,
  };
}

const GROUP_HEADER = 44;
const GROUP_GAP = 16;

/** Expanded groups grow to their children, then the journey context follows the investigation's edges. */
function fitExpandedGroupBounds(scene: SceneSpec): SceneSpec {
  const nodes = scene.nodes.map((item) => ({ ...item }));
  const byId = new Map(nodes.map((item) => [item.instanceId, item]));
  const depth = (item: SceneNode) => {
    let value = 0;
    let current: SceneNode | undefined = item;
    while (current?.parentId && value < 10) {
      current = byId.get(current.parentId);
      value += 1;
    }
    return value;
  };
  for (const groupNode of nodes.filter((item) => item.role === "group" && item.expanded).sort((a, b) => depth(b) - depth(a))) {
    const children = nodes.filter((item) => item.parentId === groupNode.instanceId);
    groupNode.width = Math.max(groupNode.width, ...children.map((child) => child.x + child.width + GROUP_GAP));
    groupNode.height = Math.max(groupNode.height, GROUP_HEADER, ...children.map((child) => child.y + child.height + GROUP_GAP));
  }
  const investigation = byId.get("ib.investigation");
  if (!investigation?.expanded) return { ...scene, nodes };
  for (const id of ["ib.platform.defense", "ib.platform.observe", "ib.platform.infra"]) {
    const platform = byId.get(id);
    if (platform) platform.y = investigation.y + investigation.height + 70;
  }
  const approve = byId.get("ib.approve");
  if (approve) approve.x = investigation.x + investigation.width + 30;
  const supportY = investigation.y + investigation.height + 35;
  const at = (ratio: number) => investigation.x + investigation.width * ratio;
  const via: Record<string, { x: number; y: number }[]> = {
    "ib.rel.support.defense": [{ x: 130, y: supportY }, { x: 240, y: supportY }, { x: at(0.2), y: supportY }],
    "ib.rel.support.observe": [{ x: 470, y: supportY }, { x: at(0.5), y: supportY }],
    "ib.rel.support.infra": [{ x: 815, y: supportY }, { x: at(0.8), y: supportY }],
  };
  return { ...scene, nodes, relationships: scene.relationships.map((item) => (via[item.id] ? { ...item, via: via[item.id] } : item)) };
}

export function projectInterbankSystem(expandedGroupIds: readonly string[], mode: Mode): SceneSpec {
  const expanded = new Set(expandedGroupIds);
  if (!expanded.has(G.investigation)) return overview(mode);
  if (expanded.has(G.kickoff)) return fitExpandedGroupBounds(kickoffExpanded(expanded, mode));
  if (expanded.has(G.exchange)) return fitExpandedGroupBounds(exchangeExpanded(expanded, mode));
  if (expanded.has(G.report)) return fitExpandedGroupBounds(reportExpanded(expanded, mode));
  return fitExpandedGroupBounds(stagesOnly(mode));
}

/** One stage at a time; within the exchange, one detail group at a time keeps the canvas readable. */
export function normalizeInterbankExpansion(current: readonly string[], groupId: string) {
  const next = new Set(current);
  next.add(G.investigation);
  if (STAGES.includes(groupId)) {
    for (const id of STAGES) if (id !== groupId) next.delete(id);
    for (const id of Object.keys(SUBGROUPS)) next.delete(id);
  }
  const stage = SUBGROUPS[groupId];
  if (stage) {
    for (const id of STAGES) if (id !== stage) next.delete(id);
    for (const id of Object.keys(SUBGROUPS)) if (id !== groupId) next.delete(id);
    next.add(stage);
  }
  next.add(groupId);
  return [...next];
}

export function collapseInterbankGroup(current: readonly string[], groupId: string) {
  const remove = new Set<string>([groupId]);
  if (groupId === G.investigation) Object.values(G).forEach((id) => remove.add(id));
  for (const [id, stage] of Object.entries(SUBGROUPS)) if (stage === groupId) remove.add(id);
  return current.filter((id) => !remove.has(id));
}

export function interbankFrameParent(groupId: string) {
  if (SUBGROUPS[groupId]) return SUBGROUPS[groupId];
  if (STAGES.includes(groupId)) return G.investigation;
  return groupId;
}

/** Every reachable state, for validation and tests. */
export function interbankStates(): { id: string; expanded: string[]; mode: Mode }[] {
  return [
    { id: "overview", expanded: [], mode: "implemented" },
    { id: "stages", expanded: [G.investigation], mode: "implemented" },
    { id: "kickoff", expanded: [G.investigation, G.kickoff], mode: "implemented" },
    { id: "kickoff-inspection", expanded: [G.investigation, G.kickoff, G.kickoffInspection], mode: "implemented" },
    { id: "exchange", expanded: [G.investigation, G.exchange], mode: "implemented" },
    { id: "exchange-control", expanded: [G.investigation, G.exchange, G.outboundControl], mode: "implemented" },
    { id: "exchange-hosting", expanded: [G.investigation, G.exchange, G.hosting], mode: "implemented" },
    { id: "exchange-hosting-proposed", expanded: [G.investigation, G.exchange, G.hosting], mode: "proposed" },
    { id: "exchange-trace", expanded: [G.investigation, G.exchange, G.trace], mode: "implemented" },
    { id: "report", expanded: [G.investigation, G.report], mode: "implemented" },
    { id: "report-inspection", expanded: [G.investigation, G.report, G.reportInspection], mode: "implemented" },
  ];
}
