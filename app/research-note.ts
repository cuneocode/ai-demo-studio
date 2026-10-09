import type { BriefingTheme, CompanyBriefingRecord, SecuritySummary, StoredCompanyProfile } from "./company-profile";
import type { RunEvent, RunInfo, ServedBy } from "./run/events";

export const RESEARCH_NOTE_STORAGE_KEY = "fsi-demo-studio.research-note";
export const RESEARCH_DISCLAIMER = "Demo research — not financial advice";

/** Example chips. services/wealth/scripts/warm_cache.py reads the tickers from this list. */
export const EXAMPLE_RESEARCH_TICKERS: readonly { ticker: string; tag?: string; title?: string }[] = [
  { ticker: "HCYN", tag: "Fictional", title: "Halcyon Interconnect, Inc. · fictional issuer, synthetic data" },
  { ticker: "NVDA" },
  { ticker: "JPM" },
  { ticker: "MSFT" },
  { ticker: "AAPL" },
  { ticker: "XOM" },
];

/** Audience titles for signal-divergence ids (services/wealth/tools/conflicts.py TITLES), for older stored notes. */
export const DIVERGENCE_TITLES: Record<string, string> = {
  beat_vs_spy: "Earnings beats vs. a lagging stock",
  pe_vs_growth: "Valuation premium vs. slowing growth",
  macro_vs_sector: "Rates or inflation vs. a rate-sensitive sector",
};

export type ConflictRow = {
  id: string;
  title: string;
  severity: string;
  left: string;
  right: string;
  detail: string;
};

export type ResearchSource = {
  /** live and cache are Yahoo; fixture is a committed snapshot; fictional is a synthetic issuer. */
  kind: "live" | "cache" | "fixture" | "fictional";
  fetchedAt?: string;
  label?: string;
  asOf?: string;
  fictional?: boolean;
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

export type HouseView = { rating?: string; owner?: string; asOf?: string; focusList?: boolean; thesisPoints: string[]; keyRisks: string[]; synthetic?: boolean };
export type EarningsEvent = { period?: string; date?: string; epsActual?: number; epsEstimate?: number; guidanceChange?: string; whatChanged: string[]; source?: string };
export type AffectedHouseholds = { households?: number; count?: number; concentrated?: number; executives?: number; thresholdPct?: number };
export type ResearchContext = { houseView?: HouseView; restricted?: { reason?: string; since?: string }; event?: EarningsEvent; affected?: AffectedHouseholds };

export type ResearchNoteBody = {
  status: string;
  reason?: string;
  summary?: string | null;
  bullets?: string[];
  citations?: Citation[];
};

export type Citation = { field?: string; excerpt?: string; value?: string };

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
  context?: ResearchContext;
  servedBy?: ServedBy | null;
  runId?: string;
};

export type StoredResearchNote = {
  ticker: string;
  acceptedAt: string;
  analyze: ResearchAnalyze;
  /** Set when the accepted note is a recorded run rather than a live one. */
  recordedAt?: string;
};

export type ModelHealth = { status?: string; base_url?: string; model?: string; label?: string; private?: boolean; fallback?: boolean; reason?: string };

export type WealthHealth = {
  ready?: boolean;
  model?: string;
  detail?: string;
  nim?: ModelHealth;
  advisoryModel?: ModelHealth;
  /** How client data may reach a hosted model: "allowed with AI Defense enforce" or "refused: …". */
  advisoryHostedFallback?: string;
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

function modelHealth(value: unknown): ModelHealth | undefined {
  if (!isRecord(value)) return undefined;
  return {
    status: readableStatus(asString(value.status)), base_url: asString(value.base_url), model: asString(value.model),
    label: asString(value.label), private: value.private === true, fallback: value.fallback === true, reason: asString(value.reason),
  };
}

export function normalizeWealthHealth(value: unknown): WealthHealth | null {
  if (!isRecord(value)) return null;
  const nim = isRecord(value.nim) ? value.nim : undefined;
  const fred = isRecord(value.fred) ? value.fred : undefined;
  return {
    ready: value.ready === true,
    model: asString(value.model) || asString(nim?.model),
    detail: asString(value.detail) || asString(value.error),
    nim: modelHealth(nim),
    advisoryModel: modelHealth(value.advisory_model),
    advisoryHostedFallback: asString(value.advisory_hosted_fallback),
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

const SOURCE_KINDS = new Set<ResearchSource["kind"]>(["live", "cache", "fixture", "fictional"]);

function normalizeSource(value: unknown): ResearchSource {
  if (!isRecord(value)) return { kind: "live" };
  const raw = asString(value.kind) as ResearchSource["kind"] | undefined;
  const kind = raw && SOURCE_KINDS.has(raw) ? raw : "live";
  return {
    kind,
    fetchedAt: asString(value.fetchedAt) || asString(value.fetched_at),
    label: asString(value.label) || "Yahoo Finance",
    asOf: asString(value.asOf) || asString(value.as_of),
    fictional: value.fictional === true || kind === "fictional",
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
      title: asString(item.title) || DIVERGENCE_TITLES[id] || "Signal divergence",
      severity: asString(item.severity) || "medium",
      left,
      right,
      detail: asString(item.detail) || "",
    };
  }).filter((item): item is ConflictRow => Boolean(item));
}

const strings = (value: unknown) => asArray(value).map(asString).filter((item): item is string => Boolean(item));

function normalizeContext(value: unknown): ResearchContext | undefined {
  if (!isRecord(value)) return undefined;
  const view = isRecord(value.house_view) ? value.house_view : undefined;
  const restricted = isRecord(value.restricted) ? value.restricted : undefined;
  const event = isRecord(value.event) ? value.event : undefined;
  const affected = isRecord(value.affected_households) ? value.affected_households : undefined;
  return {
    houseView: view ? {
      rating: asString(view.rating), owner: asString(view.owner), asOf: asString(view.as_of), focusList: view.focus_list === true,
      thesisPoints: strings(view.thesis_points), keyRisks: strings(view.key_risks), synthetic: view.synthetic === true,
    } : undefined,
    restricted: restricted ? { reason: asString(restricted.reason), since: asString(restricted.since) } : undefined,
    event: event ? {
      period: asString(event.period), date: asString(event.date), epsActual: asNumber(event.eps_actual), epsEstimate: asNumber(event.eps_estimate),
      guidanceChange: asString(event.guidance_change), whatChanged: strings(event.what_changed), source: asString(event.source),
    } : undefined,
    affected: affected ? {
      households: asNumber(affected.households), count: asNumber(affected.count), concentrated: asNumber(affected.concentrated),
      executives: asNumber(affected.executives), thresholdPct: asNumber(affected.threshold_pct),
    } : undefined,
  };
}

/** A response's served_by (services/llm/studio_models.py), when the service named one. */
export function servedByOf(value: unknown): ServedBy | null {
  return isRecord(value) && typeof value.label === "string" ? value as ServedBy : null;
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
      citations: asArray(note.citations).map((item): Citation | null => {
        if (!isRecord(item)) return null;
        return { field: asString(item.field), excerpt: asString(item.excerpt), value: asString(item.value) };
      }).filter((item): item is Citation => Boolean(item)),
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
    context: normalizeContext(value.context),
    servedBy: servedByOf(value.served_by),
    runId: asString(value.run_id),
  };
}

