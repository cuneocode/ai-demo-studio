"use client";

import { FormEvent, useEffect, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  Landmark,
  Loader2,
  Server,
  ShieldCheck,
  Sparkles,
  Table2,
  X,
} from "lucide-react";
import type { StoredCompanyProfile } from "./company-profile";
import {
  EXAMPLE_RESEARCH_TICKERS,
  RESEARCH_DISCLAIMER,
  clearResearchNote,
  formatNumber,
  formatPct,
  loadResearchNote,
  normalizeAnalyze,
  normalizeWealthHealth,
  observabilityLabel,
  parseApiError,
  saveResearchNote,
  tickerFromProfile,
  type ResearchAnalyze,
  type StoredResearchNote,
  type WealthHealth,
} from "./research-note";
import "./research.css";

type Props = {
  embedded?: boolean;
  inStory?: boolean;
  companyProfile?: StoredCompanyProfile | null;
  note?: StoredResearchNote | null;
  onNoteChange?: (note: StoredResearchNote | null) => void;
};

function defenseLabel(health?: WealthHealth | null, analyze?: ResearchAnalyze | null) {
  const current = analyze?.security || health?.security;
  const mode = current?.mode || health?.security?.mode;
  if (mode === "off" || current?.status === "disabled") return "Disabled";
  return current?.verdict || current?.status || "Not reported";
}

