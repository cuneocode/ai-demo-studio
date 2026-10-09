"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft, ArrowRight, Bot, CircleAlert, CircleGauge, FastForward, FileWarning, Gavel, History, Loader2, Network, NotebookPen,
  Play, Plus, ShieldAlert, ShieldCheck, UserRound, X,
} from "lucide-react";
import "./banking.css";
import "./fraud.css";
import DemoStatusBanner from "./DemoStatusBanner";
import FraudRuntimeDetails, { type FraudHealth } from "./FraudRuntimeDetails";
import RunStats, { agentTraceIntegration, defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, startRun, traceFacts, useRunLedger, type ObservedRun, type StatsCard } from "./RunStats";
import { saveHandoff } from "./lifecycle-handoff";
import { useStudioNav } from "./studio-nav";
import NetworkGraph from "./fraud/NetworkGraph";
import { BacktestStrip, caughtShare, ComputeFooter, type ModelCardData } from "./fraud/ModelCard";
import { triageState, type FraudCase, type QueueRow, type RiskBand, type Scenario, type TriageState } from "./fraud/triage-state";
import type { RunEvent } from "./run/events";
import ProvenanceBadge, { provenanceText, type Provenance } from "./run/ProvenanceBadge";
import ReplayPicker, { loadRecording, useRecordings } from "./run/ReplayPicker";
import RunTimeline, { RichText } from "./run/RunTimeline";
import { useRun } from "./run/useRun";

type FraudDemoProps = { onBack: () => void; onAdd: () => void; inStory: boolean; embedded?: boolean };
type NoteResult = { saved: boolean; masked?: string | null; ai_defense: { status: string; rules: string[] }; policy: { decision: string; reason: string; engine_label: string; entities?: string[] } };

const API = "/api/fraud";
const ANALYST = "Maya (analyst)";
const CHANNEL: Record<string, string> = { pos: "Card present", cnp: "Card not present" };
const RULE_LABEL: Record<string, string> = { approve: "Approve", review: "Review", decline: "Decline" };
const ACTION_LABEL: Record<string, string> = {
  contact_customer: "Contact customer", block_and_reissue: "Block and reissue", false_positive: "Mark false positive", escalate: "Escalate to investigations",
};
const KIND_LABEL: Record<Scenario["kind"], string> = { story: "Scenario", illustrative: "Illustrative · rules + agent", attack: "Attack" };

const money = (value: number) => value.toLocaleString("en-US", { style: "currency", currency: "USD" });
const seconds = (ms?: number) => (typeof ms === "number" ? (ms >= 60_000 ? `${(ms / 60_000).toFixed(1)} min` : `${(ms / 1000).toFixed(ms < 10_000 ? 1 : 0)} s`) : undefined);

function scoreProvenance(backend?: string, recordedAt?: string | null): Provenance {
  if (backend === "live") return { kind: "live", servedBy: { provider: "sparky-gnn", label: "GNN on Sparky", model: "GraphSAGE + XGBoost", private: true } };
  if (backend === "cache") return { kind: "recorded", recordedAt: recordedAt || "", servedBy: { provider: "sparky-gnn", label: "GNN on Sparky", model: null, private: true } };
  return { kind: "sample", detail: "synthetic scores" };
}

