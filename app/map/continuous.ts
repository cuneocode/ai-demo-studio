import { BRAHE_GROUPS, collapseBraheGroup, normalizeBraheExpansion, projectBraheSystem } from "./brahe-system.ts";
import { INTERBANK_GROUPS, collapseInterbankGroup, interbankFrameParent, normalizeInterbankExpansion, projectInterbankSystem } from "./interbank-system.ts";
import type { Mode, SceneSpec } from "./scene-model.ts";

export type FrameRule = {
  /** Occurrences kept in the camera when this group is opened. Exact ids win over prefixes. */
  ids?: string[];
  prefixes?: string[];
  /** Context occurrences reduced to their header while framing. */
  shrink?: Record<string, { x?: number; width: number; height: number }>;
  minZoom?: number;
};

export type ContinuousStage = { instanceId: string; displayLabel: string; groupId: string; occurrenceId: string };

/** A hand-authored continuous projection: one canvas whose groups expand in place. */
export type ContinuousSystem = {
  rootLabel: string;
  rootGroupId: string;
  rootOccurrenceId: string;
  railLabel: string;
  stages: ContinuousStage[];
  labels: Record<string, string>;
  occurrences: Record<string, string>;
  framing: Record<string, FrameRule>;
  project: (expandedGroupIds: readonly string[], mode: Mode) => SceneSpec;
  normalize: (current: readonly string[], groupId: string) => string[];
  collapse: (current: readonly string[], groupId: string) => string[];
  frameParent: (groupId: string) => string;
  /** Journey activity on the rail to the occurrence that represents it in the projection. */
  railOccurrence: (stepInstanceId: string) => string;
  /** Cards render at least their authored height, so routed edges meet the card edge. */
  fillDeclaredHeights?: boolean;
};

const braheHeader = { width: 220, height: 44 };

