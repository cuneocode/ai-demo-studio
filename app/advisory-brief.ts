import { readStored, writeStored, removeStored } from "./studio/storage.ts";
import type { StoredCompanyProfile } from "./company-profile";
import {
  RESEARCH_NOTE_STORAGE_KEY, normalizeClaims, normalizeEvaluation, normalizeEvidence, normalizePolicy, normalizeSecurity, normalizeUsage,
  normalizeWithheld, servedByOf, type Claim, type Evaluation, type EvidenceItem, type PolicyResult, type Usage, type WithheldItem,
} from "./research-note";
import type { SecuritySummary } from "./company-profile";
import type { ServedBy } from "./run/events";

export const ADVISORY_BRIEF_STORAGE_KEY = "fsi-demo-studio.advisory-brief";
export const ADVISOR = "Jordan Lee · advisor";
export const SUPERVISOR = "Morgan Patel · supervising principal";

export type HouseholdCard = { id: string; name: string; headline?: string; age?: number; riskProfile?: string; totalValue?: number; scenario?: string; serviceEvent?: string };

export type Holding = {
  ticker: string; name?: string; weight: number; value?: number; assetClass?: string; account?: string; status: string;
  return1y?: number; return1ySpy?: number; sourceKind?: string;
};

export type CrmNote = {
  index: number; date?: string; author?: string; text: string; status: "kept" | "masked" | "withheld" | string; reason?: string;
  masked: { entity: string; by: string }[]; aiDefense?: string; aiDefenseRules: string[];
};

export type Finding = {
  id: string; rule?: string; title: string; severity: string; category: string; detail: string; regBi?: string;
};

export type NextBestAction = {
  id: string; type?: string; title: string; summary: string; rules: string[]; dollars?: number; dollarsDisplay?: string; dollarsLabel?: string;
  suitable: boolean; fit: string; cautions: string[];
};

export type BriefLine = Claim;

export type MeetingBrief = {
  status: string; mode: string; modeLabel: string; reason?: string; refused: boolean; lines: BriefLine[]; actionIds: string[];
  droppedActions: { actionId: string; reason: string }[]; counts: { claims: number; verified: number; unverified: number; policy: number };
};

export type ApprovalState = {
  status: "awaiting_advisor" | "awaiting_supervisor" | "returned" | "sent" | "denied" | "rejected" | "unavailable" | string;
  advisor?: { by: string; at: string }; supervisor?: { by: string; at: string }; actionIds: string[]; controls?: PolicyResult;
  findings: string[]; originLabel?: string; reason?: string; simulated?: boolean;
};

export type ResearchContextRef = { origin?: string; ticker?: string; rating?: string; impact?: string; claims?: number };

export type MeetingPrep = {
  household?: { id: string; name: string; riskProfile?: string; totalValue?: number; headline?: string; age?: number; horizonYears?: number; goals: string[]; affiliate: boolean; employerTicker?: string };
  holdings: Holding[];
  notes: CrmNote[];
  suitability: Finding[];
  actions: NextBestAction[];
  addressableDisplay?: string;
  context: { research?: ResearchContextRef | null; issuerPolicy: boolean; briefing: boolean };
  evidence: EvidenceItem[];
  withheld: WithheldItem[];
  brief: MeetingBrief;
  compliance: string[];
  approval: ApprovalState;
  security?: SecuritySummary & { forced?: boolean };
  usage?: Usage;
  evaluation?: Evaluation;
  servedBy?: ServedBy | null;
  runId?: string;
  durationMs?: number;
  disclaimer: string;
};

export type StoredAdvisoryBrief = {
  acceptedAt: string;
  householdId?: string;
  householdName?: string;
  brief: MeetingPrep;
  recordedAt?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);
const asString = (value: unknown): string | undefined =>
  typeof value === "string" && value.trim() ? value.trim() : typeof value === "number" && Number.isFinite(value) ? String(value) : undefined;
const asNumber = (value: unknown): number | undefined => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const strings = (value: unknown) => asArray(value).map(asString).filter((item): item is string => Boolean(item));

