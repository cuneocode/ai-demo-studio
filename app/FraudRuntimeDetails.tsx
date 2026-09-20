"use client";

import { Activity, CircleGauge, Server, ShieldCheck, Sparkles } from "lucide-react";

export type FraudHealth = {
  ready?: boolean;
  backend?: string;
  model?: string;
  detail?: string;
  threshold?: number;
  cases?: number;
  triton?: { status?: string; url?: string; model?: string };
  narrative?: { status?: string; model?: string | null };
  security?: { status?: string; mode?: string; fail_open?: boolean };
  splunk?: { status?: string };
};

const readable = (value?: string) => value ? value.replaceAll("_", " ") : "Not reported";

export default function FraudRuntimeDetails({ health }: { health: FraudHealth | null }) {
  const security = health?.security;
  const defense = security?.status === "configured"
    ? security.mode === "enforce" ? "Enforcing on narrative" : "Monitoring narrative"
    : readable(security?.status);
  return <div className="proof-card runtime-details">
    <div className="proof-card-title"><span><Server size={15} /> Runtime details</span></div>
    <dl>
      <div><dt><CircleGauge size={16} /> Scoring backend</dt><dd>{health?.backend || "Not reported"}</dd><dd className="runtime-note">{health?.detail || "Live GraphSAGE + XGBoost when the infer sidecar is up."}</dd></div>
      <div><dt><Server size={16} /> Model</dt><dd>{health?.model || "Not reported"}</dd></div>
      <div><dt><CircleGauge size={16} /> Threshold</dt><dd>{health?.threshold ?? "Not reported"}</dd><dd className="runtime-note">Suggested band only. Analysts own disposition.</dd></div>
      <div><dt><Server size={16} /> Triton</dt><dd>{readable(health?.triton?.status)}</dd>{health?.triton?.url && <dd className="runtime-note">{health.triton.url}{health.triton.model ? ` · ${health.triton.model}` : ""}</dd>}</div>
      <div><dt><Sparkles size={16} /> Narrative</dt><dd>{readable(health?.narrative?.status)}</dd>{health?.narrative?.model && <dd className="runtime-note">{health.narrative.model}</dd>}<dd className="runtime-note">Optional. Score is released without it.</dd></div>
      <div><dt><ShieldCheck size={16} /> AI Defense</dt><dd className={security?.status === "configured" ? "status-confirmed" : ""}>{defense}</dd><dd className="runtime-note">Inspects generated explanations only.</dd></div>
      <div><dt><Activity size={16} /> Additional OTLP export</dt><dd>{health?.splunk?.status === "missing_configuration" ? "Not configured" : readable(health?.splunk?.status)}</dd></div>
    </dl>
  </div>;
}
