"use client";

import { useEffect, useState } from "react";
import { Activity, Gauge, Search, Server, ShieldCheck } from "lucide-react";

type Status = { status: string; mode?: string; fail_open?: boolean };
type ControlConfig = { status: "enforcing" | "unavailable" | "not_configured"; names: string[]; judge_model: string; execution: string; fail_open: boolean };
export type BankingHealth = { ready: boolean; model: string; retrieval: string; galileo: string; security?: Status; controls?: ControlConfig; splunk?: Status };
type Observability = {
  tracing: { status: string; transport: string; stream: string };
  evaluators: { status: string; names: string[]; results: string };
  controls: ControlConfig;
};
const evaluatorNames: Record<string, string> = {
  agent_flow: "Agent Flow", agent_efficiency: "Agent Efficiency", action_advancement_luna: "Action Advancement (Luna)",
};
const readable = (value?: string) => value ? value.replaceAll("_", " ") : "Not verified";
const controlStatus = (value?: string) => value === "enforcing" ? "Enforcing" : value === "unavailable" ? "Unavailable" : value === "not_configured" ? "Not configured" : "Not reported";

export default function BankingRuntimeDetails({ health }: { health: BankingHealth | null }) {
  const [stream, setStream] = useState<Observability | null>(null);
  const [checking, setChecking] = useState(true);
  useEffect(() => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 9000);
    fetch("/api/banking/observability", { signal: controller.signal })
      .then((response) => response.ok ? response.json() : Promise.reject())
      .then(setStream)
      .catch(() => { /* Read failure means unknown, never no evaluators. */ })
      .finally(() => { clearTimeout(timeout); setChecking(false); });
    return () => { clearTimeout(timeout); controller.abort(); };
  }, []);
  const tracing = stream?.tracing.status;
  const evaluation = stream?.evaluators;
  const security = health?.security;
  const defense = security?.status === "configured" ? security.mode === "enforce" ? "Enforcing" : "Monitoring" : readable(security?.status);
  const controls = health?.controls ?? stream?.controls;
  const traceStatus = tracing === "traces_present" ? "Prior traces present" : checking ? "Checking…" : readable(tracing);

  // The established theme is invariant. Runtime contracts may evolve, but keep
  // configuration, observed delivery, evaluations, and controls separate.
  return <div className="proof-card runtime-details">
    <div className="proof-card-title"><span><Server size={15} /> Runtime details</span></div>
    <dl>
      <div><dt><Server size={16} /> Model</dt><dd>{health?.model || "Not reported"}</dd></div>
      <div><dt><Search size={16} /> Retrieval</dt><dd>{health?.retrieval || "Not reported"}</dd></div>
      <div><dt><ShieldCheck size={16} /> AI Defense</dt><dd className={security?.status === "configured" ? "status-confirmed" : ""}>{defense}</dd>{security?.status === "configured" && <dd className="runtime-note">{security.fail_open ? "Fail open" : "Fail closed"} · model input and output</dd>}</div>
      <div><dt><ShieldCheck size={16} /> Agent Controls</dt><dd className={controls?.status === "enforcing" ? "status-confirmed" : ""}>{controlStatus(controls?.status)}</dd>
        {!!controls?.names?.length && <dd><ul>{controls.names.map((name) => <li key={name}>{name}</li>)}</ul></dd>}
        {controls?.judge_model && <dd className="runtime-note">{controls.judge_model} · {controls.execution} · {controls.fail_open ? "Fail open" : "Fail closed"}</dd>}
        <dd className="runtime-note">Application LLM judge · Agent Control enforcement</dd>
      </div>
      <div><dt><Activity size={16} /> Agent tracing</dt><dd className={tracing === "traces_present" ? "status-confirmed" : ""}>{traceStatus}</dd><dd className="runtime-note">Splunk Agent Observability · Galileo SDK · stream-level evidence checked on page load; record timestamp and current-request correlation unavailable{stream?.tracing.stream && <span>{stream.tracing.stream}</span>}</dd></div>
      <div><dt><Gauge size={16} /> Evaluators</dt><dd>{checking ? "Checking…" : evaluation?.status === "configured" ? `${evaluation.names.length} configured` : readable(evaluation?.status)}</dd>
        {!!evaluation?.names.length && <dd><ul>{evaluation.names.map((name) => <li key={name}>{evaluatorNames[name] || readable(name)}</li>)}</ul></dd>}
        <dd className="runtime-note">Results not verified</dd>
      </div>
      <div><dt><Server size={16} /> Additional OTLP export</dt><dd>{health?.splunk?.status === "missing_configuration" ? "Not configured" : readable(health?.splunk?.status)}</dd><dd className="runtime-note">Optional second trace + metrics path</dd></div>
    </dl>
  </div>;
}