export default function FraudDemo({ onBack, onAdd, inStory, embedded = false }: FraudDemoProps) {
  const nav = useStudioNav();
  const [health, setHealth] = useState<FraudHealth | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [scenarios, setScenarios] = useState<Scenario[]>([]);
  const [mule, setMule] = useState<string>("");
  const [cases, setCases] = useState<FraudCase[]>([]);
  const [card, setCard] = useState<ModelCardData | null>(null);
  const [scenarioId, setScenarioId] = useState("cpp-orbit");
  const [starting, setStarting] = useState(false);
  const [deciding, setDeciding] = useState<string | null>(null);
  const [error, setError] = useState("");
  const [networkKey, setNetworkKey] = useState<string | null>(null);
  const [handoffSaved, setHandoffSaved] = useState<{ key: string; id: string } | null>(null);
  const ledger = useRunLedger();
  const recordRun = ledger.record;
  const ledgerStarted = useRef(0);
  const ledgerId = useRef<string | null>(null);
  const caseFile = useRef<HTMLHeadingElement>(null);
  const recordings = useRecordings(API);
  const steps = useRun({ pageUrl: (id, after) => `${API}/runs/${encodeURIComponent(id)}?after=${after}`, interval: 700 });
  const state = useMemo(() => triageState(steps.visible as RunEvent[]), [steps.visible]);
  const replay = steps.mode !== "live";
  const runLive = steps.run?.status === "running" && !replay;

  useEffect(() => {
    const get = (path: string) => fetch(`${API}/${path}`, { signal: AbortSignal.timeout(12000) }).then((r) => (r.ok ? r.json() : Promise.reject(new Error(path))));
    get("health").then(setHealth).catch(() => setHealthFailed(true));
    get("scenarios").then((body) => { setScenarios(body.scenarios ?? []); setMule(body.illustrative?.mule ?? ""); }).catch(() => undefined);
    get("cases").then((body) => setCases(body.cases ?? [])).catch(() => undefined);
    get("model-card").then(setCard).catch(() => undefined);
  }, []);

  const scenario = scenarios.find((item) => item.id === scenarioId);
  const recordingFor = (id: string) => {
    const matches = recordings.filter((item) => item.scenario === id);
    return matches.find((item) => item.served_by) ?? matches[0] ?? recordings[0];
  };

  // The case file lands in view when the investigation finishes.
  const opened = state.opened?.id;
  const ready = Boolean(state.summary);
  useEffect(() => {
    if (ready && !replay) caseFile.current?.scrollIntoView({ block: "start", behavior: "smooth" });
  }, [ready, replay]);
  const caseKey = `${steps.runId ?? ""}:${opened ?? ""}`;
  const showNetwork = networkKey === caseKey;
  const handedOff = handoffSaved?.key === caseKey ? handoffSaved.id : null;

  // The stats row follows the run's own counts: investigation first, then the disposition.
  useEffect(() => {
    const id = ledgerId.current;
    if (!id) return;
    if (!state.investigatedMs && !state.result) return;
    const finished = !steps.replaying;
    recordRun({
      id, label: state.scenario?.title ?? "Triage", startedAt: ledgerStarted.current, status: finished ? "completed" : "running", replay,
      durationMs: state.result?.duration_ms ?? state.investigatedMs,
      llmCalls: state.usage?.llm_calls, toolCalls: state.usage?.tool_calls, inputTokens: state.usage?.input_tokens, outputTokens: state.usage?.output_tokens,
      agentTrace: replay ? undefined : state.agentTrace, defense: defenseFrom(state.security),
      servedBy: state.summary?.servedBy ?? undefined,
      provenance: replay ? "recorded" : state.summary?.servedBy ? "live" : state.score?.backend === "fixture" ? "sample" : state.score?.backend === "cache" ? "recorded" : "live",
      recordedAt: replay ? steps.run?.finished_at ?? undefined : state.score?.recorded_at ?? undefined,
      note: state.result ? `Disposition · ${ACTION_LABEL[state.result.disposition ?? ""] ?? state.result.disposition}` : state.pending.length ? "Awaiting the analyst's decision" : undefined,
      counts: { toolCalls: state.usage?.tool_calls },
    });
  }, [state.investigatedMs, state.result, state.usage, state.security, state.agentTrace, state.summary, state.score, state.pending.length, state.scenario, steps.replaying, steps.run, replay, recordRun]);

  async function replayRecording(name: string) {
    setError("");
    try {
      const recording = await loadRecording(API, name);
      if (recording.scenario) setScenarioId(recording.scenario);
      steps.play({ run: recording.run ?? null, events: recording.events });
      const run: ObservedRun = { ...startRun("replay", `${recording.title}`), replay: true, provenance: "recorded", recordedAt: recording.recorded_at, servedBy: recording.served_by ?? undefined };
      ledgerId.current = run.id;
      ledgerStarted.current = run.startedAt;
      ledger.record(run);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That recording is unavailable.");
    }
  }

  async function triage(id = scenarioId) {
    setError("");
    setStarting(true);
    setScenarioId(id);
    try {
      const response = await fetch(`${API}/runs`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ scenario: id, label: `Triage · ${id}`, input: { score_queue: true } }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`The fraud service did not start the run (${response.status}).`);
      const body = await response.json() as { run_id: string };
      steps.open(body.run_id);
      const run = { ...startRun("triage", scenarios.find((item) => item.id === id)?.title ?? id), id: body.run_id };
      ledgerId.current = run.id;
      ledgerStarted.current = run.startedAt;
      ledger.record(run);
    } catch (cause) {
      const recording = recordingFor(id);
      setError(cause instanceof Error ? cause.message : "The run did not start.");
      if (recording) void replayRecording(recording.name);
    } finally {
      setStarting(false);
    }
  }

  async function decide(requestId: string, decision: string) {
    if (!steps.runId) return;
    setDeciding(decision);
    setError("");
    const note = state.notes.filter((item) => item.data.tool === "add_note" && item.data.saved).at(-1)?.body ?? undefined;
    try {
      const response = await fetch(`${API}/runs/${encodeURIComponent(steps.runId)}/decision`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ request_id: requestId, decision, by: ANALYST, ...(note ? { note } : {}) }), signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "That decision was already made or the run timed out." : `Decision not recorded (${response.status}).`);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Decision not recorded.");
    } finally {
      setDeciding(null);
    }
  }

  function escalateToSar() {
    if (!state.handoff) return;
    saveHandoff(state.handoff);
    setHandoffSaved({ key: caseKey, id: state.handoff.id });
    nav.openUseCase?.("sar-support");
  }

  const disposition = state.pending.find((item) => item.requestId === "disposition");
  const bulk = state.pending.find((item) => item.requestId === "bulk_reissue");
  const canDecide = runLive && !steps.replaying;
  const busy = starting || (runLive && !state.pending.length);
  const primaryLabel = starting ? "Starting…" : busy ? "Triaging…" : runLive && state.pending.length ? "Waiting for the analyst" : state.result || steps.run ? "Triage again" : "Triage queue";

  return (
    <div className={`banking-demo fraud-demo ${embedded ? "banking-embedded" : ""}`}>
      {!embedded && <>
        <div className="banking-topline">
          <button className="banking-back" onClick={onBack}><ArrowLeft size={15} /> Back to library</button>
          <div className="banking-top-actions">
            <button className="banking-icon-button" disabled={inStory} title={inStory ? "Already in story" : "Add to story"} onClick={onAdd}>
              <Plus size={17} /><span className="add-story-label">{inStory ? "In story" : "Add to story"}</span>
            </button>
          </div>
        </div>
        <section className="banking-heading">
          <div>
            <div className="banking-eyebrow"><CircleGauge size={14} /> CARD FRAUD TRIAGE</div>
            <h1>Triage the alert queue, then decide</h1>
            <p>Synthetic card payments. The graph score is evidence for the analyst, not a decision.</p>
          </div>
        </section>
      </>}

      <BusinessBand card={card} state={state} />
      <FraudStatus health={health} failed={healthFailed} recording={recordingFor(scenarioId)?.name} onReplay={replayRecording} />

      <section className="fx-scenarios" aria-label="Scenarios">
        {(scenarios.length ? scenarios : []).map((item) => (
          <button
            key={item.id}
            className={`fx-scenario ${item.kind}${item.id === scenarioId ? " selected" : ""}`}
            aria-pressed={item.id === scenarioId}
            onClick={() => setScenarioId(item.id)}
          >
            <span className="fx-scenario-kind">{item.kind === "attack" ? <ShieldAlert size={13} aria-hidden="true" /> : null}{KIND_LABEL[item.kind]}</span>
            <strong>{item.title}</strong>
            <span>{item.situation}</span>
            <small><b>Expected:</b> {item.expected}</small>
          </button>
        ))}
        {!scenarios.length && <p className="fx-muted">{healthFailed ? "Scenarios load from the fraud service." : "Loading scenarios…"}</p>}
      </section>

      <div className="fx-actions">
        <button id="triage-queue" className="fx-primary" onClick={() => triage()} disabled={starting || busy}>
          {starting || busy ? <Loader2 size={16} className="spin" /> : <Play size={16} />} {primaryLabel}
        </button>
        <span className="fx-actions-scenario">{scenario ? <>Scenario: <strong>{scenario.title}</strong></> : null}</span>
        <ReplayPicker recordings={recordings} onPick={replayRecording} disabled={starting} />
        {steps.replaying && <button className="fx-secondary" onClick={steps.skip}><FastForward size={14} /> Skip replay</button>}
      </div>
      {error && <div className="banking-error fx-error" role="alert"><CircleAlert size={14} /><div>{error}</div><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}

      <QueueTable cases={cases} state={state} replay={replay} recordedAt={steps.run?.finished_at} />
      {mule && <p className="fx-mule"><span className="fx-tag illustrative">Illustrative · not in the card queue</span> {mule}</p>}

      {(state.opened || steps.runId) && (
        <section className="fx-casefile" aria-labelledby="fx-casefile-title">
          <div className="fx-case-left">
            <h3 id="fx-casefile-title" ref={caseFile} tabIndex={-1}>
              {state.opened ? <>Case file · {state.opened.account} at {state.opened.merchant} · {money(state.opened.amount)}</> : "Case file"}
            </h3>
            {state.opened && <p className="fx-muted">{state.opened.customer ? `${state.opened.customer}${/fictional/i.test(state.opened.customer) ? "" : " (fictional)"} · ` : ""}{CHANNEL[state.opened.channel] ?? state.opened.channel}{state.opened.mcc_label ? ` · ${state.opened.mcc_label}` : ""}{state.opened.at ? ` · ${new Date(state.opened.at).toLocaleString(undefined, { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" })}` : ""}</p>}
            <Verdicts state={state} threshold={health?.threshold ?? 0.5} />
            {state.graph && (
              <div className="fx-network">
                <button className="fx-secondary" id="show-network" onClick={() => setNetworkKey(showNetwork ? null : caseKey)} aria-expanded={showNetwork}>
                  <Network size={14} /> {showNetwork ? "Hide network" : "Show network"}
                </button>
                {showNetwork && <NetworkGraph graph={state.graph} />}
              </div>
            )}
            {state.reasons && <Reasons state={state} />}
            {(state.similar?.length || state.playbook) && (
              <div className="fx-context">
                {!!state.similar?.length && <div><h4>Similar earlier alerts</h4><ul>{state.similar.map((item) => <li key={item.id}><b>{item.id}</b> {item.summary} → {item.outcome}</li>)}</ul></div>}
                {state.playbook && <div><h4>Playbook · {state.playbook.title}</h4><RichText text={state.playbook.body} /></div>}
              </div>
            )}
          </div>

          <div className="fx-case-right">
            <section className="fx-timeline" aria-labelledby="fx-steps-title">
              <h4 id="fx-steps-title">Triage steps {replay && <ProvenanceBadge provenance={{ kind: "recorded", recordedAt: steps.run?.finished_at ?? steps.run?.started_at ?? "", servedBy: state.servedBy }} />}</h4>
              <RunTimeline label="Fraud triage steps" events={steps.visible} start={steps.run?.started_at} className="boxed" showLane empty="Waiting for the first step…" />
            </section>
            {state.dispute && <DisputeCard state={state} />}
            <SummaryCard state={state} replay={replay} recordedAt={steps.run?.finished_at ?? steps.run?.started_at} />
            <DecisionBar
              state={state} request={disposition} canDecide={canDecide} deciding={deciding} replay={replay}
              onDecide={(decision) => disposition && decide(disposition.requestId, decision)}
            />
            {bulk && (
              <div className="fx-approval" role="group" aria-label="Approve proactive reissue">
                <strong>{bulk.title}</strong><p>{bulk.body}</p>
                <div>{bulk.options.map((option) => (
                  <button key={option.id} className={option.id === "approve" ? "fx-primary small" : "fx-secondary"} disabled={!canDecide || deciding !== null} onClick={() => decide(bulk.requestId, option.id)}>{option.label}</button>
                ))}</div>
              </div>
            )}
            {state.opened && <NoteComposer key={`${steps.runId}-${scenarioId}`} runId={replay ? null : steps.runId} caseId={state.opened.id} initial={state.scenario?.analyst_note ?? ""} />}
            <AuditTrail state={state} />
            {state.handoff && (
              <div className="fx-handoff">
                <div><FileWarning size={16} aria-hidden="true" /><span><strong>SAR referral drafted</strong> · {state.handoff.evidence.length} evidence items · {state.handoff.transactions.length} transaction{state.handoff.transactions.length === 1 ? "" : "s"}{replay ? " · from a recorded run" : ""}</span></div>
                <button id="escalate-to-sar" className="fx-primary small" onClick={escalateToSar}>Escalate to SAR <ArrowRight size={14} /></button>
                {handedOff && !nav.openUseCase && <small>Saved for the SAR team. Open “SAR investigation” to continue.</small>}
              </div>
            )}
            {state.reveal && <p className="fx-reveal">Label reveal (after the decision) · TabFormer marks this payment <b>{state.reveal}</b>.</p>}
          </div>
        </section>
      )}

      <BacktestStrip card={card} />
      <ComputeFooter card={card} run={state.score ? { backend: state.score.backend, device: state.score.device, model_ms: state.score.model_ms } : undefined} />
      <RunStats ledger={ledger} {...fraudStats(health, healthFailed)} empty="Triage the queue. The agent's model calls, tool spans, and AI Defense verdicts land here." />
      <details className="fx-hood">
        <summary>Under the hood</summary>
        <FraudRuntimeDetails health={health} />
      </details>
      {!embedded && inStory && <div className="story-context"><span>STORY MODE</span> Escalate a case to hand it to SAR investigation.</div>}
    </div>
  );
}

