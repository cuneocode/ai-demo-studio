import type { SecuritySummary, StoredCompanyProfile } from "./company-profile";
import type { RunEvent, RunInfo, ServedBy } from "./run/events";

/** The published house-view update an advisor's meeting prep picks up. */
export const RESEARCH_NOTE_STORAGE_KEY = "fsi-demo-studio.research-note";

/** Real-ticker chips (the secondary path). services/wealth/scripts/warm_cache.py reads the tickers from this list. */
export const EXAMPLE_RESEARCH_TICKERS: readonly { ticker: string; tag?: string; title?: string }[] = [
  { ticker: "HCYN", tag: "Fictional", title: "Halcyon Interconnect, Inc. · fictional issuer, synthetic data" },
  { ticker: "NVDA" },
  { ticker: "JPM" },
  { ticker: "MSFT" },
  { ticker: "AAPL" },
  { ticker: "XOM" },
];

export type ResearchScenarioId = "earnings" | "restricted" | "poisoned-news" | "bank";
export type ResearchScenario = {
  id: ResearchScenarioId; ticker: string; title: string; summary: string; moment: string; recording: string; kind: string;
};

/** The four stories. Each has a recorded golden run (services/wealth/data/recorded/<recording>.json). */
export const RESEARCH_SCENARIOS: readonly ResearchScenario[] = [
  { id: "earnings", ticker: "HCYN", kind: "Synthetic issuer", recording: "research-hcyn", title: "Company reports higher earnings",
    summary: "Halcyon beat expectations and raised its forecast. Check what changed and what advisors should know.", moment: "Every claim is checked against its source" },
  { id: "restricted", ticker: "KSTL", kind: "Synthetic issuer", recording: "research-kstl-restricted", title: "Restricted issuer",
    summary: "Kestrel Ridge is on the restricted list during a pending deal.", moment: "Watch policy stop research before a model is called" },
  { id: "poisoned-news", ticker: "HCYN", kind: "Attack", recording: "research-hcyn-poisoned", title: "Poisoned news story",
    summary: "A blog post in the feed tells the agent to push a $2,000 target.", moment: "The post is screened as a tool result and withheld" },
  { id: "bank", ticker: "JPM", kind: "Real data", recording: "research-jpm-bank", title: "A bank, from public data",
    summary: "Analyze JPMorgan’s earnings, valuation, and profitability using available public market data.", moment: "Compare the bank with peers and the market" },
];

export type ConflictRow = { id: string; title: string; severity: string; left: string; right: string; detail: string };

export type ResearchSource = {
  /** live and cache are Yahoo; fixture is a committed snapshot; fictional is a synthetic issuer. */
  kind: "live" | "cache" | "fixture" | "fictional";
  fetchedAt?: string; label?: string; asOf?: string; fictional?: boolean; macro?: string | null; fresh?: boolean;
};

export type EarningsPanel = {
  status: string; beatRate?: number | null; observations?: number; beats?: number; latestSurprisePct?: number | null;
  revenue?: { latestYoy?: number | null; priorYoy?: number | null; decelerating?: boolean };
};
export type PeersPanel = { status: string; tickers?: string[]; subjectPe?: number | null; medianPe?: number | null; pePremium?: number | null };
export type ReturnsPanel = { status: string; asOf?: string; windows?: Record<string, { ticker?: number | null; spy?: number | null; excess?: number | null }> };
export type MacroPanel = { status: string; reason?: string; series?: Record<string, { label?: string; latest?: number | null; direction?: string }> };

export type HouseView = { rating?: string; owner?: string; asOf?: string; focusList?: boolean; thesisPoints: string[]; keyRisks: string[]; synthetic?: boolean };
export type EarningsEvent = { period?: string; date?: string; guidanceChange?: string; whatChanged: string[]; source?: string };
export type AffectedHouseholds = { households?: number; count?: number; concentrated?: number; executives?: number; thresholdPct?: number };
export type ResearchContext = { houseView?: HouseView; event?: EarningsEvent; affected?: AffectedHouseholds };

export type EvidenceField = { display: string; label?: string };
export type EvidenceItem = {
  id: string; title: string; source: string; kind: string; synthetic: boolean; fields: Record<string, EvidenceField>; text: string;
  date?: string; publisher?: string; section?: string;
};
export type WithheldItem = { id: string; title: string; reason: string };

