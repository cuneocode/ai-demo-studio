"use client";

import { useEffect, useRef, useState } from "react";
import { Activity, ArrowLeft, ArrowRight, ArrowUpRight, Bell, CircleAlert, CircleCheck, Copy, KeyRound, ShieldCheck, Terminal, X } from "lucide-react";
import { MODEL_USE_CASES } from "./studio-models";
import { USE_CASE_SERVICE, humanize, serviceRows, type StudioStatus, type UseCaseHealth } from "./studio-status";
import "./studio-settings.css";
import "./studio-shell.css";

const LIVE_CASES = MODEL_USE_CASES.map((useCase) => ({ id: useCase.id, title: useCase.title, service: USE_CASE_SERVICE[useCase.id] }));

function useDismiss(open: boolean, onClose: () => void) {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    const onClick = (event: MouseEvent) => { if (ref.current && !ref.current.contains(event.target as Node)) onClose(); };
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onClick);
    return () => { document.removeEventListener("keydown", onKey); document.removeEventListener("mousedown", onClick); };
  }, [open, onClose]);
  return ref;
}

/** The bell: live service status, with a dot only when something is down. */
export function ServiceBell({ status, onOpenSettings }: { status: StudioStatus | null; onOpenSettings: () => void }) {
  const [open, setOpen] = useState(false);
  const ref = useDismiss(open, () => setOpen(false));
  const rows = status ? serviceRows(status) : [];
  const down = rows.filter((row) => !row.ok).length;
  return (
    <div className="shell-popover-anchor" ref={ref}>
      <button className="notification-button" aria-label={status ? `Service status, ${down ? `${down} need attention` : "all ready"}` : "Service status"} aria-expanded={open} onClick={() => setOpen(!open)}>
        <Bell size={18} />{(down > 0 || !status) && <span />}
      </button>
      {open && (
        <div className="shell-popover" role="dialog" aria-label="Service status">
          <header><strong>Service status</strong><small>{status ? `Checked ${new Date(status.checkedAt).toLocaleTimeString()}` : ""}</small></header>
          {!status ? <p className="shell-muted">The studio API is not answering. Start the studio with <code>npm run dev:studio</code>.</p> : (
            <ul>
              {rows.map((row) => (
                <li key={row.id} className={row.ok ? "ok" : "down"}>
                  {row.ok ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
                  <span><strong>{row.label}</strong><small>{row.detail}</small></span>
                </li>
              ))}
            </ul>
          )}
          <button className="text-button" onClick={() => { setOpen(false); onOpenSettings(); }}>Manage in Studio settings <ArrowRight size={14} /></button>
        </div>
      )}
    </div>
  );
}

/** Help: what this machine still needs, how to start everything, and shortcuts. */
export function HelpDrawer({ status, onClose, onOpenSettings }: { status: StudioStatus | null; onClose: () => void; onOpenSettings: () => void }) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);
  return (
    <>
      <button className="shell-scrim" aria-label="Close help" onClick={onClose} />
      <aside className="shell-drawer" role="dialog" aria-modal="true" aria-label="Run this demo">
        <header><div><span className="eyebrow">HELP</span><h2>Run this demo</h2></div><button className="st-icon" aria-label="Close help" onClick={onClose}><X size={18} /></button></header>
        <section>
          <h3>1. Bring your credentials</h3>
          <p className="shell-muted">Models, Splunk Agent Observability, and Cisco AI Defense are configured per machine in Studio settings and saved to the git-ignored <code>.env</code>.</p>
          <ul className="shell-checklist">
            {(status?.readiness ?? []).map((row) => (
              <li key={row.id} className={row.ready ? "ok" : "down"}>
                {row.ready ? <CircleCheck size={15} /> : <CircleAlert size={15} />}
                <span><strong>{row.title}</strong><small>{row.ready ? "Ready" : `Needs ${row.missing.join(", ")}`}</small></span>
              </li>
            ))}
          </ul>
          <button className="secondary-button" onClick={() => { onClose(); onOpenSettings(); }}><KeyRound size={16} /> Open Studio settings</button>
        </section>
        <section>
          <h3>2. Start the services</h3>
          <dl className="shell-commands">
            <dt><code>npm run banking:install</code> (and fraud, briefing, wealth)</dt><dd>One-time Python environments.</dd>
            <dt><code>npm run dev:studio</code></dt><dd>The studio plus the Python services, which Studio settings can then restart.</dd>
            <dt><code>npm run interbank:up</code></dt><dd>The interbank lab in Docker; Studio settings can rebuild it.</dd>
          </dl>
        </section>
        <section>
          <h3>3. Present</h3>
          <dl className="shell-commands">
            <dt><kbd>⌘ K</kbd> / <kbd>Ctrl K</kbd></dt><dd>Search use cases and pages.</dd>
            <dt>Story builder → <strong>Present story</strong></dt><dd>Full screen, one moment at a time. <kbd>←</kbd> <kbd>→</kbd> step, <kbd>Esc</kbd> exits.</dd>
            <dt>Controls and Telemetry</dt><dd>Live AI Defense, Agent Control, and tracing status for each use case.</dd>
          </dl>
        </section>
      </aside>
    </>
  );
}

