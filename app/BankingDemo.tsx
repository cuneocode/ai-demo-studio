"use client";

import { FormEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  Bot,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  Clock3,
  CreditCard,
  Gauge,
  GitBranch,
  History,
  Loader2,
  MessageSquareText,
  Plus,
  Search,
  Server,
  ShieldCheck,
  Sparkles,
  Waypoints,
  X,
} from "lucide-react";
import "./banking.css";
import BankingRuntimeDetails from "./BankingRuntimeDetails";
import RunStats, { agentTraceIntegration, defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, servedByFrom, traceFacts, usageFrom, startRun, useRunLedger, type ObservedRun, type StatsCard } from "./RunStats";
import ProvenanceBadge from "./run/ProvenanceBadge";
import { loadRecording, useRecordings } from "./run/ReplayPicker";
import type { ServedBy } from "./run/events";
import { useStudioNav } from "./studio-nav";
import { guideAnchor } from "./guide/anchors";
import { useGuideActions } from "./guide/GuidedTour";
import suggestions from "./banking-scenarios.json";

type TraceStep = { name: string; kind: string };
type Source = { title: string; text: string };
type IntegrationStatus = { status: string; mode?: string; fail_open?: boolean; service_name?: string; missing?: string[]; dashboard_url?: string; event_ids?: string[] };
type ControlResult = { status: "allowed" | "blocked"; control_id: number; execution_id?: string; name: string };
type ResponseControls = { status: "allowed" | "blocked" | "unavailable" | "not_checked"; checks: ControlResult[]; judge_model: string };
type ControlConfig = { status: "enforcing" | "unavailable" | "not_configured"; names: string[]; judge_model: string; execution: string; fail_open: boolean };
type Health = { ready: boolean; model: string; retrieval: string; galileo: string; security?: IntegrationStatus; controls?: ControlConfig; splunk?: IntegrationStatus };
type ResponseTelemetry = { security?: { status: string; mode?: string; checks?: number; blocked?: number; errors?: number; event_ids?: string[] }; controls?: ResponseControls; splunk?: { status: string; trace_id?: string; span_count?: number; dashboard_url?: string }; galileo?: string };
type Message = { role: "user" | "assistant"; text: string; sources?: Source[]; trace?: TraceStep[]; duration?: number; telemetry?: ResponseTelemetry; servedBy?: ServedBy; recordedAt?: string };
type ErrorMeta = { security?: IntegrationStatus; controls?: ResponseControls; splunk?: { status: string; trace_id?: string; span_count?: number; dashboard_url?: string } };
function displayStatus(value?: string) { return value ? value.replaceAll("_", " ") : "not reported"; }
function controlStatus(value?: string) { return value === "allowed" || value === "blocked" ? value : displayStatus(value); }
const EXPORTED = new Set(["accepted_by_endpoint", "delivery_pending"]);
/** A trace ID is only worth showing when its spans went somewhere it can be looked up. */
function exportedTrace(splunk?: { status?: string; trace_id?: string }) { return splunk?.status && EXPORTED.has(splunk.status) ? splunk.trace_id : undefined; }

function answerText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> :
    part.startsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

export type BankingDemoProps = { onBack: () => void; onAdd: () => void; inStory: boolean; embedded?: boolean };

const BANKING_API = "/api/banking";
/** One scripted prompt as services/banking/scripts/record_golden.py captured it from the live service. */
type RecordedBody = Omit<TurnBody, "telemetry" | "security"> & { telemetry?: ResponseTelemetry; security?: NonNullable<ResponseTelemetry["security"]>; answer?: string; detail?: string; sources?: Source[] };
type RecordedTurn = { id: string; label: string; prompt: string; expected?: string; status: number; body: RecordedBody };
type ReplayTurn = { key: string; recordedAt: string; turn: RecordedTurn };
const REPLAY_DELAY_MS = 900;

function recordedOutcome({ status, body }: RecordedTurn) {
  if (body.security?.status === "blocked") return "AI Defense blocked";
  if (body.controls?.status === "blocked") return "Agent Control blocked";
  return status < 300 ? "answered" : `HTTP ${status}`;
}

// Shared with the live scenario test. Expectations are labels only: every click
// uses the real API, AI Defense, and Agent Controls; never simulate a verdict.

