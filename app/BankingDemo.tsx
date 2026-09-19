"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
import suggestions from "./banking-scenarios.json";

type TraceStep = { name: string; kind: string };
type Source = { title: string; text: string };
type IntegrationStatus = { status: string; mode?: string; fail_open?: boolean; service_name?: string; missing?: string[]; dashboard_url?: string; event_ids?: string[] };
type ControlResult = { status: "allowed" | "blocked"; control_id: number; execution_id?: string; name: string };
type ResponseControls = { status: "allowed" | "blocked" | "unavailable" | "not_checked"; checks: ControlResult[]; judge_model: string };
type ControlConfig = { status: "enforcing" | "unavailable" | "not_configured"; names: string[]; judge_model: string; execution: string; fail_open: boolean };
type Health = { ready: boolean; model: string; retrieval: string; galileo: string; security?: IntegrationStatus; controls?: ControlConfig; splunk?: IntegrationStatus };
type ResponseTelemetry = { security?: { status: string; mode?: string; checks?: number; blocked?: number; errors?: number; event_ids?: string[] }; controls?: ResponseControls; splunk?: { status: string; trace_id?: string; span_count?: number; dashboard_url?: string }; galileo?: string };
type Message = { role: "user" | "assistant"; text: string; sources?: Source[]; trace?: TraceStep[]; duration?: number; telemetry?: ResponseTelemetry };
type ErrorMeta = { security?: IntegrationStatus; controls?: ResponseControls; splunk?: { status: string; trace_id?: string; span_count?: number; dashboard_url?: string } };
function displayStatus(value?: string) { return value ? value.replaceAll("_", " ") : "not reported"; }
function controlStatus(value?: string) { return value === "allowed" || value === "blocked" ? value : displayStatus(value); }

function answerText(text: string) {
  return text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g).map((part, index) =>
    part.startsWith("**") ? <strong key={index}>{part.slice(2, -2)}</strong> :
    part.startsWith("`") ? <code key={index}>{part.slice(1, -1)}</code> : part);
}

