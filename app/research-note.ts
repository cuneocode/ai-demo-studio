import type { BriefingTheme, CompanyBriefingRecord, SecuritySummary, StoredCompanyProfile } from "./company-profile";

export const RESEARCH_NOTE_STORAGE_KEY = "fsi-demo-studio.research-note";
export const RESEARCH_DISCLAIMER = "Demo recommendation — not financial advice";
export const EXAMPLE_RESEARCH_TICKERS = ["JPM", "AAPL", "MSFT", "XOM"] as const;

export type ConflictRow = {
  id: string;
  severity: string;
  left: string;
  right: string;
  detail: string;
};

export type ResearchSource = {
  kind: "live" | "cache";
  fetchedAt?: string;
  label?: string;
  macro?: string | null;
  fresh?: boolean;
};

export type EarningsPanel = {
  status: string;
  beatRate?: number | null;
  observations?: number;
  beats?: number;
  latestSurprisePct?: number | null;
  revenue?: { latestYoy?: number | null; priorYoy?: number | null; decelerating?: boolean };
};

export type PeersPanel = {
  status: string;
  tickers?: string[];
  count?: number;
  sector?: string;
  industry?: string;
  subjectPe?: number | null;
  medianPe?: number | null;
  pePremium?: number | null;
};

export type ReturnsPanel = {
  status: string;
  asOf?: string;
  windows?: Record<string, { ticker?: number | null; spy?: number | null; excess?: number | null }>;
};

export type MacroPanel = {
  status: string;
  reason?: string;
  series?: Record<string, { label?: string; latest?: number | null; asOf?: string; direction?: string }>;
};

export type ResearchNoteBody = {
  status: string;
  reason?: string;
  summary?: string | null;
  bullets?: string[];
  citations?: { field?: string; excerpt?: string; value?: string }[];
};

export type ResearchRecommendation = {
  status: string;
  reason?: string;
  action?: string | null;
  thesis?: string | null;
  disclaimer?: string;
};

export type SplunkStatus = {
  status?: string;
  serviceName?: string;
  missing?: string[];
  export?: string;
};

export type ObservabilityStatus = {
  tracing?: { status?: string; transport?: string; stream?: string };
  evaluators?: { status?: string; names?: string[]; results?: string };
  controls?: { status?: string };
};

export type ResearchAnalyze = {
  ticker: string;
  company: { name?: string; ticker?: string; sector?: string; industry?: string };
  source: ResearchSource;
  earnings: EarningsPanel;
  peers: PeersPanel;
  returns: ReturnsPanel;
  macro: MacroPanel;
  conflicts: ConflictRow[];
  note: ResearchNoteBody;
  recommendation: ResearchRecommendation;
  grounding?: { droppedClaims?: number };
  security?: SecuritySummary;
  telemetry?: { splunk?: SplunkStatus; galileo?: string };
  durationMs?: number;
  perimeter?: string;
  disclaimer?: string;
};

export type StoredResearchNote = {
  ticker: string;
  acceptedAt: string;
  analyze: ResearchAnalyze;
};

export type WealthHealth = {
  ready?: boolean;
  model?: string;
  detail?: string;
  nim?: { status?: string; base_url?: string; model?: string };
  yahoo?: { status?: string };
  fred?: { status?: string };
  cache?: { root?: string };
  security?: SecuritySummary;
  galileo?: string;
  splunk?: SplunkStatus;
  observability?: ObservabilityStatus;
  perimeter?: string;
  disclaimer?: string;
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
  const verdict = readableStatus(asString(value.verdict) || asString(value.decision) || status);
  if (!status && !mode && !verdict) return undefined;
  return {
    status,
    mode,
    verdict,
    failOpen: value.fail_open === true || value.failOpen === true,
    checks: asNumber(value.checks),
    blocked: asNumber(value.blocked),
    errors: asNumber(value.errors),
  };
}

export function normalizeSplunk(value: unknown): SplunkStatus | undefined {
  if (!isRecord(value)) return undefined;
  const status = asString(value.status);
  if (!status) return undefined;
  return {
    status,
    serviceName: asString(value.service_name ?? value.serviceName),
    missing: asArray(value.missing).map(asString).filter((item): item is string => Boolean(item)),
    export: asString(value.export),
  };
}

export function observabilityLabel(health?: WealthHealth | null) {
  const status = health?.observability?.tracing?.status || health?.galileo;
  if (!status || status === "disabled" || status === "not_configured" || status === "missing_configuration") {
    return "Not configured";
  }
  if (status === "configured" || status === "traces_present" || status === "awaiting_traces") return "Configured";
  return readableStatus(status) || "Not configured";
}

export function splunkLabel(splunk?: SplunkStatus | null) {
  if (!splunk?.status || splunk.status === "missing_configuration") return "Not configured";
  return readableStatus(splunk.status) || "Not configured";
}

