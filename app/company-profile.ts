export const COMPANY_PROFILE_STORAGE_KEY = "fsi-demo-studio.company-profile";
export const MAX_UPLOAD_BYTES = 40 * 1024 * 1024;
export const EXAMPLE_TICKERS = ["JPM", "GS", "BLK", "V"] as const;
export const ALLOWED_UPLOAD_EXTENSIONS = [".pdf", ".html", ".htm", ".txt"] as const;

export type MetricSource = "xbrl" | "verbatim-table" | "absent";

export type BriefingFact = {
  text: string;
  item?: string;
  nodeId?: string;
  excerpt?: string;
  sourceUrl?: string;
};

export type BriefingTheme = {
  id: "objectives" | "risks" | "regulatory" | "ai_initiatives" | "metrics";
  title: string;
  status: "ready" | "abstain";
  facts: BriefingFact[];
  note?: string;
};

export type BriefingMetric = {
  label: string;
  value?: string;
  unit?: string;
  period?: string;
  concept?: string;
  accession?: string;
  source: MetricSource;
  excerpt?: string;
  sourceUrl?: string;
};

export type CompanyIdentity = {
  name: string;
  ticker?: string;
  cik?: string;
};

export type BriefingSource = {
  kind: "edgar" | "upload";
  label: string;
  url?: string;
  filename?: string;
  form?: string;
  filedAt?: string;
  periodOfReport?: string;
  accession?: string;
};

export type AgentTodo = {
  content: string;
  status?: string;
};

export type NodeRead = {
  id?: string;
  title?: string;
  item?: string;
  tool?: string;
};

export type SecuritySummary = {
  status?: string;
  mode?: string;
  verdict?: string;
  failOpen?: boolean;
  checks?: number;
  blocked?: number;
  errors?: number;
};

export type GroundingSummary = {
  droppedFacts: number;
  droppedMetrics: number;
};

export type IssuerCandidate = {
  cik: string;
  ticker: string;
  name: string;
};

export type CompanyBriefingRecord = {
  company: CompanyIdentity;
  period?: string;
  source: BriefingSource;
  objectives: BriefingTheme;
  risks: BriefingTheme;
  regulatory: BriefingTheme;
  aiInitiatives: BriefingTheme;
  metrics: BriefingMetric[];
  todos: AgentTodo[];
  nodesRead: NodeRead[];
  tools: string[];
  path?: "edgar" | "upload";
  grounding?: GroundingSummary;
  security?: SecuritySummary;
  perimeter?: string;
};

export type StoredCompanyProfile = {
  company: CompanyIdentity;
  period?: string;
  source: BriefingSource;
  acceptedAt: string;
  briefing: CompanyBriefingRecord;
};

export type BriefingHealth = {
  ready?: boolean;
  model?: string;
  detail?: string;
  sec?: { status?: string; detail?: string };
  xbrl?: { status?: string; detail?: string };
  cache?: { status?: string };
  security?: SecuritySummary;
  perimeter?: string;
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

export function formatCik(cik?: string) {
  if (!cik) return "";
  const digits = cik.replace(/\D/g, "");
  return digits ? digits.padStart(10, "0") : cik;
}

export function companySwitcherLabel(profile: StoredCompanyProfile | null | undefined) {
  if (!profile?.company.name) return "Select a company";
  const ticker = profile.company.ticker?.trim();
  return ticker ? `${profile.company.name} (${ticker})` : profile.company.name;
}

export function allowedUploadName(name: string) {
  const lower = name.toLowerCase();
  return ALLOWED_UPLOAD_EXTENSIONS.some((extension) => lower.endsWith(extension));
}

export function loadCompanyProfile(): StoredCompanyProfile | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.localStorage.getItem(COMPANY_PROFILE_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    const profile = normalizeStoredProfile(parsed);
    return profile?.company.name ? profile : null;
  } catch {
    return null;
  }
}

export function saveCompanyProfile(profile: StoredCompanyProfile) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(COMPANY_PROFILE_STORAGE_KEY, JSON.stringify(profile));
}

export function clearCompanyProfile() {
  if (typeof window === "undefined") return;
  window.localStorage.removeItem(COMPANY_PROFILE_STORAGE_KEY);
}

function normalizeStoredProfile(value: unknown): StoredCompanyProfile | null {
  if (!isRecord(value)) return null;
  const briefing = normalizeBriefing(value.briefing ?? value);
  if (!briefing) return null;
  const company = normalizeIdentity(value.company) || briefing.company;
  if (!company.name) return null;
  return {
    company,
    period: asString(value.period) || briefing.period,
    source: normalizeSource(value.source) || briefing.source,
    acceptedAt: asString(value.acceptedAt) || asString(value.accepted_at) || new Date().toISOString(),
    briefing,
  };
}