function normalizeApproval(value: unknown): ApprovalState {
  if (!isRecord(value)) return { status: "unavailable", actionIds: [], findings: [] };
  const stamp = (row: unknown) => (isRecord(row) && asString(row.by) ? { by: asString(row.by)!, at: asString(row.at) || "" } : undefined);
  return {
    status: asString(value.status) || "unavailable", advisor: stamp(value.advisor), supervisor: stamp(value.supervisor),
    actionIds: strings(value.action_ids ?? value.actions), controls: normalizePolicy(value.controls), findings: strings(value.findings),
    originLabel: asString(value.origin_label), reason: asString(value.reason), simulated: value.simulated === true,
  };
}

export { normalizeApproval };

export function normalizeMeetingPrep(value: unknown): MeetingPrep | null {
  if (!isRecord(value)) return null;
  const household = isRecord(value.household) ? value.household : undefined;
  const brief = isRecord(value.brief) ? value.brief : {};
  const counts = isRecord(brief.counts) ? brief.counts : {};
  const context = isRecord(value.context) ? value.context : {};
  const research = isRecord(context.research) ? context.research : null;
  const compliance = isRecord(value.compliance) ? value.compliance : {};
  return {
    household: household && asString(household.id) ? {
      id: asString(household.id)!, name: asString(household.name) || "", riskProfile: asString(household.risk_profile), totalValue: asNumber(household.total_value),
      headline: asString(household.headline), age: asNumber(household.age), horizonYears: asNumber(household.horizon_years), goals: strings(household.goals),
      affiliate: household.affiliate === true, employerTicker: asString(household.employer_ticker),
    } : undefined,
    holdings: asArray(value.holdings).filter(isRecord).map((row) => ({
      ticker: asString(row.ticker) || "", name: asString(row.name), weight: asNumber(row.weight) ?? 0, value: asNumber(row.value), assetClass: asString(row.asset_class),
      account: asString(row.account), status: asString(row.status) || "ready", return1y: asNumber(row.return_1y), return1ySpy: asNumber(row.return_1y_spy),
      sourceKind: isRecord(row.source) ? asString(row.source.kind) : undefined,
    })),
    notes: asArray(value.notes).filter(isRecord).map((row) => ({
      index: asNumber(row.index) ?? 0, date: asString(row.date), author: asString(row.author), text: asString(row.text) || "", status: asString(row.status) || "kept",
      reason: asString(row.reason), aiDefense: asString(row.ai_defense), aiDefenseRules: strings(row.ai_defense_rules),
      masked: asArray(row.masked).filter(isRecord).map((item) => ({ entity: asString(item.entity) || "PII", by: asString(item.by) || "" })),
    })),
    suitability: asArray(value.suitability).filter(isRecord).map((row) => ({
      id: asString(row.id) || "", rule: asString(row.rule), title: asString(row.title) || "", severity: asString(row.severity) || "info",
      category: asString(row.category) || "suitability", detail: asString(row.detail) || "", regBi: asString(row.reg_bi),
    })),
    actions: asArray(value.actions).filter(isRecord).map((row) => ({
      id: asString(row.id) || "", type: asString(row.type), title: asString(row.title) || "", summary: asString(row.summary) || "", rules: strings(row.rules),
      dollars: asNumber(row.dollars), dollarsDisplay: asString(row.dollars_display), dollarsLabel: asString(row.dollars_label),
      suitable: row.suitable !== false, fit: asString(row.fit) || "", cautions: strings(row.cautions),
    })),
    addressableDisplay: asString(value.addressable_display),
    context: {
      research: research ? { origin: asString(research.origin), ticker: asString(research.ticker), rating: asString(research.rating), impact: asString(research.impact), claims: asNumber(research.claims) } : null,
      issuerPolicy: context.issuer_policy === true, briefing: context.briefing === true,
    },
    evidence: normalizeEvidence(value.evidence),
    withheld: normalizeWithheld(value.withheld),
    brief: {
      status: asString(brief.status) || "unavailable", mode: asString(brief.mode) || "none", modeLabel: asString(brief.mode_label) || "No brief drafted",
      reason: asString(brief.reason), refused: brief.refused === true, lines: normalizeClaims(brief.lines), actionIds: strings(brief.action_ids),
      droppedActions: asArray(brief.dropped_actions).filter(isRecord).map((row) => ({ actionId: asString(row.action_id) || "", reason: asString(row.reason) || "" })),
      counts: { claims: asNumber(counts.claims) ?? 0, verified: asNumber(counts.verified) ?? 0, unverified: asNumber(counts.unverified) ?? 0, policy: asNumber(counts.policy) ?? 0 },
    },
    compliance: strings(compliance.findings),
    approval: normalizeApproval(value.approval),
    security: normalizeSecurity(value.security) ? { ...normalizeSecurity(value.security)!, forced: isRecord(value.security) && value.security.forced === true } : undefined,
    usage: normalizeUsage(value.usage),
    evaluation: normalizeEvaluation(value.evaluation),
    servedBy: servedByOf(value.served_by),
    runId: asString(value.run_id),
    durationMs: asNumber(value.duration_ms),
    disclaimer: asString(value.disclaimer) || "Synthetic client data for demonstration only. Not investment, tax, or legal advice.",
  };
}

