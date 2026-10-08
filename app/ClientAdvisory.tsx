"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  Landmark,
  Loader2,
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  Table2,
  WalletCards,
  X,
} from "lucide-react";
import type { StoredCompanyProfile } from "./company-profile";
import {
  ADVISORY_DISCLAIMER,
  briefingPayload,
  clearAdvisoryBrief,
  defaultHoldings,
  loadAdvisoryBrief,
  normalizeAdvisory,
  researchPayload,
  saveAdvisoryBrief,
  type AdvisoryBriefResponse,
  type HoldingInput,
  type StoredAdvisoryBrief,
} from "./advisory-brief";
import {
  formatPct,
  loadResearchNote,
  normalizeWealthHealth,
  observabilityLabel,
  parseApiError,
  type StoredResearchNote,
  type WealthHealth,
} from "./research-note";
import RunStats, { startRun, useRunLedger } from "./RunStats";
import { useStudioNav } from "./studio-nav";
import { observeWealth, wealthService, wealthStats, type WealthService } from "./wealth-stats";
import "./advisory.css";

type Props = {
  embedded?: boolean;
  inStory?: boolean;
  companyProfile?: StoredCompanyProfile | null;
  researchNote?: StoredResearchNote | null;
  brief?: StoredAdvisoryBrief | null;
  onBriefChange?: (brief: StoredAdvisoryBrief | null) => void;
};

function defenseLabel(health?: WealthHealth | null, result?: AdvisoryBriefResponse | null) {
  const current = result?.security || health?.security;
  if (current?.mode === "off" || current?.status === "disabled") return "Disabled";
  return current?.verdict || current?.status || "Not reported";
}