const tone = (value: string | null | undefined) => {
  if (!value) return "off";
  if (/^(enforc|configured|traces_present|ready|ok|exporting|recorded)/.test(value)) return "ok";
  if (/(monitor|not_verified)/.test(value)) return "warn";
  if (/(off|disabled|not_integrated)/.test(value)) return "off";
  return "warn";
};

function Pill({ value, label }: { value: string | null | undefined; label?: string }) {
  return <span className={`shell-pill ${tone(value)}`}>{label ?? (value ? humanize(value) : "Not reported")}</span>;
}

function PageHeading({ crumb, title, summary, onOpenSettings }: { crumb: string; title: string; summary: string; onOpenSettings: () => void }) {
  return (
    <div className="page-heading">
      <div>
        <span className="breadcrumb">FSI AI Demo Studio <span>/</span> {crumb}</span>
        <h1>{title}</h1>
        <p>{summary}</p>
      </div>
      <div className="heading-actions"><button className="secondary-button" onClick={onOpenSettings}><KeyRound size={16} /> Credentials in Studio settings</button></div>
    </div>
  );
}

function Unavailable() {
  return <div className="st-banner"><CircleAlert size={18} /><span>The studio API is not answering, so live status is unavailable. Start the studio with <code>npm run dev:studio</code>.</span></div>;
}

const healthFor = (status: StudioStatus, service: string): UseCaseHealth | undefined => status.services.find((item) => item.id === service);