export function formatPct(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return "Not reported";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value?: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "Not reported";
  return value.toFixed(digits);
}

export function parseApiError(text: string, status: number) {
  try {
    const body = JSON.parse(text) as unknown;
    if (isRecord(body)) {
      const detail = body.detail;
      if (typeof detail === "string") return detail;
      if (isRecord(detail)) return asString(detail.message) || asString(detail.detail) || `Request failed (${status}).`;
    }
  } catch {
    /* non-JSON */
  }
  return text.trim() || `Request failed (${status}).`;
}

export function normalizeWealthHealth(value: unknown): WealthHealth | null {
  if (!isRecord(value)) return null;
  const nim = isRecord(value.nim) ? value.nim : undefined;
  const fred = isRecord(value.fred) ? value.fred : undefined;
  return {
    ready: value.ready === true,
    model: asString(value.model) || asString(nim?.model),
    detail: asString(value.detail) || asString(value.error),
    nim: nim ? { status: readableStatus(asString(nim.status)), base_url: asString(nim.base_url), model: asString(nim.model) } : undefined,
    yahoo: isRecord(value.yahoo) ? { status: readableStatus(asString(value.yahoo.status)) } : { status: "not asserted" },
    fred: fred ? { status: readableStatus(asString(fred.status)) } : { status: "absent" },
    cache: isRecord(value.cache) ? { root: asString(value.cache.root) } : undefined,
    security: normalizeSecurity(value.security),
    galileo: asString(value.galileo),
    splunk: normalizeSplunk(value.splunk),
    observability: isRecord(value.observability) ? {
      tracing: isRecord(value.observability.tracing) ? {
        status: asString(value.observability.tracing.status),
        transport: asString(value.observability.tracing.transport),
        stream: asString(value.observability.tracing.stream),
      } : undefined,
      evaluators: isRecord(value.observability.evaluators) ? {
        status: asString(value.observability.evaluators.status),
        results: asString(value.observability.evaluators.results),
      } : undefined,
      controls: isRecord(value.observability.controls) ? { status: asString(value.observability.controls.status) } : undefined,
    } : undefined,
    perimeter: asString(value.perimeter) || "Yahoo + FRED allowlist only",
    disclaimer: asString(value.disclaimer) || RESEARCH_DISCLAIMER,
  };
}

function normalizeSource(value: unknown): ResearchSource {
  if (!isRecord(value)) return { kind: "live" };
  const kind = asString(value.kind) === "cache" ? "cache" : "live";
  return {
    kind,
    fetchedAt: asString(value.fetchedAt) || asString(value.fetched_at),
    label: asString(value.label) || "Yahoo Finance",
    macro: asString(value.macro),
    fresh: value.fresh === true,
  };
}

function normalizeConflicts(value: unknown): ConflictRow[] {
  return asArray(value).map((item) => {
    if (!isRecord(item)) return null;
    const id = asString(item.id);
    const left = asString(item.left);
    const right = asString(item.right);
    if (!id || !left || !right) return null;
    return {
      id,
      severity: asString(item.severity) || "medium",
      left,
      right,
      detail: asString(item.detail) || "",
    };
  }).filter((item): item is ConflictRow => Boolean(item));
}

