import type { SecuritySummary, StoredCompanyProfile } from "./company-profile";
import type { ServedBy } from "./run/events";
import { RESEARCH_NOTE_STORAGE_KEY, servedByOf, type StoredResearchNote } from "./research-note";

export const ADVISORY_BRIEF_STORAGE_KEY = "fsi-demo-studio.advisory-brief";
export const ADVISORY_DISCLAIMER = "Demo brief — not advice";

/** A holding as the advisor enters it: weight is a percentage of the household (46 = 46%). */
export type HoldingInput = { ticker: string; weight: number };
export type HoldingMetric = {
  ticker: string;
  name?: string;
  /** Fraction of the household, as the service returns it. */
  weight: number;
  sector?: string;
  assetClass?: string;
  value?: number;
  trailingPE?: number | null;
  return_1y?: number | null;
  return_1y_spy?: number | null;
  return_1y_vs_spy?: number | null;
  sourceLabel?: string;
  status?: string;
  reason?: string;
};

export type SuitabilityFinding = { id: string; rule?: string; title?: string; severity: string; detail: string };

export type MeetingBriefBody = {
  status: string;
  reason?: string;
  opening?: string | null;
  agenda?: string[];
  discussion_points?: string[];
  suitability_callouts?: string[];
  citations?: Citation[];
  disclaimer?: string;
};

export type Citation = { field?: string; excerpt?: string; value?: string };

export type AdvisorySecurity = SecuritySummary & { forced?: boolean };

export type AdvisoryBriefResponse = {
  household?: { id: string; name: string; synthetic: boolean };
  holdings: HoldingMetric[];
  suitability: SuitabilityFinding[];
  brief: MeetingBriefBody;
  entitled?: { briefing?: boolean; research?: boolean };
  grounding?: { droppedClaims?: number };
  security?: AdvisorySecurity;
  telemetry?: { galileo?: string };
  durationMs?: number;
  perimeter?: string;
  disclaimer?: string;
  servedBy?: ServedBy | null;
  llmCalls?: number;
  runId?: string;
};

export type StoredAdvisoryBrief = {
  acceptedAt: string;
  holdings: HoldingInput[];
  brief: AdvisoryBriefResponse;
  householdId?: string;
  /** Set when the accepted brief is a recorded run rather than a live one. */
  recordedAt?: string;
};

/** A household card from GET /api/wealth/households. Every household is synthetic. */
export type HouseholdCard = {
  id: string;
  name: string;
  headline?: string;
  age?: number;
  riskProfile?: string;
  totalValue?: number;
  scenario?: string;
};

/** The parts of GET /api/wealth/households/{id} the picker uses. */
export type HouseholdRecord = HouseholdCard & {
  goals: string[];
  holdings: { ticker: string; weightPct: number; name?: string }[];
  ips?: { objective?: string; risk_tolerance?: string; horizon?: string };
  crmNotes: { date?: string; author?: string; text: string }[];
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function asString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  if (typeof value === "number" && Number.isFinite(value)) return String(value);
  return undefined;
}

function asNumber(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value === "string" && value.trim() && !Number.isNaN(Number(value))) return Number(value);
  return undefined;
}

function asArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

function readableStatus(value?: string) {
  return value ? value.replaceAll("_", " ") : undefined;
}

function normalizeSecurity(value: unknown): AdvisorySecurity | undefined {
  if (!isRecord(value)) return undefined;
  const status = readableStatus(asString(value.status));
  const mode = readableStatus(asString(value.mode));
  if (!status && !mode) return undefined;
  return {
    status,
    mode,
    verdict: readableStatus(asString(value.verdict) || status),
    failOpen: value.fail_open === true,
    checks: asNumber(value.checks),
    blocked: asNumber(value.blocked),
    errors: asNumber(value.errors),
    forced: value.forced === true,
  };
}

