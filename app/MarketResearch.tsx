"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  History,
  Landmark,
  Loader2,
  Server,
  ShieldCheck,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import type { StoredCompanyProfile } from "./company-profile";
import DemoStatusBanner from "./DemoStatusBanner";
import {
  EXAMPLE_RESEARCH_TICKERS,
  RESEARCH_DISCLAIMER,
  RESEARCH_RECORDING,
  citationLabel,
  citationValue,
  clearResearchNote,
  formatNumber,
  formatPct,
  loadResearchNote,
  loadWealthRecording,
  normalizeAnalyze,
  normalizeWealthHealth,
  observabilityLabel,
  parseApiError,
  saveResearchNote,
  signedPct,
  tickerFromProfile,
  vsSpy,
  type ResearchAnalyze,
  type StoredResearchNote,
  type WealthHealth,
} from "./research-note";
import RunStats, { startRun, useRunLedger } from "./RunStats";
import { newRunId } from "./run/events";
import ProvenanceBadge, { type Provenance } from "./run/ProvenanceBadge";
import RunTimeline from "./run/RunTimeline";
import { useRun } from "./run/useRun";
import { useStudioNav } from "./studio-nav";
import { observeRecordedWealth, observeWealth, wealthService, wealthStats, type WealthService } from "./wealth-stats";
import "./research.css";

type Props = {
  embedded?: boolean;
  inStory?: boolean;
  companyProfile?: StoredCompanyProfile | null;
  note?: StoredResearchNote | null;
  onNoteChange?: (note: StoredResearchNote | null) => void;
};

type Origin = { kind: "live" } | { kind: "recorded"; recordedAt: string };

function defenseLabel(health?: WealthHealth | null, analyze?: ResearchAnalyze | null) {
  const current = analyze?.security || health?.security;
  const mode = current?.mode || health?.security?.mode;
  if (mode === "off" || current?.status === "disabled") return "Off for research";
  return current?.verdict || current?.status || "Not reported";
}

function modelLabel(health?: WealthHealth | null) {
  const model = health?.nim;
  if (!health) return "Checking…";
  if (!model?.label || model.status === "down" || health.ready === false) return "None reachable";
  return `${model.label}${model.private ? " · private" : " · hosted"}${model.fallback ? " · fallback" : ""}`;
}

