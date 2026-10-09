"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import {
  ArrowRight, Ban, Check, CircleAlert, FileText, History, Landmark, Loader2, Newspaper, Play, Search, ShieldAlert, ShieldCheck, Users, X,
} from "lucide-react";
import type { StoredCompanyProfile } from "./company-profile";
import DemoStatusBanner from "./DemoStatusBanner";
import {
  EXAMPLE_RESEARCH_TICKERS, IMPACT_LABEL, RESEARCH_SCENARIOS, SECTION_LABEL,
  loadResearchNote, loadWealthRecording, normalizeAnalyze, normalizePublish, normalizeWealthHealth, parseApiError,
  saveResearchNote, signedPct, vsSpy,
  type EvidenceItem, type PublishState, type ResearchAnalyze, type ResearchScenario, type StoredResearchNote, type WealthHealth,
} from "./research-note";
import RunStats, { startRun, useRunLedger } from "./RunStats";
import { newRunId } from "./run/events";
import ProvenanceBadge, { type Provenance } from "./run/ProvenanceBadge";
import RunTimeline from "./run/RunTimeline";
import { useRun } from "./run/useRun";
import { useStudioNav } from "./studio-nav";
import { ClaimRow, EvidenceCard, PolicyList, type Focus } from "./wealth-evidence";
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

const STRATEGIST = "Sam Ortiz · CIO Office strategist";
const SECTIONS = ["what_changed", "impact", "talking_point"];
const parsed = (text: string): unknown => { try { return text ? JSON.parse(text) : {}; } catch { return {}; } };

function provenanceOf(result: ResearchAnalyze, origin: Origin): Provenance {
  if (origin.kind === "recorded") return { kind: "recorded", recordedAt: origin.recordedAt, servedBy: result.servedBy };
  if (result.status === "blocked") return { kind: "none", detail: "No data fetched · no model call" };
  if (result.update.mode === "fixture") return { kind: "sample", detail: "Fixture summary · written by code, no model" };
  return result.servedBy ? { kind: "live", servedBy: result.servedBy } : { kind: "none", detail: "No model answered" };
}