export function normalizeAdvisory(value: unknown): AdvisoryBriefResponse | null {
  if (!isRecord(value)) return null;
  const brief = isRecord(value.brief) ? value.brief : {};
  const holdings = asArray(value.holdings).map((item): HoldingMetric | null => {
    if (!isRecord(item) || !asString(item.ticker)) return null;
    return {
      ticker: asString(item.ticker)!.toUpperCase(),
      name: asString(item.name),
      weight: asNumber(item.weight) ?? 0,
      sector: asString(item.sector),
      assetClass: asString(item.asset_class),
      value: asNumber(item.value),
      trailingPE: asNumber(item.trailingPE ?? item.trailing_pe),
      return_1y: asNumber(item.return_1y ?? item.return1y),
      return_1y_spy: asNumber(item.return_1y_spy),
      return_1y_vs_spy: asNumber(item.return_1y_vs_spy),
      sourceLabel: isRecord(item.source) ? asString(item.source.label) : undefined,
      status: asString(item.status),
      reason: asString(item.reason),
    };
  }).filter((item): item is HoldingMetric => Boolean(item));
  if (!holdings.length && !asString(brief.status)) return null;
  const household = isRecord(value.household) && asString(value.household.id)
    ? { id: asString(value.household.id)!, name: asString(value.household.name) || asString(value.household.id)!, synthetic: value.household.synthetic === true }
    : undefined;
  return {
    household,
    holdings,
    suitability: asArray(value.suitability).map((item): SuitabilityFinding | null => {
      if (!isRecord(item)) return null;
      const id = asString(item.id);
      const detail = asString(item.detail);
      if (!id || !detail) return null;
      return { id, rule: asString(item.rule), title: asString(item.title), severity: asString(item.severity) || "medium", detail };
    }).filter((item): item is SuitabilityFinding => Boolean(item)),
    brief: {
      status: asString(brief.status) || "omitted",
      reason: asString(brief.reason),
      opening: asString(brief.opening) || null,
      agenda: asArray(brief.agenda).map(asString).filter((item): item is string => Boolean(item)),
      discussion_points: asArray(brief.discussion_points ?? brief.talking_points).map(asString).filter((item): item is string => Boolean(item)),
      suitability_callouts: asArray(brief.suitability_callouts).map(asString).filter((item): item is string => Boolean(item)),
      citations: asArray(brief.citations).map((item): Citation | null => {
        if (!isRecord(item)) return null;
        return { field: asString(item.field), excerpt: asString(item.excerpt), value: asString(item.value) };
      }).filter((item): item is Citation => Boolean(item)),
      disclaimer: asString(brief.disclaimer) || asString(value.disclaimer) || ADVISORY_DISCLAIMER,
    },
    entitled: isRecord(value.entitled) ? { briefing: value.entitled.briefing === true, research: value.entitled.research === true } : undefined,
    grounding: isRecord(value.grounding) ? { droppedClaims: asNumber(value.grounding.dropped_claims ?? value.grounding.droppedClaims) ?? 0 } : undefined,
    security: normalizeSecurity(value.security),
    telemetry: isRecord(value.telemetry) ? { galileo: asString(value.telemetry.galileo) } : undefined,
    durationMs: asNumber(value.duration_ms ?? value.durationMs),
    perimeter: asString(value.perimeter),
    disclaimer: asString(value.disclaimer) || ADVISORY_DISCLAIMER,
    servedBy: servedByOf(value.served_by),
    llmCalls: isRecord(value.usage) ? asNumber(value.usage.llm_calls) : undefined,
    runId: asString(value.run_id),
  };
}

export function loadAdvisoryBrief(): StoredAdvisoryBrief | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(ADVISORY_BRIEF_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const brief = normalizeAdvisory(parsed.brief ?? parsed);
    if (!brief) return null;
    // Briefs stored before weights were percentages kept fractions (0.25 = 25%).
    const scale = parsed.weightsUnit === "percent" ? 1 : 100;
    const holdings = asArray(parsed.holdings).map((item) => {
      if (!isRecord(item) || !asString(item.ticker)) return null;
      return { ticker: asString(item.ticker)!.toUpperCase(), weight: (asNumber(item.weight) ?? 0) * scale };
    }).filter((item): item is HoldingInput => Boolean(item));
    return {
      acceptedAt: asString(parsed.acceptedAt) || new Date().toISOString(),
      holdings: holdings.length ? holdings : brief.holdings.map((item) => ({ ticker: item.ticker, weight: Math.round(item.weight * 1000) / 10 })),
      brief,
      householdId: asString(parsed.householdId),
      recordedAt: asString(parsed.recordedAt),
    };
  } catch {
    return null;
  }
}

