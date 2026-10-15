"use client";

import { useCallback, useEffect, useState, type ReactNode } from "react";
import { Activity, ArrowUpRight, Loader2, RotateCcw, Settings2, ShieldCheck } from "lucide-react";
import { useStudioNav } from "./studio-nav";
import { guideAnchor } from "./guide/anchors";
import type { ServedBy } from "./run/events";
import ProvenanceBadge, { type Provenance } from "./run/ProvenanceBadge";
import "./run-stats.css";

export type RunStatus = "running" | "completed" | "blocked" | "failed" | "cached";

export type DefenseCounts = { mode?: string; status?: string; checks?: number; blocked?: number; errors?: number; eventIds?: string[] };

/** One demo run as its service reported it. A field left undefined was not reported, which is not the same as zero. */
export type ObservedRun = {
  id: string;
  label: string;
  status: RunStatus;
  startedAt: number;
  /** Replays reveal a finished run's events; there is no wall clock to show. */
  replay?: boolean;
  durationMs?: number;
  traceId?: string;
  spans?: number;
  llmCalls?: number;
  toolCalls?: number;
  inputTokens?: number;
  outputTokens?: number;
  /** Splunk Agent Observability delivery, as the service reported it. */
  agentTrace?: string;
  /** Additional OTLP export to Splunk Observability Cloud, as the service reported it. */
  otlp?: string;
  counts?: Record<string, number | undefined>;
  defense?: DefenseCounts;
  note?: string;
  /** The model that answered, from the response's served_by. */
  servedBy?: ServedBy | null;
  /** A recorded run or sample data rather than a live call; recordedAt dates a recording. */
  provenance?: "live" | "recorded" | "sample";
  recordedAt?: string;
};

export type Integration = {
  state: "on" | "off" | "missing" | "not_instrumented" | "unknown";
  summary: string;
  notice?: string;
  settings?: "st-splunk-ao" | "st-splunk-otel" | "st-ai-defense";
  link?: { label: string; href: string };
};

export type Tile = {
  label: string;
  value: (run: ObservedRun) => number | undefined;
  format?: "count" | "ms" | "tokens";
  /** Session figure: sum (default) or mean of the runs that reported a value. */
  total?: "sum" | "avg";
  /** Highlights a non-zero value: blocked is deny, errors are warn. */
  alert?: "deny" | "warn";
  hint?: string;
};

export type Fact = { label: string; value?: ReactNode; mono?: boolean };

export type StatsCard = {
  integration: Integration;
  tiles: Tile[];
  facts?: (run: ObservedRun | undefined) => Fact[];
  /** Where the numbers come from, in one sentence. */
  source: string;
  footer?: (run: ObservedRun | undefined) => ReactNode;
};

const MAX_RUNS = 50;

let sequence = 0;

/** A new in-flight run, stamped when the request starts. */
export function startRun(prefix: string, label: string): ObservedRun {
  sequence += 1;
  return { id: `${prefix}-${Date.now()}-${sequence}`, label, status: "running", startedAt: Date.now() };
}

/** Session ledger for one demo: lives in the demo, so it survives tab switches. */
export function useRunLedger() {
  const [runs, setRuns] = useState<ObservedRun[]>([]);
  const record = useCallback((run: ObservedRun) => setRuns((previous) => {
    const index = previous.findIndex((item) => item.id === run.id);
    if (index < 0) return [...previous, run].slice(-MAX_RUNS);
    const next = [...previous];
    next[index] = { ...next[index], ...run };
    return next;
  }), []);
  const discard = useCallback((id: string) => setRuns((previous) => previous.filter((run) => run.id !== id)), []);
  const reset = useCallback(() => setRuns((previous) => previous.filter((run) => run.status === "running")), []);
  return { runs, record, discard, reset };
}

export type RunLedger = ReturnType<typeof useRunLedger>;

const number = (value: unknown) => (typeof value === "number" && Number.isFinite(value) ? value : undefined);
const text = (value: unknown) => (typeof value === "string" && value ? value : undefined);
const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

