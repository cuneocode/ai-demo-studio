"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Building2,
  Check,
  CircleAlert,
  FileText,
  History,
  Loader2,
  Quote,
  ShieldCheck,
  Sparkles,
  Upload,
  X,
} from "lucide-react";
import CompanyBriefingRuntime from "../../../app/CompanyBriefingRuntime";
import {
  EXAMPLE_TICKERS,
  MAX_UPLOAD_BYTES,
  allowedUploadName,
  clearCompanyProfile,
  exactTickerMatches,
  formatCik,
  loadCompanyProfile,
  normalizeAnalyzeResponse,
  normalizeHealth,
  normalizeSearchResults,
  parseApiError,
  saveCompanyProfile,
  type BriefingHealth,
  type BriefingMetric,
  type BriefingTheme,
  type CompanyBriefingRecord,
  type IssuerCandidate,
  type StoredCompanyProfile,
} from "../../../app/company-profile";
import ProvenanceBadge from "../../../app/run/ProvenanceBadge";
import { guideAnchor } from "../../../app/guide/anchors";
import { useGuideActions } from "../../../app/guide/GuidedTour";
import { loadRecording, useRecordings } from "../../../app/run/ReplayPicker";
import type { ServedBy } from "../../../app/run/events";
import RunStats, { defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, servedByFrom, traceFacts, usageFrom, startRun, useRunLedger, type ObservedRun, type StatsCard } from "../../../app/RunStats";
import "../../../app/briefing.css";

type CompanyBriefingProps = {
  embedded?: boolean;
  inStory?: boolean;
  onBack?: () => void;
  onAdd?: () => void;
  profile?: StoredCompanyProfile | null;
  onProfileChange?: (profile: StoredCompanyProfile | null) => void;
};

const BRIEFING_API = "/api/briefing";

const THEME_ORDER: Array<keyof Pick<CompanyBriefingRecord, "objectives" | "risks" | "regulatory" | "aiInitiatives">> = [
  "objectives",
  "risks",
  "regulatory",
  "aiInitiatives",
];

function metricValue(metric: BriefingMetric) {
  if (!metric.value) return metric.source === "absent" ? "Absent" : "Not reported";
  const numeric = Number(metric.value.replace(/,/g, ""));
  if (metric.unit?.toUpperCase() === "USD" && Number.isFinite(numeric)) {
    return new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(numeric) ? 0 : 2 }).format(numeric);
  }
  return metric.unit ? `${metric.value} ${metric.unit}` : metric.value;
}

function Citation({ excerpt, item, sourceUrl }: { excerpt?: string; item?: string; sourceUrl?: string }) {
  if (!excerpt && !item && !sourceUrl) return null;
  return (
    <details className="briefing-excerpt">
      <summary><Quote size={12} />{item || "Excerpt"}</summary>
      {excerpt && <p>{excerpt}</p>}
      {sourceUrl && <p><a href={sourceUrl} target="_blank" rel="noreferrer">{sourceUrl}</a></p>}
    </details>
  );
}

function ThemePanel({ theme }: { theme: BriefingTheme }) {
  const first = theme.facts[0];
  return (
    <article className="briefing-panel">
      <h3>{theme.title}<span className={`briefing-theme-status ${theme.status}`}>{theme.status}</span></h3>
      {!first && <p className="briefing-empty">{theme.note || "No grounded claim remained after citation checks."}</p>}
      {theme.facts.length > 0 && <section className="demo-details"><h3>{theme.facts.length} cited findings</h3>
        {theme.facts.map((fact, index) => <div className="briefing-fact" key={`${theme.id}-${index}`}>
          <p>{fact.text}</p><Citation excerpt={fact.excerpt} item={fact.item} sourceUrl={fact.sourceUrl} />
        </div>)}
      </section>}
    </article>
  );
}

