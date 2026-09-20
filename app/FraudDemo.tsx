"use client";

import { FormEvent, useEffect, useMemo, useState } from "react";
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
import FraudRuntimeDetails, { type FraudHealth } from "./FraudRuntimeDetails";

type CaseItem = {
  id: string;
  label: string;
  account: string;
  merchant: string;
  amount: number;
  channel: string;
  neighborhood: string;
  hint: string;
};
type ShapItem = { feature: string; value: number; direction: "risk" | "protective" };
type ScoreResult = {
  case: CaseItem;
  probability: number;
  threshold: number;
  decision: "clear" | "review" | "hold";
  shap: ShapItem[];
  backend: string;
  narrative?: { status: string; text?: string | null; security?: { status?: string } };
  duration_ms?: number;
};
type FraudDemoProps = { onBack: () => void; onAdd: () => void; inStory: boolean; embedded?: boolean };

function money(value: number) {
  return value.toLocaleString("en-US", { style: "currency", currency: "USD" });
}

function shapWidth(value: number, max: number) {
  if (!max) return "8%";
  return `${Math.max(8, Math.round((Math.abs(value) / max) * 100))}%`;
}

export default function FraudDemo({ onBack, onAdd, inStory, embedded = false }: FraudDemoProps) {
  const [cases, setCases] = useState<CaseItem[]>([]);
  const [selectedId, setSelectedId] = useState<string>();
  const [health, setHealth] = useState<FraudHealth | null>(null);
  const [healthFailed, setHealthFailed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [score, setScore] = useState<ScoreResult | null>(null);
  const [includeNarrative, setIncludeNarrative] = useState(true);
  const [showSystem, setShowSystem] = useState(false);

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
      .catch(() => setError("Fraud cases are unavailable. Start the local fraud service."));
  }, []);

  const selected = useMemo(() => cases.find((item) => item.id === selectedId), [cases, selectedId]);
  const statusLabel = health?.ready ? "Ready" : health ? "Unavailable" : healthFailed ? "Unavailable" : "Health check pending";
  const shapMax = Math.max(0.01, ...(score?.shap.map((item) => Math.abs(item.value)) || [0]));

  async function scoreCase(event?: FormEvent) {
    event?.preventDefault();
    if (!selected || loading) return;
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/fraud/score", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ case_id: selected.id, include_narrative: includeNarrative }),
        signal: AbortSignal.timeout(includeNarrative ? 180000 : 30000),
      });
      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(body.detail || `Scoring failed (${response.status}).`);
      }
      setScore(await response.json());
    } catch (cause) {
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
            <p>Synthetic payments. The score is evidence, not a fraud flag.</p>
          </div>
          <div className="banking-status">
            <span className={health?.ready ? "status-dot ready" : "status-dot"} />
            {statusLabel}
            <small>{health?.model || "Fixture scorer"}</small>
          </div>
        </section>
      </>}

      <section className="banking-layout">
        <div className="chat-card queue-card">
          <div className="queue-card-head">
            <div className="assistant-identity">
              <span className="assistant-avatar"><CircleGauge size={18} /></span>
              <div><strong>Alert queue</strong><span>{cases.length || 0} TabFormer test-window payments</span></div>
            </div>
          </div>
          <div className="queue-list" role="list">
            {cases.map((item) => (
              <button
                key={item.id}
                className={`queue-row ${item.id === selectedId ? "selected" : ""}`}
                onClick={() => selectCase(item.id)}
                aria-pressed={item.id === selectedId}
              >
                <span><strong>{item.label}</strong><small>{item.merchant}</small></span>
                <span className="amount">{money(item.amount)}</span>
                <span className="channel">{item.channel}</span>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
        </div>

        <aside className="banking-side">
          <div className="proof-card review-card">
            {selected ? <>
              <span className="review-kicker">SELECTED PAYMENT</span>
              <h3>{selected.label}</h3>
              <p>{selected.neighborhood}</p>
              <dl className="fact-grid">
                <div><dt>Account</dt><dd>{selected.account}</dd></div>
                <div><dt>Merchant</dt><dd>{selected.merchant}</dd></div>
                <div><dt>Amount</dt><dd>{money(selected.amount)}</dd></div>
                <div><dt>Channel</dt><dd>{selected.channel}</dd></div>
              </dl>
              {score && score.case.id === selected.id && (
                <div className="score-panel">
                  <div className="score-meter">
                    <div>
                      <small>Fraud probability</small>
                      <strong>{score.probability.toFixed(2)}</strong>
                    </div>
                    <span className={`decision-pill ${score.decision}`}>{score.decision}</span>
                  </div>
                  <small>Threshold {score.threshold} · {score.backend} · suggested band only</small>
                  <div className="shap-list" aria-label="Shapley feature groups">
                    {score.shap.map((item) => (
                      <div className="shap-row" key={item.feature}>
                        <span>{item.feature.replaceAll("_", " ")}</span>
                        <span>{item.value >= 0 ? "+" : ""}{item.value.toFixed(2)}</span>
                        <span className="shap-track"><span className={`shap-fill ${item.direction}`} style={{ width: shapWidth(item.value, shapMax) }} /></span>
                      </div>
                    ))}
                  </div>
                  {score.duration_ms != null && <small className="response-meta"><Clock3 size={11} /> {score.duration_ms} ms</small>}
                  {score.narrative?.status && score.narrative.status !== "disabled" && (
                    <small className="response-meta security-meta">
                      <ShieldCheck size={11} /> Narrative: {score.narrative.status.replaceAll("_", " ")}
                      {score.narrative.security?.status ? ` · AI Defense: ${score.narrative.security.status.replaceAll("_", " ")}` : ""}
                    </small>
                  )}
                  {score.narrative?.text && <div className="narrative-box">{score.narrative.text}</div>}
                </div>
              )}
              <p className="demo-note">{selected.hint}</p>
              <form className="review-actions" onSubmit={scoreCase}>
                <button id="score-payment" className="primary" disabled={loading || !health?.ready}>
                  {loading ? <><Loader2 size={15} className="spin" /> Scoring…</> : <><Sparkles size={15} /> Score this payment</>}
                </button>
                <fieldset className="narrative-toggle">
                  <legend>Include narrative</legend>
                  <div role="group" aria-label="Include narrative">
                    <button
                      type="button"
                      className={includeNarrative ? "active" : ""}
                      aria-pressed={includeNarrative}
                      onClick={() => setIncludeNarrative(true)}
                    >
                      On
                    </button>
                    <button
                      type="button"
                      className={!includeNarrative ? "active" : ""}
                      aria-pressed={!includeNarrative}
                      onClick={() => setIncludeNarrative(false)}
                    >
                      Off
                    </button>
                  </div>
                  <small>{includeNarrative ? "On · AI Defense inspects this draft only" : "Off · score only"}</small>
                </fieldset>
              </form>
            </> : <p>Select a payment from the queue.</p>}
          </div>
          {error && <div className="banking-error"><CircleAlert size={14} /><div>{error}</div><button onClick={() => setError("")}><X size={14} /></button></div>}
          <FraudRuntimeDetails health={health} />
          <div className="system-card">
            <button className="system-toggle" onClick={() => setShowSystem((value) => !value)}>
              <span><Waypoints size={15} /> System view</span>
              {showSystem ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </button>
            {showSystem && <div className="system-diagram">
              <div className="diagram-node supervisor"><span>01</span><CircleGauge size={15} /><strong>Case catalog</strong><small>TabFormer test window</small></div>
              <div className="diagram-branch">
                <div className="diagram-node violet-node"><span>02A</span><strong>GraphSAGE + XGBoost</strong><small>trained TabFormer weights</small></div>
                <div className="diagram-node"><span>02B</span><strong>Captum Shapley</strong><small>feature-group attributions</small></div>
              </div>
              <div className="diagram-foot"><span>Score + SHAP</span><span>·</span><span>optional inspected narrative</span></div>
              <p className="planned-note">The probability is not a disposition. Analysts own hold, review, and clear.</p>
            </div>}
          </div>
        </aside>
      </section>
      {!embedded && inStory && <div className="story-context"><span>STORY MODE</span> This slice shows graph scoring before investigation or SAR drafting.</div>}
    </div>
  );
}