export type BankingDemoProps = { onBack: () => void; onAdd: () => void; inStory: boolean; embedded?: boolean };

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

  useEffect(() => {
    fetch("/api/banking/health", { signal: AbortSignal.timeout(10000) })
      .then((r) => r.ok ? r.json() : Promise.reject(new Error("Health check unavailable")))
      .then(setHealth)
      .catch(() => setHealthFailed(true));
  }, []);

  const statusLabel = useMemo(() => health?.ready ? "Ready" : health ? "Unavailable" : healthFailed ? "Unavailable" : "Health check pending", [health, healthFailed]);

  async function sendMessage(event?: FormEvent, preset?: string) {
    event?.preventDefault();
    const message = (preset ?? input).trim();
    if (!message || loading) return;
    setInput(""); setError(""); setErrorMeta(undefined); setLoading(true);
    setMessages((current) => [...current, { role: "user", text: message }]);
    try {
      const response = await fetch("/api/banking/chat", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message, ...(sessionId ? { session_id: sessionId } : {}) }),
        signal: AbortSignal.timeout(155000),
      });
      if (!response.ok) { const detail = await response.text().catch(() => ""); let body: { detail?: string; message?: string; session_reset?: boolean; security?: IntegrationStatus; controls?: ResponseControls; telemetry?: { splunk?: ErrorMeta["splunk"] } } = {}; try { body = JSON.parse(detail); } catch { /* non-JSON error body */ } if (body.session_reset) setSessionId(undefined); setErrorMeta({ security: body.security, controls: body.controls, splunk: body.telemetry?.splunk }); throw new Error(body.detail || body.message || `Brahe Bank could not respond (${response.status}).`); }
      const data = await response.json();
      setSessionId(data.session_id);
      setMessages((current) => [...current, { role: "assistant", text: data.answer || "I don't have an answer for that yet.", sources: data.sources, trace: data.trace, duration: data.duration_ms, telemetry: { ...data.telemetry, security: data.security, controls: data.controls } }]);
    } catch (cause) {
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? "The request timed out. Try again." : cause instanceof Error ? cause.message : "Something went wrong. Try again.");
    } finally { setLoading(false); }
  }

  function newConversation() { setMessages([]); setSessionId(undefined); setInput(""); setError(""); setErrorMeta(undefined); }
  async function copyTrace(traceId: string) { await navigator.clipboard?.writeText(traceId); }
  return (
    /* Theme intentionally follows the studio's ink/navy/slate/cobalt/violet design contract. */
    <div className={`banking-demo ${embedded ? "banking-embedded" : ""}`}>
      {!embedded && <>
      <div className="banking-topline">
        <button className="banking-back" onClick={onBack}><ArrowLeft size={15} /> Back to library</button>
        <div className="banking-top-actions"><button className="banking-icon-button" disabled={inStory} title={inStory ? "Already in story" : "Add to story"} onClick={onAdd}><Plus size={17} /><span className="add-story-label">{inStory ? "In story" : "Add to story"}</span></button></div>
      </div>
      <section className="banking-heading">
        <div><div className="banking-eyebrow"><LandmarkMark /> BRAHE BANK CUSTOMER ASSISTANCE</div><h1>Ask Brahe Bank</h1><p>A demo assistant for product guidance, score education, and eligibility questions.</p></div>
        <div className="banking-status"><span className={health?.ready ? "status-dot ready" : "status-dot"} />{statusLabel}<small>{health?.model || "OpenAI hosted model"}</small></div>
      </section>
      </>}
      <section className="banking-layout">
        <div className="chat-card">
          <div className="chat-card-head"><div className="assistant-identity"><span className="assistant-avatar"><Bot size={18} /></span><div><strong>Brahe Bank assistant</strong><span>Fictional bank · mock score 550</span></div></div><button className="new-chat" disabled={loading} onClick={newConversation}><Plus size={14} /> New conversation</button></div>
          <div className="chat-feed" aria-live="polite">
            {messages.length === 0 && <div className="chat-empty"><span className="empty-icon"><Sparkles size={20} /></span><h2>How can I help today?</h2><p>Try a banking question or test the guardrails.</p><div className="suggestion-grid">{suggestions.map((item) => <button key={item.id} title={item.prompt} disabled={loading} onClick={() => sendMessage(undefined, item.prompt)}><MessageSquareText size={16} /><span className="suggestion-copy"><strong>{item.label}</strong><small>{item.expected}</small></span><ChevronRight size={16} /></button>)}</div></div>}
            {messages.map((message, index) => <div className={`chat-message ${message.role}`} key={`${message.role}-${index}`}><span className="message-avatar">{message.role === "user" ? "JC" : <Bot size={14} />}</span><div className="message-body"><div className="message-bubble">{answerText(message.text)}</div>{message.role === "assistant" && <>{message.duration && <small className="response-meta"><Clock3 size={11} /> {message.duration} ms</small>}{message.telemetry?.security && <small className="response-meta security-meta"><ShieldCheck size={11} /> AI Defense: {displayStatus(message.telemetry.security.status)} · {message.telemetry.security.checks ?? 0} checks · {message.telemetry.security.blocked ?? 0} blocked</small>}{message.telemetry?.controls && <div className="response-meta security-meta"><ShieldCheck size={11} /> Agent Controls: {displayStatus(message.telemetry.controls.status)}{message.telemetry.controls.checks.map((check) => <span key={`${check.control_id}-${check.name}`}> · {check.name}: {controlStatus(check.status)}</span>)}</div>}{message.telemetry?.galileo && <small className="response-meta">Agent tracing (Galileo SDK): {message.telemetry.galileo}</small>}{message.telemetry?.splunk && <div className="response-meta splunk-meta"><Server size={11} /> Additional OTLP export: {displayStatus(message.telemetry.splunk.status)}{message.telemetry.splunk.trace_id ? <><span>· Trace {message.telemetry.splunk.trace_id}</span><button onClick={() => copyTrace(message.telemetry!.splunk!.trace_id!)} className="copy-trace">Copy</button></> : null}{message.telemetry.splunk.dashboard_url ? <a href={message.telemetry.splunk.dashboard_url} target="_blank" rel="noreferrer">Open dashboard</a> : null}</div>}{message.sources?.length ? <div className="sources"><strong><Search size={12} /> Sources</strong>{message.sources.map((source, sourceIndex) => <details key={`${source.title}-${sourceIndex}`}><summary>{source.title}</summary><p>{source.text}</p></details>)}</div> : null}{message.trace?.length ? <button className="trace-toggle" onClick={() => setShowTrace((value) => !value)}><GitBranch size={12} /> {showTrace ? "Hide" : "Show"} executed trace</button> : null}</>}</div></div>)}
            {loading && <div className="chat-message assistant"><span className="message-avatar"><Bot size={14} /></span><div className="message-bubble loading-bubble"><Loader2 size={15} className="spin" /> Brahe Bank is thinking…</div></div>}
          </div>
          {error && <div className="banking-error"><CircleAlert size={14} /><div><div>{error}</div>{errorMeta?.security && <small>AI Defense: {displayStatus(errorMeta.security.status)}</small>}{errorMeta?.security?.event_ids?.map((id) => <small key={id}>Cisco event: {id}</small>)}{errorMeta?.controls && <small>Agent Controls: {displayStatus(errorMeta.controls.status)}</small>}{errorMeta?.splunk && <small>Additional OTLP export: {displayStatus(errorMeta.splunk.status)}</small>}{errorMeta?.splunk?.trace_id && <small>Trace ID: {errorMeta.splunk.trace_id}</small>}</div><button onClick={() => setError("")}><X size={14} /></button></div>}
          <form className="chat-composer" onSubmit={sendMessage}><input maxLength={4000} value={input} onChange={(event) => setInput(event.target.value)} placeholder="Ask a question about Brahe Bank…" aria-label="Message Brahe Bank" disabled={loading} /><button className="send-button" disabled={loading || !input.trim()}>Send</button></form>
        </div>
        <aside className="banking-side">
          <BankingRuntimeDetails health={health} />
          {!embedded && (<div className="system-card"><button className="system-toggle" onClick={() => setShowSystem((value) => !value)}><span><Waypoints size={15} /> System view</span>{showSystem ? <ChevronDown size={15} /> : <ChevronRight size={15} />}</button>{showSystem && <div className="system-diagram"><div className="diagram-node supervisor"><span>01</span><Bot size={15} /><strong>Supervisor</strong><small>routes intent</small></div><div className="diagram-branch"><div className="diagram-node"><span>02A</span><CreditCard size={14} /><strong>Credit card agent</strong><small>{health?.retrieval || "Local document search"}</small></div><div className="diagram-node violet-node"><span>02B</span><Gauge size={14} /><strong>Credit score agent</strong><small>Mock score · 550</small></div></div><div className="diagram-foot"><span>AI Defense → scope control → LangGraph</span><span>·</span><span>final AI Defense → quality controls → release</span></div><p className="planned-note">Controls record verdicts; they do not guarantee answer quality.</p></div>}</div>)}
          {showTrace && messages.some((message) => message.trace?.length) && <div className="trace-card"><strong><GitBranch size={14} /> Last executed trace</strong>{[...messages].reverse().find((message) => message.trace?.length)?.trace?.map((step, index) => <div className="trace-row" key={`${step.name}-${index}`}><span>{String(index + 1).padStart(2, "0")}</span><div><b>{step.name}</b><small>{step.kind}</small></div><CheckCircle2 size={13} /></div>)}</div>}
        </aside>
      </section>
      {!embedded && inStory && <div className="story-context"><span>STORY MODE</span> This interactive slice demonstrates the customer-assistance path.</div>}
    </div>
  );
}

function LandmarkMark() { return <span className="landmark-mark"><span /><span /><span /><span /></span>; }