function cacheAge(analyze?: ResearchAnalyze | null) {
  const fetched = analyze?.source.fetchedAt;
  if (!fetched) return "No snapshot yet";
  const stamp = Date.parse(fetched);
  if (Number.isNaN(stamp)) return analyze.source.kind;
  const minutes = Math.max(0, Math.round((Date.now() - stamp) / 60000));
  if (minutes < 1) return `${analyze.source.kind} · just now`;
  if (minutes < 60) return `${analyze.source.kind} · ${minutes}m`;
  return `${analyze.source.kind} · ${Math.round(minutes / 60)}h`;
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
  const [draft, setDraft] = useState<ResearchAnalyze | null>(null);
  const [tickerSyncKey, setTickerSyncKey] = useState(`${profileTicker}|idle`);
  const nextTickerSyncKey = `${profileTicker}|${draft ? "draft" : "idle"}`;
  if (nextTickerSyncKey !== tickerSyncKey) {
    setTickerSyncKey(nextTickerSyncKey);
    if (profileTicker && !draft) setTicker(profileTicker);
  }

  useEffect(() => {
    fetch("/api/wealth/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Health check unavailable")))
      .then((body) => setHealth(normalizeWealthHealth(body)))
      .catch(() => setHealth({ ready: false, perimeter: "Yahoo + FRED allowlist only", detail: "Wealth service unavailable", nim: { status: "down" } }));
  }, []);

  const displayed = draft || accepted?.analyze || null;
  const isAccepted = Boolean(accepted && !draft && displayed && accepted.ticker === displayed.ticker);
  const nimDown = health?.nim?.status === "down" || health?.ready === false;

  async function analyze(refresh = false, preset?: string) {
    const symbol = (preset ?? ticker).trim().toUpperCase();
    if (!symbol) {
      setError("Enter a US ticker.");
      return;
    }
    if (preset) setTicker(symbol);
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/wealth/research/analyze", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: symbol, refresh }),
        signal: AbortSignal.timeout(180000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const next = normalizeAnalyze(text ? JSON.parse(text) : {}, symbol);
      if (!next) throw new Error("The research service returned an empty snapshot.");
      setDraft(next);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "Analyze timed out. Try again or use cache if a snapshot already exists."
        : cause instanceof Error ? cause.message : "Analyze failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function acceptNote() {
    if (!displayed) return;
    const next: StoredResearchNote = {
      ticker: displayed.ticker,
      acceptedAt: new Date().toISOString(),
      analyze: displayed,
    };
    saveResearchNote(next);
    setDraft(null);
    onNoteChange?.(next);
  }

  function clearNote() {
    clearResearchNote();
    setDraft(null);
    setError("");
    onNoteChange?.(null);
  }

  return (
    <div className={`research-demo ${embedded ? "research-embedded" : ""}`}>
      <section className="research-runtime" aria-label="Research runtime">
        <div>
          <span><Server size={15} /> NIM</span>
          <strong className={health?.nim?.status === "reachable" || health?.ready ? "is-ready" : "is-down"}>
            {health?.nim?.status || (health?.ready ? "reachable" : "down")}
          </strong>
        </div>
        <div>
          <span><Table2 size={15} /> Cache</span>
          <strong>{cacheAge(displayed)}</strong>
        </div>
        <div>
          <span><ShieldCheck size={15} /> Defense</span>
          <strong>{defenseLabel(health, displayed)}</strong>
        </div>
        <div>
          <span><Landmark size={15} /> FRED</span>
          <strong className={health?.fred?.status === "configured" ? "is-ready" : "is-down"}>{health?.fred?.status || "absent"}</strong>
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
            <span className="research-source-chip">Yahoo + FRED cache</span>
          </div>
          <h2>Analyze a US ticker</h2>
          <p className="research-lead">
            Live allowlisted Yahoo and FRED fetches write through a local cache. Indicators and conflict rows release even when the local NIM is down.
            {companyProfile?.company.ticker ? ` Accepted briefing ticker is ${companyProfile.company.ticker}.` : ""}
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
            <div className="research-chips" aria-label="Example tickers">
              {EXAMPLE_RESEARCH_TICKERS.map((item) => (
                <button key={item} type="button" disabled={loading} onClick={() => analyze(false, item)}>{item}</button>
              ))}
            </div>
            <div className="research-actions">
              <button className="primary" disabled={loading || !ticker.trim()}>
                {loading ? <><Loader2 size={15} className="spin" /> Analyzing…</> : <><Sparkles size={15} /> Analyze</>}
              </button>
              <button type="button" className="secondary" disabled={loading || !ticker.trim()} onClick={() => analyze(true)}>Refresh</button>
              <button type="button" className="secondary" disabled={!accepted && !draft} onClick={clearNote}>Clear note</button>
            </div>
            <p className="research-disclaimer">{RESEARCH_DISCLAIMER}. Start local NIM with services/llm/serve.sh for synthesis. This workbench does not assert live Yahoo, FRED, or NIM availability.</p>
          </form>
        </section>

        {nimDown && (
          <div className="research-banner"><CircleAlert size={14} /> Local NIM is down. Analyze still returns earnings, peers, returns, macro, and conflicts. The note is omitted.</div>
        )}

        {error && (
          <div className="research-error">
            <CircleAlert size={14} />
            <div>{error}</div>
            <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button>
          </div>
        )}

        {displayed && (
          <>
            <section className="research-card research-review">
              <div>
                <div className="research-kicker">
                  <span>REVIEW</span>
                  {isAccepted && <span className="research-accepted"><Check size={12} /> Research note accepted</span>}
                </div>
                <h2>{displayed.company.name} ({displayed.ticker})</h2>
                <p>{[displayed.company.sector, displayed.company.industry, displayed.source.kind].filter(Boolean).join(" · ")}</p>
                <span className="research-source-chip">{displayed.source.label || "Yahoo Finance"} · {displayed.source.kind}</span>
              </div>
              <div className="research-actions">
                <button id="accept-research-note" className="primary" type="button" disabled={isAccepted} onClick={acceptNote}>
                  {isAccepted ? <><Check size={15} /> Research note accepted</> : "Accept research note"}
                </button>
                <button className="secondary" type="button" disabled={loading} onClick={() => analyze(true, displayed.ticker)}>Refresh</button>
              </div>
            </section>
            <div className="research-banner">{displayed.disclaimer || RESEARCH_DISCLAIMER}</div>

            <div className="research-panels">
              <article className="research-panel">
                <h3>Earnings<span className={`research-status ${displayed.earnings.status}`}>{displayed.earnings.status}</span></h3>
                {displayed.earnings.status === "absent" ? <p className="research-empty">No earnings surprise rows were in the snapshot.</p> : (
                  <div className="research-metrics">
                    <div className="research-metric"><span>Beat rate</span><strong>{formatPct(displayed.earnings.beatRate)}</strong></div>
                    <div className="research-metric"><span>Latest surprise</span><strong>{displayed.earnings.latestSurprisePct == null ? "Not reported" : `${displayed.earnings.latestSurprisePct.toFixed(1)}%`}</strong></div>
                    <div className="research-metric"><span>Revenue YoY</span><strong>{formatPct(displayed.earnings.revenue?.latestYoy)}</strong></div>
                    <div className="research-metric"><span>Decelerating</span><strong>{displayed.earnings.revenue?.decelerating ? "Yes" : "No"}</strong></div>
                  </div>
                )}
              </article>
              <article className="research-panel">
                <h3>Peers<span className={`research-status ${displayed.peers.status}`}>{displayed.peers.status}</span></h3>
                {displayed.peers.status === "absent" ? <p className="research-empty">Live industry peers were not discovered for this snapshot.</p> : (
                  <div className="research-metrics">
                    <div className="research-metric"><span>Peer set</span><strong>{displayed.peers.tickers?.join(", ") || "Not reported"}</strong></div>
                    <div className="research-metric"><span>Subject P/E</span><strong>{formatNumber(displayed.peers.subjectPe)}</strong></div>
                    <div className="research-metric"><span>Median P/E</span><strong>{formatNumber(displayed.peers.medianPe)}</strong></div>
                    <div className="research-metric"><span>P/E premium</span><strong>{formatPct(displayed.peers.pePremium)}</strong></div>
                  </div>
                )}
              </article>
              <article className="research-panel">
                <h3>Returns vs SPY<span className={`research-status ${displayed.returns.status}`}>{displayed.returns.status}</span></h3>
                <div className="research-metrics">
                  {["1M", "3M", "6M", "1Y"].map((window) => (
                    <div className="research-metric" key={window}>
                      <span>{window}</span>
                      <strong>{formatPct(displayed.returns.windows?.[window]?.ticker)} · vs SPY {formatPct(displayed.returns.windows?.[window]?.excess)}</strong>
                    </div>
                  ))}
                </div>
              </article>
              <article className="research-panel">
                <h3>Macro<span className={`research-status ${displayed.macro.status}`}>{displayed.macro.status}</span></h3>
                {displayed.macro.status === "absent" ? <p className="research-empty">{displayed.macro.reason || "FRED is not configured."}</p> : (
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
                <h3>Conflicts<span className="research-status">{displayed.conflicts.length ? "ready" : "none"}</span></h3>
                {displayed.conflicts.length === 0 ? <p className="research-empty">No structured conflicts fired on this snapshot.</p> : displayed.conflicts.map((row) => (
                  <div className="research-conflict" key={row.id}>
                    <small className={`research-status ${row.severity}`}>{row.severity} · {row.id}</small>
                    <strong>{row.left} vs {row.right}</strong>
                    <p>{row.detail}</p>
                  </div>
                ))}
              </article>
              <article className="research-panel">
                <h3>Draft note<span className={`research-status ${displayed.note.status}`}>{displayed.note.status}</span></h3>
                {displayed.note.status !== "ready" ? <p className="research-empty">{displayed.note.reason || "Note omitted. Numbers above still released."}</p> : (
                  <>
                    <p className="research-fact">{displayed.note.summary}</p>
                    {(displayed.note.bullets || []).map((bullet) => <div className="research-fact" key={bullet}><p>{bullet}</p></div>)}
                  </>
                )}
              </article>
              <article className="research-panel">
                <h3>Demo recommendation<span className={`research-status ${displayed.recommendation.status}`}>{displayed.recommendation.status}</span></h3>
                {displayed.recommendation.status !== "ready" ? <p className="research-empty">{displayed.recommendation.reason || "Recommendation omitted."}</p> : (
                  <div className="research-fact">
                    <p><strong>{displayed.recommendation.action}</strong> — {displayed.recommendation.thesis}</p>
                  </div>
                )}
                <p className="research-disclaimer">{displayed.recommendation.disclaimer || RESEARCH_DISCLAIMER}</p>
                {displayed.grounding && <p className="research-disclaimer">Grounding dropped {displayed.grounding.droppedClaims} ungrounded claims.</p>}
                {displayed.security && <p className="research-disclaimer">AI Defense: {displayed.security.verdict || displayed.security.status}</p>}
              </article>
            </div>
          </>
        )}
      </div>
      {embedded && inStory && <div className="research-story"><span>STORY MODE</span> Research notes stay local until you accept them. Clearing the company profile does not wipe this note.</div>}
    </div>
  );
}