function parsed(text: string): unknown {
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

function sourceText(analyze?: ResearchAnalyze | null) {
  const source = analyze?.source;
  if (!source) return "No snapshot yet";
  if (source.kind === "fictional") return `Fictional · synthetic${source.asOf ? ` · ${source.asOf}` : ""}`;
  if (source.kind === "fixture") return `Committed snapshot${source.asOf ? ` · ${source.asOf}` : ""}`;
  if (source.kind === "cache") return `Yahoo · cached${source.asOf ? ` · ${source.asOf}` : ""}`;
  return "Yahoo · live";
}

/** The badge on the note: a recording, the model that wrote it, or why no model did. */
function noteProvenance(analyze: ResearchAnalyze, origin: Origin): Provenance {
  if (origin.kind === "recorded") return { kind: "recorded", recordedAt: origin.recordedAt, servedBy: analyze.servedBy };
  if (analyze.note.status === "blocked") return { kind: "none", detail: "No model call · restricted issuer" };
  if (analyze.note.status === "ready" && analyze.servedBy) return { kind: "live", servedBy: analyze.servedBy };
  return { kind: "none", detail: "No model answered · numbers only" };
}

function acceptReason(analyze: ResearchAnalyze) {
  const status = analyze.note.status;
  if (status === "ready") return "";
  if (status === "blocked") return "This issuer is on the restricted list, so there is no note to accept.";
  return `The draft note is ${status}${analyze.note.reason ? `: ${analyze.note.reason}` : ""}. Only a ready note can be accepted; the numbers above are still usable.`;
}

export default function MarketResearch({
  embedded = false,
  inStory = false,
  companyProfile,
  note,
  onNoteChange,
}: Props) {
  const accepted = note !== undefined ? note : loadResearchNote();
  const profileTicker = tickerFromProfile(companyProfile);
  const [health, setHealth] = useState<WealthHealth | null>(null);
  const [ticker, setTicker] = useState(profileTicker || accepted?.ticker || "");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [unreachable, setUnreachable] = useState(false);
  const [draft, setDraft] = useState<ResearchAnalyze | null>(null);
  const [origin, setOrigin] = useState<Origin>({ kind: "live" });
  const [service, setService] = useState<WealthService | null>(null);
  const [focusTick, setFocusTick] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const ledger = useRunLedger();
  const timeline = useRun({ pageUrl: (id, after) => `/api/wealth/runs/${encodeURIComponent(id)}?after=${after}` });
  const { links } = useStudioNav();
  const stats = useMemo(() => wealthStats(service, "/api/wealth/research/analyze", links?.agentObservability), [service, links?.agentObservability]);
  const [tickerSyncKey, setTickerSyncKey] = useState(`${profileTicker}|idle`);
  const nextTickerSyncKey = `${profileTicker}|${draft ? "draft" : "idle"}`;
  if (nextTickerSyncKey !== tickerSyncKey) {
    setTickerSyncKey(nextTickerSyncKey);
    if (profileTicker && !draft) setTicker(profileTicker);
  }

  useEffect(() => {
    fetch("/api/wealth/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Health check unavailable")))
      .then((body) => { setHealth(normalizeWealthHealth(body)); setService(wealthService(body)); })
      .catch(() => {
        setHealth({ ready: false, perimeter: "Yahoo + FRED allowlist only", detail: "Wealth service unavailable", nim: { status: "down" } });
        setService({ reachable: false });
        setUnreachable(true);
      });
  }, []);

  useEffect(() => {
    if (!focusTick) return;
    const heading = headingRef.current;
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
    heading?.focus({ preventScroll: true });
  }, [focusTick]);

  const displayed = draft || accepted?.analyze || null;
  const shownOrigin: Origin = draft ? origin : accepted?.recordedAt ? { kind: "recorded", recordedAt: accepted.recordedAt } : { kind: "live" };
  const isAccepted = Boolean(accepted && !draft && displayed && accepted.ticker === displayed.ticker);
  const nimDown = health?.nim?.status === "down" || health?.ready === false;
  const reason = displayed ? acceptReason(displayed) : "";
  const context = displayed?.context;

  async function analyze(refresh = false, preset?: string) {
    const symbol = (preset ?? ticker).trim().toUpperCase();
    if (!symbol) {
      setError("Enter a US ticker.");
      return;
    }
    if (preset) setTicker(symbol);
    setLoading(true);
    setError("");
    const runId = newRunId("wealth-research");
    timeline.open(runId);
    const run = startRun("research", `${symbol} research${refresh ? " · refresh" : ""}`);
    ledger.record(run);
    let settled = false;
    try {
      const response = await fetch("/api/wealth/research/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: symbol, refresh, run_id: runId }),
        signal: AbortSignal.timeout(180000),
      });
      const text = await response.text();
      ledger.record(observeWealth(run, response.status, parsed(text)));
      settled = true;
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const next = normalizeAnalyze(text ? JSON.parse(text) : {}, symbol);
      if (!next) throw new Error("The research service returned an empty snapshot.");
      setDraft(next);
      setOrigin({ kind: "live" });
      setUnreachable(false);
      setFocusTick((tick) => tick + 1);
    } catch (cause) {
      if (!settled) {
        ledger.record({ ...run, status: "failed" });
        setUnreachable(true);
      }
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "Analyze timed out. Try again, or replay the recorded run."
        : cause instanceof TypeError ? "The wealth service did not answer."
          : cause instanceof Error ? cause.message : "Analyze failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  async function replayRecorded() {
    setLoading(true);
    setError("");
    try {
      const recording = await loadWealthRecording(RESEARCH_RECORDING);
      const next = normalizeAnalyze(recording.result);
      if (!next) throw new Error("The recorded run has no research result.");
      timeline.play({ run: recording.run, events: recording.events });
      ledger.record(observeRecordedWealth(startRun("research", `${next.ticker} research · recorded`), recording.result, recording.recordedAt));
      setDraft(next);
      setTicker(next.ticker);
      setOrigin({ kind: "recorded", recordedAt: recording.recordedAt });
      setFocusTick((tick) => tick + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recorded run is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  function acceptNote() {
    if (!displayed || displayed.note.status !== "ready") return;
    const next: StoredResearchNote = {
      ticker: displayed.ticker,
      acceptedAt: new Date().toISOString(),
      analyze: displayed,
      recordedAt: shownOrigin.kind === "recorded" ? shownOrigin.recordedAt : undefined,
    };
    saveResearchNote(next);
    setDraft(null);
    onNoteChange?.(next);
  }

  function clearNote() {
    clearResearchNote();
    setDraft(null);
    setError("");
    timeline.reset();
    onNoteChange?.(null);
  }

  const replayButton = (
    <button type="button" className="secondary" disabled={loading} onClick={replayRecorded}>
      <History size={15} aria-hidden="true" /> Replay recorded HCYN run
    </button>
  );

  return (
    <div className={`research-demo ${embedded ? "research-embedded" : ""}`}>
      <section className="research-runtime" aria-label="Research runtime">
        <div>
          <span><Server size={15} /> Model</span>
          <strong className={nimDown ? "is-down" : health ? "is-ready" : undefined}>{modelLabel(health)}</strong>
        </div>
        <div>
          <span><Table2 size={15} /> Market data</span>
          <strong>{sourceText(displayed)}</strong>
        </div>
        <div>
          <span><ShieldCheck size={15} /> AI Defense</span>
          <strong>{defenseLabel(health, displayed)}</strong>
        </div>
        <div>
          <span><Landmark size={15} /> Macro (FRED)</span>
          <strong className={health?.fred?.status === "configured" ? "is-ready" : "is-down"}>{health?.fred?.status === "configured" ? "Configured" : "Off"}</strong>
        </div>
        <div>
          <span><Activity size={15} /> Observability</span>
          <strong className={health?.galileo === "configured" || health?.observability?.tracing?.status === "configured" ? "is-ready" : undefined}>
            {observabilityLabel(health)}
          </strong>
        </div>
        <div>
          <span><Landmark size={15} /> Perimeter</span>
          <strong>{health?.perimeter || "Yahoo + FRED allowlist only"}</strong>
        </div>
      </section>

      <div className="research-layout">
        <section className="research-card">
          <div className="research-kicker">
            <span><Landmark size={14} /> ISSUER RESEARCH</span>
            <span className="research-source-chip">Yahoo · cache · committed snapshots</span>
          </div>
          <h2>Analyze a US ticker</h2>
          <p className="research-lead">
            Market data comes from allowlisted Yahoo and FRED calls through a local cache, with committed snapshots when the network is down.
            Earnings, peers, returns, and signal divergences are computed before any model runs, so they appear even when no model answers.
            {companyProfile?.company.ticker ? ` The accepted briefing's ticker is ${companyProfile.company.ticker}.` : ""}
          </p>
          <form className="research-intake" onSubmit={(event: FormEvent) => { event.preventDefault(); analyze(false); }}>
            <label className="research-search">
              <Landmark size={17} />
              <input
                id="research-ticker"
                value={ticker}
                onChange={(event) => setTicker(event.target.value.toUpperCase())}
                placeholder="US ticker"
                aria-label="US ticker"
                disabled={loading}
                autoComplete="off"
              />
            </label>
            <div className="research-chips" role="group" aria-label="Example tickers">
              {EXAMPLE_RESEARCH_TICKERS.map((item) => (
                <button key={item.ticker} type="button" disabled={loading} title={item.title} onClick={() => analyze(false, item.ticker)}>
                  {item.ticker}{item.tag && <span className="research-chip-tag">{item.tag}</span>}
                </button>
              ))}
            </div>
            <div className="research-actions">
              <button className="primary" disabled={loading || !ticker.trim()}>
                {loading ? <><Loader2 size={15} className="spin" /> Analyzing…</> : <><Sparkles size={15} /> Analyze</>}
              </button>
              <button type="button" className="secondary" disabled={loading || !ticker.trim()} onClick={() => analyze(true)}>Refresh</button>
              <button type="button" className="secondary" disabled={!accepted && !draft} onClick={clearNote}>Clear note</button>
            </div>
            {error && (
              <div className="research-error" role="alert">
                <CircleAlert size={14} />
                <div>
                  {error}
                  {unreachable && <div className="research-error-actions">{replayButton}</div>}
                </div>
                <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button>
              </div>
            )}
          </form>
        </section>

        {unreachable && !error && (
          <DemoStatusBanner
            title="The wealth research service is not answering"
            stillWorks="the recorded HCYN research run"
            fix="start the wealth service"
            settingsSection="st-services"
            actions={replayButton}
          />
        )}
        {!unreachable && nimDown && (
          <DemoStatusBanner
            tone="degraded"
            title="No model is answering, so the draft note is off"
            stillWorks="earnings, peers, returns, signal divergences, and the recorded HCYN run"
            fix="bring Sparky up or add an OpenAI key"
            settingsSection="st-models"
            actions={replayButton}
          />
        )}

        {displayed && (
          <>
            <section className="research-card research-review" aria-labelledby="research-result-heading">
              <div>
                <div className="research-kicker">
                  <span>REVIEW</span>
                  {isAccepted && <span className="research-accepted"><Check size={12} /> Research note accepted</span>}
                </div>
                <h2 id="research-result-heading" ref={headingRef} tabIndex={-1}>{displayed.company.name} ({displayed.ticker})</h2>
                <p>{[displayed.company.sector, displayed.company.industry].filter(Boolean).join(" · ")}</p>
                <div className="research-badges">
                  <span className={`research-source-chip ${displayed.source.fictional ? "fictional" : ""}`}>{displayed.source.label || "Yahoo Finance"}</span>
                  <ProvenanceBadge provenance={noteProvenance(displayed, shownOrigin)} />
                </div>
              </div>
              <p className="research-live" aria-live="polite">
                {displayed.note.status === "ready" ? "Draft note ready for review." : `Draft note ${displayed.note.status}. Indicators are ready.`}
              </p>
            </section>

            {context?.restricted && (
              <div className="research-banner research-blocked" role="status">
                <CircleAlert size={14} /> {displayed.ticker} is on the restricted list ({context.restricted.reason}{context.restricted.since ? `, since ${context.restricted.since}` : ""}). The note is blocked before any model call.
              </div>
            )}

            <div className="research-panels">
              {context?.houseView && (
                <article className="research-panel">
                  <h3>House view<span className="research-status ready">{context.houseView.rating}</span></h3>
                  <p className="research-meta">{context.houseView.owner}{context.houseView.asOf ? ` · as of ${context.houseView.asOf}` : ""}{context.houseView.focusList ? " · Focus List" : ""}{context.houseView.synthetic ? " · Synthetic" : ""}</p>
                  <ul className="research-list">{context.houseView.thesisPoints.map((point) => <li key={point}>{point}</li>)}</ul>
                  {context.houseView.keyRisks.length > 0 && <p className="research-meta">Key risks: {context.houseView.keyRisks.join("; ")}</p>}
                </article>
              )}
              {context?.event && (
                <article className="research-panel">
                  <h3>Earnings event<span className="research-status ready">{context.event.period}</span></h3>
                  <p className="research-meta">{context.event.date}{context.event.source ? ` · ${context.event.source}` : ""}</p>
                  <div className="research-metrics">
                    <div className="research-metric"><span>EPS</span><strong>{context.event.epsActual != null ? `$${context.event.epsActual.toFixed(2)} vs $${context.event.epsEstimate?.toFixed(2)} est.` : "Not reported"}</strong></div>
                    <div className="research-metric"><span>Guidance</span><strong>{context.event.guidanceChange || "Unchanged"}</strong></div>
                  </div>
                  {context.event.whatChanged.length > 0 && <ul className="research-list">{context.event.whatChanged.map((item) => <li key={item}>{item}</li>)}</ul>}
                </article>
              )}
              {context?.affected && (
                <article className="research-panel wide">
                  <h3>Affected households<span className="research-status">Synthetic book</span></h3>
                  <div className="research-metrics research-metrics-3">
                    <div className="research-metric"><span>Hold {displayed.ticker}</span><strong>{context.affected.count} of {context.affected.households}</strong></div>
                    <div className="research-metric"><span>Above {context.affected.thresholdPct ?? 10}% of the household</span><strong>{context.affected.concentrated}</strong></div>
                    <div className="research-metric"><span>Executives or insiders</span><strong>{context.affected.executives}</strong></div>
                  </div>
                </article>
              )}
              <article className="research-panel">
                <h3>Earnings<span className={`research-status ${displayed.earnings.status}`}>{displayed.earnings.status}</span></h3>
                {displayed.earnings.status === "absent" ? <p className="research-empty">No earnings surprise rows were in the snapshot.</p> : (
                  <div className="research-metrics">
                    <div className="research-metric"><span>Beat rate</span><strong>{formatPct(displayed.earnings.beatRate)}{displayed.earnings.observations ? ` · ${displayed.earnings.beats} of ${displayed.earnings.observations}` : ""}</strong></div>
                    <div className="research-metric"><span>Latest surprise</span><strong>{displayed.earnings.latestSurprisePct == null ? "Not reported" : `${displayed.earnings.latestSurprisePct > 0 ? "+" : ""}${displayed.earnings.latestSurprisePct.toFixed(1)}%`}</strong></div>
                    <div className="research-metric"><span>Revenue growth (YoY)</span><strong>{signedPct(displayed.earnings.revenue?.latestYoy)}</strong></div>
                    <div className="research-metric"><span>Growth slowing</span><strong>{displayed.earnings.revenue?.decelerating ? "Yes" : "No"}</strong></div>
                  </div>
                )}
              </article>
              <article className="research-panel">
                <h3>Peers<span className={`research-status ${displayed.peers.status}`}>{displayed.peers.status}</span></h3>
                {displayed.peers.status === "absent" ? <p className="research-empty">No industry peers were found for this snapshot.</p> : (
                  <div className="research-metrics">
                    <div className="research-metric"><span>Peer set</span><strong>{displayed.peers.tickers?.join(", ") || "Not reported"}</strong></div>
                    <div className="research-metric"><span>P/E</span><strong>{formatNumber(displayed.peers.subjectPe)}</strong></div>
                    <div className="research-metric"><span>Peer median P/E</span><strong>{formatNumber(displayed.peers.medianPe)}</strong></div>
                    <div className="research-metric"><span>Premium to peers</span><strong>{signedPct(displayed.peers.pePremium)}</strong></div>
                  </div>
                )}
              </article>
              <article className="research-panel">
                <h3>Returns vs SPY<span className={`research-status ${displayed.returns.status}`}>{displayed.returns.status}</span></h3>
                <div className="research-metrics">
                  {["1M", "3M", "6M", "1Y"].map((window) => (
                    <div className="research-metric" key={window}>
                      <span>{window}</span>
                      <strong>{vsSpy(displayed.returns.windows?.[window]?.ticker, displayed.returns.windows?.[window]?.spy)}</strong>
                    </div>
                  ))}
                </div>
              </article>
              <article className="research-panel">
                <h3>Macro<span className={`research-status ${displayed.macro.status}`}>{displayed.macro.status}</span></h3>
                {displayed.macro.status === "absent" ? <p className="research-empty">{displayed.macro.reason || "Live macro series are off."}</p> : (
                  <div className="research-metrics">
                    {Object.entries(displayed.macro.series || {}).map(([id, row]) => (
                      <div className="research-metric" key={id}>
                        <span>{row.label}</span>
                        <strong>{row.latest == null ? "Not reported" : `${row.latest} · ${row.direction || ""}`}</strong>
                      </div>
                    ))}
                  </div>
                )}
              </article>
              <article className="research-panel wide">
                <h3>Signal divergences<span className="research-status">{displayed.conflicts.length ? `${displayed.conflicts.length} found` : "none"}</span></h3>
                {displayed.conflicts.length === 0 ? <p className="research-empty">The indicators agree: no signal points the other way on this snapshot.</p> : displayed.conflicts.map((row) => (
                  <div className="research-conflict" key={row.id}>
                    <small className={`research-status ${row.severity}`}>{row.severity}</small>
                    <strong>{row.title}</strong>
                    <p>{row.left} · {row.right}</p>
                    {row.detail && <p>{row.detail}</p>}
                  </div>
                ))}
              </article>
              <article className="research-panel">
                <h3>Draft note<span className={`research-status ${displayed.note.status}`}>{displayed.note.status}</span></h3>
                {displayed.note.status !== "ready" ? <p className="research-empty">{displayed.note.reason || "No note this time. The numbers above are still released."}</p> : (
                  <>
                    <p className="research-fact">{displayed.note.summary}</p>
                    {(displayed.note.bullets || []).map((bullet) => <div className="research-fact" key={bullet}><p>{bullet}</p></div>)}
                    {(displayed.note.citations || []).length > 0 && (
                      <ul className="research-citations" aria-label="Citations">
                        {(displayed.note.citations || []).map((cite, index) => (
                          <li key={`${cite.field}-${index}`} title={[cite.excerpt, cite.value].filter(Boolean).join(" · ")}>{citationLabel(cite.field)}{cite.value ? <b>{citationValue(cite.field, cite.value)}</b> : null}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
              </article>
              <article className="research-panel">
                <h3>Suggested stance<span className={`research-status ${displayed.recommendation.status}`}>{displayed.recommendation.status}</span></h3>
                {displayed.recommendation.status !== "ready" ? <p className="research-empty">{displayed.recommendation.reason || "No stance this time."}</p> : (
                  <div className="research-fact">
                    <p><strong className="research-action">{displayed.recommendation.action}</strong> {displayed.recommendation.thesis}</p>
                  </div>
                )}
                <p className="research-disclaimer">A draft for the strategist to review. The CIO Office owns the rating. {RESEARCH_DISCLAIMER}.</p>
                {displayed.grounding && displayed.grounding.droppedClaims ? <p className="research-disclaimer">{displayed.grounding.droppedClaims} claim{displayed.grounding.droppedClaims === 1 ? "" : "s"} without support in the data {displayed.grounding.droppedClaims === 1 ? "was" : "were"} dropped.</p> : null}
              </article>
            </div>

            <section className="research-card research-accept">
              <div className="research-actions">
                <button
                  id="accept-research-note"
                  className="primary"
                  type="button"
                  disabled={isAccepted || displayed.note.status !== "ready"}
                  aria-describedby={reason ? "accept-research-reason" : undefined}
                  onClick={acceptNote}
                >
                  {isAccepted ? <><Check size={15} /> Research note accepted</> : <><Check size={15} /> Accept research note</>}
                </button>
                <button className="secondary" type="button" disabled={loading} onClick={() => analyze(true, displayed.ticker)}>Refresh</button>
              </div>
              {reason && <p id="accept-research-reason" className="research-disclaimer">{reason}</p>}
            </section>
          </>
        )}

        {timeline.visible.length > 0 && (
          <section className="research-card research-steps" aria-label="How this note was made">
            <div className="research-kicker">
              <span>RUN STEPS</span>
              {timeline.mode === "recorded" && <span className="research-source-chip">Recorded run</span>}
            </div>
            <RunTimeline label="Research run steps" events={timeline.visible} start={timeline.run?.started_at} className="boxed" showLane />
          </section>
        )}
      </div>
      <RunStats ledger={ledger} {...stats} empty="Analyze a ticker. The note's model calls and AI Defense verdicts land here." />
      {embedded && inStory && <div className="research-story"><span>STORY MODE</span> Research notes stay local until you accept them. Clearing the company profile does not wipe this note.</div>}
    </div>
  );
}