/** Controls: AI Defense and Agent Control, as each running use case reports them. */
export function ControlsPage({ status, onOpenCase, onOpenSettings }: { status: StudioStatus | null; onOpenCase: (id: string) => void; onOpenSettings: () => void }) {
  return (
    <div className="shell-page">
      <PageHeading crumb="Controls" title="Runtime controls" summary="Cisco AI Defense inspection and Splunk Agent Control enforcement for each live use case, as the running services report them." onOpenSettings={onOpenSettings} />
      {!status ? <Unavailable /> : (
        <section className="st-section">
          <div className="section-heading"><div><span className="eyebrow">PROTECT</span><h2>By use case</h2></div></div>
          <div className="st-table" role="table" aria-label="Runtime controls by use case">
            <div className="st-row head shell-row" role="row"><span role="columnheader">Use case</span><span role="columnheader">Cisco AI Defense</span><span role="columnheader">Agent Control</span><span role="columnheader" /></div>
            {LIVE_CASES.map((useCase) => {
              if (useCase.service === "interbank") {
                const lab = status.interbank;
                return (
                  <div className="st-row shell-row" role="row" key={useCase.id}>
                    <strong role="cell">{useCase.title}</strong>
                    <span role="cell">{!lab.up ? <Pill value={null} label="Lab not running" /> : lab.aiDefense ? <><Pill value="enforce" label={lab.aiDefense.mode} /><small>{lab.aiDefense.hops} gateway hops · {lab.aiDefense.region}</small></> : <Pill value={null} />}</span>
                    <span role="cell">{lab.up && lab.agentControl ? <><Pill value="enforcing" label="Pre-send" /><small><code>{lab.agentControl}</code></small></> : <Pill value={null} label={lab.up ? "Not reported" : "Lab not running"} />}</span>
                    <span role="cell"><button className="text-button" onClick={() => onOpenCase(useCase.id)}>Open <ArrowRight size={14} /></button></span>
                  </div>
                );
              }
              const health = healthFor(status, useCase.service);
              return (
                <div className="st-row shell-row" role="row" key={useCase.id}>
                  <strong role="cell">{useCase.title}</strong>
                  <span role="cell">{!health?.up ? <Pill value={null} label="Service not running" /> : <><Pill value={health.aiDefense?.mode || health.aiDefense?.status} />{health.aiDefense && <small>{humanize(health.aiDefense.status)}</small>}</>}</span>
                  <span role="cell">{!health?.up ? <Pill value={null} label="Service not running" /> : health.agentControl ? <><Pill value={health.agentControl.status} />{health.agentControl.names.length > 0 && <small>{health.agentControl.names.join(" · ")}</small>}</> : <Pill value="not_integrated" label="Not integrated" />}</span>
                  <span role="cell"><button className="text-button" onClick={() => onOpenCase(useCase.id)}>Open <ArrowRight size={14} /></button></span>
                </div>
              );
            })}
          </div>
          <p className="shell-muted shell-note"><ShieldCheck size={15} /><span>Modes come from Studio settings: Brahe Bank, fraud triage, and SAR follow <code>AIDEFENSE_MODE</code>; briefing and wealth have their own modes; interbank always enforces at its gateways. Agent Control reads &ldquo;enforcing&rdquo; only when the hosted controls are bound; &ldquo;local&rdquo; means the same rules ran in-process.</span></p>
        </section>
      )}
    </div>
  );
}