export type ClaimStatus = "verified" | "unverified" | "policy";
export type Claim = {
  section: string; text: string; evidenceId?: string; fieldPath?: string; display?: string; quote?: string; also: string[];
  status: ClaimStatus | string; reason: string; check?: string;
};

export type NewsRow = {
  id: string; evidenceId: string; headline: string; publisher?: string; date?: string; body?: string;
  status: "kept" | "withheld" | string; reason?: string; by?: string; aiDefense?: string; aiDefenseRules: string[];
};

export type PolicyCheck = { control?: string; label: string; key?: string; verdict?: boolean; status: string; source: string };
export type PolicyResult = { policy: string; allowed: boolean; source: string; checks: PolicyCheck[]; detail?: string };

export type Precheck = { status: string; reason?: string; since?: string; issuer?: string; controls?: PolicyResult };

export type ResearchUpdate = {
  status: string; mode: string; modeLabel: string; impact?: string; impactSource?: string; triggers: string[];
  claims: Claim[]; counts: { verified: number; unverified: number; policy: number; total: number }; reason?: string; rating?: string;
};

export type PublishState = {
  status: "awaiting_approval" | "unavailable" | "blocked" | "published" | "rejected" | "denied" | string;
  requestId?: string; reason?: string; by?: string; at?: string; controls?: PolicyResult; originLabel?: string;
};

export type SplunkStatus = { status?: string; serviceName?: string; missing?: string[]; export?: string };
export type ObservabilityStatus = { tracing?: { status?: string; transport?: string; stream?: string }; evaluators?: { status?: string; results?: string } };
export type Usage = { llmCalls?: number; toolCalls?: number; inputTokens?: number; outputTokens?: number };
export type Evaluation = { status: string; label: string; verifier?: string };

export type ResearchAnalyze = {
  review?: string;
  ticker: string;
  scenario?: string;
  status: string;
  company: { name?: string; ticker?: string; sector?: string; industry?: string; metricFamily?: string };
  source: ResearchSource;
  precheck?: Precheck;
  earnings: EarningsPanel;
  peers: PeersPanel;
  returns: ReturnsPanel;
  macro: MacroPanel;
  conflicts: ConflictRow[];
  valuation: Record<string, string>;
  context?: ResearchContext;
  news: NewsRow[];
  evidence: EvidenceItem[];
  withheld: WithheldItem[];
  update: ResearchUpdate;
  publish: PublishState;
  security?: SecuritySummary;
  usage?: Usage;
  telemetry?: { splunk?: SplunkStatus; galileo?: string };
  evaluation?: Evaluation;
  durationMs?: number;
  disclaimer: string;
  servedBy?: ServedBy | null;
  runId?: string;
};

export type StoredResearchNote = {
  ticker: string;
  /** When the strategist published it. */
  acceptedAt: string;
  analyze: ResearchAnalyze;
  /** Set when the published update is a recorded run rather than a live one. */
  recordedAt?: string;
  publishedBy?: string;
};

export type ModelHealth = { status?: string; model?: string; label?: string; private?: boolean; fallback?: boolean; reason?: string };

export type WealthHealth = {
  ready?: boolean;
  detail?: string;
  nim?: ModelHealth;
  advisoryModel?: ModelHealth;
  /** How client data may reach a hosted model: "allowed with AI Defense enforce" or "refused: …". */
  advisoryHostedFallback?: string;
  fred?: { status?: string };
  security?: SecuritySummary;
  controls?: { status?: string; source?: string; reason?: string };
  evaluation?: Evaluation;
  untrusted?: string;
  galileo?: string;
  splunk?: SplunkStatus;
  observability?: ObservabilityStatus;
  perimeter?: string;
};

const isRecord = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const asArray = (value: unknown): unknown[] => (Array.isArray(value) ? value : []);

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

const strings = (value: unknown) => asArray(value).map(asString).filter((item): item is string => Boolean(item));
const readable = (value?: string) => (value ? value.replaceAll("_", " ") : undefined);

