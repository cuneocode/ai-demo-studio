"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  Check,
  CircleAlert,
  History,
  Loader2,
  Plus,
  Server,
  ShieldCheck,
  Sparkles,
  Table2,
  UsersRound,
  WalletCards,
  X,
} from "lucide-react";
import type { StoredCompanyProfile } from "./company-profile";
import DemoStatusBanner from "./DemoStatusBanner";
import {
  ADVISORY_DISCLAIMER,
  briefingPayload,
  clearAdvisoryBrief,
  defaultHoldings,
  fetchHousehold,
  fetchHouseholds,
  formatMoney,
  loadAdvisoryBrief,
  normalizeAdvisory,
  notesFromHousehold,
  researchPayload,
  saveAdvisoryBrief,
  type AdvisoryBriefResponse,
  type HoldingInput,
  type HouseholdCard,
  type StoredAdvisoryBrief,
} from "./advisory-brief";
import {
  ADVISORY_RECORDING,
  citationLabel,
  citationValue,
  formatPct,
  loadResearchNote,
  loadWealthRecording,
  normalizeWealthHealth,
  observabilityLabel,
  parseApiError,
  vsSpy,
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
import "./advisory.css";

type Props = {
  embedded?: boolean;
  inStory?: boolean;
  companyProfile?: StoredCompanyProfile | null;
  researchNote?: StoredResearchNote | null;
  brief?: StoredAdvisoryBrief | null;
  onBriefChange?: (brief: StoredAdvisoryBrief | null) => void;
};

type Origin = { kind: "live" } | { kind: "recorded"; recordedAt: string };

const REFUSED_TITLE = "Sparky (private model) is down and client data may only go to a hosted model after Cisco AI Defense inspects it; AI Defense is not configured";
const RECORDED_HOUSEHOLD = "dana-whitfield";

function defenseLabel(health?: WealthHealth | null, result?: AdvisoryBriefResponse | null) {
  const current = result?.security || health?.security;
  if (result?.security?.forced) return `Enforce (forced for a hosted model) · ${result.security.status || "checked"}`;
  if (current?.mode === "off" || current?.status === "disabled") return "Off · forced to enforce for hosted models";
  return current?.verdict || current?.status || "Not reported";
}

function modelLabel(health?: WealthHealth | null) {
  const model = health?.advisoryModel || health?.nim;
  if (!health) return "Checking…";
  if (!model?.label || model.status === "down") return "None reachable";
  return `${model.label}${model.private ? " · private" : " · hosted"}${model.fallback ? " · fallback" : ""}`;
}

function egressLabel(health?: WealthHealth | null) {
  const model = health?.advisoryModel;
  if (!model?.label || model.status === "down") return "No model reachable";
  if (model.private) return "Stays on the private model";
  return health?.advisoryHostedFallback?.startsWith("refused") ? "Refused: AI Defense not configured" : "Hosted, after AI Defense (enforce)";
}

/** The model would be hosted and AI Defense cannot inspect: the service will refuse to send client data. */
function willRefuse(health?: WealthHealth | null) {
  const model = health?.advisoryModel;
  return Boolean(model?.label && model.status !== "down" && !model.private && health?.advisoryHostedFallback?.startsWith("refused"));
}

function briefProvenance(result: AdvisoryBriefResponse, origin: Origin): Provenance {
  if (origin.kind === "recorded") return { kind: "recorded", recordedAt: origin.recordedAt, servedBy: result.servedBy };
  if (result.brief.status === "refused") return { kind: "none", detail: "Client data not sent · no model call" };
  if (result.brief.status === "ready" && result.servedBy && result.llmCalls !== 0) return { kind: "live", servedBy: result.servedBy };
  return { kind: "none", detail: "No model answered · holdings and suitability only" };
}

function acceptReason(result: AdvisoryBriefResponse) {
  const status = result.brief.status;
  if (status === "ready") return "";
  if (status === "refused") return "No brief was drafted: client data was not sent to a hosted model. Holdings and suitability above are still usable.";
  return `The meeting brief is ${status}${result.brief.reason ? `: ${result.brief.reason}` : ""}. Only a ready brief can be accepted.`;
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
  const timeline = useRun({ pageUrl: (id, after) => `/api/wealth/runs/${encodeURIComponent(id)}?after=${after}` });
  const { links } = useStudioNav();
  const stats = useMemo(() => wealthStats(service, "/api/wealth/advisory/brief", links?.agentObservability), [service, links?.agentObservability]);
  const [households, setHouseholds] = useState<HouseholdCard[]>([]);
  const [householdId, setHouseholdId] = useState<string | null>(accepted?.householdId ?? null);
  const [picking, setPicking] = useState<string | null>(null);
  const [holdings, setHoldings] = useState<HoldingInput[]>(accepted?.holdings?.length ? accepted.holdings : defaultHoldings(companyProfile, note || undefined));
  const [clientNotes, setClientNotes] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [draft, setDraft] = useState<AdvisoryBriefResponse | null>(null);
  const [origin, setOrigin] = useState<Origin>({ kind: "live" });
  const [refused, setRefused] = useState(false);
  const [focusTick, setFocusTick] = useState(0);
  const headingRef = useRef<HTMLHeadingElement>(null);

  useEffect(() => {
    fetch("/api/wealth/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Health check unavailable")))
      .then((body) => { setHealth(normalizeWealthHealth(body)); setService(wealthService(body)); })
      .catch(() => { setHealth({ ready: false, perimeter: "Yahoo + FRED allowlist only", nim: { status: "down" } }); setService({ reachable: false }); });
    fetchHouseholds().then(setHouseholds).catch(() => setHouseholds([]));
  }, []);

  useEffect(() => {
    if (!focusTick) return;
    const heading = headingRef.current;
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
    heading?.focus({ preventScroll: true });
  }, [focusTick]);

  const displayed = draft || accepted?.brief || null;
  const shownOrigin: Origin = draft ? origin : accepted?.recordedAt ? { kind: "recorded", recordedAt: accepted.recordedAt } : { kind: "live" };
  const isAccepted = Boolean(accepted && !draft && displayed);
  const hasBriefing = Boolean(companyProfile?.briefing);
  const hasNote = Boolean(note?.analyze);
  const reason = displayed ? acceptReason(displayed) : "";
  const showRefusal = refused || (willRefuse(health) && shownOrigin.kind !== "recorded");
  const total = holdings.reduce((sum, row) => sum + (Number.isFinite(row.weight) ? row.weight : 0), 0);
  const inspectedBy = displayed && shownOrigin.kind === "live" && displayed.brief.status === "ready" && displayed.servedBy && !displayed.servedBy.private
    && (displayed.security?.forced || displayed.servedBy.ai_defense?.startsWith("enforce")) ? displayed.servedBy.label : null;

  function updateHolding(index: number, patch: Partial<HoldingInput>) {
    setHoldings((rows) => rows.map((row, current) => current === index ? { ...row, ...patch } : row));
  }

  async function pickHousehold(id: string) {
    setPicking(id);
    setError("");
    try {
      const record = await fetchHousehold(id);
      setHouseholdId(record.id);
      setHoldings(record.holdings.map((row) => ({ ticker: row.ticker, weight: row.weightPct })));
      setClientNotes(notesFromHousehold(record));
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That household is unavailable.");
    } finally {
      setPicking(null);
    }
  }

  function enterByHand() {
    setHouseholdId(null);
    setHoldings(defaultHoldings(companyProfile, note || undefined));
    setClientNotes("");
  }

  async function showRecorded() {
    try {
      const recording = await loadWealthRecording(ADVISORY_RECORDING);
      const next = normalizeAdvisory(recording.result);
      if (!next) throw new Error("The recorded run has no meeting brief.");
      timeline.play({ run: recording.run, events: recording.events });
      ledger.record(observeRecordedWealth(startRun("brief", `${next.household?.name || "Meeting brief"} · recorded`), recording.result, recording.recordedAt));
      setDraft(next);
      setOrigin({ kind: "recorded", recordedAt: recording.recordedAt });
      setFocusTick((tick) => tick + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recorded meeting brief is unavailable.");
    }
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
    setRefused(false);
    const runId = newRunId("wealth-advisory");
    timeline.open(runId);
    const run = startRun("brief", `Meeting brief · ${rows.map((item) => item.ticker.trim().toUpperCase()).join(", ")}`);
    ledger.record(run);
    let settled = false;
    try {
      const response = await fetch("/api/wealth/advisory/brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          holdings: rows.map((item) => ({ ticker: item.ticker.trim().toUpperCase(), weight: item.weight })),
          weights_unit: "percent",
          household_id: householdId || undefined,
          clientNotes: clientNotes.trim() || undefined,
          briefing: briefingPayload(companyProfile) || undefined,
          research: researchPayload(note) || undefined,
          run_id: runId,
        }),
        signal: AbortSignal.timeout(180000),
      });
      const text = await response.text();
      let payload: unknown = {};
      try { payload = text ? JSON.parse(text) : {}; } catch { /* non-JSON error body */ }
      ledger.record(observeWealth(run, response.status, payload));
      settled = true;
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const next = normalizeAdvisory(payload);
      if (!next) throw new Error("The advisory service returned an empty brief.");
      if (next.brief.status === "refused") {
        setRefused(true);
        if (!householdId || householdId === RECORDED_HOUSEHOLD) {
          await showRecorded();
          return;
        }
      }
      setDraft(next);
      setOrigin({ kind: "live" });
      setFocusTick((tick) => tick + 1);
    } catch (cause) {
      if (!settled) ledger.record({ ...run, status: "failed" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "The meeting brief timed out. Try again, or show the recorded brief."
        : cause instanceof TypeError ? "The wealth service did not answer."
          : cause instanceof Error ? cause.message : "Brief failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function acceptBrief() {
    if (!displayed || displayed.brief.status !== "ready") return;
    const next: StoredAdvisoryBrief = {
      acceptedAt: new Date().toISOString(),
      holdings: holdings.filter((item) => item.ticker.trim()),
      brief: displayed,
      householdId: displayed.household?.id ?? householdId ?? undefined,
      recordedAt: shownOrigin.kind === "recorded" ? shownOrigin.recordedAt : undefined,
    };
    saveAdvisoryBrief(next);
    setDraft(null);
    onBriefChange?.(next);
  }

  function clearBrief() {
    clearAdvisoryBrief();
    setDraft(null);
    setRefused(false);
    timeline.reset();
    onBriefChange?.(null);
  }

  return (
    <div className={`advisory-demo ${embedded ? "advisory-embedded" : ""}`}>
      <section className="advisory-runtime" aria-label="Advisory runtime">
        <div>
          <span><Server size={15} /> Model</span>
          <strong className={health?.advisoryModel?.status === "down" || health?.ready === false ? "is-down" : health ? "is-ready" : undefined}>{modelLabel(health)}</strong>
        </div>
        <div>
          <span><ShieldCheck size={15} /> Client data</span>
          <strong className={willRefuse(health) ? "is-down" : undefined}>{egressLabel(health)}</strong>
        </div>
        <div>
          <span><ShieldCheck size={15} /> AI Defense</span>
          <strong>{defenseLabel(health, displayed)}</strong>
        </div>
        <div>
          <span><Table2 size={15} /> Shared context</span>
          <strong>{hasNote ? "Research note" : "No research note"} · {hasBriefing ? "briefing" : "no briefing"}</strong>
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
        {showRefusal && (
          <DemoStatusBanner
            title={REFUSED_TITLE}
            stillWorks="recorded meeting brief, holdings and suitability"
            fix="configure AI Defense or bring Sparky up"
            settingsSection="st-ai-defense"
            actions={shownOrigin.kind !== "recorded" ? (
              <button type="button" onClick={showRecorded}><History size={14} aria-hidden="true" /> Show the recorded Dana Whitfield brief</button>
            ) : undefined}
          />
        )}

        {households.length > 0 && (
          <section className="advisory-card" aria-labelledby="advisory-households-heading">
            <div className="advisory-kicker"><span><UsersRound size={14} /> HOUSEHOLDS</span><span className="advisory-tag">Synthetic</span></div>
            <h2 id="advisory-households-heading">Pick a client household</h2>
            <p className="advisory-lead">Fictional clients from a synthetic CRM. Picking one fills the holdings and client notes; you can still edit both.</p>
            <div className="advisory-households" role="group" aria-label="Synthetic households">
              {households.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  className={`advisory-household ${householdId === item.id ? "is-selected" : ""}`}
                  aria-pressed={householdId === item.id}
                  disabled={loading || picking !== null}
                  onClick={() => pickHousehold(item.id)}
                >
                  <span className="advisory-household-name">{item.name}{picking === item.id && <Loader2 size={13} className="spin" />}</span>
                  <span className="advisory-household-meta">{[item.age ? `${item.age}` : "", item.riskProfile, formatMoney(item.totalValue)].filter(Boolean).join(" · ")}</span>
                  {item.headline && <span className="advisory-household-headline">{item.headline}</span>}
                  <span className="advisory-tag">Synthetic</span>
                </button>
              ))}
            </div>
            {householdId && <button type="button" className="advisory-link" onClick={enterByHand}>Enter holdings by hand instead</button>}
          </section>
        )}

        <section className="advisory-card">
          <div className="advisory-kicker"><span>CONTEXT THE BRIEF MAY USE</span></div>
          <h2>Accepted research and briefing</h2>
          <p className="advisory-lead">The brief uses only what you accepted in the studio, the household record, and the holdings below.</p>
          <div className="advisory-entitled">
            {hasBriefing ? (
              <div className="advisory-theme">
                <strong>{companyProfile?.company.name} briefing accepted</strong>
                <p>{companyProfile?.briefing.objectives.facts[0]?.text || "Objectives were extracted from the accepted filing."}</p>
              </div>
            ) : (
              <div className="advisory-prompt">No company briefing accepted. The brief will not cite filing excerpts.</div>
            )}
            {hasNote ? (
              <div className="advisory-theme">
                <strong>Research note accepted for {note?.ticker}</strong>
                <p>{note?.analyze.note.summary || note?.analyze.recommendation.thesis || "Indicators and signal divergences are available from the accepted note."}</p>
              </div>
            ) : (
              <div className="advisory-prompt">No research note accepted. Accept one in market research so the brief can cite it.</div>
            )}
          </div>
        </section>

        <section className="advisory-card">
          <div className="advisory-kicker"><span>HOLDINGS</span>{householdId && <span className="advisory-tag">Synthetic</span>}</div>
          <h2>Holdings and client notes</h2>
          <form onSubmit={requestBrief}>
            <div className="advisory-holdings">
              {holdings.map((row, index) => (
                <div className="advisory-holding" key={index}>
                  <input
                    aria-label={`Holding ticker ${index + 1}`}
                    value={row.ticker}
                    placeholder="Ticker"
                    onChange={(event) => updateHolding(index, { ticker: event.target.value.toUpperCase() })}
                  />
                  <label className="advisory-weight">
                    <input
                      aria-label={`Holding weight ${index + 1} (percent)`}
                      type="number"
                      min="0"
                      max="100"
                      step="0.1"
                      value={row.weight}
                      onChange={(event) => updateHolding(index, { weight: Number(event.target.value) })}
                    />
                    <span aria-hidden="true">%</span>
                  </label>
                  <button type="button" aria-label={`Remove holding ${index + 1}`} onClick={() => setHoldings((rows) => rows.filter((_, current) => current !== index))}><X size={14} /></button>
                </div>
              ))}
              <div className="advisory-holdings-foot">
                <button type="button" className="advisory-add" onClick={() => setHoldings((rows) => [...rows, { ticker: "", weight: 10 }])}><Plus size={14} /> Add holding</button>
                <span className={Math.abs(total - 100) > 0.5 ? "is-off" : undefined}>Total {total.toFixed(1)}%</span>
              </div>
            </div>
            <label className="advisory-notes-label" htmlFor="advisory-notes">Client notes <span>Untrusted: the model never follows instructions written in them.</span></label>
            <textarea
              id="advisory-notes"
              className="advisory-notes"
              value={clientNotes}
              onChange={(event) => setClientNotes(event.target.value)}
              placeholder="Objective, risk tolerance, horizon, recent CRM notes"
            />
            <div className="advisory-actions">
              <button className="primary" disabled={loading}>
                {loading ? <><Loader2 size={15} className="spin" /> Preparing…</> : <><Sparkles size={15} /> Prepare meeting brief</>}
              </button>
              <button type="button" className="secondary" disabled={!accepted && !draft} onClick={clearBrief}>Clear brief</button>
            </div>
            {error && (
              <div className="advisory-error" role="alert">
                <CircleAlert size={14} />
                <div>{error}</div>
                <button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button>
              </div>
            )}
          </form>
        </section>

        {displayed && (
          <>
            <section className="advisory-card" aria-labelledby="advisory-result-heading">
              <div className="advisory-kicker">
                <span>MEETING BRIEF</span>
                {isAccepted && <span className="advisory-accepted"><Check size={12} /> Meeting brief accepted</span>}
              </div>
              <h2 id="advisory-result-heading" ref={headingRef} tabIndex={-1}>
                Meeting brief{displayed.household ? ` · ${displayed.household.name}` : ""}
              </h2>
              <div className="advisory-badges">
                <ProvenanceBadge provenance={briefProvenance(displayed, shownOrigin)} />
                {displayed.household?.synthetic && <span className="advisory-tag">Synthetic client</span>}
              </div>
              {inspectedBy && <p className="advisory-inspected"><ShieldCheck size={14} aria-hidden="true" /> Client data inspected by Cisco AI Defense (enforce) before reaching {inspectedBy}</p>}
              <p className="advisory-live" aria-live="polite">
                {shownOrigin.kind === "recorded" ? "Showing a recorded meeting brief." : displayed.brief.status === "ready" ? "Meeting brief ready for advisor review." : `Meeting brief ${displayed.brief.status}. Holdings and suitability are ready.`}
              </p>
            </section>
            <div className="advisory-panels">
              <article className="advisory-panel">
                <h3>Holdings<span className="advisory-status ready">ready</span></h3>
                {displayed.holdings.map((item) => (
                  <div className="advisory-row" key={item.ticker}>
                    <strong>{item.ticker} · {formatPct(item.weight)}{item.value != null ? ` · ${formatMoney(item.value)}` : ""}</strong>
                    <div>{item.name || item.sector || item.status}{item.assetClass !== "cash" && item.return_1y != null ? ` · 1Y ${vsSpy(item.return_1y, item.return_1y_spy)}` : ""}</div>
                    {item.sourceLabel && <small>{item.sourceLabel}</small>}
                  </div>
                ))}
              </article>
              <article className="advisory-panel">
                <h3>Suitability<span className="advisory-status">{displayed.suitability.length ? `${displayed.suitability.length} findings` : "clear"}</span></h3>
                {displayed.suitability.length === 0 ? <p className="advisory-empty">No concentration or investment-policy findings.</p> : displayed.suitability.map((item) => (
                  <div className="advisory-row" key={item.id}>
                    <div className="advisory-finding-head">
                      <span className={`advisory-status ${item.severity}`}>{item.severity}</span>
                      <strong>{item.title || "Policy finding"}</strong>
                      {item.rule && <small>{item.rule}</small>}
                    </div>
                    <div>{item.detail}</div>
                  </div>
                ))}
              </article>
              <article className="advisory-panel wide">
                <h3>Meeting brief<span className={`advisory-status ${displayed.brief.status}`}>{displayed.brief.status}</span></h3>
                {displayed.brief.status !== "ready" ? (
                  <p className="advisory-empty">{displayed.brief.reason || "No brief this time. Holdings and suitability remain."}</p>
                ) : (
                  <>
                    {displayed.brief.opening && <p className="advisory-fact">{displayed.brief.opening}</p>}
                    {(displayed.brief.agenda || []).length > 0 && <h4 className="advisory-subhead">Agenda</h4>}
                    {(displayed.brief.agenda || []).map((item) => <div className="advisory-fact" key={item}>{item}</div>)}
                    {(displayed.brief.discussion_points || []).length > 0 && <h4 className="advisory-subhead">Discussion points</h4>}
                    {(displayed.brief.discussion_points || []).map((item) => <div className="advisory-fact" key={item}>{item}</div>)}
                    {(displayed.brief.suitability_callouts || []).length > 0 && <h4 className="advisory-subhead">Suitability callouts</h4>}
                    {(displayed.brief.suitability_callouts || []).map((item) => <div className="advisory-fact" key={item}>{item}</div>)}
                    {(displayed.brief.citations || []).length > 0 && (
                      <ul className="advisory-citations" aria-label="Citations">
                        {(displayed.brief.citations || []).map((cite, index) => (
                          <li key={`${cite.field}-${index}`} title={[cite.excerpt, cite.value].filter(Boolean).join(" · ")}>{citationLabel(cite.field)}{cite.value ? <b>{citationValue(cite.field, cite.value)}</b> : null}</li>
                        ))}
                      </ul>
                    )}
                  </>
                )}
                <p className="advisory-disclaimer">The advisor owns every recommendation; nothing trades automatically. {ADVISORY_DISCLAIMER}.</p>
                {displayed.grounding && displayed.grounding.droppedClaims ? <p className="advisory-disclaimer">{displayed.grounding.droppedClaims} claim{displayed.grounding.droppedClaims === 1 ? "" : "s"} without support in the record {displayed.grounding.droppedClaims === 1 ? "was" : "were"} dropped.</p> : null}
              </article>
            </div>
            <section className="advisory-card advisory-accept">
              <div className="advisory-actions">
                <button
                  id="accept-meeting-brief"
                  className="primary"
                  type="button"
                  disabled={isAccepted || displayed.brief.status !== "ready"}
                  aria-describedby={reason ? "accept-meeting-reason" : undefined}
                  onClick={acceptBrief}
                >
                  <Check size={15} /> {isAccepted ? "Meeting brief accepted" : "Accept meeting brief"}
                </button>
              </div>
              {reason && <p id="accept-meeting-reason" className="advisory-disclaimer">{reason}</p>}
            </section>
          </>
        )}

        {timeline.visible.length > 0 && (
          <section className="advisory-card advisory-steps" aria-label="How this brief was made">
            <div className="advisory-kicker">
              <span>RUN STEPS</span>
              {timeline.mode === "recorded" && <span className="advisory-tag">Recorded run</span>}
            </div>
            <RunTimeline label="Advisory run steps" events={timeline.visible} start={timeline.run?.started_at} className="boxed" showLane />
          </section>
        )}
      </div>
      <RunStats ledger={ledger} {...stats} empty="Request a meeting brief. Its model calls and AI Defense verdicts land here." />
      {embedded && inStory && <div className="advisory-story"><span>STORY MODE</span> The advisor gate stays on the brief. Clearing the company profile does not wipe this meeting note.</div>}
    </div>
  );
}