export function normalizeHealth(value: unknown): BriefingHealth | null {
  if (!isRecord(value)) return null;
  const sec = isRecord(value.sec) ? value.sec : isRecord(value.sec_client) ? value.sec_client : isRecord(value.edgar) ? value.edgar : undefined;
  const xbrl = isRecord(value.xbrl) ? value.xbrl : isRecord(value.companyfacts) ? value.companyfacts : undefined;
  const cache = isRecord(value.cache) ? value.cache : undefined;
  const secStatus = sec
    ? readableStatus(asString(sec.status) || (sec.ready === true || sec.user_agent_set === true ? "configured" : undefined))
    : undefined;
  return {
    ready: value.ready === true,
    model: asString(value.model),
    detail: asString(value.detail) || asString(value.error),
    sec: sec ? { status: secStatus, detail: asString(sec.detail) } : undefined,
    xbrl: xbrl
      ? { status: readableStatus(asString(xbrl.status) || (xbrl.ready === true ? "ready" : undefined)), detail: asString(xbrl.detail) }
      : { status: secStatus === "configured" ? "companyfacts" : secStatus ? "unavailable" : undefined },
    cache: cache
      ? { status: readableStatus(asString(cache.status) || (cache.tickers === true || cache.tickers_cached === true ? "cached" : asString(cache.root) ? "ready" : undefined)) }
      : undefined,
    security: normalizeSecurity(value.security),
    perimeter: asString(value.perimeter) || "EDGAR + upload only",
  };
}

export function normalizeSearchResults(value: unknown): IssuerCandidate[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value)
      ? asArray(value.candidates ?? value.results ?? value.issuers ?? value.matches)
      : [];
  return rows.map(normalizeCandidate).filter((item): item is IssuerCandidate => Boolean(item?.cik || item?.ticker || item?.name));
}

function normalizeCandidate(value: unknown): IssuerCandidate | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name) || asString(value.title) || asString(value.company) || "";
  const ticker = (asString(value.ticker) || asString(value.symbol) || "").toUpperCase();
  const cik = formatCik(asString(value.cik) || asString(value.CIK));
  if (!name && !ticker && !cik) return null;
  return { cik, ticker, name: name || ticker || cik };
}

export function exactTickerMatches(query: string, candidates: IssuerCandidate[]) {
  const ticker = query.trim().toUpperCase();
  return candidates.filter((item) => item.ticker && item.ticker === ticker);
}

export function parseApiError(text: string, status: number) {
  try {
    const body = JSON.parse(text) as unknown;
    if (isRecord(body)) {
      const detail = body.detail;
      const candidates = normalizeSearchResults(
        body.candidates ?? (isRecord(detail) ? detail.candidates ?? detail : undefined),
      );
      if (isRecord(detail)) {
        return { message: asString(detail.message) || asString(detail.detail) || `Request failed (${status}).`, candidates };
      }
      if (typeof detail === "string") return { message: detail, candidates };
      if (Array.isArray(detail)) {
        return {
          message: detail.map((item) => (isRecord(item) ? asString(item.msg) || asString(item.detail) : asString(item)) || "").filter(Boolean).join(" ") || `Request failed (${status}).`,
          candidates,
        };
      }
      return { message: asString(body.message) || `Request failed (${status}).`, candidates };
    }
  } catch {
    /* non-JSON error body */
  }
  return { message: text.trim() || `Request failed (${status}).`, candidates: [] as IssuerCandidate[] };
}

export function normalizeAnalyzeResponse(value: unknown, fallback: { query?: string; filename?: string }): CompanyBriefingRecord | null {
  if (!isRecord(value)) return null;
  const briefing = normalizeBriefing(value.briefing ?? value, fallback);
  if (!briefing) return null;
  const trail = isRecord(value.trail) ? value.trail : isRecord(value.agent_trail) ? value.agent_trail : value;
  const nodesRead = normalizeNodesRead(
    (isRecord(trail) ? trail.nodes_read ?? trail.nodesRead : undefined) ?? value.nodes_read ?? value.nodesRead ?? briefing.nodesRead,
  );
  const todos = normalizeTodos(
    (isRecord(trail) ? trail.todos ?? trail.write_todos : undefined) ?? value.todos ?? briefing.todos,
  );
  const tools = normalizeTools(
    (isRecord(trail) ? trail.tools ?? trail.tools_used : undefined) ?? value.tools ?? briefing.tools,
  );
  const path = normalizePath((isRecord(trail) ? trail.path : undefined) ?? value.path ?? briefing.path ?? briefing.source.kind);
  return {
    ...briefing,
    todos,
    nodesRead,
    tools,
    path,
    grounding: normalizeGrounding(value.grounding) || briefing.grounding,
    security: normalizeSecurity(value.security ?? briefing.security) || briefing.security,
    perimeter: asString(value.perimeter) || briefing.perimeter,
  };
}

