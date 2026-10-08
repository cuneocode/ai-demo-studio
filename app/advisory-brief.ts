import type { SecuritySummary, StoredCompanyProfile } from "./company-profile";
import { RESEARCH_NOTE_STORAGE_KEY, type StoredResearchNote } from "./research-note";

export const ADVISORY_BRIEF_STORAGE_KEY = "fsi-demo-studio.advisory-brief";
export const ADVISORY_DISCLAIMER = "Demo brief — not advice";

export type HoldingInput = { ticker: string; weight: number };
export type HoldingMetric = {
  ticker: string;
  name?: string;
  weight: number;
  sector?: string;
  trailingPE?: number | null;
  return_1y?: number | null;
  return_1y_vs_spy?: number | null;
  status?: string;
  reason?: string;
};

export type SuitabilityFinding = { id: string; severity: string; detail: string };

export type MeetingBriefBody = {
  status: string;
  reason?: string;
  opening?: string | null;
  agenda?: string[];
  discussion_points?: string[];
  suitability_callouts?: string[];
  citations?: { field?: string; excerpt?: string; value?: string }[];
  disclaimer?: string;
};

export type AdvisoryBriefResponse = {
  holdings: HoldingMetric[];
  suitability: SuitabilityFinding[];
  brief: MeetingBriefBody;
  entitled?: { briefing?: boolean; research?: boolean };
  grounding?: { droppedClaims?: number };
  security?: SecuritySummary;
  telemetry?: { galileo?: string };
  durationMs?: number;
  perimeter?: string;
  disclaimer?: string;
};

export type StoredAdvisoryBrief = {
  acceptedAt: string;
  holdings: HoldingInput[];
  brief: AdvisoryBriefResponse;
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

function normalizeSecurity(value: unknown): SecuritySummary | undefined {
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
  };
}

export function normalizeAdvisory(value: unknown): AdvisoryBriefResponse | null {
  if (!isRecord(value)) return null;
  const brief = isRecord(value.brief) ? value.brief : {};
  const holdings = asArray(value.holdings).map((item) => {
    if (!isRecord(item) || !asString(item.ticker)) return null;
    return {
      ticker: asString(item.ticker)!.toUpperCase(),
      name: asString(item.name),
      weight: asNumber(item.weight) ?? 0,
      sector: asString(item.sector),
      trailingPE: asNumber(item.trailingPE ?? item.trailing_pe),
      return_1y: asNumber(item.return_1y ?? item.return1y),
      return_1y_vs_spy: asNumber(item.return_1y_vs_spy),
      status: asString(item.status),
      reason: asString(item.reason),
    };
  }).filter((item): item is HoldingMetric => Boolean(item));
  if (!holdings.length && !asString(brief.status)) return null;
  return {
    holdings,
    suitability: asArray(value.suitability).map((item) => {
      if (!isRecord(item)) return null;
      const id = asString(item.id);
      const detail = asString(item.detail);
      if (!id || !detail) return null;
      return { id, severity: asString(item.severity) || "medium", detail };
    }).filter((item): item is SuitabilityFinding => Boolean(item)),
    brief: {
      status: asString(brief.status) || "omitted",
      reason: asString(brief.reason),
      opening: asString(brief.opening) || null,
      agenda: asArray(brief.agenda).map(asString).filter((item): item is string => Boolean(item)),
      discussion_points: asArray(brief.discussion_points ?? brief.talking_points).map(asString).filter((item): item is string => Boolean(item)),
      suitability_callouts: asArray(brief.suitability_callouts).map(asString).filter((item): item is string => Boolean(item)),
      citations: asArray(brief.citations).map((item) => {
        if (!isRecord(item)) return null;
        return { field: asString(item.field), excerpt: asString(item.excerpt), value: asString(item.value) };
      }).filter((item): item is { field?: string; excerpt?: string; value?: string } => Boolean(item)),
      disclaimer: asString(brief.disclaimer) || asString(value.disclaimer) || ADVISORY_DISCLAIMER,
    },
    entitled: isRecord(value.entitled) ? { briefing: value.entitled.briefing === true, research: value.entitled.research === true } : undefined,
    grounding: isRecord(value.grounding) ? { droppedClaims: asNumber(value.grounding.dropped_claims ?? value.grounding.droppedClaims) ?? 0 } : undefined,
    security: normalizeSecurity(value.security),
    telemetry: isRecord(value.telemetry) ? { galileo: asString(value.telemetry.galileo) } : undefined,
    durationMs: asNumber(value.duration_ms ?? value.durationMs),
    perimeter: asString(value.perimeter),
    disclaimer: asString(value.disclaimer) || ADVISORY_DISCLAIMER,
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
    const holdings = asArray(parsed.holdings).map((item) => {
      if (!isRecord(item) || !asString(item.ticker)) return null;
      return { ticker: asString(item.ticker)!.toUpperCase(), weight: asNumber(item.weight) ?? 0 };
    }).filter((item): item is HoldingInput => Boolean(item));
    return {
      acceptedAt: asString(parsed.acceptedAt) || new Date().toISOString(),
      holdings: holdings.length ? holdings : brief.holdings.map((item) => ({ ticker: item.ticker, weight: item.weight })),
      brief,
    };
  } catch {
    return null;
  }
}

export function saveAdvisoryBrief(value: StoredAdvisoryBrief) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(ADVISORY_BRIEF_STORAGE_KEY, JSON.stringify(value));
}

export function clearAdvisoryBrief() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(ADVISORY_BRIEF_STORAGE_KEY);
}

export function defaultHoldings(profile?: StoredCompanyProfile | null, note?: StoredResearchNote | null): HoldingInput[] {
  const ticker = note?.ticker || profile?.company.ticker?.trim().toUpperCase();
  return ticker ? [{ ticker, weight: 0.25 }] : [{ ticker: "", weight: 0.25 }];
}

export function briefingPayload(profile?: StoredCompanyProfile | null) {
  return profile?.briefing || null;
}

export function researchPayload(note?: StoredResearchNote | null) {
  return note?.analyze || null;
}

export { RESEARCH_NOTE_STORAGE_KEY };