/** A service's per-request `security` object, as returned. */
export function defenseFrom(raw: unknown): DefenseCounts | undefined {
  const value = record(raw);
  if (!Object.keys(value).length) return undefined;
  return {
    mode: text(value.mode), status: text(value.status),
    checks: number(value.checks), blocked: number(value.blocked), errors: number(value.errors),
    eventIds: Array.isArray(value.event_ids) ? value.event_ids.filter((id): id is string => typeof id === "string" && id !== "") : undefined,
  };
}

/** A response's `served_by` object (services/llm/studio_models.py), or undefined. */
export function servedByFrom(raw: unknown): ServedBy | undefined {
  const value = record(raw);
  return typeof value.label === "string" ? value as ServedBy : undefined;
}

/** The badge for a run: recorded, sample, or the model that answered. */
export function runProvenance(run: ObservedRun): Provenance | null {
  if (run.provenance === "recorded") return { kind: "recorded", recordedAt: run.recordedAt ?? "", servedBy: run.servedBy };
  if (run.provenance === "sample") return { kind: "sample" };
  if (run.llmCalls === 0 && run.status !== "running") return { kind: "none", detail: "No model call made" };
  return run.servedBy ? { kind: "live", servedBy: run.servedBy } : null;
}

/** A service's per-request `usage` object: model calls and provider-reported tokens. */
export function usageFrom(raw: unknown): Pick<ObservedRun, "llmCalls" | "inputTokens" | "outputTokens"> {
  const value = record(raw);
  return { llmCalls: number(value.llm_calls), inputTokens: number(value.input_tokens), outputTokens: number(value.output_tokens) };
}

/** The Defense card's configuration from a service health `security` object. */
export function defenseIntegration(security: { status?: string; mode?: string; fail_open?: boolean; failOpen?: boolean } | null | undefined, scope: string, reachable = true): Integration {
  if (!reachable) return { state: "unknown", summary: "Service not reachable", notice: "The service is not answering, so its AI Defense setting is unknown." };
  if (!security?.status) return { state: "unknown", summary: "Checking the service…" };
  if (security.status === "disabled" || security.mode === "off") {
    return { state: "off", summary: `Off · ${scope}`, notice: "AI Defense is off for this use case. Enable it in Studio settings.", settings: "st-ai-defense" };
  }
  if (security.status !== "configured") {
    return { state: "missing", summary: "Not configured", notice: "AI Defense needs an API key. Add it in Studio settings.", settings: "st-ai-defense" };
  }
  const failOpen = security.fail_open ?? security.failOpen;
  return { state: "on", summary: `${security.mode === "monitor" ? "Monitor" : "Enforce"} · ${failOpen ? "fail open" : "fail closed"} · ${scope}` };
}

export const DEFENSE_TILES: Tile[] = [
  { label: "Inspections", value: (run) => run.defense?.checks, hint: "Inspection API calls that returned a verdict" },
  { label: "Blocked", value: (run) => run.defense?.blocked, alert: "deny", hint: "Unsafe verdicts" },
  { label: "Errors", value: (run) => run.defense?.errors, alert: "warn", hint: "Inspections that did not return a verdict" },
  { label: "Event IDs", value: (run) => run.defense?.eventIds?.length, hint: "AI Defense event IDs returned for this run" },
];

const DEFENSE_STATUS: Record<string, string> = {
  allowed: "Allowed",
  blocked: "Blocked",
  monitored_violation: "Violation recorded (monitor mode)",
  inspection_unavailable: "Inspection unavailable · failed closed",
  fail_open: "Inspection unavailable · failed open",
  not_checked: "Not inspected on this run",
  disabled: "Off",
  cached_replay: "Cached replay · not re-inspected",
};

export const defenseStatusLabel = (status?: string) => (status ? DEFENSE_STATUS[status] ?? status.replaceAll("_", " ") : undefined);

