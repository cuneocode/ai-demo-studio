import type { ReactNode } from "react";
import type { RunLedger, StatsCard } from "./RunStats";
import { ArrowRight, Loader2 } from "lucide-react";
import "./operator-workspace.css";

/** Source records and decisions lead; full-width execution evidence follows. */
export function OperatorWorkspace({ children, execution, inbox }: { children: ReactNode; execution: ReactNode; inbox?: ReactNode }) {
  return <div className={`operator-workspace${inbox ? " has-inbox" : ""}`}>
    <div className={`operator-work-row${inbox ? " has-inbox" : ""}`}>
      {inbox && <aside className="operator-inbox" aria-label="Case inbox">{inbox}</aside>}
      <div className="operator-work">{children}</div>
    </div>
    <section className="operator-execution" aria-label="Live execution and controls">
      {execution}
    </section>
  </div>;
}

export function OperatorEmpty({ busy, title, description, items }: { busy: boolean; title: string; description: string; items: string[] }) {
  return <section className={`operator-empty${busy ? " is-running" : ""}`} aria-label={busy ? "Work in progress" : "Expected outcome"} aria-live="polite">
    <span className="operator-eyebrow">{busy ? "WORK IN PROGRESS" : "YOUR RESULT"}</span>
    <h2>{busy && <Loader2 size={22} className="spin" aria-hidden="true" />}{title}</h2><p>{description}</p>
    <ol>{items.map((item, index) => <li key={item}><span>{index + 1}</span>{item}{index < items.length - 1 && <ArrowRight size={16} aria-hidden="true" />}</li>)}</ol>
  </section>;
}

export function ExecutionSummary({ ledger, observability, defense, controls, status }: { ledger: RunLedger; observability: StatsCard; defense: StatsCard; controls?: string; status?: string }) {
  const run = ledger.runs.at(-1);
  const shown = (value: number | undefined) => value === undefined ? "—" : value.toLocaleString();
  return <section className="operator-run-summary" aria-label="Execution summary">
    <div className="operator-run-state"><strong>{status || (run ? run.status === "running" ? "In progress" : run.status.replaceAll("_", " ") : "Ready to run")}</strong><span>{run?.provenance === "recorded" ? "Recorded evidence" : run?.provenance === "sample" ? "Sample data" : "Live execution"}</span></div>
    <dl className="operator-run-numbers"><div><dt>Model calls</dt><dd>{shown(run?.llmCalls)}</dd></div><div><dt>Tool calls</dt><dd>{shown(run?.toolCalls)}</dd></div><div><dt>Duration</dt><dd>{run?.durationMs === undefined ? "—" : `${(run.durationMs / 1000).toFixed(1)}s`}</dd></div></dl>
    <div className="operator-safeguard"><strong>Splunk Agent Observability</strong><span>{run?.agentTrace ? `Trace: ${run.agentTrace.replaceAll("_", " ")}` : run?.provenance === "recorded" ? "Original recording · no new trace" : run ? "Current trace not reported yet" : observability.integration.summary}</span></div>
    <div className="operator-safeguard"><strong>Cisco AI Defense</strong><span>{run?.defense ? `${shown(run.defense.checks)} inspections · ${shown(run.defense.blocked)} blocked · ${run.defense.status || run.defense.mode || "See verdicts below"}` : defense.integration.summary}</span></div>
    {controls && <div className="operator-safeguard"><strong>Agent controls</strong><span>{controls}</span></div>}
    {defense.integration.notice && run?.defense?.mode !== "enforce" && <p className="operator-check-note">{defense.integration.notice}</p>}
  </section>;
}