export function normalizeSecurity(value: unknown): SecuritySummary | undefined {
  if (!isRecord(value)) return undefined;
  const status = readable(asString(value.status));
  const mode = readable(asString(value.mode));
  const verdict = readable(asString(value.verdict) || asString(value.decision) || status);
  if (!status && !mode && !verdict) return undefined;
  return { status, mode, verdict, failOpen: value.fail_open === true, checks: asNumber(value.checks), blocked: asNumber(value.blocked), errors: asNumber(value.errors) };
}

export function normalizeSplunk(value: unknown): SplunkStatus | undefined {
  if (!isRecord(value) || !asString(value.status)) return undefined;
  return { status: asString(value.status), serviceName: asString(value.service_name), missing: strings(value.missing), export: asString(value.export) };
}

export function normalizeUsage(value: unknown): Usage | undefined {
  if (!isRecord(value)) return undefined;
  return { llmCalls: asNumber(value.llm_calls), toolCalls: asNumber(value.tool_calls), inputTokens: asNumber(value.input_tokens), outputTokens: asNumber(value.output_tokens) };
}

export function normalizeEvaluation(value: unknown): Evaluation | undefined {
  if (!isRecord(value)) return undefined;
  return { status: asString(value.status) || "not_configured", label: asString(value.label) || "Evaluation not configured", verifier: asString(value.verifier) };
}

export function observabilityLabel(health?: WealthHealth | null) {
  const status = health?.observability?.tracing?.status || health?.galileo;
  if (!status || status === "disabled" || status === "not_configured" || status === "missing_configuration") return "Not configured";
  if (status === "configured" || status === "traces_present" || status === "awaiting_traces") return "Configured";
  return readable(status) || "Not configured";
}

export function formatPct(value?: number | null, digits = 1) {
  if (value == null || Number.isNaN(value)) return "Not reported";
  return `${(value * 100).toFixed(digits)}%`;
}