export function saveAdvisoryBrief(value: StoredAdvisoryBrief) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADVISORY_BRIEF_STORAGE_KEY, JSON.stringify({ ...value, weightsUnit: "percent" }));
}

export function clearAdvisoryBrief() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADVISORY_BRIEF_STORAGE_KEY);
}

export function defaultHoldings(profile?: StoredCompanyProfile | null, note?: StoredResearchNote | null): HoldingInput[] {
  const ticker = note?.ticker || profile?.company.ticker?.trim().toUpperCase();
  return ticker ? [{ ticker, weight: 25 }] : [{ ticker: "", weight: 25 }];
}

export function briefingPayload(profile?: StoredCompanyProfile | null) {
  return profile?.briefing || null;
}

export function researchPayload(note?: StoredResearchNote | null) {
  return note?.analyze || null;
}

function householdCard(value: Record<string, unknown>): HouseholdCard | null {
  const id = asString(value.id);
  const name = asString(value.name);
  if (!id || !name) return null;
  return {
    id, name,
    headline: asString(value.headline),
    age: asNumber(value.age),
    riskProfile: asString(value.risk_profile),
    totalValue: asNumber(value.total_value),
    scenario: asString(value.scenario),
  };
}

export async function fetchHouseholds(): Promise<HouseholdCard[]> {
  const response = await fetch("/api/wealth/households", { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Households are unavailable (${response.status}).`);
  const body = await response.json() as unknown;
  return asArray(isRecord(body) ? body.households : body).filter(isRecord).map(householdCard).filter((item): item is HouseholdCard => Boolean(item));
}

export async function fetchHousehold(id: string): Promise<HouseholdRecord> {
  const response = await fetch(`/api/wealth/households/${encodeURIComponent(id)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`That household is unavailable (${response.status}).`);
  const body = await response.json() as unknown;
  const card = isRecord(body) ? householdCard(body) : null;
  if (!isRecord(body) || !card) throw new Error("The household record is empty.");
  return {
    ...card,
    goals: asArray(body.goals).map(asString).filter((item): item is string => Boolean(item)),
    holdings: asArray(body.holdings).filter(isRecord).map((row) => ({
      ticker: (asString(row.ticker) || "").toUpperCase(), weightPct: asNumber(row.weight_pct) ?? 0, name: asString(row.name),
    })).filter((row) => row.ticker),
    ips: isRecord(body.ips) ? { objective: asString(body.ips.objective), risk_tolerance: asString(body.ips.risk_tolerance), horizon: asString(body.ips.horizon) } : undefined,
    crmNotes: asArray(body.crm_notes).filter(isRecord).map((note) => ({ date: asString(note.date), author: asString(note.author), text: asString(note.text) || "" })).filter((note) => note.text),
  };
}

/** The notes box text for a picked household (services/wealth/scripts/record_golden.py builds the same). */
export function notesFromHousehold(record: HouseholdRecord) {
  return [
    `Investment policy: ${record.ips?.objective}; risk tolerance ${record.ips?.risk_tolerance}; horizon ${record.ips?.horizon}.`,
    `Goals: ${record.goals.join(", ")}.`,
    "CRM notes:",
    ...record.crmNotes.map((note) => `- ${note.date} · ${note.author}: ${note.text}`),
  ].join("\n");
}

export function formatMoney(value?: number) {
  if (value == null) return "Not reported";
  if (Math.abs(value) >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (Math.abs(value) >= 1e3) return `$${Math.round(value / 1e3)}k`;
  return `$${Math.round(value)}`;
}

export { RESEARCH_NOTE_STORAGE_KEY };