export default function ClientAdvisory({
  embedded = false,
  inStory = false,
  companyProfile,
  researchNote,
  brief,
  onBriefChange,
}: Props) {
  const accepted = brief !== undefined ? brief : loadAdvisoryBrief();
  const note = researchNote !== undefined ? researchNote : loadResearchNote();
  const [health, setHealth] = useState<WealthHealth | null>(null);
  const [service, setService] = useState<WealthService | null>(null);
  const ledger = useRunLedger();
  const { links } = useStudioNav();
  const stats = useMemo(() => wealthStats(service, "/api/wealth/advisory/brief", links?.agentObservability), [service, links?.agentObservability]);
  const [holdings, setHoldings] = useState<HoldingInput[]>(accepted?.holdings?.length ? accepted.holdings : defaultHoldings(companyProfile, note || undefined));
  const [clientNotes, setClientNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AdvisoryBriefResponse | null>(null);

  useEffect(() => {
    fetch("/api/wealth/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Health check unavailable")))
      .then((body) => { setHealth(normalizeWealthHealth(body)); setService(wealthService(body)); })
      .catch(() => { setHealth({ ready: false, perimeter: "Yahoo + FRED allowlist only", nim: { status: "down" } }); setService({ reachable: false }); });
  }, []);

  const displayed = draft || accepted?.brief || null;
  const isAccepted = Boolean(accepted && !draft && displayed);
  const hasBriefing = Boolean(companyProfile?.briefing);
  const hasNote = Boolean(note?.analyze);

  function updateHolding(index: number, patch: Partial<HoldingInput>) {
    setHoldings((rows) => rows.map((row, current) => current === index ? { ...row, ...patch } : row));
  }

  async function requestBrief(event?: FormEvent) {
    event?.preventDefault();
    const rows = holdings.filter((item) => item.ticker.trim());
    if (!rows.length) {
      setError("Enter at least one holding ticker and weight.");
      return;
    }
    setLoading(true);
    setError("");
    const run = startRun("brief", `Meeting brief · ${rows.map((item) => item.ticker.trim().toUpperCase()).join(", ")}`);
    ledger.record(run);
    let settled = false;
    try {
      const response = await fetch("/api/wealth/advisory/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: rows.map((item) => ({ ticker: item.ticker.trim().toUpperCase(), weight: item.weight })),
          clientNotes: clientNotes.trim() || undefined,
          briefing: briefingPayload(companyProfile) || undefined,
          research: researchPayload(note) || undefined,
        }),
        signal: AbortSignal.timeout(180000),
      });
      const text = await response.text();
      let payload: unknown = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }
      ledger.record(observeWealth(run, response.status, payload));
      settled = true;
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const next = normalizeAdvisory(text ? JSON.parse(text) : {});
      if (!next) throw new Error("The advisory service returned an empty brief.");
      setDraft(next);
    } catch (cause) {
      if (!settled) ledger.record({ ...run, status: "failed" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "The meeting brief timed out. Holdings metrics may still be retried."
        : cause instanceof Error ? cause.message : "Brief failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function acceptBrief() {
    if (!displayed) return;
    const next: StoredAdvisoryBrief = {
      acceptedAt: new Date().toISOString(),
      holdings: holdings.filter((item) => item.ticker.trim()),
      brief: displayed,
    };
    saveAdvisoryBrief(next);
    setDraft(null);
    onBriefChange?.(next);
  }

  function clearBrief() {
    clearAdvisoryBrief();
    setDraft(null);
    onBriefChange?.(null);
  }

  return (
    <div className={`advisory-demo ${embedded ? "advisory-embedded" : ""}`}>
      <section className="advisory-runtime" aria-label="Advisory runtime">
        <div>
          <span><Server size={15} /> NIM</span>
          <strong className={health?.nim?.status === "reachable" || health?.ready ? "is-ready" : "is-down"}>
            {health?.nim?.status || (health?.ready ? "reachable" : "down")}
          </strong>
        </div>
        <div>
          <span><Table2 size={15} /> Entitled</span>
          <strong>{hasBriefing ? "Briefing" : "No briefing"} · {hasNote ? "Note" : "No note"}</strong>
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
          <span><WalletCards size={15} /> Perimeter</span>
          <strong>{health?.perimeter || "Yahoo + FRED allowlist only"}</strong>
        </div>
      </section>

      <div className="advisory-layout">
        <section className="advisory-card">
          <div className="advisory-kicker"><span>ENTITLED CONTEXT</span></div>
          <h2>Accepted briefing and research note</h2>
          <p className="advisory-lead">The meeting brief uses only accepted studio context plus presenter-entered holdings. There is no household catalog.</p>
          <div className="advisory-entitled">
            {hasBriefing ? (
              <div className="advisory-theme">
                <strong>{companyProfile?.company.name} briefing accepted</strong>
                <p>{companyProfile?.briefing.objectives.facts[0]?.text || "Objectives were extracted from the accepted filing."}</p>
              </div>
            ) : (
              <div className="advisory-prompt">Accept a company briefing first so this meeting can cite filing excerpts.</div>
            )}
            {hasNote ? (
              <div className="advisory-theme">
                <strong>Research note accepted for {note?.ticker}</strong>
                <p>{note?.analyze.note.summary || note?.analyze.recommendation.thesis || "Indicators and conflicts are available from the accepted note."}</p>
              </div>
            ) : (
              <div className="advisory-prompt">Accept a research note so the brief can cite the live snapshot.</div>
            )}
          </div>
        </section>

        <section className="advisory-card">
          <div className="advisory-kicker"><span>HOLDINGS</span></div>
          <h2>Presenter-entered live holdings</h2>
          <form onSubmit={requestBrief}>
            <div className="advisory-holdings">
              {holdings.map((row, index) => (
                <div className="advisory-holding" key={`${row.ticker}-${index}`}>
                  <input
                    aria-label={`Holding ticker ${index + 1}`}
                    value={row.ticker}
                    placeholder="Ticker"
                    onChange={(event) => updateHolding(index, { ticker: event.target.value.toUpperCase() })}
                  />
                  <input
                    aria-label={`Holding weight ${index + 1}`}
                    type="number"
                    min="0"
                    max="1"
                    step="0.01"
                    value={row.weight}
                    onChange={(event) => updateHolding(index, { weight: Number(event.target.value) })}
                  />
                  <button type="button" aria-label="Remove holding" onClick={() => setHoldings((rows) => rows.filter((_, current) => current !== index))}><X size={14} /></button>
                </div>
              ))}
              <button type="button" className="advisory-add" onClick={() => setHoldings((rows) => [...rows, { ticker: "", weight: 0.1 }])}><Plus size={14} /> Add holding</button>
            </div>
            <textarea
              className="advisory-notes"
              value={clientNotes}
              onChange={(event) => setClientNotes(event.target.value)}
              placeholder="IPS notes: objective, risk tolerance, horizon"
              aria-label="Client IPS notes"
            />
            <div className="advisory-actions">
              <button className="primary" disabled={loading}>
                {loading ? <><Loader2 size={15} className="spin" /> Preparing…</> : <><Sparkles size={15} /> Prepare meeting brief</>}
              </button>
              <button type="button" className="secondary" disabled={!accepted && !draft} onClick={clearBrief}>Clear brief</button>
            </div>
            <p className="advisory-disclaimer">{ADVISORY_DISCLAIMER}. Advisor-owned. No auto-trade. Weights are fractions (0.25 = 25%).</p>
          </form>
        </section>

        {error && (
          <div className="advisory-error">
            <CircleAlert size={14} />
            <div>{error}</div>
            <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button>
          </div>
        )}

        {displayed && (
          <>
            <section className="advisory-card">
              <div className="advisory-kicker">
                <span>MEETING BRIEF</span>
                {isAccepted && <span className="advisory-accepted"><Check size={12} /> Meeting brief accepted</span>}
              </div>
              <h2>Advisor review</h2>
              <div className="advisory-banner">{displayed.disclaimer || ADVISORY_DISCLAIMER}</div>
              <div className="advisory-actions">
                <button id="accept-meeting-brief" className="primary" type="button" disabled={isAccepted} onClick={acceptBrief}>
                  {isAccepted ? <><Check size={15} /> Meeting brief accepted</> : "Accept meeting brief"}
                </button>
              </div>
            </section>
            <div className="advisory-panels">
              <article className="advisory-panel">
                <h3>Live holdings<span className="advisory-status ready">ready</span></h3>
                {displayed.holdings.map((item) => (
                  <div className="advisory-row" key={item.ticker}>
                    <strong>{item.ticker} · {formatPct(item.weight)}</strong>
                    <div>{item.name || item.sector || item.status} · 1Y {formatPct(item.return_1y)} vs SPY {formatPct(item.return_1y_vs_spy)}</div>
                  </div>
                ))}
              </article>
              <article className="advisory-panel">
                <h3>Suitability<span className="advisory-status">{displayed.suitability.length ? "findings" : "clear"}</span></h3>
                {displayed.suitability.length === 0 ? <p className="advisory-empty">No concentration or IPS-rule findings.</p> : displayed.suitability.map((item) => (
                  <div className="advisory-row" key={item.id}>
                    <span className={`advisory-status ${item.severity}`}>{item.severity}</span> {item.detail}
                  </div>
                ))}
              </article>
              <article className="advisory-panel wide">
                <h3>NIM meeting brief<span className={`advisory-status ${displayed.brief.status}`}>{displayed.brief.status}</span></h3>
                {displayed.brief.status !== "ready" ? (
                  <p className="advisory-empty">{displayed.brief.reason || "Brief omitted. Holdings and suitability rows remain."}</p>
                ) : (
                  <>
                    {displayed.brief.opening && <p className="advisory-fact">{displayed.brief.opening}</p>}
                    {(displayed.brief.agenda || []).map((item) => <div className="advisory-fact" key={item}>{item}</div>)}
                    {(displayed.brief.discussion_points || []).map((item) => <div className="advisory-fact" key={item}>{item}</div>)}
                    {(displayed.brief.suitability_callouts || []).map((item) => <div className="advisory-fact" key={item}>{item}</div>)}
                  </>
                )}
              </article>
            </div>
          </>
        )}
      </div>
      <RunStats ledger={ledger} {...stats} empty="Request a meeting brief. Its model calls and AI Defense verdicts land here." />
      {embedded && inStory && <div className="advisory-story"><span>STORY MODE</span> The advisor gate stays on the brief. Clearing the company profile does not wipe this meeting note.</div>}
    </div>
  );
}