export function formatNumber(value?: number | null, digits = 2) {
  if (value == null || Number.isNaN(value)) return "Not reported";
  return value.toFixed(digits);
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

export function parseApiError(text: string, status: number) {
  try {
    const body = JSON.parse(text) as unknown;
    if (isRecord(body) && typeof body.detail === "string") return body.detail;
  } catch {
    /* non-JSON */
  }
  return text.trim() || `Request failed (${status}).`;
}

function modelHealth(value: unknown): ModelHealth | undefined {
  if (!isRecord(value)) return undefined;
  return { status: readable(asString(value.status)), model: asString(value.model), label: asString(value.label),
    private: value.private === true, fallback: value.fallback === true, reason: asString(value.reason) };
}

export function normalizeWealthHealth(value: unknown): WealthHealth | null {
  if (!isRecord(value)) return null;
  const observability = isRecord(value.observability) ? value.observability : undefined;
  const controls = isRecord(value.controls) ? value.controls : undefined;
  return {
    ready: value.ready === true,
    detail: asString(value.detail) || asString(value.error),
    nim: modelHealth(value.nim),
    advisoryModel: modelHealth(value.advisory_model),
    advisoryHostedFallback: asString(value.advisory_hosted_fallback),
    fred: isRecord(value.fred) ? { status: readable(asString(value.fred.status)) } : { status: "absent" },
    security: normalizeSecurity(value.security),
    controls: controls ? { status: asString(controls.status), source: asString(controls.source), reason: asString(controls.reason) } : undefined,
    evaluation: normalizeEvaluation(value.evaluation),
    untrusted: asString(value.untrusted_inspection),
    galileo: asString(value.galileo),
    splunk: normalizeSplunk(value.splunk),
    observability: observability ? {
      tracing: isRecord(observability.tracing) ? { status: asString(observability.tracing.status), transport: asString(observability.tracing.transport), stream: asString(observability.tracing.stream) } : undefined,
      evaluators: isRecord(observability.evaluators) ? { status: asString(observability.evaluators.status), results: asString(observability.evaluators.results) } : undefined,
    } : undefined,
    perimeter: asString(value.perimeter) || "Yahoo + FRED allowlist only",
  };
}

const SOURCE_KINDS = new Set<ResearchSource["kind"]>(["live", "cache", "fixture", "fictional"]);

function normalizeSource(value: unknown): ResearchSource {
  if (!isRecord(value)) return { kind: "fixture" };
  const raw = asString(value.kind) as ResearchSource["kind"] | undefined;
  const kind = raw && SOURCE_KINDS.has(raw) ? raw : "live";
  return { kind, fetchedAt: asString(value.fetchedAt), label: asString(value.label) || "Yahoo Finance", asOf: asString(value.asOf),
    fictional: value.fictional === true || kind === "fictional", macro: asString(value.macro), fresh: value.fresh === true };
}

function normalizeConflicts(value: unknown): ConflictRow[] {
  return asArray(value).map((item) => {
    if (!isRecord(item) || !asString(item.id) || !asString(item.left) || !asString(item.right)) return null;
    return { id: asString(item.id)!, title: asString(item.title) || "Signal divergence", severity: asString(item.severity) || "medium",
      left: asString(item.left)!, right: asString(item.right)!, detail: asString(item.detail) || "" };
  }).filter((item): item is ConflictRow => Boolean(item));
}

function normalizeContext(value: unknown): ResearchContext | undefined {
  if (!isRecord(value)) return undefined;
  const view = isRecord(value.house_view) ? value.house_view : undefined;
  const event = isRecord(value.event) ? value.event : undefined;
  const affected = isRecord(value.affected_households) ? value.affected_households : undefined;
  return {
    houseView: view ? { rating: asString(view.rating), owner: asString(view.owner), asOf: asString(view.as_of), focusList: view.focus_list === true,
      thesisPoints: strings(view.thesis_points), keyRisks: strings(view.key_risks), synthetic: view.synthetic === true } : undefined,
    event: event ? { period: asString(event.period), date: asString(event.date), guidanceChange: asString(event.guidance_change),
      whatChanged: strings(event.what_changed), source: asString(event.source) } : undefined,
    affected: affected ? { households: asNumber(affected.households), count: asNumber(affected.count), concentrated: asNumber(affected.concentrated),
      executives: asNumber(affected.executives), thresholdPct: asNumber(affected.threshold_pct) } : undefined,
  };
}

export function normalizeEvidence(value: unknown): EvidenceItem[] {
  return asArray(value).map((item): EvidenceItem | null => {
    if (!isRecord(item) || !asString(item.id)) return null;
    const fields = isRecord(item.fields) ? Object.fromEntries(Object.entries(item.fields).map(([path, spec]) => {
      const row = isRecord(spec) ? spec : {};
      return [path, { display: asString(row.display) || "", label: asString(row.label) }];
    })) : {};
    return { id: asString(item.id)!, title: asString(item.title) || asString(item.id)!, source: asString(item.source) || "", kind: asString(item.kind) || "data",
      synthetic: item.synthetic === true, fields, text: asString(item.text) || "", date: asString(item.date), publisher: asString(item.publisher), section: asString(item.section) };
  }).filter((item): item is EvidenceItem => Boolean(item));
}

export function normalizeWithheld(value: unknown): WithheldItem[] {
  return asArray(value).filter(isRecord).map((item) => ({ id: asString(item.id) || "", title: asString(item.title) || "", reason: asString(item.reason) || "" }));
}

export function normalizeClaims(value: unknown): Claim[] {
  return asArray(value).filter(isRecord).map((item) => ({
    section: asString(item.section) || "what_changed", text: asString(item.text) || "", evidenceId: asString(item.evidence_id),
    fieldPath: asString(item.field_path), display: asString(item.display), quote: asString(item.quote), also: strings(item.also),
    status: asString(item.status) || "unverified", reason: asString(item.reason) || "", check: asString(item.check),
  })).filter((item) => item.text);
}

export function normalizePolicy(value: unknown): PolicyResult | undefined {
  if (!isRecord(value)) return undefined;
  return {
    policy: asString(value.policy) || "", allowed: value.allowed === true, source: asString(value.source) || "local", detail: asString(value.detail),
    checks: asArray(value.checks).filter(isRecord).map((row) => ({ control: asString(row.control), label: asString(row.label) || "", key: asString(row.key),
      verdict: typeof row.verdict === "boolean" ? row.verdict : undefined, status: asString(row.status) || "", source: asString(row.source) || "local" })),
  };
}

export function normalizePublish(value: unknown): PublishState {
  if (!isRecord(value)) return { status: "unavailable" };
  return { status: asString(value.status) || "unavailable", requestId: asString(value.request_id), reason: asString(value.reason), by: asString(value.by),
    at: asString(value.at), controls: normalizePolicy(value.controls), originLabel: asString(value.origin_label) };
}

function normalizeNews(value: unknown): NewsRow[] {
  return asArray(value).filter(isRecord).map((row) => ({
    id: asString(row.id) || "", evidenceId: asString(row.evidence_id) || `news:${asString(row.id)}`, headline: asString(row.headline) || "",
    publisher: asString(row.publisher), date: asString(row.date), body: asString(row.body), status: asString(row.status) || "kept",
    reason: asString(row.reason), by: asString(row.by), aiDefense: asString(row.ai_defense), aiDefenseRules: strings(row.ai_defense_rules),
  }));
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
  const revenue = isRecord(earnings.revenue) ? earnings.revenue : {};
  const update = isRecord(value.update) ? value.update : {};
  const counts = isRecord(update.counts) ? update.counts : {};
  const precheck = isRecord(value.precheck) ? value.precheck : undefined;
  return {
    ticker,
    review: asString(value.review),
    scenario: asString(value.scenario),
    status: asString(value.status) || "omitted",
    company: { name: asString(company.name) || ticker, ticker, sector: asString(company.sector), industry: asString(company.industry), metricFamily: asString(company.metric_family) },
    source: normalizeSource(value.source),
    precheck: precheck ? { status: asString(precheck.status) || "", reason: asString(precheck.reason), since: asString(precheck.since),
      issuer: asString(precheck.issuer), controls: normalizePolicy(precheck.controls) } : undefined,
    earnings: {
      status: asString(earnings.status) || "absent", beatRate: asNumber(earnings.beatRate), observations: asNumber(earnings.observations), beats: asNumber(earnings.beats),
      latestSurprisePct: asNumber(earnings.latestSurprisePct),
      revenue: { latestYoy: asNumber(revenue.latestYoy), priorYoy: asNumber(revenue.priorYoy), decelerating: revenue.decelerating === true },
    },
    peers: { status: asString(peers.status) || "absent", tickers: strings(peers.tickers), subjectPe: asNumber(peers.subjectPe), medianPe: asNumber(peers.medianPe), pePremium: asNumber(peers.pePremium) },
    returns: {
      status: asString(returns.status) || "absent", asOf: asString(returns.asOf),
      windows: isRecord(returns.windows) ? Object.fromEntries(Object.entries(returns.windows).map(([key, window]) => {
        const row = isRecord(window) ? window : {};
        return [key, { ticker: asNumber(row.ticker), spy: asNumber(row.spy), excess: asNumber(row.excess) }];
      })) : {},
    },
    macro: {
      status: asString(macro.status) || "absent", reason: asString(macro.reason),
      series: isRecord(macro.series) ? Object.fromEntries(Object.entries(macro.series).map(([key, item]) => {
        const row = isRecord(item) ? item : {};
        return [key, { label: asString(row.label) || key, latest: asNumber(row.latest), direction: asString(row.direction) }];
      })) : {},
    },
    conflicts: normalizeConflicts(value.conflicts),
    valuation: isRecord(value.valuation) ? Object.fromEntries(Object.entries(value.valuation).map(([key, display]) => [key, asString(display) || ""])) : {},
    context: normalizeContext(value.context),
    news: normalizeNews(value.news),
    evidence: normalizeEvidence(value.evidence),
    withheld: normalizeWithheld(value.withheld),
    update: {
      status: asString(update.status) || "unavailable", mode: asString(update.mode) || "none", modeLabel: asString(update.mode_label) || "No update drafted",
      impact: asString(update.house_view_impact), impactSource: asString(update.impact_source), triggers: strings(update.triggers),
      claims: normalizeClaims(update.claims), reason: asString(update.reason), rating: asString(update.rating),
      counts: { verified: asNumber(counts.verified) ?? 0, unverified: asNumber(counts.unverified) ?? 0, policy: asNumber(counts.policy) ?? 0, total: asNumber(counts.total) ?? 0 },
    },
    publish: normalizePublish(value.publish),
    security: normalizeSecurity(value.security),
    usage: normalizeUsage(value.usage),
    telemetry: isRecord(value.telemetry) ? { splunk: normalizeSplunk(value.telemetry.splunk), galileo: asString(value.telemetry.galileo) } : undefined,
    evaluation: normalizeEvaluation(value.evaluation),
    durationMs: asNumber(value.duration_ms),
    disclaimer: asString(value.disclaimer) || "Demonstration only. Not investment advice.",
    servedBy: servedByOf(value.served_by),
    runId: asString(value.run_id),
  };
}

/** One golden run from GET /api/wealth/recordings/{name} (services/common/runs.py record format). */
export type WealthRecording = {
  name: string; title: string; recordedAt: string; servedBy: ServedBy | null; synthetic: boolean; run: RunInfo | null; events: RunEvent[]; result: unknown;
};

export async function loadWealthRecording(name: string): Promise<WealthRecording> {
  const response = await fetch(`/api/studio/recordings/wealth/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`The recorded run is unavailable (${response.status}).`);
  const body = await response.json() as unknown;
  if (!isRecord(body)) throw new Error("The recorded run is empty.");
  return {
    name: asString(body.name) || name, title: asString(body.title) || name, recordedAt: asString(body.recorded_at) || "",
    servedBy: servedByOf(body.served_by), synthetic: body.synthetic === true, run: isRecord(body.run) ? body.run as RunInfo : null,
    events: asArray(body.events).filter(isRecord) as RunEvent[], result: body.result,
  };
}

export function loadResearchNote(): StoredResearchNote | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(RESEARCH_NOTE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!isRecord(parsed) || !isRecord(parsed.analyze) || !isRecord(parsed.analyze.update)) return null;
    const analyze = normalizeAnalyze(parsed.raw ?? parsed.analyze);
    if (!analyze) return null;
    return { ticker: (asString(parsed.ticker) || analyze.ticker).toUpperCase(), acceptedAt: asString(parsed.acceptedAt) || new Date().toISOString(),
      analyze, recordedAt: asString(parsed.recordedAt), publishedBy: asString(parsed.publishedBy) };
  } catch {
    return null;
  }
}

/** Stores the published update with the raw service body, which meeting prep posts back as research context. */
export function saveResearchNote(note: StoredResearchNote, raw?: unknown) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(RESEARCH_NOTE_STORAGE_KEY, JSON.stringify({ ...note, raw }));
}

export function rawResearchNote(): unknown {
  if (typeof window === "undefined") return null;
  try {
    const parsed = JSON.parse(window.localStorage.getItem(RESEARCH_NOTE_STORAGE_KEY) || "null") as unknown;
    return isRecord(parsed) ? parsed.raw ?? null : null;
  } catch {
    return null;
  }
}

export function clearResearchNote() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(RESEARCH_NOTE_STORAGE_KEY);
}

export function tickerFromProfile(profile?: StoredCompanyProfile | null) {
  return profile?.company.ticker?.trim().toUpperCase() || "";
}

export function switcherContextLabel(profile: StoredCompanyProfile | null | undefined, note: StoredResearchNote | null | undefined, briefExists?: boolean) {
  const name = profile?.company.name;
  if (!name) return briefExists || note ? "Select a company · studio context" : "Select a company";
  const ticker = profile?.company.ticker?.trim();
  const base = ticker ? `${name} (${ticker})` : name;
  const extras = [];
  if (note && ticker && note.ticker === ticker.toUpperCase()) extras.push("update");
  if (briefExists) extras.push("brief");
  return extras.length ? `${base} · ${extras.join(" · ")}` : base;
}

export const SECTION_LABEL: Record<string, string> = {
  what_changed: "What changed", impact: "Why it matters", talking_point: "Talking points for advisors",
};

export const IMPACT_LABEL: Record<string, string> = {
  consistent: "Current investment outlook still supported", needs_strategist_review: "Investment outlook needs human review", no_house_view: "No existing investment outlook to compare",
};

/** The verdict wording a claim chip shows. */
export const CLAIM_LABEL: Record<string, string> = { verified: "Verified", unverified: "Struck · unverified", policy: "Blocked by policy" };

export function policySourceLabel(source?: string) {
  return source === "agent_control" ? "Agent Control" : "Local policy check";
}