export default function CompanyBriefing({
  embedded = false,
  inStory = false,
  profile,
  onProfileChange,
}: CompanyBriefingProps) {
  const accepted = profile !== undefined ? profile : loadCompanyProfile();
  const [health, setHealth] = useState<BriefingHealth | null>(null);
  const [query, setQuery] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [candidates, setCandidates] = useState<IssuerCandidate[] | null>(null);
  const [draft, setDraft] = useState<CompanyBriefingRecord | null>(null);
  const [servedBy, setServedBy] = useState<ServedBy | null>(null);
  const [replay, setReplay] = useState<{ recordedAt: string; servedBy: ServedBy | null; committed?: boolean } | null>(null);
  const recordings = useRecordings(BRIEFING_API);
  const [service, setService] = useState<ServiceHealth | null>(null);
  const ledger = useRunLedger();
  const stats = useMemo(() => briefingStats(service), [service]);
  const lastRequest = useRef<{ query?: string; cik?: string; file?: File | null }>({});
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    fetch("/api/briefing/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Health check unavailable")))
      .then((body) => { setHealth(normalizeHealth(body)); setService({ reachable: true, security: body?.security, splunk: body?.splunk?.status }); })
      .catch(() => { setHealth({ ready: false, perimeter: "EDGAR + upload only", detail: "Briefing service unavailable" }); setService({ reachable: false }); });
  }, []);

  const displayed = draft || accepted?.briefing || null;
  const isAccepted = Boolean(accepted && !draft && displayed);

  const canExtract = useMemo(() => Boolean(query.trim() || file), [query, file]);

  function notify(next: StoredCompanyProfile | null) {
    onProfileChange?.(next);
  }

  function assignFile(next: File | null) {
    if (!next) {
      setFile(null);
      return;
    }
    if (!allowedUploadName(next.name)) {
      setError("Upload a PDF, HTML, or TXT annual report.");
      return;
    }
    if (next.size > MAX_UPLOAD_BYTES) {
      setError("Uploads are limited to 40 MB.");
      return;
    }
    if (!next.size) {
      setError("The selected file is empty.");
      return;
    }
    setError("");
    setFile(next);
  }

  async function searchIssuers(term: string) {
    const response = await fetch(`/api/briefing/search?q=${encodeURIComponent(term)}`, { signal: AbortSignal.timeout(15000) });
    const text = await response.text();
    if (!response.ok) {
      const parsed = parseApiError(text, response.status);
      throw new Error(parsed.message);
    }
    return normalizeSearchResults(text ? JSON.parse(text) : []);
  }

  async function analyze(options: { query?: string; cik?: string; file?: File | null; refresh?: boolean }) {
    if (!options.query && !options.cik && !options.file) {
      setError("Enter a company name or ticker, or upload an annual report.");
      return;
    }
    setLoading(true);
    setError("");
    setCandidates(null);
    lastRequest.current = { query: options.query, cik: options.cik, file: options.file };
    const run = startRun("briefing", `${options.query || options.file?.name || `CIK ${options.cik}`}${options.refresh ? " · refresh" : ""}`);
    ledger.record(run);
    let settled = false;
    try {
      const body = new FormData();
      if (options.query) body.append("query", options.query);
      if (options.cik) body.append("cik", options.cik);
      if (options.file) body.append("file", options.file);
      body.append("refresh", "true"); // Live extraction must not silently return a cached briefing.
      const response = await fetch("/api/briefing/analyze", {
        method: "POST",
        body,
        signal: AbortSignal.timeout(240000),
      });
      const text = await response.text();
      let payload: unknown = {};
      if (text) {
        try { payload = JSON.parse(text); } catch { payload = {}; }
      }
      if (!response.ok) {
        const parsed = parseApiError(text, response.status);
        if (parsed.candidates.length > 1) {
          ledger.discard(run.id);
          setCandidates(parsed.candidates);
          setError("Multiple issuers match that name. Pick one to continue.");
          return;
        }
        ledger.record(observeBriefing(run, response.status, payload));
        settled = true;
        throw new Error(parsed.message);
      }
      ledger.record(observeBriefing(run, response.status, payload));
      settled = true;
      const briefing = normalizeAnalyzeResponse(payload, { query: options.query, filename: options.file?.name });
      if (!briefing) throw new Error("The briefing service returned an empty extract.");
      const answered = payload as { cached?: boolean; served_by?: unknown; recorded_at?: string };
      setServedBy(answered.cached ? null : servedByFrom(answered.served_by) ?? null);
      setReplay(answered.cached ? { recordedAt: answered.recorded_at ?? "", servedBy: servedByFrom(answered.served_by) ?? null } : null);
      setDraft(briefing);
    } catch (cause) {
      if (!settled) ledger.record({ ...run, status: "failed" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "The extract timed out. Try again or upload the filing."
        : cause instanceof SyntaxError
          ? "The briefing service returned an unreadable response."
          : cause instanceof Error ? cause.message : "Extract failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function startExtract(event?: FormEvent, preset?: string, pinnedCik?: string) {
    event?.preventDefault();
    const term = (preset ?? query).trim();
    if (preset) setQuery(preset);
    if (loading) return;
    const upload = file;
    if (pinnedCik) {
      await analyze({ query: term || undefined, cik: pinnedCik, file: upload });
      return;
    }
    if (term && !upload) {
      try {
        setLoading(true);
        setError("");
        const matches = await searchIssuers(term);
        const exact = exactTickerMatches(term, matches);
        if (exact.length === 1) {
          await analyze({ query: term, cik: exact[0].cik || undefined, file: upload });
          return;
        }
        if (matches.length > 1) {
          setCandidates(matches);
          setLoading(false);
          return;
        }
        if (matches.length === 1) {
          await analyze({ query: term, cik: matches[0].cik || undefined, file: upload });
          return;
        }
      } catch {
        await analyze({ query: term, file: upload });
        return;
      }
    }
    if (term && upload) {
      try {
        const matches = await searchIssuers(term);
        const exact = exactTickerMatches(term, matches);
        if (matches.length > 1 && exact.length !== 1) {
          setCandidates(matches);
          return;
        }
        const pinned = exact[0] || matches[0];
        await analyze({ query: term, cik: pinned?.cik, file: upload });
        return;
      } catch {
        await analyze({ query: term, file: upload });
        return;
      }
    }
    await analyze({ query: term || undefined, file: upload });
  }

  /** Shows the committed recording of a real extract as the draft; nothing is called now. */
  async function replayRecorded() {
    const meta = recordings[0];
    if (!meta || loading) return;
    setError("");
    setCandidates(null);
    try {
      const recording = await loadRecording<Record<string, unknown>>(BRIEFING_API, meta.name);
      const source = (recording.result?.source ?? {}) as { filename?: string };
      const briefing = normalizeAnalyzeResponse(recording.result, { filename: source.filename });
      if (!briefing) throw new Error("That recording has no extract.");
      ledger.record(observeRecordedBriefing(startRun("briefing", `${recording.title} · recorded`), recording.result, recording.recorded_at));
      lastRequest.current = {};
      setServedBy(null);
      setReplay({ recordedAt: recording.recorded_at, servedBy: servedByFrom(recording.served_by) ?? null, committed: true });
      setDraft(briefing);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That recording is unavailable.");
    }
  }

  function acceptCompany() {
    if (!displayed) return;
    const next: StoredCompanyProfile = {
      company: displayed.company,
      period: displayed.period,
      source: displayed.source,
      acceptedAt: new Date().toISOString(),
      briefing: displayed,
    };
    saveCompanyProfile(next);
    setDraft(null);
    notify(next);
  }

  function clearCompany() {
    clearCompanyProfile();
    setDraft(null);
    setQuery("");
    setFile(null);
    setCandidates(null);
    setError("");
    lastRequest.current = {};
    notify(null);
  }

  useGuideActions("company-briefing", { run: () => { void startExtract(); }, canRun: () => !loading && Boolean(query.trim() || file), replay: () => { void replayRecorded(); } });

  function refreshBriefing() {
    const previous = lastRequest.current;
    const term = previous.query || query.trim() || displayed?.company.ticker || displayed?.company.name;
    analyze({
      query: term || undefined,
      cik: previous.cik || displayed?.company.cik,
      file: previous.file || file,
      refresh: true,
    });
  }

  return (
    <div
      className={`briefing-demo ${embedded ? "briefing-embedded" : ""}`}
      data-guide-run={loading ? "running" : error && !displayed ? "failed" : displayed ? "done" : "idle"}
      data-guide-source={draft ? (replay ? "recorded" : "live") : "none"}
      data-guide-recorded-at={draft && replay ? replay.recordedAt : undefined}
      data-guide-stage={[displayed && "review", isAccepted && "accepted"].filter(Boolean).join(" ")}
    >
      <CompanyBriefingRuntime
        health={health}
        security={displayed?.security}
        xbrl={displayed?.metrics.some((metric) => metric.source === "xbrl") ? "xbrl" : undefined}
      />

      <div className="briefing-layout">
        <section className="demo-details"><h3>Run a live extract · company search or file upload</h3>
        <section className="briefing-card" {...guideAnchor("briefing.intake")}>
          <div className="briefing-kicker">
            <span><Building2 size={14} /> ISSUER INTAKE</span>
            <span className="briefing-perimeter">EDGAR + upload only</span>
          </div>
          <h2>Find a company or upload a filing</h2>
          <p className="briefing-lead">US-listed tickers resolve through EDGAR. An uploaded PDF, HTML, or TXT report is the document when both are present. Nothing is stored until you accept the extract.</p>

          <form className="briefing-intake" onSubmit={startExtract}>
            <label className="briefing-search">
              <Building2 size={17} />
              <input
                id="company-briefing-query"
                value={query}
                onChange={(event) => { setQuery(event.target.value); setCandidates(null); }}
                placeholder="Company name or ticker"
                aria-label="Company name or ticker"
                disabled={loading}
                autoComplete="off"
              />
            </label>
            <div className="briefing-chips" aria-label="Example issuers" {...guideAnchor("briefing.examples")}>
              {EXAMPLE_TICKERS.map((ticker) => (
                <button key={ticker} type="button" disabled={loading} onClick={() => startExtract(undefined, ticker)}>{ticker}</button>
              ))}
            </div>
            <label
              className={`briefing-upload ${dragActive ? "is-active" : ""}`}
              onDragOver={(event) => { event.preventDefault(); setDragActive(true); }}
              onDragLeave={() => setDragActive(false)}
              onDrop={(event) => { event.preventDefault(); setDragActive(false); assignFile(event.dataTransfer.files[0] || null); }}
            >
              <Upload size={18} />
              <strong>Upload an annual report</strong>
              <small>PDF, HTML, or TXT · 40 MB maximum · no scanned image-only PDFs</small>
              <input
                ref={fileInput}
                type="file"
                hidden
                accept=".pdf,.html,.htm,.txt,application/pdf,text/html,text/plain"
                onChange={(event) => assignFile(event.target.files?.[0] || null)}
              />
            </label>
            {file && (
              <div className="briefing-file-name">
                <FileText size={14} />
                <span>{file.name}</span>
                <button type="button" aria-label="Remove upload" onClick={() => { setFile(null); if (fileInput.current) fileInput.current.value = ""; }}><X size={14} /></button>
              </div>
            )}
            <div className="briefing-actions">
              <button className="primary" disabled={loading || !canExtract} {...guideAnchor("briefing.extract")}>
                {loading ? <><Loader2 size={15} className="spin" /> Extracting…</> : <><Sparkles size={15} /> Extract briefing</>}
              </button>
              <button type="button" className="secondary" disabled={!displayed || loading} onClick={refreshBriefing}>Refresh</button>
              <button type="button" className="secondary" disabled={!accepted && !draft && !file && !query} onClick={clearCompany}>Clear</button>

            </div>
            <p className="briefing-disclaimer">Public filings and uploaded text only. This is not investment advice, and the agent does not browse the open web or IR sites.</p>
          </form>
        </section></section>

        <details className="demo-fallback"><summary>Fallback: recorded extract</summary>
              {recordings.length > 0 && (
                <button data-demo-replay id="briefing-replay" {...guideAnchor("briefing.replay")} type="button" className="secondary" disabled={loading} onClick={replayRecorded} title={`${recordings[0].title} · recorded ${new Date(recordings[0].recorded_at).toLocaleDateString()}`}>
                  <History size={15} /> Replay recording
                </button>
              )}
        </details>
        {error && (
          <div className="briefing-error">
            <CircleAlert size={14} />
            <div>{error}</div>
            <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button>
          </div>
        )}

        {candidates && candidates.length > 0 && (
          <section className="briefing-card">
            <div className="briefing-kicker"><span>ISSUER PICKER</span></div>
            <h2>Select the issuer</h2>
            <p className="briefing-lead">More than one ticker matched that name. Choose one — the extract will not guess.</p>
            <div className="briefing-picker" role="listbox" aria-label="Matching issuers">
              {candidates.map((item) => (
                <button
                  key={`${item.cik}-${item.ticker}-${item.name}`}
                  type="button"
                  className="briefing-issuer"
                  role="option"
                  aria-selected={false}
                  disabled={loading}
                  onClick={() => startExtract(undefined, query.trim() || item.ticker || item.name, item.cik)}
                >
                  <span>
                    <strong>{item.name}</strong>
                    <small>{item.ticker ? `${item.ticker} · ` : ""}CIK {formatCik(item.cik) || "not reported"}</small>
                  </span>
                  <em>{item.ticker || "Select"}</em>
                </button>
              ))}
            </div>
          </section>
        )}

        {displayed && (
          <>
            <section className="briefing-card briefing-review-head" {...guideAnchor("briefing.review")}>
              <div>
                <div className="briefing-kicker">
                  <span>REVIEW</span>
                  {isAccepted && <span className="briefing-accepted"><Check size={12} /> Using this company</span>}
                </div>
                <h2>{displayed.company.name}{displayed.company.ticker ? ` (${displayed.company.ticker})` : ""}</h2>
                <p>
                  {displayed.period ? `Period ${displayed.period}` : "Period not reported"}
                  {displayed.company.cik ? ` · CIK ${formatCik(displayed.company.cik)}` : ""}
                </p>
                {draft && servedBy && <ProvenanceBadge provenance={{ kind: "live", servedBy }} />}
                {draft && replay && <>
                  <ProvenanceBadge provenance={{ kind: "recorded", recordedAt: replay.recordedAt, servedBy: replay.servedBy }} />
                  <span className="briefing-replay-note">{replay.committed
                    ? "Recorded run · no model ran this time · upload the report and extract to rerun the agent"
                    : "Cached result for this filing · no model ran this time · Refresh reruns the agent"}</span>
                </>}
                {displayed.source.synthetic && <span className="briefing-synthetic-chip">Synthetic document · fictional issuer · not an SEC filing</span>}
                <span className="briefing-source-chip">
                  {displayed.source.url
                    ? <a href={displayed.source.url} target="_blank" rel="noreferrer">{displayed.source.label}</a>
                    : displayed.source.label}
                </span>
              </div>
              <div className="briefing-review-actions">
                <button className="primary" type="button" disabled={isAccepted} onClick={acceptCompany} {...guideAnchor("briefing.accept")}>
                  {isAccepted ? <><Check size={15} /> Using this company</> : "Use this company"}
                </button>
                <button className="secondary" type="button" disabled={loading} onClick={refreshBriefing}>Refresh</button>
                <button className="secondary" type="button" onClick={clearCompany}>Clear</button>
              </div>
            </section>

            <div className="briefing-panels" {...guideAnchor("briefing.themes")}>
              {THEME_ORDER.map((key) => <ThemePanel key={key} theme={displayed[key]} />)}
              <article className="briefing-panel wide" {...guideAnchor("briefing.metrics")}>
                <h3>Key metrics<span className="briefing-theme-status">{displayed.metrics.length ? "ready" : "abstain"}</span></h3>
                {displayed.metrics.length === 0 ? (
                  <p className="briefing-empty">No XBRL or verbatim table metric survived grounding.</p>
                ) : (
                  <div className="briefing-metrics">
                    {displayed.metrics.map((metric) => (
                      <div className="briefing-metric" key={`${metric.label}-${metric.concept || ""}`}>
                        <div className="briefing-metric-top">
                          <div>
                            <span>{metric.label}</span>
                            <strong>{metricValue(metric)}</strong>
                          </div>
                          <span className={`briefing-metric-source ${metric.source}`}>{metric.source}</span>
                        </div>
                        {(metric.period || metric.concept) && (
                          <p>{[metric.period, metric.concept].filter(Boolean).join(" · ")}</p>
                        )}
                        <Citation excerpt={metric.excerpt} item={metric.source === "xbrl" ? "XBRL" : metric.source === "verbatim-table" ? "Table" : "Absent"} sourceUrl={metric.sourceUrl} />
                      </div>
                    ))}
                  </div>
                )}
              </article>
            </div>

            <section className="demo-details"><h3>Agent steps & source trail</h3><section className="briefing-trail" {...guideAnchor("briefing.trail")}>
              <h3>Deep Agent trail</h3>
              {displayed.todos.length > 0 && (
                <ul className="briefing-todos">
                  {displayed.todos.map((todo, index) => (
                    <li key={`${todo.content}-${index}`}>
                      <Check size={14} className={todo.status === "completed" ? "done" : undefined} />
                      <span>{todo.content}{todo.status ? ` · ${todo.status}` : ""}</span>
                    </li>
                  ))}
                </ul>
              )}
              {displayed.tools.length > 0 && (
                <div className="briefing-nodes" aria-label="Tools used">
                  {displayed.tools.map((tool, index) => (
                    <span className="briefing-node" key={`${tool}-${index}`}>{tool}</span>
                  ))}
                </div>
              )}
              <div className="briefing-nodes" aria-label="Nodes read">
                {displayed.nodesRead.length === 0
                  ? <p className="briefing-empty">No node-read trail was returned.</p>
                  : displayed.nodesRead.map((node, index) => (
                    <span className="briefing-node" key={`${node.id || node.title}-${index}`}>
                      {node.item ? `${node.item} · ` : ""}{node.title || node.id}
                    </span>
                  ))}
              </div>
              {displayed.grounding && (
                <p className="briefing-security">
                  Grounding dropped {displayed.grounding.droppedFacts} uncited facts and {displayed.grounding.droppedMetrics} metrics.
                </p>
              )}
              {displayed.security && (
                <p className="briefing-security">
                  <ShieldCheck size={14} />
                  {draft && replay ? "AI Defense (original run): " : "AI Defense: "}{displayed.security.verdict || displayed.security.status || "Not reported"}
                  {displayed.security.mode ? ` · ${displayed.security.mode}` : ""}
                  {displayed.security.checks != null ? ` · ${displayed.security.checks} checks` : ""}
                  {displayed.security.blocked != null ? ` · ${displayed.security.blocked} blocked` : ""}
                </p>
              )}
            </section></section>
          </>
        )}
      </div>
      <RunStats ledger={ledger} {...stats} empty="Extract a company. The Deep Agent's model calls, tools, and AI Defense verdicts land here." />
      {embedded && inStory && <div className="briefing-story"><span>STORY MODE</span> Company context stays local until the presenter accepts it. Other demos are unchanged.</div>}
    </div>
  );
}

type ServiceHealth = { reachable: boolean; security?: { status?: string; mode?: string; fail_open?: boolean }; splunk?: string };

const list = (value: unknown) => (Array.isArray(value) ? value.length : undefined);

/** One analyze call from the raw response. A cached replay ran no model and no inspection, so it reports none. */
function observeBriefing(run: ObservedRun, status: number, payload: unknown): ObservedRun {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const trail = (body.trail && typeof body.trail === "object" ? body.trail : {}) as Record<string, unknown>;
  const splunk = ((body.telemetry as { splunk?: Record<string, unknown> } | undefined)?.splunk ?? {}) as { status?: string; trace_id?: string; span_count?: number };
  const cached = body.cached === true;
  const defense = defenseFrom(body.security);
  return {
    ...run,
    status: cached ? "cached" : status < 300 ? "completed" : status === 403 ? "blocked" : "failed",
    durationMs: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
    ...usageFrom(body.usage),
    servedBy: servedByFrom(body.served_by),
    ...(cached ? { provenance: "recorded" as const, recordedAt: typeof body.recorded_at === "string" ? body.recorded_at : undefined } : {}),
    // A replay's trail belongs to the original run; nothing was called or read this time.
    toolCalls: cached ? 0 : list(trail.tools),
    counts: { nodes: cached ? 0 : list(trail.nodes_read) },
    otlp: splunk.status,
    traceId: splunk.trace_id,
    spans: splunk.span_count,
    defense: cached ? { mode: defense?.mode, status: "cached_replay", checks: 0, blocked: 0, errors: 0, eventIds: [] } : defense,
    note: cached ? "Cached replay · no model calls, inspections, or export" : undefined,
  };
}

/** A committed recording shown now: no model calls, inspections, or export happened in this session. */
function observeRecordedBriefing(run: ObservedRun, payload: unknown, recordedAt: string): ObservedRun {
  const original = usageFrom((payload as Record<string, unknown> | null)?.usage);
  return {
    ...observeBriefing(run, 200, payload),
    status: "completed",
    durationMs: undefined,
    otlp: undefined,
    traceId: undefined,
    spans: undefined,
    replay: true,
    provenance: "recorded",
    recordedAt,
    note: `Historical counts · ${original.llmCalls ?? "unknown"} original model calls. No new calls, inspections, or trace export.`,
  };
}

function briefingStats(service: ServiceHealth | null): { observability: StatsCard; defense: StatsCard } {
  const reachable = service?.reachable !== false;
  const otlp = service?.splunk === "configured";
  return {
    observability: {
      integration: !reachable
        ? { state: "unknown", summary: "Service not reachable", notice: "The briefing service is not answering." }
        : otlp
          ? { state: "on", summary: "OTLP spans to Splunk Observability Cloud · Agent Observability SDK not wired in yet" }
          : { state: "not_instrumented", summary: "Agent Observability SDK not wired into this service yet",
              notice: "No traces leave this service: optional OTLP export is not configured. The figures below are measured by the briefing service.", settings: "st-splunk-otel" },
      tiles: [
        { label: "LLM calls", value: (run) => run.llmCalls },
        { label: "Tool calls", value: (run) => run.toolCalls },
        { label: "Nodes read", value: (run) => run.counts?.nodes, hint: "Filing sections the Deep Agent opened" },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "Measured by the briefing service" },
      ],
      facts: traceFacts,
      source: "From each /api/briefing/analyze response: model calls and tokens are counted at the model client, tools and nodes from the agent's trail.",
    },
    defense: {
      integration: defenseIntegration(service?.security, "filing text, model input, and the briefing", reachable),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the security summary on each analyze response.",
    },
  };
}