function normalizeBriefing(value: unknown, fallback: { query?: string; filename?: string } = {}): CompanyBriefingRecord | null {
  if (!isRecord(value)) return null;
  const company = normalizeIdentity(value.company ?? value.issuer ?? value.identity) || identityFromQuery(fallback.query);
  const source = normalizeSource(value.source, fallback.filename) || defaultSource(fallback.filename);
  if (!company.name && !source.label) return null;
  if (!company.name) company.name = fallback.query?.trim() || (fallback.filename ? fallback.filename.replace(/\.[^.]+$/, "") : "Uploaded issuer");
  const metrics = normalizeMetrics(value.metrics ?? (isRecord(value.themes) ? value.themes.metrics : undefined));
  return {
    company,
    period: normalizePeriod(value.period, source) || asString(value.fiscal_year) || asString(value.fiscalYear),
    source,
    objectives: normalizeTheme("objectives", "Key business objectives", value.objectives ?? value.business_objectives),
    risks: normalizeTheme("risks", "Material risks", value.risks ?? value.material_risks),
    regulatory: normalizeTheme("regulatory", "Regulatory obligations", value.regulatory ?? value.regulatory_obligations),
    aiInitiatives: normalizeTheme("ai_initiatives", "Strategic AI initiatives", value.ai_initiatives ?? value.aiInitiatives ?? value.ai),
    metrics,
    todos: normalizeTodos(value.todos),
    nodesRead: normalizeNodesRead(value.nodes_read ?? value.nodesRead),
    tools: normalizeTools(value.tools),
    path: normalizePath(value.path ?? source.kind),
    grounding: normalizeGrounding(value.grounding),
    security: normalizeSecurity(value.security),
    perimeter: asString(value.perimeter),
  };
}

function identityFromQuery(query?: string): CompanyIdentity {
  const trimmed = query?.trim() || "";
  const ticker = /^[A-Za-z.]{1,6}$/.test(trimmed) ? trimmed.toUpperCase() : undefined;
  return { name: trimmed || "Selected issuer", ticker };
}

function normalizeIdentity(value: unknown): CompanyIdentity | null {
  if (!isRecord(value)) return null;
  const name = asString(value.name) || asString(value.title) || asString(value.company);
  const ticker = asString(value.ticker) || asString(value.symbol);
  const cik = formatCik(asString(value.cik));
  if (!name && !ticker && !cik) return null;
  return { name: name || ticker || cik, ticker: ticker?.toUpperCase(), cik: cik || undefined };
}

function normalizePeriod(value: unknown, source?: BriefingSource): string | undefined {
  if (typeof value === "string" || typeof value === "number") return asString(value);
  if (isRecord(value)) {
    const form = asString(value.form);
    const fy = asString(value.fiscalYear) || asString(value.fiscal_year);
    const reported = asString(value.periodOfReport) || asString(value.period_of_report);
    const filed = asString(value.filedAt) || asString(value.filed_at);
    return [form, fy ? `FY ${fy}` : undefined, reported || filed].filter(Boolean).join(" · ") || undefined;
  }
  return source?.periodOfReport || source?.form;
}

function normalizePath(value: unknown): "edgar" | "upload" | undefined {
  const kind = asString(value)?.toLowerCase();
  if (kind === "upload") return "upload";
  if (kind === "edgar" || kind === "auto") return "edgar";
  return undefined;
}

function defaultSource(filename?: string): BriefingSource {
  return filename
    ? { kind: "upload", label: `Uploaded · ${filename}`, filename }
    : { kind: "edgar", label: "EDGAR" };
}

function normalizeSource(value: unknown, filename?: string): BriefingSource | null {
  if (typeof value === "string" && value.trim()) {
    const text = value.trim();
    const upload = /upload/i.test(text) || Boolean(filename);
    return {
      kind: upload ? "upload" : "edgar",
      label: upload && filename && !/upload/i.test(text) ? `Uploaded · ${filename}` : text,
      url: text.startsWith("http") ? text : undefined,
      filename,
    };
  }
  if (!isRecord(value)) return filename ? defaultSource(filename) : null;
  const kind = asString(value.kind) === "upload" || asString(value.source) === "upload" || filename ? "upload" : "edgar";
  const file = asString(value.filename) || filename;
  const url = asString(value.url) || asString(value.accession_url) || asString(value.edgar_url);
  const accession = asString(value.accession);
  const form = asString(value.form);
  const explicit = asString(value.label);
  const label = explicit
    || (kind === "upload" && file ? `Uploaded · ${file}` : undefined)
    || url
    || (accession ? `EDGAR · ${form ? `${form} · ` : ""}${accession}` : undefined)
    || (kind === "upload" ? "Uploaded filing" : "EDGAR");
  return {
    kind,
    label,
    url,
    filename: file,
    form,
    filedAt: asString(value.filedAt) || asString(value.filed_at),
    periodOfReport: asString(value.periodOfReport) || asString(value.period_of_report),
    accession,
  };
}