export default function BankingDemo({ onBack, onAdd, inStory, embedded = false }: BankingDemoProps) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [sessionId, setSessionId] = useState<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [errorMeta, setErrorMeta] = useState<ErrorMeta>();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [showSystem, setShowSystem] = useState(false);
  const [showTrace, setShowTrace] = useState(false);
  const [source, setSource] = useState<"none" | "live" | "recorded">("none");
  const [errorRecordedAt, setErrorRecordedAt] = useState<string>();
  const [recordedTurns, setRecordedTurns] = useState<ReplayTurn[]>([]);
  const replayTimer = useRef<number | undefined>(undefined);
  const recordings = useRecordings(BANKING_API);
  const ledger = useRunLedger();
  const { links } = useStudioNav();
  const stats = useMemo(() => bankingStats(health, healthFailed, links?.agentObservability), [health, healthFailed, links?.agentObservability]);

  useEffect(() => {
    fetch("/api/banking/health", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Health check unavailable")))
      .then(setHealth)
      .catch(() => setHealthFailed(true));
  }, []);

  useEffect(() => {
    let live = true;
    Promise.all(recordings.map((meta) => loadRecording<{ turns?: RecordedTurn[] }>(BANKING_API, meta.name).catch(() => null)))
      .then((docs) => {
        if (!live) return;
        setRecordedTurns(docs.flatMap((doc) => doc?.result?.turns?.map((turn) => ({ key: `${doc.name}:${turn.id}`, recordedAt: doc.recorded_at, turn })) ?? []));
      });
    return () => { live = false; };
  }, [recordings]);

  useEffect(() => () => window.clearTimeout(replayTimer.current), []);

  const statusLabel = useMemo(() => health?.ready ? "Ready" : health ? "Unavailable" : healthFailed ? "Unavailable" : "Health check pending", [health, healthFailed]);

  async function sendMessage(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || loading) return;
    setInput(""); setError(""); setErrorMeta(undefined); setErrorRecordedAt(undefined); setLoading(true);
    // A recorded turn has no server session behind it, so a live message starts a fresh conversation.
    const afterReplay = source === "recorded";
    if (afterReplay) setSessionId(undefined);
    setSource("live");
    setMessages((current) => [...(afterReplay ? [] : current), { role: "user", text: message }]);
    const run = startRun("turn", message);
    ledger.record(run);
    let settled = false;
    try {
      const response = await fetch("/api/banking/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(sessionId && !afterReplay ? { session_id: sessionId } : {}) }),
        signal: AbortSignal.timeout(155000),
      });
      if (!response.ok) { const detail = await response.text().catch(() => ""); let body: { detail?: string; message?: string; session_reset?: boolean; security?: IntegrationStatus; controls?: ResponseControls; telemetry?: { splunk?: ErrorMeta["splunk"] } } = {}; try { body = JSON.parse(detail); } catch { /* non-JSON error body */ } if (body.session_reset) setSessionId(undefined); ledger.record(observeTurn(run, response.status, body)); settled = true; setErrorMeta({ security: body.security, controls: body.controls, splunk: body.telemetry?.splunk }); throw new Error(body.detail || body.message || `Brahe Bank could not respond (${response.status}).`); }
      const data = await response.json();
      ledger.record(observeTurn(run, response.status, data));
      setSessionId(data.session_id);
      setMessages((current) => [...current, { role: "assistant", text: data.answer || "I don't have an answer for that yet.", sources: data.sources, trace: data.trace, duration: data.duration_ms, telemetry: { ...data.telemetry, security: data.security, controls: data.controls }, servedBy: servedByFrom(data.served_by) }]);
    } catch (cause) {
      if (!settled) ledger.record({ ...run, status: "failed", note: "No response from the service" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? "The request timed out. Try again." : cause instanceof Error ? cause.message : "Something went wrong. Try again.");
    } finally { setLoading(false); }
  }

  function newConversation() { window.clearTimeout(replayTimer.current); setMessages([]); setSessionId(undefined); setInput(""); setError(""); setErrorMeta(undefined); setErrorRecordedAt(undefined); setSource("none"); }

  /** Replays one recorded turn: the prompt, then the answer or refusal the live service returned when it was recorded. */
  function replayTurn(key: string) {
    const item = recordedTurns.find((entry) => entry.key === key);
    if (!item || loading) return;
    const { turn, recordedAt } = item;
    newConversation();
    setSource("recorded");
    setLoading(true);
    setMessages([{ role: "user", text: turn.prompt }]);
    const recorded = { replay: true, provenance: "recorded" as const, recordedAt };
    const run = { ...startRun("turn", `${turn.label} · recorded`), ...recorded };
    ledger.record(run);
    replayTimer.current = window.setTimeout(() => {
      const body = turn.body;
      ledger.record({ ...observeTurn(run, turn.status, body), ...recorded });
      if (turn.status < 300) {
        setMessages((current) => [...current, { role: "assistant", text: body.answer || "No answer was recorded.", sources: body.sources, trace: body.trace, duration: body.duration_ms, telemetry: { ...body.telemetry, security: body.security, controls: body.controls }, servedBy: servedByFrom(body.served_by), recordedAt }]);
      } else {
        setErrorMeta({ security: body.security, controls: body.controls, splunk: body.telemetry?.splunk });
        setErrorRecordedAt(recordedAt);
        setError(body.detail || `Brahe Bank did not answer (${turn.status}).`);
      }
      setLoading(false);
    }, REPLAY_DELAY_MS);
  }
  async function copyTrace(traceId: string) { await navigator.clipboard?.writeText(traceId); }
  useGuideActions("brahe-bank", {
    replay: (turnId) => {
      const item = recordedTurns.find((entry) => (turnId ? entry.key.endsWith(`:${turnId}`) : true));
      if (item) replayTurn(item.key);
    },
  });
  const lastAssistant = messages.reduce((found, message, index) => (message.role === "assistant" ? index : found), -1);
  const guideRun = loading ? "running" : error ? (errorMeta?.security?.status === "blocked" || errorMeta?.controls?.status === "blocked" ? "blocked" : "failed") : lastAssistant >= 0 ? "done" : "idle";
  const guideStage = [
    lastAssistant >= 0 && !loading && "answered",
    errorMeta?.security?.status === "blocked" && "blocked-defense",
    errorMeta?.controls?.status === "blocked" && "blocked-control",
  ].filter(Boolean).join(" ");
  const guideRecordedAt = source === "recorded" ? (errorRecordedAt ?? messages[lastAssistant]?.recordedAt) : undefined;
  return (
    /* Theme intentionally follows the studio's ink/navy/slate/cobalt/violet design contract. */
    <div className={`banking-demo ${embedded ? "banking-embedded" : ""}`} data-guide-run={guideRun} data-guide-source={source} data-guide-stage={guideStage} data-guide-recorded-at={guideRecordedAt}>
      {!embedded && <>
      <div className="banking-topline">
        <button className="banking-back" onClick={onBack}><ArrowLeft size={15} /> Back to library</button>
        <div className="banking-top-actions"><button className="banking-icon-button" disabled={inStory} title={inStory ? "Already in story" : "Add to story"} onClick={onAdd}><Plus size={17} /><span className="add-story-label">{inStory ? "In story" : "Add to story"}</span></button></div>
      </div>
      <section className="banking-heading">
        <div><div className="banking-eyebrow"><LandmarkMark /> BRAHE BANK CUSTOMER ASSISTANCE</div><h1>Ask Brahe Bank</h1><p>A demo assistant for product guidance, score education, and eligibility questions.</p></div>
        <div className="banking-status"><span className={health?.ready ? "status-dot ready" : "status-dot"} />{statusLabel}<small>{health?.model || (health ? "No model reachable" : "Model not reported")}</small></div>
      </section>
      </>}
      <section className="banking-layout">
        <div className="chat-card" {...guideAnchor("banking.chat")}>
          <div className="chat-card-head"><div className="assistant-identity"><span className="assistant-avatar"><Bot size={18} /></span><div><strong>Brahe Bank assistant</strong><span>Fictional bank · mock score 550</span></div></div><div className="chat-card-actions">{recordedTurns.length > 0 && <label className="rt-replay banking-replay" {...guideAnchor("banking.replay")}><History size={15} aria-hidden="true" /><span>Replay a recorded turn</span><select id="banking-replay" value="" disabled={loading} onChange={(event) => { if (event.target.value) replayTurn(event.target.value); }}><option value="">Choose…</option>{recordedTurns.map(({ key, recordedAt, turn }) => <option key={key} value={key}>{turn.label} · {recordedOutcome(turn)} · {new Date(recordedAt).toLocaleDateString()}</option>)}</select></label>}<button className="new-chat" disabled={loading} onClick={newConversation}><Plus size={14} /> New conversation</button></div></div>
          <div className="chat-feed" aria-live="polite">
            {messages.length === 0 && <div className="chat-empty"><span className="empty-icon"><Sparkles size={20} /></span><h2>How can I help today?</h2><p>Try a banking question or test the guardrails.</p><div className="suggestion-grid" {...guideAnchor("banking.suggestions")}>{suggestions.map((item) => <button key={item.id} {...guideAnchor(`banking.suggestion.${item.id}`)} title={item.prompt} disabled={loading} onClick={() => sendMessage(undefined, item.prompt)}><MessageSquareText size={16} /><span className="suggestion-copy"><strong>{item.label}</strong><small>{item.expected}</small></span><ChevronRight size={16} /></button>)}</div></div>}
            {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="message-avatar">{message.role === "user" ? "JC" : <Bot size={14} />}</span><div className="message-body" {...(index === lastAssistant ? guideAnchor("banking.answer") : {})}><div className="message-bubble">{answerText(message.text)}</div>{message.role === "assistant" && <>{message.recordedAt ? <ProvenanceBadge provenance={{ kind: "recorded", recordedAt: message.recordedAt, servedBy: message.servedBy }} className="response-meta" /> : message.servedBy && <ProvenanceBadge provenance={{ kind: "live", servedBy: message.servedBy }} className="response-meta" />}{message.duration && <small className="response-meta"><Clock3 size={11} /> {message.duration} ms{message.recordedAt ? " (original run)" : ""}</small>}{message.telemetry?.security && <small className="response-meta security-meta"><ShieldCheck size={11} /> AI Defense{message.recordedAt ? " (original run)" : ""}: {displayStatus(message.telemetry.security.status)} · {message.telemetry.security.checks ?? 0} checks · {message.telemetry.security.blocked ?? 0} blocked</small>}{message.telemetry?.controls && <div className="response-meta security-meta"><ShieldCheck size={11} /> Agent Controls{message.recordedAt ? " (original run)" : ""}: {displayStatus(message.telemetry.controls.status)}{message.telemetry.controls.checks.map((check) => <span key={`${check.control_id}-${check.name}`}> · {check.name}: {controlStatus(check.status)}</span>)}</div>}{message.telemetry?.galileo && <small className="response-meta">Agent tracing (Galileo SDK{message.recordedAt ? ", original run" : ""}): {message.telemetry.galileo}</small>}{message.telemetry?.splunk && <div className="response-meta splunk-meta"><Server size={11} /> Additional OTLP export{message.recordedAt ? " (original run)" : ""}: {displayStatus(message.telemetry.splunk.status)}{exportedTrace(message.telemetry.splunk) ? <><span>· Trace {exportedTrace(message.telemetry.splunk)}</span><button onClick={() => copyTrace(exportedTrace(message.telemetry?.splunk)!)} className="copy-trace">Copy</button></> : null}{message.telemetry.splunk.dashboard_url ? <a href={message.telemetry.splunk.dashboard_url} target="_blank" rel="noreferrer">Open dashboard</a> : null}</div>}{message.sources?.length ? <div className="sources"><strong><Search size={12} /> Sources</strong>{message.sources.map((source, sourceIndex) => <details key={`${source.title}-${sourceIndex}`}><summary>{source.title}</summary><p>{source.text}</p></details>)}</div> : null}{message.trace?.length ? <button className="trace-toggle" onClick={() => setShowTrace((value) => !value)}><GitBranch size={12} /> {showTrace ? "Hide" : "Show"} executed trace</button> : null}</>}</div></div>)}
            {loading && <div className="chat-message assistant"><span className="message-avatar"><Bot size={14} /></span><div className="message-bubble loading-bubble"><Loader2 size={15} className="spin" /> {source === "recorded" ? "Replaying the recorded answer…" : "Brahe Bank is thinking…"}</div></div>}
          </div>
          {error && <div className="banking-error" {...guideAnchor("banking.error")} data-provenance={errorRecordedAt ? "recorded" : undefined}><CircleAlert size={14} /><div>{errorRecordedAt && <ProvenanceBadge provenance={{ kind: "recorded", recordedAt: errorRecordedAt }} />}<div>{error}</div>{errorMeta?.security && <small>AI Defense{errorRecordedAt ? " (original run)" : ""}: {displayStatus(errorMeta.security.status)}</small>}{errorMeta?.security?.event_ids?.map((id) => <small key={id}>Cisco event: {id}</small>)}{errorMeta?.controls && <small>Agent Controls{errorRecordedAt ? " (original run)" : ""}: {displayStatus(errorMeta.controls.status)}{errorRecordedAt && errorMeta.controls.checks.map((check) => <span key={`${check.control_id}-${check.name}`}> · {check.name}: {controlStatus(check.status)}</span>)}</small>}{errorMeta?.splunk && <small>Additional OTLP export: {displayStatus(errorMeta.splunk.status)}</small>}{exportedTrace(errorMeta?.splunk) && <small>Trace ID: {exportedTrace(errorMeta?.splunk)}</small>}</div><button onClick={() => setError("")}><X size={14} /></button></div>}
          <form className="chat-composer" onSubmit={sendMessage} {...guideAnchor("banking.composer")}><input maxLength={4000} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question about Brahe Bank…" aria-label="Message Brahe Bank" disabled={loading} /><button className="send-button" disabled={loading || !input.trim()}>Send</button></form>
        </div>
        <aside className="banking-side">
          <BankingRuntimeDetails health={health} />
          {!embedded && (<div className="system-card"><button className="system-toggle" onClick={() => setShowSystem((value) => !value)}><span><Waypoints size={15} /> System view</span>{showSystem ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>{showSystem && <div className="system-diagram"><div className="diagram-node supervisor"><span>01</span><Bot size={15} /><strong>Supervisor</strong><small>routes intent</small></div><div className="diagram-branch"><div className="diagram-node"><span>02A</span><CreditCard size={14} /><strong>Credit card agent</strong><small>{health?.retrieval || "Local document search"}</small></div><div className="diagram-node violet-node"><span>02B</span><Gauge size={14} /><strong>Credit score agent</strong><small>Mock score · 550</small></div></div><div className="diagram-foot"><span>AI Defense → scope control → LangGraph</span><span>·</span><span>final AI Defense → quality controls → release</span></div><p className="planned-note">Controls record verdicts; they do not guarantee answer quality.</p></div>}</div>)}
          {showTrace && messages.some((message) => message.trace?.length) && <div className="trace-card"><strong><GitBranch size={14} /> Last executed trace</strong>{[...messages].reverse().find((message) => message.trace?.length)?.trace?.map((step, index) => <div className="trace-row" key={`${step.name}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{step.name}</b><small>{step.kind}</small></div><CheckCircle2 size={13} /></div>)}</div>}
        </aside>
      </section>
      <RunStats ledger={ledger} {...stats} empty="Ask a question. Each turn's model calls, tools, controls, and AI Defense verdicts land here." />
      {!embedded && inStory && <div className="story-context"><span>STORY MODE</span> This interactive slice demonstrates the customer-assistance path.</div>}
    </div>
  );
}

type TurnBody = { trace?: TraceStep[]; duration_ms?: number; usage?: unknown; served_by?: unknown; security?: unknown; controls?: ResponseControls; telemetry?: { galileo?: string; splunk?: { status?: string; trace_id?: string; span_count?: number } } };

/** One chat turn from the banking service's own response, including refusals that carry the same accounting. */
function observeTurn(run: ObservedRun, status: number, body: TurnBody): ObservedRun {
  const checks = body.controls?.checks ?? [];
  const blocked = status === 403 || status === 422;
  return {
    ...run,
    status: status < 300 ? "completed" : blocked ? "blocked" : "failed",
    durationMs: body.duration_ms,
    ...usageFrom(body.usage),
    servedBy: servedByFrom(body.served_by),
    toolCalls: body.trace ? body.trace.filter((step) => step.kind === "tool").length : undefined,
    counts: {
      handoffs: body.trace ? body.trace.filter((step) => step.kind === "handoff").length : undefined,
      controls: body.controls ? checks.length : undefined,
      controlsBlocked: body.controls ? checks.filter((check) => check.status === "blocked").length : undefined,
    },
    agentTrace: body.telemetry?.galileo,
    otlp: body.telemetry?.splunk?.status,
    traceId: body.telemetry?.splunk?.trace_id,
    spans: body.telemetry?.splunk?.span_count,
    defense: defenseFrom(body.security),
  };
}

function bankingStats(health: Health | null, failed: boolean, link?: string | null): { observability: StatsCard; defense: StatsCard } {
  const reachable = !failed;
  return {
    observability: {
      integration: agentTraceIntegration(health?.galileo, reachable, link),
      tiles: [
        { label: "LLM calls", value: (run) => run.llmCalls, hint: "Supervisor and agent model calls; Agent Control's judge is not counted" },
        { label: "Tool calls", value: (run) => run.toolCalls },
        { label: "Handoffs", value: (run) => run.counts?.handoffs },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
        { label: "Controls", value: (run) => run.counts?.controls, hint: "Agent Control evaluations" },
        { label: "Denials", value: (run) => run.counts?.controlsBlocked, alert: "deny", hint: "Agent Control blocks" },
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "Measured by the banking service" },
      ],
      facts: traceFacts,
      source: "From each /api/banking/chat response: the graph's own callbacks count model and tool calls, and tokens are what the provider reported.",
    },
    defense: {
      integration: defenseIntegration(health?.security, "model input and output", reachable),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the security summary on each response: one inspection per model input and output.",
    },
  };
}

function LandmarkMark() { return <span className="landmark-mark"><span /><span /><span /><span /></span>; }