function PublishBar({ result, publish, busy, onDecide, onPrepare }: {
  result: ResearchAnalyze; publish: PublishState; busy: boolean; onDecide: (decision: "approve" | "reject") => void; onPrepare: () => void;
}) {
  if (publish.status === "published") {
    return (
      <section className="rx-publish is-done" aria-label="Publication">
        <ShieldCheck size={18} aria-hidden="true" />
        <div>
          <strong>Published to the advisor desk</strong>
          <span>{publish.by} · {publish.at ? new Date(publish.at).toLocaleTimeString() : ""}{publish.originLabel ? ` · ${publish.originLabel}` : ""}</span>
        </div>
        <button type="button" className="primary" onClick={onPrepare}>Prepare client meeting <ArrowRight size={15} aria-hidden="true" /></button>
      </section>
    );
  }
  if (publish.status === "awaiting_approval") {
    return (
      <section className="rx-publish" aria-label="Publication">
        <Users size={18} aria-hidden="true" />
        <div>
          <strong>Strategist approval</strong>
          <span>{STRATEGIST} decides. Only the {result.update.counts.verified} verified claims go to advisors; the rating stays the CIO office&apos;s call.</span>
        </div>
        <button type="button" className="secondary" disabled={busy} onClick={() => onDecide("reject")}>Reject</button>
        <button type="button" className="primary" disabled={busy} onClick={() => onDecide("approve")}>
          {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Publish update
        </button>
      </section>
    );
  }
  const tone = publish.status === "denied" || publish.status === "blocked" ? "is-denied" : "";
  const text = publish.status === "denied" ? "Not published · a research.publish policy denied it"
    : publish.status === "rejected" ? `Rejected by ${publish.by || "the strategist"} · nothing reaches advisors`
      : publish.status === "blocked" ? "Nothing to publish · restricted issuer"
        : `Nothing to publish${publish.reason ? ` · ${publish.reason}` : ""}`;
  return (
    <section className={`rx-publish ${tone}`} aria-label="Publication">
      <Ban size={18} aria-hidden="true" />
      <div><strong>{text}</strong></div>
    </section>
  );
}

const RESEARCH_DEFENSE = { inputs: "news items inspected", whenOff: "every news item is still inspected before the agent reads it." };

export default function MarketResearch({ embedded = false, inStory = false, note, onNoteChange }: Props) {
  const published = note !== undefined ? note : loadResearchNote();
  const [health, setHealth] = useState<WealthHealth | null>(null);
  const [service, setService] = useState<WealthService | null>(null);
  const [scenario, setScenario] = useState<ResearchScenario>(RESEARCH_SCENARIOS[0]);
  const [ticker, setTicker] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [result, setResult] = useState<ResearchAnalyze | null>(null);
  const [raw, setRaw] = useState<unknown>(null);
  const [origin, setOrigin] = useState<Origin>({ kind: "live" });
  const [publish, setPublish] = useState<PublishState | null>(null);
  const [publishing, setPublishing] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const ledger = useRunLedger();
  const timeline = useRun({ pageUrl: (id, after) => `/api/wealth/runs/${encodeURIComponent(id)}?after=${after}` });
  const { links, openUseCase } = useStudioNav();
  const stats = useMemo(() => wealthStats(service, "/api/wealth/research/analyze", links?.agentObservability, RESEARCH_DEFENSE), [service, links?.agentObservability]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusResult = useRef(false);

  useEffect(() => {
    if (!focusResult.current || !result) return;
    focusResult.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [result]);

  useEffect(() => {
    fetch("/api/wealth/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((body) => { setHealth(normalizeWealthHealth(body)); setService(wealthService(body)); })
      .catch(() => { setHealth({ ready: false, nim: { status: "down" } }); setService({ reachable: false }); });
  }, []);

  const shown = result ?? published?.analyze ?? null;
  const shownOrigin: Origin = result ? origin : published?.recordedAt ? { kind: "recorded", recordedAt: published.recordedAt } : { kind: "live" };
  const shownPublish = result ? publish ?? result.publish : shown?.publish ?? null;
  const evidence = useMemo(() => new Map((shown?.evidence ?? []).map((item) => [item.id, item])), [shown]);
  const serviceDown = service?.reachable === false;
  const modelDown = health?.nim?.status === "down" || health?.ready === false;

  function begin() {
    setLoading(true);
    setError("");
    setFocus(null);
    setPublish(null);
  }

  function landed(next: ResearchAnalyze, body: unknown, from: Origin) {
    setResult(next);
    setRaw(body);
    setOrigin(from);
    focusResult.current = true;
  }

  async function runLive(pick: ResearchScenario | null, symbol?: string) {
    const target = (symbol ?? pick?.ticker ?? "").trim().toUpperCase();
    if (!target) { setError("Enter a ticker."); return; }
    begin();
    const runId = newRunId("wealth-research");
    timeline.open(runId);
    const run = startRun("research", pick ? pick.title : `${target} · public data`);
    ledger.record(run);
    let settled = false;
    try {
      const response = await fetch("/api/wealth/research/analyze", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ticker: target, scenario: pick?.id ?? "ticker", run_id: runId }), signal: AbortSignal.timeout(260000),
      });
      const text = await response.text();
      ledger.record(observeWealth(run, response.status, parsed(text)));
      settled = true;
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const next = normalizeAnalyze(parsed(text), target);
      if (!next) throw new Error("The research service returned nothing.");
      landed(next, parsed(text), { kind: "live" });
    } catch (cause) {
      if (!settled) ledger.record({ ...run, status: "failed" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? "The run timed out. Replay the recorded run instead."
        : cause instanceof TypeError ? "The wealth service did not answer. Replay the recorded run instead."
          : cause instanceof Error ? cause.message : "The run failed.");
    } finally {
      setLoading(false);
    }
  }

  async function replay(pick: ResearchScenario) {
    begin();
    try {
      const recording = await loadWealthRecording(pick.recording);
      const next = normalizeAnalyze(recording.result);
      if (!next) throw new Error("The recorded run has no result.");
      timeline.play({ run: recording.run, events: recording.events });
      ledger.record(observeRecordedWealth(startRun("research", `${pick.title} · recorded`), recording.result, recording.recordedAt));
      landed(next, recording.result, { kind: "recorded", recordedAt: recording.recordedAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recorded run is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(decision: "approve" | "reject") {
    if (!result) return;
    setPublishing(true);
    setError("");
    try {
      const response = await fetch("/api/wealth/research/publish", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: origin.kind === "live" ? result.runId : undefined, decision, result: raw, by: STRATEGIST }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const outcome = normalizePublish(parsed(text));
      setPublish(outcome);
      if (origin.kind === "live" && result.runId) timeline.resume(result.runId);
      if (outcome.status === "published") {
        const stored: StoredResearchNote = {
          ticker: result.ticker, acceptedAt: outcome.at || new Date().toISOString(), publishedBy: outcome.by,
          analyze: { ...result, publish: outcome }, recordedAt: origin.kind === "recorded" ? origin.recordedAt : undefined,
        };
        saveResearchNote(stored, { ...(raw as object), publish: { ...((raw as { publish?: object })?.publish ?? {}), status: "published", by: outcome.by, at: outcome.at } });
        onNoteChange?.(stored);
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Publishing failed.");
    } finally {
      setPublishing(false);
    }
  }

  function submitTicker(event: FormEvent) {
    event.preventDefault();
    void runLive(null, ticker);
  }

  const replayAction = (
    <button type="button" className="secondary" disabled={loading} onClick={() => replay(scenario)}>
      <History size={15} aria-hidden="true" /> Replay recorded run
    </button>
  );

  return (
    <div className={`research-demo ${embedded ? "research-embedded" : ""}`}>
      {!inStory && (
        <p className="rx-intro">
          <strong>Sam, CIO-office strategist.</strong> An earnings event lands on a name the house view covers. A research Deep Agent drafts
          what changed and whether it moves the house view; every claim is checked against its source before Sam decides what advisors see.
        </p>
      )}

      {serviceDown ? (
        <DemoStatusBanner title="The wealth service is not answering" stillWorks="Recorded runs of every scenario" fix="Start it from Studio settings · Services" actions={replayAction} />
      ) : modelDown ? (
        <DemoStatusBanner tone="degraded" settingsSection="st-models" title="No model is reachable" stillWorks="Live runs still check policy, screen news, and write a code-built fixture summary; recorded runs replay" actions={replayAction} />
      ) : health?.nim?.fallback ? (
        <DemoStatusBanner tone="degraded" settingsSection="st-models" title={`Private inference is down · answering from ${health.nim.label}`}
          stillWorks="Market research carries no client data, so the hosted fallback is allowed here" />
      ) : null}

      <section className="rx-scenarios" aria-label="Scenarios">
        {RESEARCH_SCENARIOS.map((item) => (
          <button key={item.id} type="button" className={`rx-scenario ${scenario.id === item.id ? "selected" : ""}`} aria-pressed={scenario.id === item.id}
            onClick={() => setScenario(item)}>
            <span className={`rx-kind ${item.kind === "Attack" ? "is-attack" : ""}`}>{item.kind} · {item.ticker}</span>
            <strong>{item.title}</strong>
            <span>{item.summary}</span>
            <small>{item.moment}</small>
          </button>
        ))}
      </section>
      <div className="rx-actions">
        <button type="button" id="research-run" className="primary" disabled={loading || serviceDown} onClick={() => runLive(scenario)}>
          {loading ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />} Run live
        </button>
        {replayAction}
        <form className="rx-ticker" onSubmit={submitTicker} aria-label="Any cached ticker">
          <Search size={15} aria-hidden="true" />
          <input value={ticker} onChange={(event) => setTicker(event.target.value.toUpperCase())} placeholder="Or a real ticker" aria-label="Real ticker" maxLength={8} />
          {EXAMPLE_RESEARCH_TICKERS.filter((item) => !item.tag && item.ticker !== "JPM").map((item) => (
            <button key={item.ticker} type="button" disabled={loading || serviceDown} onClick={() => { setTicker(item.ticker); void runLive(null, item.ticker); }}>{item.ticker}</button>
          ))}
        </form>
      </div>
      {error && <p className="rx-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {error}</p>}

      {shown ? (
        <ResultView
          result={shown} origin={shownOrigin} publish={shownPublish} focus={focus} onCite={setFocus} evidence={evidence} headingRef={headingRef}
          publishBar={shownPublish && (
            <PublishBar result={shown} publish={shownPublish} busy={publishing || !result} onDecide={decide} onPrepare={() => openUseCase?.("client-advisory")} />
          )}
        />
      ) : (
        <p className="rx-empty">Pick a scenario and run it live, or replay the recorded run.</p>
      )}

      <RunTimeline label="Agent timeline" events={timeline.visible} start={timeline.run?.started_at} showLane
        onSource={(ids) => ids[0] && setFocus({ id: ids[0] })}
        empty={loading ? "Waiting for the first event…" : "The supervisor, its subagents, tools, policy checks, and the strategist's decision stream here."} />

      <RunStats ledger={ledger} observability={stats.observability} defense={stats.defense} />
      <p className="rx-disclaimer">Synthetic issuers and households. Demonstration only · not investment advice.</p>
    </div>
  );
}

function ResultView({ result, origin, publish, focus, onCite, evidence, headingRef, publishBar }: {
  result: ResearchAnalyze; origin: Origin; publish: PublishState | null; focus: Focus; onCite: (focus: Focus) => void;
  evidence: Map<string, EvidenceItem>; headingRef: RefObject<HTMLHeadingElement | null>; publishBar: ReactNode;
}) {
  const view = result.context?.houseView;
  const update = result.update;
  const kept = update.claims.filter((claim) => claim.status === "verified");
  const struck = update.claims.filter((claim) => claim.status !== "verified");
  const items = [...evidence.values()];
  const cited = new Set(update.claims.map((claim) => claim.evidenceId).filter(Boolean));
  const filings = items.filter((item) => item.kind === "filing");
  const shownFilings = filings.filter((item) => cited.has(item.id) || focus?.id === item.id);
  const data = items.filter((item) => !["filing", "news"].includes(item.kind));
  const affected = result.context?.affected;
  const blocked = result.status === "blocked";
  const bank = result.company.metricFamily === "bank";

  return (
    <section className="rx-result" aria-label="House-view update">
      <header className="rx-result-head">
        <div>
          <span className="rx-eyebrow">{blocked ? "RESTRICTED-LIST PRE-CHECK" : "HOUSE-VIEW UPDATE"}</span>
          <h2 ref={headingRef} tabIndex={-1}>{result.company.name} <span>{result.ticker}</span></h2>
          <div className="rx-badges">
            {result.source.fictional && <span className="rx-tag">Fictional issuer · synthetic data</span>}
            {view?.rating && <span className="rx-tag is-view">House view: {view.rating}{view.focusList ? " · Focus List" : ""}</span>}
            {bank && <span className="rx-tag">Bank · read on P/B and ROE</span>}
            {!blocked && <span className="rx-tag is-mode">{update.modeLabel}</span>}
          </div>
        </div>
        <ProvenanceBadge provenance={provenanceOf(result, origin)} />
      </header>

      {blocked ? (
        <div className="rx-blocked">
          <ShieldAlert size={22} aria-hidden="true" />
          <div>
            <strong>Blocked before any data or model call</strong>
            <p>{result.precheck?.reason || "This issuer is on the restricted list."}{result.precheck?.since ? ` Restricted since ${result.precheck.since}.` : ""}</p>
            <PolicyList title="research.precheck" result={result.precheck?.controls} />
          </div>
        </div>
      ) : (
        <div className="rx-grid">
          <div className="rx-main">
            {update.impact && (
              <div className={`rx-impact is-${update.impact}`}>
                <Landmark size={18} aria-hidden="true" />
                <div>
                  <strong>{IMPACT_LABEL[update.impact] ?? update.impact}</strong>
                  <span>
                    {update.triggers.length ? update.triggers.join(" · ") : "No thesis point or key risk was tripped by the event."}
                    {" "}The AI does not set ratings or targets; the CIO office owns the call.
                  </span>
                </div>
              </div>
            )}
            {update.status !== "ready" && update.reason && <p className="rx-muted">{update.reason}</p>}
            {SECTIONS.map((section) => {
              const rows = kept.filter((claim) => claim.section === section);
              if (!rows.length) return null;
              return (
                <div key={section} className="rx-section">
                  <h3>{SECTION_LABEL[section]}</h3>
                  <ul>{rows.map((claim, index) => (
                    <ClaimRow key={index} claim={claim} item={claim.evidenceId ? evidence.get(claim.evidenceId) : undefined} onCite={onCite} focus={focus} />
                  ))}</ul>
                </div>
              );
            })}
            <p className="rx-count">
              <Check size={14} aria-hidden="true" /> {update.counts.verified} verified
              {struck.length > 0 && <> · <X size={14} aria-hidden="true" /> {struck.length} struck before anyone saw them</>}
              {result.evaluation && <> · {result.evaluation.label}</>}
            </p>
            {struck.length > 0 && (
              <div className="rx-section rx-struck">
                <h3>Struck by the claim verifier</h3>
                <ul>{struck.map((claim, index) => (
                  <ClaimRow key={index} claim={claim} item={claim.evidenceId ? evidence.get(claim.evidenceId) : undefined} onCite={onCite} focus={focus} />
                ))}</ul>
              </div>
            )}

            {result.news.length > 0 && (
              <div className="rx-section">
                <h3><Newspaper size={15} aria-hidden="true" /> News feed · allowlisted sources, inspected as tool results</h3>
                <ul className="rx-news">
                  {result.news.map((row) => (
                    <li key={row.id} className={`is-${row.status}`}>
                      <span className="rx-news-status">{row.status === "withheld" ? <ShieldAlert size={14} aria-hidden="true" /> : <Check size={14} aria-hidden="true" />} {row.status === "withheld" ? "Withheld" : "Kept"}</span>
                      <div>
                        <strong>{row.headline}</strong>
                        <small>{row.publisher} · {row.date}{row.by ? ` · checked by ${row.by}` : ""}</small>
                        {row.status === "withheld" && <small className="rx-reason">{row.reason}. It never reached the agent.</small>}
                      </div>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {result.conflicts.length > 0 && (
              <div className="rx-section">
                <h3>Signal divergences</h3>
                <ul className="rx-divergences">
                  {result.conflicts.map((row) => <li key={row.id}><strong>{row.title}</strong><span>{row.left} · {row.right}</span></li>)}
                </ul>
              </div>
            )}

            <div className="rx-policies">
              <PolicyList title="Pre-check · research.precheck" result={result.precheck?.controls} />
              <PolicyList title="Publish · research.publish" result={publish?.controls} />
            </div>
            {publishBar}
          </div>

          <aside className="rx-side" aria-label="Evidence">
            <h3><FileText size={15} aria-hidden="true" /> Evidence {focus ? <button type="button" className="rx-clear" onClick={() => onCite(null)}>Clear highlight</button> : <small>Click a citation to highlight it</small>}</h3>
            {affected && (
              <div className="rx-affected">
                <Users size={16} aria-hidden="true" />
                <span><strong>{affected.count ?? 0}</strong> of {affected.households} households hold {result.ticker}; <strong>{affected.concentrated ?? 0}</strong> above {affected.thresholdPct}%, {affected.executives ?? 0} executives</span>
              </div>
            )}
            {result.returns.windows?.["1Y"] && (
              <p className="rx-muted">1Y return {vsSpy(result.returns.windows["1Y"].ticker, result.returns.windows["1Y"].spy)} · excess {signedPct(result.returns.windows["1Y"].excess)}</p>
            )}
            {data.map((item) => <EvidenceCard key={item.id} item={item} focus={focus} />)}
            {items.filter((item) => item.kind === "news").map((item) => <EvidenceCard key={item.id} item={item} focus={focus} />)}
            {shownFilings.map((item) => <EvidenceCard key={item.id} item={item} focus={focus} />)}
            {filings.length > shownFilings.length && <p className="rx-muted">{filings.length - shownFilings.length} more 10-K sections were searched and not cited.</p>}
            {result.withheld.map((item) => (
              <article key={item.id} className="rx-evidence is-withheld">
                <header><strong>{item.title}</strong><span className="rx-tag is-deny">Withheld</span></header>
                <small>{item.reason}</small>
              </article>
            ))}
          </aside>
        </div>
      )}
    </section>
  );
}
