import { INTERBANK_GROUPS, collapseInterbankGroup, interbankFrameParent, normalizeInterbankExpansion, projectInterbankSystem } from "./system.ts";
import type { ContinuousSystem } from "../../../app/map/continuous.ts";

const interbankHeader = { width: 240, height: 44 };

export const interbank: ContinuousSystem = {
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