/** Act 1: Maya's queue and the KPIs that hurt; "this run" values replace the illustrative ones when measured. */
function BusinessBand({ card, state }: { card: ModelCardData | null; state: TriageState }) {
  const measured = card && card.status !== "not_measured";
  const rules = caughtShare(card, "rules");
  const graph = caughtShare(card, "gnn_xgboost");
  const run = state.result?.duration_ms;
  const tiles = [
    { label: "Alerts a day", value: "1,240", sub: "38 analysts on the queue", tag: "Illustrative" },
    { label: "False positives per real fraud", value: "~14 : 1", sub: "rules today · target ~8 : 1", tag: "Illustrative" },
    measured && rules && graph
      ? { label: "Fraud $ caught at a 0.5% alert rate", value: `${rules} → ${graph}`, sub: "rules → graph model", tag: card.tag ?? "Measured" }
      : { label: "Fraud $ caught at a 0.5% alert rate", value: "Not measured yet", sub: "run the backtest on Sparky", tag: "Not measured" },
    run
      ? { label: "Time to disposition", value: seconds(run)!, sub: "this run · investigation + analyst decision", tag: "Measured · this run" }
      : { label: "Average handle time", value: "11 min", sub: "per alert today · target 4 min", tag: "Illustrative" },
  ];
  return (
    <section className="fx-band" aria-label="Business problem">
      <div className="fx-persona">
        <span className="fx-avatar"><UserRound size={18} aria-hidden="true" /></span>
        <div>
          <strong>Maya · card-fraud operations analyst</strong>
          <p>Rules look at one payment at a time, so a clean customer at a compromised merchant sails through, and real fraud hides among false positives.</p>
        </div>
      </div>
      <dl className="fx-kpis">
        {tiles.map((tile) => (
          <div key={tile.label}><dt>{tile.label}</dt><dd>{tile.value}</dd><small>{tile.sub} · <span className={`fx-tag ${tile.tag.startsWith("Measured") ? "measured" : tile.tag === "Not measured" ? "pending" : "illustrative"}`}>{tile.tag}</span></small></div>
        ))}
      </dl>
    </section>
  );
}

