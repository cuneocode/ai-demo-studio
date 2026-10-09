"use client";

import { FormEvent, useEffect, useMemo, useRef, useState, type RefObject } from "react";
import {
  ArrowLeft,
  ArrowRight,
  ChevronDown,
  ChevronRight,
  CircleAlert,
  CircleGauge,
  Clock3,
  Loader2,
  Plus,
  ShieldCheck,
  Sparkles,
  Waypoints,
  X,
} from "lucide-react";
import "./banking.css";
import "./fraud.css";
import DemoStatusBanner from "./DemoStatusBanner";
import FraudRuntimeDetails, { type FraudHealth } from "./FraudRuntimeDetails";
import RunStats, { defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, servedByFrom, usageFrom, startRun, useRunLedger, type Integration, type ObservedRun, type StatsCard } from "./RunStats";
import { newRunId, type ServedBy } from "./run/events";
import ProvenanceBadge, { type Provenance } from "./run/ProvenanceBadge";
import RunTimeline from "./run/RunTimeline";
import { useRun } from "./run/useRun";

type CaseItem = {
  id: string;
  label: string;
  account: string;
  merchant: string;
  amount: number;
  channel: string;
  neighborhood: string;
};
type ShapItem = { feature: string; label?: string; value: number; direction: "risk" | "protective" };
type RiskBand = "high" | "elevated" | "low";
type Backend = "live" | "cache" | "fixture" | "unavailable";
type ScoreResult = {
  case: CaseItem;
  probability: number;
  threshold: number;
  risk_band?: RiskBand;
  suggested_action?: string;
  shap: ShapItem[];
  backend: string;
  backend_label?: string;
  recorded_at?: string | null;
  fallback?: { backend: string; label: string; reason: string }[];
  narrative?: { status: string; text?: string | null; security?: { status?: string }; usage?: unknown; served_by?: unknown };
  security?: unknown;
  duration_ms?: number;
  run_id?: string;
};
type Health = FraudHealth & {
  backend_label?: string;
  sidecar?: { status?: string; url?: string };
  recorded_at?: string | null;
};
type FraudDemoProps = { onBack: () => void; onAdd: () => void; inStory: boolean; embedded?: boolean };

const RISK: Record<RiskBand, { label: string; action: string }> = {
  high: { label: "High risk", action: "Contact customer, then block and reissue" },
  elevated: { label: "Elevated risk", action: "Verify with the customer before the payment settles" },
  low: { label: "Low risk", action: "No action needed; keep monitoring" },
};
const BACKEND_LABEL: Record<Backend, string> = { live: "GNN on Sparky (live)", cache: "Recorded scores", fixture: "Sample scores", unavailable: "No scorer" };
const STATUS_LABEL: Record<Backend, string> = { live: "Live model", cache: "Recorded scores", fixture: "Sample data", unavailable: "Unavailable" };
const CHANNEL: Record<string, string> = { pos: "Card present", cnp: "Card not present", ach: "ACH transfer", recurring: "Recurring" };
const GNN: ServedBy = { provider: "sparky-gnn", label: "GNN on Sparky", model: "GraphSAGE + XGBoost", private: true, fallback: false };

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function shapWidth(value: number, max: number) {
  if (!max) return "8%";
  return `${Math.max(8, Math.round((Math.abs(value) / max) * 100))}%`;
}

const sentence = (value: string) => {
  const words = value.replace(/[_\s]+/g, " ").trim();
  return words ? words[0].toUpperCase() + words.slice(1) : value;
};
const channelLabel = (value: string) => CHANNEL[value.toLowerCase()] ?? sentence(value);

/** Older services reported production_http / triton for the live scorer. */
function backendKind(raw?: string): Backend {
  if (raw === "live" || raw === "production_http" || raw === "triton") return "live";
  if (raw === "cache" || raw === "fixture") return raw;
  return "unavailable";
}

function bandOf(result: ScoreResult): RiskBand {
  if (result.risk_band && result.risk_band in RISK) return result.risk_band;
  if (result.probability >= result.threshold) return "high";
  return result.probability >= result.threshold * 0.7 ? "elevated" : "low";
}