export function normalizeAnalyze(value: unknown, fallbackTicker?: string): ResearchAnalyze | null {
  if (!isRecord(value)) return null;
  const ticker = (asString(value.ticker) || fallbackTicker || "").toUpperCase();
  if (!ticker) return null;
  const company = isRecord(value.company) ? value.company : {};
  const earnings = isRecord(value.earnings) ? value.earnings : {};
  const peers = isRecord(value.peers) ? value.peers : {};
  const returns = isRecord(value.returns) ? value.returns : {};
  const macro = isRecord(value.macro) ? value.macro : {};
  const note = isRecord(value.note) ? value.note : {};
  const recommendation = isRecord(value.recommendation) ? value.recommendation : {};
  const revenue = isRecord(earnings.revenue) ? earnings.revenue : {};
  const grounding = isRecord(value.grounding) ? value.grounding : undefined;
  return {
    ticker,
    company: {
      name: asString(company.name) || ticker,
      ticker,
      sector: asString(company.sector),
      industry: asString(company.industry),
    },
    source: normalizeSource(value.source),
    earnings: {
      status: asString(earnings.status) || "absent",
      beatRate: asNumber(earnings.beatRate ?? earnings.beat_rate),
      observations: asNumber(earnings.observations),
      beats: asNumber(earnings.beats),
      latestSurprisePct: asNumber(earnings.latestSurprisePct ?? earnings.latest_surprise_pct),
      revenue: {
        latestYoy: asNumber(revenue.latestYoy ?? revenue.latest_yoy),
        priorYoy: asNumber(revenue.priorYoy ?? revenue.prior_yoy),
        decelerating: revenue.decelerating === true,
      },
    },
    peers: {
      status: asString(peers.status) || "absent",
      tickers: asArray(peers.tickers).map(asString).filter((item): item is string => Boolean(item)),
      count: asNumber(peers.count),
      sector: asString(peers.sector),
      industry: asString(peers.industry),
      subjectPe: asNumber(peers.subjectPe ?? peers.subject_pe),
      medianPe: asNumber(peers.medianPe ?? peers.median_pe),
      pePremium: asNumber(peers.pePremium ?? peers.pe_premium),
    },
    returns: {
      status: asString(returns.status) || "absent",
      asOf: asString(returns.asOf ?? returns.as_of),
      windows: isRecord(returns.windows)
        ? Object.fromEntries(Object.entries(returns.windows).map(([key, window]) => {
          const row = isRecord(window) ? window : {};
          return [key, { ticker: asNumber(row.ticker), spy: asNumber(row.spy), excess: asNumber(row.excess) }];
        }))
        : {},
    },
    macro: {
      status: asString(macro.status) || "absent",
      reason: asString(macro.reason),
      series: isRecord(macro.series)
        ? Object.fromEntries(Object.entries(macro.series).map(([key, item]) => {
          const row = isRecord(item) ? item : {};
          return [key, { label: asString(row.label) || key, latest: asNumber(row.latest), asOf: asString(row.asOf ?? row.as_of), direction: asString(row.direction) }];
        }))
        : {},
    },
    conflicts: normalizeConflicts(value.conflicts),
    note: {
      status: asString(note.status) || "omitted",
      reason: asString(note.reason),
      summary: asString(note.summary) || null,
      bullets: asArray(note.bullets).map(asString).filter((item): item is string => Boolean(item)),
      citations: asArray(note.citations).map((item) => {
        if (!isRecord(item)) return null;
        return { field: asString(item.field), excerpt: asString(item.excerpt), value: asString(item.value) };
      }).filter((item): item is { field?: string; excerpt?: string; value?: string } => Boolean(item)),
    },
    recommendation: {
      status: asString(recommendation.status) || "omitted",
      reason: asString(recommendation.reason),
      action: asString(recommendation.action) || null,
      thesis: asString(recommendation.thesis) || null,
      disclaimer: asString(recommendation.disclaimer) || asString(value.disclaimer) || RESEARCH_DISCLAIMER,
    },
    grounding: grounding ? { droppedClaims: asNumber(grounding.dropped_claims ?? grounding.droppedClaims) ?? 0 } : undefined,
    security: normalizeSecurity(value.security),
    telemetry: isRecord(value.telemetry) ? {
      splunk: normalizeSplunk(value.telemetry.splunk),
      galileo: asString(value.telemetry.galileo),
    } : undefined,
    durationMs: asNumber(value.duration_ms ?? value.durationMs),
    perimeter: asString(value.perimeter),
    disclaimer: asString(value.disclaimer) || RESEARCH_DISCLAIMER,
  };
}

export function loadResearchNote(): StoredResearchNote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESEARCH_NOTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed)) return null;
    const analyze = normalizeAnalyze(parsed.analyze ?? parsed);
    if (!analyze) return null;
    return {
      ticker: (asString(parsed.ticker) || analyze.ticker).toUpperCase(),
      acceptedAt: asString(parsed.acceptedAt) || asString(parsed.accepted_at) || new Date().toISOString(),
      analyze,
    };
  } catch {
    return null;
  }
}

export function saveResearchNote(note: StoredResearchNote) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESEARCH_NOTE_STORAGE_KEY, JSON.stringify(note));
}

export function clearResearchNote() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RESEARCH_NOTE_STORAGE_KEY);
}

export function tickerFromProfile(profile?: StoredCompanyProfile | null) {
  return profile?.company.ticker?.trim().toUpperCase() || "";
}

export function entitledThemes(briefing?: CompanyBriefingRecord | null): BriefingTheme[] {
  if (!briefing) return [];
  return [briefing.objectives, briefing.risks, briefing.regulatory, briefing.aiInitiatives];
}

export function switcherContextLabel(profile: StoredCompanyProfile | null | undefined, note: StoredResearchNote | null | undefined, briefExists?: boolean) {
  const name = profile?.company.name;
  if (!name) return briefExists || note ? "Select a company · studio context" : "Select a company";
  const ticker = profile?.company.ticker?.trim();
  const base = ticker ? `${name} (${ticker})` : name;
  const extras = [];
  if (note && ticker && note.ticker === ticker.toUpperCase()) extras.push("note");
  if (briefExists) extras.push("brief");
  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}