function QueueTable({ cases, state, replay, recordedAt }: { cases: FraudCase[]; state: TriageState; replay: boolean; recordedAt?: string | null }) {
  const scored = new Map(state.queue.map((row) => [row.case.id, row]));
  const rows: (QueueRow | { case: FraudCase })[] = state.queue.length ? state.queue : cases.map((item) => ({ case: item }));
  const first = state.queue[0];
  return (
    <section className="fx-queue" aria-labelledby="fx-queue-title">
      <header>
        <h3 id="fx-queue-title">Alert queue · {rows.length || 5} flagged payments</h3>
        {first ? <ProvenanceBadge provenance={replay ? { kind: "recorded", recordedAt: recordedAt ?? "" } : scoreProvenance(first.backend)} label={replay ? undefined : `Scores · ${first.label}`} /> : <span className="fx-muted">Scores fill in as the run streams.</span>}
      </header>
      <div className="fx-table-wrap">
        <table>
          <thead><tr><th>Payment</th><th>Amount</th><th>Channel</th><th>Rules</th><th>Graph score</th><th>Suggested</th><th>Analyst</th></tr></thead>
          <tbody>
            {rows.map(({ case: item }) => {
              const row = scored.get(item.id);
              const open = state.opened?.id === item.id;
              return (
                <tr key={item.id} className={open ? "open" : undefined} data-case={item.id}>
                  <td><strong>{item.account} · {item.merchant}</strong><small>{item.label}{item.illustrative ? " · illustrative" : ""}</small></td>
                  <td>{money(item.amount)}</td>
                  <td>{CHANNEL[item.channel] ?? item.channel}</td>
                  <td>{row ? <span className={`fx-pill rules-${row.rules.decision}`}>{RULE_LABEL[row.rules.decision] ?? row.rules.decision} · {row.rules.score}</span> : "—"}</td>
                  <td>{row ? <span className={`fx-pill band-${row.risk_band}`}>{row.probability.toFixed(2)} · {row.risk_label}</span> : "—"}{row?.model_ms != null && <small>{row.model_ms.toFixed(1)} ms {row.device?.toUpperCase()}</small>}</td>
                  <td>{row?.suggested_action ?? "—"}</td>
                  <td>{open ? (state.result?.disposition ? <b>{ACTION_LABEL[state.result.disposition] ?? state.result.disposition}</b> : state.pending.length ? "Deciding" : "Open") : "—"}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

function Gauge({ title, value, max, marks, decision, tone, detail }: { title: string; value: number; max: number; marks: { at: number; label: string }[]; decision: string; tone: string; detail: string }) {
  return (
    <div className={`fx-gauge tone-${tone}`}>
      <span className="fx-gauge-title">{title}</span>
      <strong>{decision}</strong>
      <div className="fx-gauge-track" aria-hidden="true">
        <span className="fx-gauge-fill" style={{ width: `${Math.min(100, (value / max) * 100)}%` }} />
        {marks.map((mark) => <span key={mark.label} className="fx-gauge-mark" style={{ left: `${(mark.at / max) * 100}%` }} title={mark.label} />)}
      </div>
      <small>{detail}</small>
    </div>
  );
}

function Verdicts({ state, threshold }: { state: TriageState; threshold: number }) {
  const { rules, score, opened } = state;
  if (!rules && !score) return <p className="fx-muted fx-waiting"><Loader2 size={14} className="spin" /> Scoring and gathering evidence…</p>;
  const tone: Record<RiskBand, string> = { high: "deny", elevated: "warn", low: "ok" };
  const aha = rules && score
    ? rules.decision === "approve" && score.risk_band === "high"
      ? "Rules approve what the graph model flags: the risk is in the merchant's network, not in this payment."
      : rules.decision === "decline" && score.risk_band === "low"
        ? "Rules catch what the graph model cannot see: device and address changes are not in the payment graph."
        : null
    : null;
  return (
    <div className="fx-verdicts">
      <div className="fx-gauges">
        {rules ? <Gauge title="Rules engine · one payment at a time" value={rules.score} max={rules.max || 999} decision={`${RULE_LABEL[rules.decision] ?? rules.decision} · ${rules.score}/${rules.max || 999}`}
          tone={rules.decision === "approve" ? "ok" : rules.decision === "review" ? "warn" : "deny"} marks={[{ at: rules.thresholds.review, label: "Review" }, { at: rules.thresholds.decline, label: "Decline" }]}
          detail={rules.fired.filter((item) => item.rule !== "BASE").map((item) => item.text).join(" · ") || "No risk rule fired"} /> : <div className="fx-gauge pending">Rules engine…</div>}
        {score ? <Gauge title="Graph model · GraphSAGE + XGBoost" value={score.probability} max={1} decision={`${score.risk_band === "high" ? "High risk" : score.risk_band === "elevated" ? "Elevated risk" : "Low risk"} · ${score.probability.toFixed(2)}`}
          tone={tone[score.risk_band]} marks={[{ at: threshold, label: `Alert threshold ${threshold.toFixed(2)}` }]}
          detail={`${score.label}${score.model_ms != null ? ` · ${score.model_ms.toFixed(1)} ms on ${(score.device ?? "?").toUpperCase()}` : ""}${opened?.scoreable_by_model === false ? " · cannot see device or address events" : ""}`} /> : <div className="fx-gauge pending">Graph model…</div>}
      </div>
      {aha && <p className="fx-aha">{aha}</p>}
    </div>
  );
}

function Reasons({ state }: { state: TriageState }) {
  const reasons = state.reasons?.reasons ?? [];
  return (
    <div className="fx-reasons">
      <h4>Why the graph model scored it this way</h4>
      <ul>{reasons.slice(0, 6).map((item) => (
        <li key={item.code + item.feature} className={item.direction}><span>{item.text}</span><b>{item.value >= 0 ? "+" : ""}{item.value.toFixed(2)}</b></li>
      ))}</ul>
      <small>{state.reasons?.how} · contributions in log-odds; positive raises risk.</small>
    </div>
  );
}

function DisputeCard({ state }: { state: TriageState }) {
  const verdict = state.dispute?.verdict;
  const blocked = verdict?.status === "blocked";
  return (
    <div className={`fx-dispute ${blocked ? "blocked" : ""}`}>
      <span className="fx-tag illustrative">Untrusted input · cardholder dispute note</span>
      <blockquote>{state.dispute?.text}</blockquote>
      {verdict ? <p>{blocked ? <ShieldAlert size={14} /> : <ShieldCheck size={14} />} {verdict.title}{blocked ? " · the agent never sees it" : ""}</p> : <p className="fx-muted">AI Defense is inspecting the note…</p>}
    </div>
  );
}

function SummaryCard({ state, replay, recordedAt }: { state: TriageState; replay: boolean; recordedAt?: string | null }) {
  const summary = state.summary;
  if (!summary) return null;
  const output = state.guardrails.find((item) => item.data.stage === "agent_output");
  const scripted = summary.mode === "scripted";
  const provenance: Provenance = replay
    ? { kind: "recorded", recordedAt: recordedAt ?? "", servedBy: summary.servedBy }
    : scripted ? { kind: "none", detail: "Scripted · no model reachable" } : { kind: "live", servedBy: summary.servedBy };
  return (
    <section className="fx-summary" aria-labelledby="fx-summary-title">
      <header>
        <h4 id="fx-summary-title"><Bot size={15} aria-hidden="true" /> Analyst summary · {scripted ? "scripted template" : "AI draft"}</h4>
        <ProvenanceBadge provenance={provenance} label={replay && scripted ? `${provenanceText(provenance)} · scripted` : undefined} />
      </header>
      <RichText text={summary.text} />
      <div className="fx-badges">
        {state.citations && <span className={`fx-chip ${state.citations.cited === state.citations.total ? "ok" : "warn"}`}>Citations · {state.citations.cited}/{state.citations.total} points cite tool evidence</span>}
        {output ? <span className={`fx-chip ${output.status === "allowed" ? "ok" : "deny"}`}><ShieldCheck size={12} /> AI Defense · summary {output.status === "allowed" ? "inspected · clean" : output.status}</span>
          : !scripted && <span className="fx-chip">AI Defense · summary not inspected</span>}
      </div>
    </section>
  );
}

function DecisionBar({ state, request, canDecide, deciding, replay, onDecide }: {
  state: TriageState; request?: TriageState["pending"][number]; canDecide: boolean; deciding: string | null; replay: boolean; onDecide: (decision: string) => void;
}) {
  const proposals = (state.requests.find((item) => item.requestId === "disposition")?.data.case_file as { proposals?: { action: string; label: string; policy?: string }[] } | undefined)?.proposals ?? [];
  const recommended = request?.recommended ?? state.draft?.action;
  const decided = state.result?.disposition;
  const options = request?.options ?? Object.keys(ACTION_LABEL).map((id) => ({ id, label: ACTION_LABEL[id], policy: id === "contact_customer" || id === "escalate" ? "reversible" : "requires analyst approval" }));
  return (
    <section className="fx-decision" aria-labelledby="fx-decision-title">
      <h4 id="fx-decision-title"><Gavel size={15} aria-hidden="true" /> Disposition {replay ? "· as recorded" : request ? "· your decision" : ""}</h4>
      {proposals.length > 0 && <p className="fx-muted">Agent proposed: {proposals.map((item) => `${item.label}${item.policy === "deny" ? " (denied until you approve)" : ""}`).join(" · ")}</p>}
      <div className="fx-decision-buttons" role="group" aria-label="Analyst disposition">
        {options.map((option) => (
          <button
            key={option.id}
            data-action={option.id}
            className={`${option.id === recommended ? "recommended" : ""}${decided === option.id ? " chosen" : ""}`}
            disabled={!canDecide || !request || deciding !== null}
            onClick={() => onDecide(option.id)}
            title={option.policy}
          >
            {deciding === option.id && <Loader2 size={13} className="spin" />}{option.label}
            {option.id === recommended && <small>Suggested</small>}
          </button>
        ))}
      </div>
      <small className="fx-muted">
        {decided ? `Decided: ${ACTION_LABEL[decided] ?? decided}.` : request && canDecide ? "Card actions are simulated. Irreversible ones pass fraud.take_action only with your approval." : replay ? "Recorded run: the decision replays as it was made." : "Enabled when the agent finishes and asks for your decision."}
      </small>
    </section>
  );
}

function NoteComposer({ runId, caseId, initial }: { runId: string | null; caseId: string; initial: string }) {
  const [note, setNote] = useState(initial);
  const [saving, setSaving] = useState(false);
  const [result, setResult] = useState<NoteResult | null>(null);
  async function save() {
    if (!note.trim()) return;
    setSaving(true);
    try {
      const response = await fetch(`${API}/notes`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ note, case_id: caseId, ...(runId ? { run_id: runId } : {}) }), signal: AbortSignal.timeout(30000),
      });
      setResult(response.ok ? await response.json() : null);
    } catch {
      setResult(null);
    } finally {
      setSaving(false);
    }
  }
  const defense = result?.ai_defense;
  return (
    <section className="fx-note" aria-labelledby="fx-note-title">
      <h4 id="fx-note-title"><NotebookPen size={15} aria-hidden="true" /> Case note</h4>
      <textarea id="fx-note-text" value={note} maxLength={2000} rows={3} placeholder="Add a case note. Last 4 digits only, never a full card number or SSN." onChange={(event) => { setNote(event.target.value); setResult(null); }} />
      <div className="fx-note-actions">
        <button className="fx-secondary" onClick={save} disabled={saving || !note.trim()}>{saving ? <Loader2 size={13} className="spin" /> : null} Save note</button>
        {result?.masked && <button className="fx-secondary" onClick={() => { setNote(result.masked ?? ""); setResult(null); }}>Use masked note (last 4 only)</button>}
      </div>
      {result && (
        <div className="fx-badges" aria-live="polite">
          <span className={`fx-chip ${defense?.status === "blocked" ? "deny" : defense?.status === "allowed" ? "ok" : ""}`}>
            AI Defense · {defense?.status === "off" ? "off" : defense?.status === "blocked" ? `${defense.rules.join(", ") || "violation"} · blocked` : defense?.status === "allowed" ? "clean" : defense?.status}
          </span>
          <span className={`fx-chip ${result.policy.decision === "deny" ? "deny" : "ok"}`}>
            {result.policy.engine_label} · fraud.note_pii · {result.policy.decision}{result.policy.entities?.length ? ` · ${result.policy.entities.join(", ")}` : ""}
          </span>
          <span className={`fx-chip ${result.saved ? "ok" : "deny"}`}>{result.saved ? "Saved" : "Not saved · re-enter with the last 4 only"}</span>
        </div>
      )}
    </section>
  );
}

function AuditTrail({ state }: { state: TriageState }) {
  if (!state.audit.length) return null;
  return (
    <section className="fx-audit" aria-labelledby="fx-audit-title">
      <h4 id="fx-audit-title"><History size={15} aria-hidden="true" /> Audit trail</h4>
      <ol>{state.audit.map((item) => (
        <li key={item.id} className={`status-${item.status}`}>
          <time>{new Date(item.at).toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit", second: "2-digit" })}</time>
          <span>{item.title}</span>
        </li>
      ))}</ol>
    </section>
  );
}

/** Never a dead page: what is offline, what still works, and how to fix it. */
function FraudStatus({ health, failed, recording, onReplay }: { health: FraudHealth | null; failed: boolean; recording?: string; onReplay: (name: string) => void }) {
  if (failed) {
    return <DemoStatusBanner tone="down" className="fraud-status" title="The fraud triage service is not answering"
      stillWorks="The architecture view. Scenarios, scores, and recorded runs are served by the fraud service."
      fix="Start Card fraud triage under Services in Studio settings." />;
  }
  if (!health) return null;
  const scorer = health.backend === "live" ? null : health.backend === "cache" ? `recorded GNN scores${health.recorded_at ? ` (${new Date(health.recorded_at).toLocaleDateString()})` : ""}` : "sample scores for the synthetic payments";
  const agentDown = health.agent?.status !== "ready";
  if (!scorer && !agentDown) return null;
  const replay = recording ? <button type="button" onClick={() => onReplay(recording)}><History size={14} aria-hidden="true" /> Replay recorded run</button> : null;
  return <DemoStatusBanner
    tone="degraded" className="fraud-status"
    title={[scorer && "The live GNN scorer on Sparky is offline", agentDown && "no model is reachable for the triage agent"].filter(Boolean).join("; ").replace(/^n/, "N")}
    stillWorks={`Triage runs end to end with ${scorer ?? "live scores"}${agentDown ? ", and a scripted summary (no model) labelled as such" : ", and the triage agent"}.`}
    fix={[scorer && "Start the GNN scoring sidecar on Sparky", agentDown && "check the fraud-modeling model chain in Studio settings"].filter(Boolean).join("; ") + "."}
    settingsSection={agentDown ? "st-models" : "st-services"}
    actions={replay}
  />;
}

function fraudStats(health: FraudHealth | null, failed: boolean): { observability: StatsCard; defense: StatsCard } {
  return {
    observability: {
      integration: agentTraceIntegration(health?.splunk?.galileo, !failed),
      tiles: [
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "Investigation, then the analyst's decision, measured by the fraud service" },
        { label: "LLM calls", value: (run) => run.llmCalls, hint: "Triage agent model calls; scoring makes none" },
        { label: "Tool calls", value: (run) => run.toolCalls, hint: "score_payment, rules, neighborhood, explain, playbook, draft, propose_action" },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
      ],
      facts: traceFacts,
      source: "From the triage run's own events. Each tool call is a span in the agent's trace.",
    },
    defense: {
      integration: defenseIntegration(health?.security, "dispute notes, agent prompt and summary, case notes", !failed),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the run's security summary: one inspection per untrusted note, agent prompt, and summary.",
    },
  };
}
