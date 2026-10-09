"use client";

import { Activity, Bot, CircleGauge, Gavel, Server, ShieldCheck } from "lucide-react";
import type { ServedBy } from "./run/events";

export type FraudHealth = {
  ready?: boolean;
  backend?: string;
  backend_label?: string;
  model?: string;
  detail?: string;
  threshold?: number;
  cases?: number;
  recorded_at?: string | null;
  sidecar?: { status?: string; url?: string };
  triton?: { status?: string; url?: string; model?: string };
  narrative?: { status?: string; model?: string | null };
  agent?: { status?: string; label?: string; served_by?: ServedBy | null };
  controls?: { status?: string; source?: string; reason?: string | null; policies?: string[]; controls?: string[] };
  security?: { status?: string; mode?: string; fail_open?: boolean };
  splunk?: { status?: string; galileo?: string };
  model_card?: string;
};

const readable = (value?: string | null) => value ? value.replaceAll("_", " ") : "Not reported";

/** Under the hood: what actually answered. The same facts live on the Architecture tab. */
export default function FraudRuntimeDetails({ health }: { health: FraudHealth | null }) {
  const security = health?.security;
  const defense = security?.status === "configured"
    ? `${security.mode === "monitor" ? "Monitor" : "Enforce"} · ${security.fail_open ? "fail open" : "fail closed"}`
    : readable(security?.status);
  const controls = health?.controls;
  return <div className="proof-card runtime-details">
    <div className="proof-card-title"><span><Server size={15} /> Runtime details</span></div>
    <dl>
      <div><dt><CircleGauge size={16} /> Scorer</dt><dd>{health?.backend_label || readable(health?.backend)}</dd><dd className="runtime-note">{health?.detail || "Live GraphSAGE + XGBoost when the sidecar is up; recorded, then sample scores otherwise."}</dd></div>
      <div><dt><Server size={16} /> Model</dt><dd>{health?.model || "Not reported"}</dd>{health?.sidecar?.url && <dd className="runtime-note">Sidecar {readable(health.sidecar.status)} · {health.sidecar.url}</dd>}</div>
      <div><dt><CircleGauge size={16} /> Alert threshold</dt><dd>{health?.threshold ?? "Not reported"}</dd><dd className="runtime-note">Risk band only. The analyst owns the disposition.</dd></div>
      <div><dt><Bot size={16} /> Triage agent</dt><dd>{health?.agent?.label || readable(health?.agent?.status)}</dd><dd className="runtime-note">Studio model chain for fraud-modeling; scripted (no model) when nothing is reachable.</dd></div>
      <div><dt><Gavel size={16} /> Action policies</dt><dd className={controls?.source === "agent_control" ? "status-confirmed" : ""}>{controls?.source === "agent_control" ? "Agent Control · enforcing" : `Local policy check${controls?.reason ? ` · ${controls.reason}` : ""}`}</dd><dd className="runtime-note">{(controls?.policies ?? ["fraud.take_action", "fraud.note_pii"]).join(" · ")}</dd></div>
      <div><dt><ShieldCheck size={16} /> AI Defense</dt><dd className={security?.status === "configured" ? "status-confirmed" : ""}>{defense}</dd><dd className="runtime-note">Dispute notes, the agent&apos;s prompt and summary, and case notes. The score never goes through it.</dd></div>
      <div><dt><Activity size={16} /> Agent Observability</dt><dd>{health?.splunk?.galileo === "configured" ? "Traces on" : readable(health?.splunk?.galileo)}</dd><dd className="runtime-note">OTLP export: {health?.splunk?.status === "missing_configuration" ? "not configured" : readable(health?.splunk?.status)}</dd></div>
    </dl>
  </div>;
}