/** One golden run from GET /api/wealth/recordings/{name} (services/common/runs.py record format). */
export type WealthRecording = {
  name: string;
  title: string;
  recordedAt: string;
  servedBy: ServedBy | null;
  synthetic: boolean;
  run: RunInfo | null;
  events: RunEvent[];
  result: unknown;
};

export const RESEARCH_RECORDING = "research-hcyn";
export const ADVISORY_RECORDING = "advisory-dana-whitfield";

export async function loadWealthRecording(name: string): Promise<WealthRecording> {
  const response = await fetch(`/api/wealth/recordings/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`The recorded run is unavailable (${response.status}).`);
  const body = await response.json() as unknown;
  if (!isRecord(body)) throw new Error("The recorded run is empty.");
  return {
    name: asString(body.name) || name,
    title: asString(body.title) || name,
    recordedAt: asString(body.recorded_at) || "",
    servedBy: servedByOf(body.served_by),
    synthetic: body.synthetic === true,
    run: isRecord(body.run) ? body.run as RunInfo : null,
    events: asArray(body.events).filter(isRecord) as RunEvent[],
    result: body.result,
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
      recordedAt: asString(parsed.recordedAt),
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

const CITATION_AREAS: Record<string, string> = {
  earnings: "Earnings", peers: "Peers", returns: "Returns", macro: "Macro", event: "Earnings event", house_view: "House view",
  research: "Research note", briefing: "Briefing", suitability: "Suitability", household: "Household", holdings: "Holdings",
  context: "Context", tools: "Data",
};

/** "returns.1Y.excess" → "Returns · 1Y excess": a readable chip label for a cited payload field. */
export function citationLabel(field?: string) {
  if (!field) return "Source";
  const parts = field.replace(/\[(\d+)\]/g, (_, index: string) => ` #${Number(index) + 1}`).split(".").filter(Boolean);
  const [head, ...rest] = parts;
  const area = CITATION_AREAS[head] ?? head.replaceAll("_", " ");
  const detail = rest.join(" ").replaceAll("_", " ").replace(/([a-z])([A-Z])/g, "$1 $2").toLowerCase()
    .replace(/\bpe\b/g, "P/E").replace(/\beps\b/g, "EPS").replace(/\byoy\b/g, "YoY");
  return detail ? `${area} · ${detail}` : area;
}

/** A signed percentage for comparisons: 0.194 → "+19.4%". */
export function signedPct(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return "Not reported";
  const pct = value * 100;
  return `${pct > 0 ? "+" : ""}${pct.toFixed(digits)}%`;
}

/** "+19.4% vs SPY +16.9%": a return against the benchmark, the way every wealth panel shows it. */
export function vsSpy(ticker?: number | null, spy?: number | null) {
  if (ticker == null) return "Not reported";
  return spy == null ? signedPct(ticker) : `${signedPct(ticker)} vs SPY ${signedPct(spy)}`;
}

/** A cited value as a chip shows it: 1512000000 → "1.51B", a 0.875 rate → "87.5%", long text clipped. */
export function citationValue(field: string | undefined, value: string | undefined) {
  if (!value) return "";
  const number = Number(value.replace(/[,$%x]/g, ""));
  if (value.trim() && !Number.isNaN(number) && /^[\s$+\-\d.,%x]+$/.test(value)) {
    if (Math.abs(number) >= 1e9) return `${(number / 1e9).toFixed(2)}B`;
    if (Math.abs(number) >= 1e6) return `${(number / 1e6).toFixed(1)}M`;
    if (!value.includes("%") && Math.abs(number) < 1.5 && /rate|yoy|excess|premium|pct|margin|return|growth|weight/i.test(field || "")) {
      const change = /excess|premium|return|growth|yoy/i.test(field || "");
      return change ? signedPct(number) : `${(number * 100).toFixed(1)}%`;
    }
    return value;
  }
  return value.length > 32 ? `${value.slice(0, 30).trimEnd()}…` : value;
}