/** The Defense card's facts, shared by every live demo. */
export function defenseFacts(run: ObservedRun | undefined): Fact[] {
  if (!run) return [];
  const ids = run.defense?.eventIds ?? [];
  return [
    { label: "Verdict", value: run.status === "running" ? "In flight" : defenseStatusLabel(run.defense?.status) ?? "Not reported" },
    ...(ids.length ? [{ label: ids.length === 1 ? "Event" : `Events (${ids.length})`, value: ids.slice(0, 3).join(" · ") + (ids.length > 3 ? " …" : ""), mono: true }] : []),
  ];
}

export const readable = (value?: string) => (value ? value.replaceAll("_", " ") : undefined);

const AGENT_TRACE: Record<string, string> = {
  recorded: "Recorded in Splunk AO",
  "no trace recorded": "Not recorded",
  disabled: "Off",
  unavailable: "Unavailable",
  "delivery unavailable": "Delivery failed",
};
const OTLP: Record<string, string> = {
  accepted_by_endpoint: "Accepted by Splunk",
  exported: "Exported to Splunk",
  delivery_pending: "Delivery pending",
  delivery_failed: "Delivery failed",
  export_failed: "Export failed",
  not_configured: "Not configured",
  missing_configuration: "Not configured",
  disabled: "Not configured",
  not_reexported: "Not re-exported (cached replay)",
};
const EXPORTED = new Set(["accepted_by_endpoint", "exported", "delivery_pending"]);

/** Agent trace and OTLP delivery facts. A trace ID is only shown when it was exported somewhere it can be looked up. */
export function traceFacts(run: ObservedRun | undefined): Fact[] {
  if (!run || run.status === "running") return [];
  // A replay's delivery status belongs to the original run; nothing was traced or exported now.
  if (run.replay || run.provenance === "recorded") return [{ label: "Agent trace", value: "Not traced now (recorded run)" }];
  const exported = run.otlp !== undefined && EXPORTED.has(run.otlp);
  return [
    ...(run.agentTrace !== undefined ? [{ label: "Agent trace", value: AGENT_TRACE[run.agentTrace] ?? readable(run.agentTrace) }] : []),
    ...(run.otlp !== undefined ? [{ label: "OTLP export", value: `${OTLP[run.otlp] ?? readable(run.otlp)}${exported && run.spans !== undefined ? ` · ${run.spans} span${run.spans === 1 ? "" : "s"}` : ""}` }] : []),
    ...(exported && run.traceId ? [{ label: "Trace", value: run.traceId, mono: true }] : []),
  ];
}

/** Agent Observability card config for services instrumented with the Agent Observability SDK. */
export function agentTraceIntegration(galileo: string | undefined, reachable: boolean, link?: string | null): Integration {
  if (!reachable) return { state: "unknown", summary: "Service not reachable", notice: "The service is not answering, so its tracing setting is unknown." };
  if (galileo === undefined) return { state: "unknown", summary: "Checking the service…" };
  if (galileo !== "configured") {
    return { state: "missing", summary: "Not configured", notice: "Splunk Agent Observability is off for this service. Add the API key in Studio settings.", settings: "st-splunk-ao" };
  }
  return { state: "on", summary: "Agent Observability SDK · each run reports whether its trace was recorded", link: link ? { label: "Open Splunk Agent Observability", href: link } : undefined };
}

function format(value: number | undefined, kind: Tile["format"] = "count") {
  if (value === undefined) return undefined;
  if (kind === "ms") return value >= 1000 ? `${(value / 1000).toFixed(value >= 10_000 ? 0 : 1)} s` : `${Math.round(value)} ms`;
  if (kind === "tokens" && value >= 1000) return `${(value / 1000).toFixed(value >= 100_000 ? 0 : 1)}k`;
  return value.toLocaleString("en-US");
}

function sessionTotal(tile: Tile, runs: ObservedRun[]) {
  const values = runs.filter((run) => run.status !== "running").map(tile.value).filter((value): value is number => value !== undefined);
  if (!values.length) return undefined;
  const sum = values.reduce((a, b) => a + b, 0);
  return tile.total === "avg" ? sum / values.length : sum;
}