function normalizeTheme(id: BriefingTheme["id"], title: string, value: unknown): BriefingTheme {
  if (Array.isArray(value)) {
    const facts = value.map(normalizeFact).filter((item): item is BriefingFact => Boolean(item));
    return { id, title, status: facts.length ? "ready" : "abstain", facts };
  }
  if (!isRecord(value)) return { id, title, status: "abstain", facts: [] };
  const facts = asArray(value.facts ?? value.items ?? value.claims).map(normalizeFact).filter((item): item is BriefingFact => Boolean(item));
  const raw = (asString(value.status) || "").toLowerCase();
  const status = raw === "ready" || raw === "extracted" || facts.length ? "ready" : "abstain";
  return {
    id,
    title: asString(value.title) || title,
    status,
    facts,
    note: asString(value.note) || asString(value.reason) || asString(value.abstain),
  };
}

function normalizeFact(value: unknown): BriefingFact | null {
  if (typeof value === "string" && value.trim()) return { text: value.trim() };
  if (!isRecord(value)) return null;
  const text = asString(value.text) || asString(value.claim) || asString(value.summary);
  const excerpt = asString(value.excerpt) || asString(value.verbatim);
  if (!text && !excerpt) return null;
  return {
    text: text || excerpt || "",
    item: asString(value.item),
    nodeId: asString(value.nodeId) || asString(value.node_id),
    excerpt,
    sourceUrl: asString(value.sourceUrl) || asString(value.source_url),
  };
}

function normalizeMetricSource(value?: string): MetricSource {
  const normalized = (value || "").toLowerCase().replaceAll("_", "-");
  if (normalized === "xbrl") return "xbrl";
  if (normalized === "verbatim-table" || normalized === "table" || normalized === "verbatim") return "verbatim-table";
  return "absent";
}

function normalizeMetrics(value: unknown): BriefingMetric[] {
  const rows = Array.isArray(value)
    ? value
    : isRecord(value)
      ? asArray(value.facts ?? value.items ?? value.metrics)
      : [];
  return rows.map((item) => {
    if (!isRecord(item)) return null;
    const label = asString(item.label) || asString(item.concept) || asString(item.name);
    if (!label) return null;
    const rawValue = item.value === null ? undefined : asString(item.value);
    return {
      label,
      value: rawValue,
      unit: asString(item.unit),
      period: asString(item.period) || asString(item.fy),
      concept: asString(item.concept),
      accession: asString(item.accession),
      source: normalizeMetricSource(asString(item.source) || asString(item.origin) || asString(item.kind)),
      excerpt: asString(item.excerpt) || asString(item.verbatim),
      sourceUrl: asString(item.sourceUrl) || asString(item.source_url),
    };
  }).filter((item): item is BriefingMetric => Boolean(item));
}

function normalizeTodos(value: unknown): AgentTodo[] {
  return asArray(value).map((item) => {
    if (typeof item === "string" && item.trim()) return { content: item.trim() };
    if (!isRecord(item)) return null;
    const content = asString(item.content) || asString(item.text) || asString(item.title);
    if (!content) return null;
    return { content, status: readableStatus(asString(item.status)) };
  }).filter((item): item is AgentTodo => Boolean(item));
}

function normalizeTools(value: unknown): string[] {
  return asArray(value).map((item) => {
    if (typeof item === "string" && item.trim()) return item.trim();
    if (!isRecord(item)) return null;
    return asString(item.name) || asString(item.tool) || asString(item.id);
  }).filter((item): item is string => Boolean(item));
}

function normalizeGrounding(value: unknown): GroundingSummary | undefined {
  if (!isRecord(value)) return undefined;
  const droppedFacts = asNumber(value.dropped_facts ?? value.droppedFacts);
  const droppedMetrics = asNumber(value.dropped_metrics ?? value.droppedMetrics);
  if (droppedFacts == null && droppedMetrics == null) return undefined;
  return { droppedFacts: droppedFacts ?? 0, droppedMetrics: droppedMetrics ?? 0 };
}

function normalizeNodesRead(value: unknown): NodeRead[] {
  return asArray(value).map((item) => {
    if (typeof item === "string" && item.trim()) return { title: item.trim(), id: item.trim() };
    if (!isRecord(item)) return null;
    const title = asString(item.title) || asString(item.name) || asString(item.id);
    if (!title && !asString(item.id)) return null;
    return {
      id: asString(item.id) || asString(item.node_id),
      title: title || asString(item.id),
      item: asString(item.item),
      tool: asString(item.tool),
    };
  }).filter((item): item is NodeRead => Boolean(item));
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