function day(iso?: string | null) {
  const date = iso ? new Date(iso) : null;
  return date && !Number.isNaN(date.getTime()) ? date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" }) : "";
}

function scoreProvenance(result: ScoreResult): Provenance {
  const kind = backendKind(result.backend);
  if (kind === "live") return { kind: "live", servedBy: GNN };
  if (kind === "cache") return { kind: "recorded", recordedAt: result.recorded_at || "date unknown", servedBy: GNN };
  return { kind: "sample", detail: "synthetic payments" };
}

export default function FraudDemo({ onBack, onAdd, inStory, embedded = false }: FraudDemoProps) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [health, setHealth] = useState<Health | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [includeNarrative, setIncludeNarrative] = useState(true);
  const [showSystem, setShowSystem] = useState(false);
  const ledger = useRunLedger();
  const stats = useMemo(() => fraudStats(health, healthFailed), [health, healthFailed]);
  const steps = useRun({ pageUrl: (id, after) => `/api/fraud/runs/${encodeURIComponent(id)}?after=${after}` });
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const focusResult = useRef(false);

  useEffect(() => {
    fetch("/api/fraud/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Health check unavailable")))
      .then(setHealth)
      .catch(() => setHealthFailed(true));
    fetch("/api/fraud/cases", { signal: AbortSignal.timeout(10000) })
      .then((response) => response.ok ? response.json() : Promise.reject(new Error("Cases unavailable")))
      .then((body) => {
        setCases(body.cases || []);
        setSelectedId(body.cases?.[0]?.id);
      })
      .catch(() => setError("Fraud cases are unavailable. Start the fraud scoring service in Studio settings."));
  }, []);

  useEffect(() => {
    const heading = resultHeading.current;
    if (!score || !focusResult.current || !heading) return;
    focusResult.current = false;
    heading.scrollIntoView({ block: "center", behavior: "smooth" });
    heading.focus({ preventScroll: true });
  }, [score]);

  const selected = useMemo(() => cases.find((item) => item.id === selectedId), [cases, selectedId]);
  const backend = health ? backendKind(health.backend) : null;
  const statusLabel = backend ? STATUS_LABEL[backend] : healthFailed ? "Unavailable" : "Health check pending";
  const narrativeReady = health?.narrative?.status === "configured";
  const narrativeOn = includeNarrative && narrativeReady;
  const shapMax = Math.max(0.01, ...(score?.shap.map((item) => Math.abs(item.value)) || [0]));
  const shown = score && selected && score.case.id === selected.id ? score : null;

  async function scoreCase(event?: FormEvent) {
    event?.preventDefault();
    if (!selected || loading) return;
    setLoading(true);
    setError("");
    setScore(null);
    const runId = newRunId("fraud");
    steps.open(runId);
    const run = startRun("score", `${selected.label} · ${narrativeOn ? "score + AI summary" : "score only"}`);
    ledger.record(run);
    try {
      const response = await fetch("/api/fraud/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selected.id, include_narrative: narrativeOn, run_id: runId }),
        signal: AbortSignal.timeout(narrativeOn ? 180000 : 30000),
      });
      if (!response.ok) {
        // A 502 is a run that failed on the timeline; anything else never opened one.
        if (response.status !== 502) steps.reset();
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Scoring failed (${response.status}).`);
      }
      const result = await response.json() as ScoreResult;
      if (!result.run_id) steps.reset();
      else if (result.run_id !== runId) steps.open(result.run_id);
      ledger.record(observeScore(run, result));
      focusResult.current = true;
      setScore(result);
    } catch (cause) {
      ledger.record({ ...run, status: "failed", note: "No score was returned" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError"
        ? "Scoring timed out. Try again."
        : cause instanceof Error ? cause.message : "Scoring failed. Try again.");
    } finally {
      setLoading(false);
    }
  }

  function selectCase(id: string) {
    setSelectedId(id);
    setScore(null);
    setError("");
    steps.reset();
  }

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
            <div className="banking-eyebrow"><CircleGauge size={14} /> TRANSACTION FRAUD SCORING</div>
            <h1>Review graph-scored payments</h1>
            <p>Synthetic payments. The score is evidence for the analyst, not a decision.</p>
          </div>
          <div className="banking-status">
            <span className={backend === "live" ? "status-dot ready" : "status-dot"} />
            {statusLabel}
            <small>{health?.backend_label || "Checking the scorer"}</small>
          </div>
        </section>
      </>}

      <FraudStatus health={health} failed={healthFailed} />

      <section className="banking-layout">
        <div className="fraud-main">
          <div className="chat-card queue-card">
            <div className="queue-card-head">
              <div className="assistant-identity">
                <span className="assistant-avatar"><CircleGauge size={18} /></span>
                <div><strong>Alert queue</strong><span>{cases.length || 0} synthetic card payments</span></div>
              </div>
            </div>
            <ul className="queue-list" aria-label="Alert queue">
              {cases.map((item) => (
                <li key={item.id}>
                  <button
                    className={`queue-row ${item.id === selectedId ? "selected" : ""}`}
                    onClick={() => selectCase(item.id)}
                    aria-pressed={item.id === selectedId}
                  >
                    <span><strong>{item.label}</strong><small>{item.merchant}</small></span>
                    <span className="amount">{money(item.amount)}</span>
                    <span className="channel">{channelLabel(item.channel)}</span>
                    <ArrowRight size={15} />
                  </button>
                </li>
              ))}
            </ul>
          </div>
          {(loading || shown) && steps.runId && (
            <section className="chat-card score-steps" aria-labelledby="fraud-steps-title">
              <h4 id="fraud-steps-title">Scoring steps</h4>
              <RunTimeline label="Scoring steps" events={steps.visible} start={steps.run?.started_at} className="boxed" empty="Waiting for the first step…" />
            </section>
          )}
        </div>

        <aside className="banking-side">
          <div className="proof-card review-card">
            {selected ? <>
              <span className="review-kicker">SELECTED PAYMENT · SYNTHETIC</span>
              <h3>{selected.label}</h3>
              <p>{selected.neighborhood}</p>
              <dl className="fact-grid">
                <div><dt>Card</dt><dd>{selected.account}</dd></div>
                <div><dt>Merchant</dt><dd>{selected.merchant}</dd></div>
                <div><dt>Amount</dt><dd>{money(selected.amount)}</dd></div>
                <div><dt>Channel</dt><dd>{channelLabel(selected.channel)}</dd></div>
              </dl>
              <div className="score-result" aria-live="polite">
                {shown && <ScorePanel result={shown} shapMax={shapMax} headingRef={resultHeading} />}
              </div>
              <form className="review-actions" onSubmit={scoreCase}>
                <button id="score-payment" className="primary" disabled={loading}>
                  {loading ? <><Loader2 size={15} className="spin" /> Scoring…</> : <><Sparkles size={15} /> Score this payment</>}
                </button>
                <fieldset className="narrative-toggle">
                  <legend>AI analyst summary</legend>
                  <div role="group" aria-label="AI analyst summary">
                    <button
                      type="button"
                      className={narrativeOn ? "active" : ""}
                      aria-pressed={narrativeOn}
                      disabled={!narrativeReady}
                      aria-describedby="fraud-narrative-hint"
                      onClick={() => setIncludeNarrative(true)}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      className={!narrativeOn ? "active" : ""}
                      aria-pressed={!narrativeOn}
                      onClick={() => setIncludeNarrative(false)}
                    >
                      Off
                    </button>
                  </div>
                  <small id="fraud-narrative-hint">
                    {!narrativeReady
                      ? "Unavailable · no summary model is configured for this demo"
                      : narrativeOn ? "On · AI Defense inspects the summary prompt and draft" : "Off · score only"}
                  </small>
                </fieldset>
              </form>
            </> : <p>Select a payment from the queue.</p>}
            {error && <div className="banking-error" role="alert"><CircleAlert size={14} /><div>{error}</div><button aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>}
          </div>
          <div className="system-card">
            <button className="system-toggle" onClick={() => setShowSystem((value) => !value)} aria-expanded={showSystem}>
              <span><Waypoints size={15} /> System view</span>
              {showSystem ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            {showSystem && <div className="system-diagram">
              <div className="diagram-node supervisor"><span>01</span><CircleGauge size={15} /><strong>Case catalog</strong><small>Synthetic card payments</small></div>
              <div className="diagram-branch">
                <div className="diagram-node violet-node"><span>02A</span><strong>GraphSAGE + XGBoost</strong><small>live, recorded, or sample scores</small></div>
                <div className="diagram-node"><span>02B</span><strong>Reason breakdown</strong><small>what moved the score</small></div>
              </div>
              <div className="diagram-foot"><span>Score + reasons</span><span>·</span><span>optional inspected AI summary</span></div>
              <p className="planned-note">The probability is evidence, not a decision. The analyst decides what happens to the payment.</p>
              <FraudRuntimeDetails health={health} />
            </div>}
          </div>
        </aside>
      </section>
      <RunStats ledger={ledger} {...stats} empty="Score a payment. The AI analyst summary's model call and its AI Defense inspections land here." />
      {!embedded && inStory && <div className="story-context"><span>STORY MODE</span> This slice shows graph scoring before investigation or SAR drafting.</div>}
    </div>
  );
}

function ScorePanel({ result, shapMax, headingRef }: { result: ScoreResult; shapMax: number; headingRef: RefObject<HTMLHeadingElement | null> }) {
  const band = bandOf(result);
  const backend = backendKind(result.backend);
  const label = result.backend_label || BACKEND_LABEL[backend];
  const summaryBy = servedByFrom(result.narrative?.served_by);
  const fallback = result.fallback ?? [];
  return (
    <div className="score-panel">
      <div className="score-head">
        <h4 id="fraud-result-heading" ref={headingRef} tabIndex={-1} className={`risk-heading ${band}`}>
          <span className="risk-dot" aria-hidden="true" />{RISK[band].label}
        </h4>
        <ProvenanceBadge provenance={scoreProvenance(result)} />
      </div>
      <div className="score-meter">
        <div>
          <small>Fraud probability</small>
          <strong>{result.probability.toFixed(2)}</strong>
        </div>
        <small>Alert threshold {result.threshold.toFixed(2)}</small>
      </div>
      <p className={`suggested-action ${band}`}><span>Suggested action</span>{result.suggested_action || RISK[band].action}</p>
      <small className="score-source">
        Scored by {label}{backend === "cache" && result.recorded_at ? ` · recorded ${day(result.recorded_at)}` : ""}
        {fallback.length > 0 && ` · ${fallback.map((item) => item.label).join(" and ")} could not answer`}
      </small>
      <div className="shap-list" role="list" aria-label="What moved the score">
        {result.shap.map((item) => (
          <div className="shap-row" role="listitem" key={item.feature}>
            <span>{item.label || sentence(item.feature)}</span>
            <span>{item.value >= 0 ? "+" : ""}{item.value.toFixed(2)}</span>
            <span className="shap-track" aria-hidden="true"><span className={`shap-fill ${item.direction}`} style={{ width: shapWidth(item.value, shapMax) }} /></span>
          </div>
        ))}
      </div>
      {result.duration_ms != null && <small className="response-meta"><Clock3 size={11} /> {result.duration_ms} ms</small>}
      {result.narrative?.status && result.narrative.status !== "disabled" && (
        <small className="response-meta security-meta">
          <ShieldCheck size={11} /> AI analyst summary: {result.narrative.status.replaceAll("_", " ")}
          {result.narrative.security?.status ? ` · AI Defense: ${result.narrative.security.status.replaceAll("_", " ")}` : ""}
        </small>
      )}
      {result.narrative?.text && <div className="narrative-box">
        {result.narrative.text}
        {summaryBy && <ProvenanceBadge provenance={{ kind: "live", servedBy: summaryBy }} className="narrative-badge" />}
      </div>}
    </div>
  );
}

/** Never a dead page: says what is offline, what still works, and how to fix it. */
function FraudStatus({ health, failed }: { health: Health | null; failed: boolean }) {
  if (failed) {
    return <DemoStatusBanner
      tone="down"
      className="fraud-status"
      title="The fraud scoring service is not answering"
      stillWorks="The architecture view. Scoring, including sample scores, needs the service."
      fix="Start Fraud scoring under Services in Studio settings."
    />;
  }
  if (!health) return null;
  const backend = backendKind(health.backend);
  if (backend === "live") return null;
  if (backend === "unavailable") {
    return <DemoStatusBanner tone="down" className="fraud-status" title="No scoring backend is available" stillWorks="The architecture view." fix={health.detail || "Start the GNN scoring sidecar on Sparky."} />;
  }
  const sidecarUp = health.sidecar?.status === "up";
  const scores = backend === "cache"
    ? `Recorded scores from the GNN${health.recorded_at ? ` (${day(health.recorded_at)})` : ""}`
    : "Sample scores for the synthetic payments";
  return <DemoStatusBanner
    tone="degraded"
    className="fraud-status"
    title={sidecarUp ? "Live scoring is switched off; this demo is using saved scores" : "The live GNN scoring sidecar on Sparky is offline"}
    stillWorks={`${scores}, the reason breakdown, and the AI analyst summary when a summary model is configured.`}
    fix="Start the GNN scoring sidecar on Sparky, then reopen this demo. Studio settings shows the service status."
  />;
}

/** A score response as the fraud service reported it: the score itself never touches an LLM or AI Defense. */
function observeScore(run: ObservedRun, result: ScoreResult): ObservedRun {
  const narrativeOff = result.narrative?.status === "disabled";
  const backend = backendKind(result.backend);
  const summaryBy = servedByFrom(result.narrative?.served_by);
  return {
    ...run,
    status: "completed",
    durationMs: result.duration_ms,
    ...(narrativeOff ? { llmCalls: 0, inputTokens: 0, outputTokens: 0 } : usageFrom(result.narrative?.usage)),
    defense: defenseFrom(result.security ?? result.narrative?.security),
    servedBy: summaryBy ?? (backend === "live" ? GNN : undefined),
    provenance: backend === "live" ? "live" : backend === "cache" ? "recorded" : "sample",
    recordedAt: backend === "cache" ? result.recorded_at ?? undefined : undefined,
    note: narrativeOff ? "AI summary off · nothing for AI Defense to inspect" : undefined,
  };
}

function withNarrativeNotice(integration: Integration, health: FraudHealth | null): Integration {
  if (integration.state !== "on" || !health?.narrative?.status || health.narrative.status === "configured") return integration;
  return { ...integration, notice: "No AI summary model is configured, so this service has nothing for AI Defense to inspect." };
}

function fraudStats(health: FraudHealth | null, failed: boolean): { observability: StatsCard; defense: StatsCard } {
  return {
    observability: {
      integration: failed
        ? { state: "unknown", summary: "Service not reachable", notice: "The fraud service is not answering." }
        : { state: "not_instrumented", summary: "Scoring is GraphSAGE + XGBoost, not an agent",
            notice: "The fraud service sends no traces to Splunk Agent Observability. These figures are measured by the service itself." },
      tiles: [
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "Score, reasons, and AI summary, measured by the fraud service" },
        { label: "LLM calls", value: (run) => run.llmCalls, hint: "AI summary model calls; scoring makes none" },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
      ],
      source: "From each /api/fraud/score response. Tokens are what the summary model's provider reported.",
    },
    defense: {
      integration: withNarrativeNotice(defenseIntegration(health?.security, "AI summary only; the score is never inspected", !failed), health),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the security summary on each score response: one inspection per summary prompt and per summary.",
    },
  };
}