const STATE_LABEL: Record<Integration["state"], string> = { on: "Live", off: "Off", missing: "Not configured", not_instrumented: "Not instrumented", unknown: "Unknown" };
const NOT_LIVE_LABEL = { recorded: "Recorded", sample: "Sample" } as const;
const RUN_LABEL: Record<RunStatus, string> = { running: "Running", completed: "Completed", blocked: "Blocked", failed: "Failed", cached: "Cached replay" };

function useElapsed(run: ObservedRun | undefined) {
  const live = run?.status === "running" && !run.replay;
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => setNow(Date.now()), 250);
    return () => clearInterval(timer);
  }, [live]);
  return live && run ? Math.max(0, now - run.startedAt) : undefined;
}

function Card({ kind, card, runs, last }: { kind: "observability" | "defense"; card: StatsCard; runs: ObservedRun[]; last?: ObservedRun }) {
  const { openSettings } = useStudioNav();
  const { integration } = card;
  const title = kind === "observability" ? "Splunk Agent Observability" : "Cisco AI Defense";
  const Icon = kind === "observability" ? Activity : ShieldCheck;
  // Counts from a service that does not inspect would read as real zeros.
  const tiles = kind === "defense" && integration.state !== "on" ? [] : card.tiles;
  const running = last?.status === "running";
  const facts = tiles.length ? card.facts?.(last).filter((fact) => fact.value !== undefined && fact.value !== "") ?? [] : [];
  // A replayed or sample run's figures are not from this session's service calls.
  const notLive = integration.state === "on" && (last?.provenance === "recorded" || last?.provenance === "sample") ? last.provenance : null;
  const chip = running && integration.state === "on" && !notLive ? "running" : notLive ?? integration.state;
  return (
    <article className={`run-stats-card ${kind} state-${integration.state}`} aria-label={`${title} stats`} {...guideAnchor(kind === "observability" ? "stats.observability" : "stats.defense")}>
      <header>
        <span className="run-stats-icon"><Icon size={17} /></span>
        <div><strong>{title}</strong><small>{integration.summary}</small></div>
        <span className={`run-stats-chip state-${chip}`}>
          {chip === "running" ? <><Loader2 size={12} className="run-stats-spin" /> In flight</> : notLive ? NOT_LIVE_LABEL[notLive] : STATE_LABEL[integration.state]}
        </span>
      </header>
      {integration.notice && (
        <div className="run-stats-notice" role="note">
          <span>{integration.notice}</span>
          {integration.settings && openSettings && <button type="button" onClick={() => openSettings(integration.settings)}><Settings2 size={13} /> Studio settings</button>}
        </div>
      )}
      {tiles.length > 0 && (
        <dl className="run-stats-tiles">
          {tiles.map((tile) => {
            const value = last ? format(tile.value(last), tile.format) : undefined;
            const total = format(sessionTotal(tile, runs), tile.format);
            const raw = last ? tile.value(last) : undefined;
            const alert = tile.alert && raw ? tile.alert : "";
            return (
              <div key={tile.label} className={alert ? `alert-${alert}` : undefined} title={tile.hint}>
                <dt>{tile.label}</dt>
                <dd className={value === undefined ? "empty" : undefined}>
                  {value ?? (running ? "…" : "—")}
                  {value === undefined && <span className="sr-only">{running ? "in flight" : last ? "not reported" : "no run yet"}</span>}
                </dd>
                <small>{runs.length > 1 && total !== undefined ? `${tile.total === "avg" ? "Avg" : "Session"} ${total}` : last && value === undefined && !running ? "Not reported" : "\u00a0"}</small>
              </div>
            );
          })}
        </dl>
      )}
      {facts.length > 0 && (
        <dl className="run-stats-facts">
          {facts.map((fact) => <div key={fact.label}><dt>{fact.label}</dt><dd>{fact.mono ? <code>{fact.value}</code> : fact.value}</dd></div>)}
        </dl>
      )}
      <footer>
        <span>{card.source}</span>
        {card.footer?.(last)}
        {integration.link && <a href={integration.link.href} target="_blank" rel="noreferrer">{integration.link.label} <ArrowUpRight size={13} /></a>}
      </footer>
    </article>
  );
}