export function loadAdvisoryBrief(): StoredAdvisoryBrief | null {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(readStored(window.localStorage, ADVISORY_BRIEF_STORAGE_KEY) || "null") as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.brief) || !isRecord(parsed.brief.brief)) return null;
    const brief = normalizeMeetingPrep(parsed.brief);
    if (!brief) return null;
    return { acceptedAt: asString(parsed.acceptedAt) || new Date().toISOString(), householdId: asString(parsed.householdId),
      householdName: asString(parsed.householdName), brief, recordedAt: asString(parsed.recordedAt) };
  } catch {
    return null;
  }
}

/** Stores the raw service body so a reload normalizes it the same way. */
export function saveAdvisoryBrief(value: Omit<StoredAdvisoryBrief, "brief">, raw: unknown) {
  if (typeof window === "undefined") return;
  writeStored(window.localStorage, ADVISORY_BRIEF_STORAGE_KEY, JSON.stringify({ ...value, brief: raw }));
}

export function clearAdvisoryBrief() {
  if (typeof window === "undefined") return;
  removeStored(window.localStorage, ADVISORY_BRIEF_STORAGE_KEY);
}

/** What the meeting-prep run gets from the Company briefing demo: who it covered, not the whole record. */
export function briefingPayload(profile?: StoredCompanyProfile | null) {
  const company = profile?.company;
  return company?.name ? { company: company.name, ticker: company.ticker, period: profile?.period } : null;
}

function householdCard(value: Record<string, unknown>): HouseholdCard | null {
  const id = asString(value.id);
  const name = asString(value.name);
  if (!id || !name) return null;
  return { id, name, headline: asString(value.headline), age: asNumber(value.age), riskProfile: asString(value.risk_profile),
    totalValue: asNumber(value.total_value), scenario: asString(value.scenario), serviceEvent: asString(value.service_event) };
}

export async function fetchHouseholds(): Promise<HouseholdCard[]> {
  const response = await fetch("/api/studio/examples/wealth/households", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Households are unavailable (${response.status}).`);
  const body = await response.json() as unknown;
  return asArray(isRecord(body) ? body.households : body).filter(isRecord).map(householdCard).filter((item): item is HouseholdCard => Boolean(item));
}

export function formatMoney(value?: number) {
  if (value == null) return "Not reported";
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

export const LINE_SECTIONS: { id: string; label: string }[] = [
  { id: "opening", label: "Opening" }, { id: "agenda", label: "Agenda" }, { id: "callout", label: "Suitability callouts" },
  { id: "talking_point", label: "Talking points" }, { id: "rationale", label: "Best-interest rationale" }, { id: "question", label: "Questions for the client" },
];

/** Households a recorded golden run exists for (services/wealth/data/recorded/advisory-<id>.json). */
export const RECORDED_HOUSEHOLDS = new Set(["chuck-robbins", "okafor", "priya-raman"]);

export { RESEARCH_NOTE_STORAGE_KEY };
