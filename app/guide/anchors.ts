/**
 * Every spotlight target a tour may name. Components render them with
 * guideAnchor(); tests/guide-tours.test.mjs fails when a tour names an anchor
 * that no component renders.
 */
export const ANCHORS = [
  "vulnerability.intro", "vulnerability.source", "vulnerability.run", "vulnerability.findings", "vulnerability.patch", "vulnerability.checks", "vulnerability.evidence", "vulnerability.publication", "vulnerability.hec",
  "case.status", "case.tabs", "case.tab.architecture", "case.tab.capacity", "guide.launch",
  "stats", "stats.observability", "stats.defense",
  "present.bar", "present.guide",
  "arch.explorer", "arch.mode", "arch.rail", "arch.focus", "arch.canvas", "arch.env",
  "kyc.label", "kyc.metrics", "kyc.queue", "kyc.workbench",
  "fraud.band", "fraud.scenarios", "fraud.run", "fraud.replay", "fraud.queue", "fraud.verdicts", "fraud.show-network", "fraud.network",
  "fraud.reasons", "fraud.timeline", "fraud.dispute", "fraud.summary", "fraud.decision", "fraud.bulk", "fraud.note", "fraud.audit",
  "fraud.shared", "fraud.handoff", "fraud.escalate", "fraud.hood",
  "sar.inputs", "research.inputs", "advisory.inputs",
  "sar.band", "sar.runtime", "sar.inbox", "sar.inbox.open", "sar.scenarios", "sar.case", "sar.clock", "sar.investigate", "sar.replay",
  "sar.narrative", "sar.recommendation", "sar.decision", "sar.policies", "sar.typologies", "sar.evidence", "sar.timeline", "sar.audit",
  "research.intro", "research.run", "research.result", "research.news", "research.timeline",
  "advisory.intro", "advisory.households", "advisory.context", "advisory.run", "advisory.replay", "advisory.result", "advisory.findings",
  "advisory.actions", "advisory.brief", "advisory.policies", "advisory.approval", "advisory.notes", "advisory.holdings", "advisory.timeline",
  "interbank.controls", "interbank.scenarios", "interbank.kickoff", "interbank.start", "interbank.replay", "interbank.offline",
  "interbank.bank-a", "interbank.bank-b", "interbank.wire", "interbank.report", "interbank.runtime", "interbank.integrations",
  "banking.chat", "banking.suggestions", "banking.replay", "banking.answer", "banking.composer", "banking.error",
  "briefing.intake", "briefing.examples", "briefing.extract", "briefing.replay", "briefing.review", "briefing.accept",
  "briefing.themes", "briefing.metrics", "briefing.trail",
] as const;

/** Per-item anchors carry the item id, e.g. `fraud.scenario.cpp-orbit`. */
export const ANCHOR_PREFIXES = ["fraud.scenario", "sar.scenario", "advisory.household", "banking.suggestion", "library.guide"] as const;

export type AnchorId = (typeof ANCHORS)[number] | `${(typeof ANCHOR_PREFIXES)[number]}.${string}`;

/** Spreads onto an element: `<section {...guideAnchor("fraud.verdicts")}>`. */
export function guideAnchor(...ids: AnchorId[]) {
  return { "data-guide": ids.join(" ") };
}

/**
 * Marks an anchor the engine may click on an `auto` step: it only changes
 * what is shown (a scenario card, a details toggle), never starts a run or
 * records a decision.
 */
export function guideSafeAnchor(...ids: AnchorId[]) {
  return { "data-guide": ids.join(" "), "data-guide-safe": "true" };
}