/** Live Splunk Agent Observability and Cisco AI Defense figures for a demo, from its own responses. */
export default function RunStats({ ledger, observability, defense, empty = "Stats appear here as soon as the demo runs." }: {
  ledger: RunLedger;
  observability: StatsCard;
  defense: StatsCard;
  empty?: string;
}) {
  const { runs, reset } = ledger;
  const last = runs.at(-1);
  const elapsed = useElapsed(last);
  const duration = elapsed ?? last?.durationMs;
  const provenance = last ? runProvenance(last) : null;
  return (
    <section className="run-stats" aria-label="Live run stats" data-runs={runs.length} {...guideAnchor("stats")}>
      <header className="run-stats-head">
        <span className="run-stats-kicker">{last?.provenance === "recorded" ? "RUN STATS · RECORDED RUN" : last?.provenance === "sample" ? "RUN STATS · SAMPLE DATA" : "LIVE RUN STATS"}</span>
        <div className="run-stats-last" aria-live="polite">
          {last ? <>
            <span className={`run-stats-status status-${last.status}`}>{last.status === "running" && <Loader2 size={12} className="run-stats-spin" />}{last.replay && last.status === "running" ? "Replaying" : RUN_LABEL[last.status]}</span>
            <strong>{last.label}</strong>
            {provenance && <ProvenanceBadge provenance={provenance} className="run-stats-model" />}
            {duration !== undefined && <span className="run-stats-time">{format(duration, "ms")}{elapsed !== undefined ? " elapsed" : ""}</span>}
            {last.note && <span className="run-stats-note">{last.note}</span>}
          </> : <span className="run-stats-empty">{empty}</span>}
        </div>
        <div className="run-stats-session">
          <span>Session · {runs.length} run{runs.length === 1 ? "" : "s"}</span>
          <button type="button" onClick={reset} disabled={!runs.some((run) => run.status !== "running")}><RotateCcw size={13} /> Reset</button>
        </div>
      </header>
      <div className="run-stats-row">
        <Card kind="observability" card={observability} runs={runs} last={last} />
        <Card kind="defense" card={defense} runs={runs} last={last} />
      </div>
    </section>
  );
}

/** Prototype pages: example figures, labelled as such, for what the instrumented use case would report. */
export function IllustrativeRunStats({ observability, defense }: {
  observability: { label: string; value: string }[];
  defense: { label: string; value: string }[];
}) {
  const card = (kind: "observability" | "defense", tiles: { label: string; value: string }[]) => {
    const title = kind === "observability" ? "Splunk Agent Observability" : "Cisco AI Defense";
    const Icon = kind === "observability" ? Activity : ShieldCheck;
    return (
      <article className={`run-stats-card ${kind} state-illustrative`} aria-label={`${title} illustrative stats`}>
        <header>
          <span className="run-stats-icon"><Icon size={17} /></span>
          <div><strong>{title}</strong><small>What an instrumented run would report</small></div>
          <span className="run-stats-chip state-illustrative">Illustrative</span>
        </header>
        <dl className="run-stats-tiles">
          {tiles.map((tile) => <div key={tile.label}><dt>{tile.label}</dt><dd>{tile.value}</dd><small>Example</small></div>)}
        </dl>
        <footer><span>Example values. No service runs behind this prototype, so nothing here is measured.</span></footer>
      </article>
    );
  };
  return (
    <section className="run-stats illustrative" aria-label="Illustrative run stats" {...guideAnchor("stats")}>
      <header className="run-stats-head">
        <span className="run-stats-kicker">RUN STATS · ILLUSTRATIVE</span>
        <div className="run-stats-last"><span className="run-stats-empty">Prototype only: these are example figures, not a live run.</span></div>
      </header>
      <div className="run-stats-row">
        {card("observability", observability)}
        {card("defense", defense)}
      </div>
    </section>
  );
}