const brahe: ContinuousSystem = {
  rootLabel: "Card guidance",
  rootGroupId: BRAHE_GROUPS.assistant,
  rootOccurrenceId: "brahe.assistant",
  railLabel: "Assistant stages",
  stages: [
    { instanceId: "check", displayLabel: "Check question", groupId: BRAHE_GROUPS.check, occurrenceId: "brahe.stage.check" },
    { instanceId: "build", displayLabel: "Build explanation", groupId: BRAHE_GROUPS.build, occurrenceId: "brahe.stage.build" },
    { instanceId: "return-stage", displayLabel: "Check and return", groupId: BRAHE_GROUPS.return, occurrenceId: "brahe.stage.return" },
  ],
  labels: {
    [BRAHE_GROUPS.assistant]: "Bank assistant",
    [BRAHE_GROUPS.check]: "Check question",
    [BRAHE_GROUPS.requestInspection]: "Request inspection",
    [BRAHE_GROUPS.build]: "Build explanation",
    [BRAHE_GROUPS.hosting]: "Model hosting",
    [BRAHE_GROUPS.return]: "Check and return",
    [BRAHE_GROUPS.answerInspection]: "Answer inspection",
  },
  occurrences: {
    [BRAHE_GROUPS.assistant]: "brahe.assistant",
    [BRAHE_GROUPS.check]: "brahe.stage.check",
    [BRAHE_GROUPS.requestInspection]: "brahe.check.inspect",
    [BRAHE_GROUPS.build]: "brahe.stage.build",
    [BRAHE_GROUPS.hosting]: "brahe.build.host",
    [BRAHE_GROUPS.return]: "brahe.stage.return",
    [BRAHE_GROUPS.answerInspection]: "brahe.return.inspect",
  },
  framing: {
    [BRAHE_GROUPS.assistant]: { prefixes: ["brahe."] },
    [BRAHE_GROUPS.check]: {
      ids: ["brahe.assistant", "brahe.stage.check", "brahe.check.question", "brahe.check.inspect", "brahe.scope.evaluate", "brahe.scope.control", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"],
      shrink: { "brahe.assistant": braheHeader },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.requestInspection]: {
      ids: ["brahe.assistant", "brahe.stage.check", "brahe.check.question", "brahe.check.inspect", "brahe.inspect.request.call", "brahe.service.ai-defense", "brahe.inspect.request.apply", "brahe.scope.evaluate", "brahe.scope.control", "brahe.scope.decision", "brahe.scope.stop", "brahe.stage.build"],
      shrink: { "brahe.assistant": braheHeader, "brahe.stage.check": braheHeader },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.build]: {
      ids: ["brahe.stage.check", "brahe.stage.build", "brahe.build.question", "brahe.build.supervisor", "brahe.build.draft", "brahe.build.cards", "brahe.build.card-tool", "brahe.build.card-docs", "brahe.build.score", "brahe.build.score-tool", "brahe.build.score-value", "brahe.build.host", "brahe.stage.return"],
      shrink: { "brahe.assistant": { x: 470, ...braheHeader } },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.hosting]: {
      ids: ["brahe.build.question", "brahe.build.supervisor", "brahe.build.draft", "brahe.build.host", "brahe.host.runtime", "brahe.host.endpoint"],
      shrink: { "brahe.assistant": braheHeader },
    },
    [BRAHE_GROUPS.return]: {
      ids: ["brahe.assistant", "brahe.stage.return", "brahe.return.answer", "brahe.return.inspect", "brahe.answer.evaluate", "brahe.answer.control", "brahe.answer.decision", "brahe.answer.stop", "brahe.review"],
      shrink: { "brahe.assistant": braheHeader },
      minZoom: 0.82,
    },
    [BRAHE_GROUPS.answerInspection]: {
      ids: ["brahe.assistant", "brahe.stage.return", "brahe.return.answer", "brahe.return.inspect", "brahe.inspect.answer.call", "brahe.service.ai-defense", "brahe.inspect.answer.apply", "brahe.answer.evaluate", "brahe.answer.control", "brahe.answer.decision", "brahe.answer.stop", "brahe.review"],
      shrink: { "brahe.assistant": braheHeader, "brahe.stage.return": braheHeader },
      minZoom: 0.8,
    },
  },
  project: projectBraheSystem,
  normalize: normalizeBraheExpansion,
  collapse: collapseBraheGroup,
  frameParent: (groupId) => {
    if (groupId === BRAHE_GROUPS.requestInspection) return BRAHE_GROUPS.check;
    if (groupId === BRAHE_GROUPS.hosting) return BRAHE_GROUPS.build;
    if (groupId === BRAHE_GROUPS.answerInspection) return BRAHE_GROUPS.return;
    if (groupId === BRAHE_GROUPS.check || groupId === BRAHE_GROUPS.build || groupId === BRAHE_GROUPS.return) return BRAHE_GROUPS.assistant;
    return groupId;
  },
  railOccurrence: (step) => ({
    prepare: "brahe.assistant",
    check: "brahe.stage.check",
    build: "brahe.stage.build",
    "return-stage": "brahe.stage.return",
  })[step] ?? `brahe.${step}`,
};

const interbankHeader = { width: 240, height: 44 };

const interbank: ContinuousSystem = {
  rootLabel: "Settlement investigation",
  rootGroupId: INTERBANK_GROUPS.investigation,
  rootOccurrenceId: "ib.investigation",
  railLabel: "Investigation stages",
  stages: [
    { instanceId: "kickoff", displayLabel: "Open the case", groupId: INTERBANK_GROUPS.kickoff, occurrenceId: "ib.stage.kickoff" },
    { instanceId: "exchange", displayLabel: "Investigate across banks", groupId: INTERBANK_GROUPS.exchange, occurrenceId: "ib.stage.exchange" },
    { instanceId: "report", displayLabel: "Return the report", groupId: INTERBANK_GROUPS.report, occurrenceId: "ib.stage.report" },
  ],
  labels: {
    [INTERBANK_GROUPS.investigation]: "Joint investigation",
    [INTERBANK_GROUPS.kickoff]: "Open the case",
    [INTERBANK_GROUPS.kickoffInspection]: "Kickoff inspection",
    [INTERBANK_GROUPS.exchange]: "Investigate across banks",
    [INTERBANK_GROUPS.outboundControl]: "Outbound control",
    [INTERBANK_GROUPS.hosting]: "Model hosting",
    [INTERBANK_GROUPS.trace]: "One trace",
    [INTERBANK_GROUPS.report]: "Return the report",
    [INTERBANK_GROUPS.reportInspection]: "Report inspection",
  },
  occurrences: {
    [INTERBANK_GROUPS.investigation]: "ib.investigation",
    [INTERBANK_GROUPS.kickoff]: "ib.stage.kickoff",
    [INTERBANK_GROUPS.kickoffInspection]: "ib.kickoff.inspect",
    [INTERBANK_GROUPS.exchange]: "ib.stage.exchange",
    [INTERBANK_GROUPS.outboundControl]: "ib.a.control",
    [INTERBANK_GROUPS.hosting]: "ib.exchange.host",
    [INTERBANK_GROUPS.trace]: "ib.exchange.trace",
    [INTERBANK_GROUPS.report]: "ib.stage.report",
    [INTERBANK_GROUPS.reportInspection]: "ib.report.inspect",
  },
  framing: {
    [INTERBANK_GROUPS.investigation]: { prefixes: ["ib."] },
    [INTERBANK_GROUPS.kickoff]: { prefixes: ["ib.kickoff", "ib.stage"], shrink: { "ib.investigation": interbankHeader }, minZoom: 0.82 },
    [INTERBANK_GROUPS.kickoffInspection]: { prefixes: ["ib.kickoff", "ib.stage.exchange"], shrink: { "ib.investigation": interbankHeader, "ib.stage.kickoff": interbankHeader }, minZoom: 0.8 },
    [INTERBANK_GROUPS.exchange]: { prefixes: ["ib.exchange", "ib.a.", "ib.b."], minZoom: 0.62 },
    [INTERBANK_GROUPS.outboundControl]: { prefixes: ["ib.a.", "ib.b.gateway"], shrink: { "ib.investigation": interbankHeader, "ib.stage.exchange": interbankHeader }, minZoom: 0.7 },
    [INTERBANK_GROUPS.hosting]: { prefixes: ["ib.exchange.host", "ib.host.", "ib.a.bank", "ib.b.bank"], minZoom: 0.6 },
    [INTERBANK_GROUPS.trace]: { prefixes: ["ib.exchange.trace", "ib.trace.", "ib.a.bank", "ib.b.bank"], minZoom: 0.6 },
    [INTERBANK_GROUPS.report]: { prefixes: ["ib.report", "ib.stage", "ib.approve"], shrink: { "ib.investigation": interbankHeader }, minZoom: 0.82 },
    [INTERBANK_GROUPS.reportInspection]: { prefixes: ["ib.report", "ib.approve", "ib.stage.exchange"], shrink: { "ib.investigation": interbankHeader, "ib.stage.report": interbankHeader }, minZoom: 0.8 },
  },
  project: projectInterbankSystem,
  normalize: normalizeInterbankExpansion,
  collapse: collapseInterbankGroup,
  frameParent: interbankFrameParent,
  railOccurrence: (step) => ({
    investigate: "ib.investigation",
    kickoff: "ib.stage.kickoff",
    exchange: "ib.stage.exchange",
    report: "ib.stage.report",
  })[step] ?? `ib.${step}`,
  fillDeclaredHeights: true,
};

export const continuousSystems: Record<string, ContinuousSystem> = {
  "brahe-bank": brahe,
  "interbank-a2a": interbank,
};
