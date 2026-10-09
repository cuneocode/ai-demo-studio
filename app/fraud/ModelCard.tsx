"use client";

import { Cpu, FlaskConical } from "lucide-react";

/** GET /api/fraud/model-card: services/fraud/scripts/build_model_card.py output, or not_measured. Never filled in by hand. */
export type ModelCardData = {
  status: "measured" | "partial" | "not_measured";
  source?: "cache" | "recorded" | null;
  tag?: string;
  generated_at?: string;
  headline: {
    alert_rate?: number | null;
    fraud_amount_caught_share?: Record<string, number | null>;
    recall_at_alert_rate?: Record<string, number | null>;
    fp_per_tp_at_rules_recall?: Record<string, number | null>;
    train_minutes?: number | null;
    score_p50_ms?: Record<string, number | null>;
    score_p95_ms?: Record<string, number | null>;
  };
  model?: { id?: string; name?: string };
  hardware?: { gpu?: string; machine?: string };
  host_label?: string | null;
  missing?: string[];
};

export const NOT_MEASURED = "Not measured yet — run on Sparky";
const MODELS: [string, string][] = [["rules", "Rules"], ["xgboost_only", "XGBoost alone"], ["gnn_xgboost", "Graph model (GNN + XGBoost)"]];

const pct = (value?: number | null) => (typeof value === "number" ? `${(value * 100).toFixed(value < 0.1 ? 1 : 0)}%` : null);
const ms = (value?: number | null) => (typeof value === "number" ? `${value < 10 ? value.toFixed(1) : Math.round(value)} ms` : null);

export function caughtShare(card: ModelCardData | null, model: string) {
  return pct(card?.headline.fraud_amount_caught_share?.[model]);
}

/** Backtest strip: fraud dollars caught at a fixed alert rate, rules vs XGBoost alone vs the graph model. */
export function BacktestStrip({ card }: { card: ModelCardData | null }) {
  const measured = card && card.status !== "not_measured";
  const rate = pct(card?.headline.alert_rate) ?? "0.5%";
  return (
    <section className="fx-backtest" aria-label="Backtest">
      <header>
        <span><FlaskConical size={15} aria-hidden="true" /> Backtest · fraud dollars caught at a {rate} alert rate</span>
        <small className={`fx-tag ${measured ? "measured" : "pending"}`}>{measured ? card.tag ?? "Measured" : NOT_MEASURED}</small>
      </header>
      <div className="fx-backtest-bars">
        {MODELS.map(([key, label]) => {
          const value = card?.headline.fraud_amount_caught_share?.[key];
          return (
            <div key={key} className={`fx-backtest-row ${key}`}>
              <span>{label}</span>
              <span className="fx-backtest-track" aria-hidden="true"><span style={{ width: typeof value === "number" ? `${Math.max(2, value * 100)}%` : "0%" }} /></span>
              <strong>{pct(value) ?? "—"}</strong>
            </div>
          );
        })}
      </div>
      <small className="fx-foot">
        {measured
          ? `TabFormer test window (synthetic card data), point-in-time neighborhoods${card.missing?.length ? ` · missing: ${card.missing.join(", ")}` : ""}.`
          : "Nothing is shown until services/fraud/scripts/backtest.py has run on Sparky and its model_card.json is copied back."}
      </small>
    </section>
  );
}

/** One-line accelerated-compute footer: measured GPU vs CPU scoring latency on Sparky, or an honest "not measured". */
export function ComputeFooter({ card, run }: { card: ModelCardData | null; run?: { device?: string | null; model_ms?: number | null; backend?: string } }) {
  const gpu = ms(card?.headline.score_p50_ms?.cuda);
  const cpu = ms(card?.headline.score_p50_ms?.cpu);
  const train = typeof card?.headline.train_minutes === "number" ? `${card.headline.train_minutes} min` : null;
  const thisRun = run?.backend === "live" && run.model_ms != null ? `This score: ${ms(run.model_ms)} on ${(run.device || "?").toUpperCase()}` : null;
  return (
    <p className="fx-compute">
      <Cpu size={14} aria-hidden="true" />
      <span>
        {gpu || cpu || train
          ? <>{train && <>Trained in {train} · </>}{gpu && <>scored at p50 {gpu} on GPU</>}{gpu && cpu && " vs "}{cpu && <>{cpu} on CPU</>} · {card?.host_label ?? "Sparky (NVIDIA DGX Spark, GB10)"} · <em>measured</em></>
          : <>GPU vs CPU scoring: {NOT_MEASURED}.</>}
        {thisRun && <> · {thisRun}</>}
        {" "}Production placement: Cisco AI POD / UCS with NVIDIA GPUs (<em>proposed</em>).
      </span>
    </p>
  );
}