/** Telemetry: Splunk Agent Observability and Observability Cloud, with recent interbank traces. */
export function TelemetryPage({ status, onOpenCase, onOpenSettings }: { status: StudioStatus | null; onOpenCase: (id: string) => void; onOpenSettings: () => void }) {
  const [copied, setCopied] = useState<string | null>(null);
  const copy = (value: string) => navigator.clipboard?.writeText(value).then(() => { setCopied(value); setTimeout(() => setCopied(null), 1500); });
  return (
    <div className="shell-page">
      <PageHeading crumb="Telemetry" title="Telemetry" summary="Where each live use case sends traces: Splunk Agent Observability for agent sessions, and Splunk Observability Cloud for the optional OpenTelemetry export." onOpenSettings={onOpenSettings} />
      {!status ? <Unavailable /> : <>
        <div className="shell-links">
          <a className="primary-button" href={status.links.agentObservability} target="_blank" rel="noreferrer"><Activity size={16} /> Open Splunk Agent Observability <ArrowUpRight size={14} /></a>
          {status.links.splunkObservability
            ? <a className="secondary-button" href={status.links.splunkObservability} target="_blank" rel="noreferrer">Open Splunk Observability Cloud <ArrowUpRight size={14} /></a>
            : <span className="shell-muted">Set a Splunk Observability Cloud realm in Studio settings to link APM.</span>}
        </div>
        <section className="st-section">
          <div className="section-heading"><div><span className="eyebrow">OBSERVE</span><h2>By use case</h2></div></div>
          <div className="st-table" role="table" aria-label="Telemetry by use case">
            <div className="st-row head shell-row" role="row"><span role="columnheader">Use case</span><span role="columnheader">Agent Observability</span><span role="columnheader">OpenTelemetry export</span><span role="columnheader" /></div>
            {LIVE_CASES.map((useCase) => {
              const lab = status.interbank;
              const health = useCase.service === "interbank" ? null : healthFor(status, useCase.service);
              const up = useCase.service === "interbank" ? lab.up : Boolean(health?.up);
              return (
                <div className="st-row shell-row" role="row" key={useCase.id}>
                  <strong role="cell">{useCase.title}</strong>
                  <span role="cell">{!up ? <Pill value={null} label="Not running" /> : useCase.service === "interbank" ? (lab.project ? <><Pill value="configured" /><small>{lab.project} · {lab.stream}</small></> : <Pill value={null} />) : <Pill value={health?.tracing} label={health?.tracing ? undefined : "Not traced"} />}</span>
                  <span role="cell">{!up ? <Pill value={null} label="Not running" /> : useCase.service === "interbank" ? (lab.project ? <Pill value="configured" label="Gateway collector" /> : <Pill value={null} />) : <Pill value={health?.otel} />}</span>
                  <span role="cell"><button className="text-button" onClick={() => onOpenCase(useCase.id)}>Open <ArrowRight size={14} /></button></span>
                </div>
              );
            })}
          </div>
        </section>
        <section className="st-section">
          <div className="section-heading"><div><span className="eyebrow">TRACES</span><h2>Recent interbank investigations</h2></div></div>
          {status.interbank.runs.length === 0 ? <p className="shell-muted">{status.interbank.up ? "No investigations since the lab started." : "The interbank lab is not running."}</p> : (
            <div className="st-table" role="table" aria-label="Recent interbank investigations">
              {status.interbank.runs.map((run) => (
                <div className="st-row shell-row runs" role="row" key={run.id}>
                  <span role="cell"><strong>{run.id}</strong><small>{new Date(run.startedAt).toLocaleString()}</small></span>
                  <span role="cell"><Pill value={run.status === "completed" ? "ok" : run.status} label={run.status} /></span>
                  <span role="cell" className="shell-muted">{run.prompt}</span>
                  <span role="cell">{run.traceId && <button className="text-button" onClick={() => copy(run.traceId!)} title={run.traceId}><Copy size={14} /> {copied === run.traceId ? "Copied" : "Trace ID"}</button>}</span>
                </div>
              ))}
            </div>
          )}
        </section>
      </>}
    </div>
  );
}

/** Present mode: one story moment at a time, full screen. */
export function PresenterBar({ index, total, title, talk, onPrev, onNext, onExit }: {
  index: number; total: number; title: string; talk: { label: string; text: string }[]; onPrev: () => void; onNext: () => void; onExit: () => void;
}) {
  const [notes, setNotes] = useState(true);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true'], [role='tab']")) return;
      if (event.key === "ArrowRight") onNext();
      else if (event.key === "ArrowLeft") onPrev();
      else if (event.key === "Escape") onExit();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onNext, onPrev, onExit]);
  return (
    <div className="presenter-bar" role="region" aria-label="Presenter controls">
      {notes && <ul className="presenter-notes" aria-label="Talk track">{talk.map((line) => <li key={line.label}><b>{line.label}</b>{line.text}</li>)}</ul>}
      <div className="presenter-controls">
        <span className="presenter-step"><small>MOMENT {index + 1} OF {total}</small><strong>{title}</strong></span>
        <button className="secondary-button" onClick={() => setNotes(!notes)} aria-pressed={notes}><Terminal size={15} /> Talk track</button>
        <button className="secondary-button" onClick={onPrev} disabled={index === 0}><ArrowLeft size={15} /> Previous</button>
        <button className="primary-button" onClick={onNext}>{index === total - 1 ? "Finish" : "Next"} <ArrowRight size={15} /></button>
        <button className="st-icon" aria-label="Exit presenting" onClick={onExit}><X size={17} /></button>
      </div>
    </div>
  );
}

