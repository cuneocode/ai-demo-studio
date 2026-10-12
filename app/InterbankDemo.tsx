"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CircleAlert,
  CodeXml,
  Landmark,
  Loader2,
  Play,
  RotateCcw,
  ShieldCheck,
  SquareTerminal,
  X,
} from "lucide-react";
import { SourceInspector } from "./map/inspector.tsx";
import { interbankEvidence } from "./map/interbank-evidence.ts";
import RunStats, { defenseFacts, useRunLedger, type Integration, type ObservedRun, type StatsCard } from "./RunStats";
import { servedByFromEvents, type RunEvent } from "./run/events";
import { useRun, useStickToBottom } from "./run/useRun";
import { RichText, TimelineItem, defaultLine, useExpanded, type TimelineLine } from "./run/RunTimeline";
import ProvenanceBadge from "./run/ProvenanceBadge";
import "./banking.css";
import "./interbank.css";

type LabEvent = RunEvent & { organization: string };
type Run = { id: string; prompt: string; status: "running" | "completed" | "blocked" | "failed"; started_at: string; finished_at?: string; report?: string; trace_id?: string };
type Runtime = {
  model: { name: string; api: string; label?: string; reasoning_effort: string; reasoning_summary: string; private?: boolean; fallback?: boolean; reason?: string; chain?: string[] };
  agents: { framework: string; protocol: string; bank_a: string[]; bank_b: string[] };
  gateway: { product: string; transport: string; admission: string };
  ai_defense: { mode: string; region: string; hops: Record<string, string[]> };
  agent_control: { execution: string; step: string; stage: string; sinks: string[] };
  observability: { project: string; agent_stream: string; console_url: string; exporters: string[] };
};
type Lane = "a" | "wire" | "b";
type Line = TimelineLine & { event: LabEvent; sources: string[] };
type InterbankDemoProps = { onBack: () => void; onAdd: () => void; inStory: boolean; embedded?: boolean };

const BANKS = {
  a: { name: "Bank A", org: "Harbor Point Bank", role: "Coordinator · owns the case", agent: "bank-a-agent", gateway: "bank-a-gateway", records: "bank-a-records" },
  b: { name: "Bank B", org: "Meridian Trust", role: "Counterparty · answers over A2A", agent: "bank-b-agent", gateway: "bank-b-gateway", records: "bank-b-records" },
} as const;

const HOPS: Record<string, string> = {
  "ingress-from-console": "Ops desk → Bank A · ingress :7443",
  "egress-to-bank-b": "Bank A → Bank B · egress :8443",
  "ingress-from-bank-b": "Bank B → Bank A · ingress :9443",
  "ingress-from-bank-a": "Bank A → Bank B · ingress :9443",
  "egress-to-bank-a": "Bank B → Bank A · egress :8443",
};

/** Each source button opens the same captured evidence the architecture explorer cites. */
const EVIDENCE: Record<string, { title: string; ids: string[] }> = {
  "bank-a-agent": { title: "Bank A coordinator", ids: ["interbank.bank-a.coordinator"] },
  "bank-b-agent": { title: "Bank B investigator", ids: ["interbank.bank-b.investigator"] },
  "deep-agent-builder": { title: "Deep Agent and model", ids: ["interbank.agents.build", "interbank.agents.model"] },
  telemetry: { title: "Tracing and handoff", ids: ["interbank.telemetry.setup", "interbank.telemetry.handoff", "interbank.telemetry.session"] },
  genai: { title: "GenAI span export", ids: ["interbank.genai.exporter"] },
  "agent-control": { title: "Agent Control evaluation", ids: ["interbank.controls.outbound"] },
  "controls-setup": { title: "Agent Control definition", ids: ["interbank.controls.setup"] },
  "partner-tool": { title: "Partner tool", ids: ["interbank.partner-tool"] },
  "a2a-send": { title: "A2A client", ids: ["interbank.a2a.send", "interbank.a2a.mtls"] },
  "a2a-receive": { title: "A2A server", ids: ["interbank.a2a.receive", "interbank.a2a.server"] },
  records: { title: "Read-only records tool", ids: ["interbank.records"] },
  "bank-a-records": { title: "Read-only records tool", ids: ["interbank.records"] },
  "bank-b-records": { title: "Read-only records tool", ids: ["interbank.records"] },
  "bank-a-gateway": { title: "Bank A gateway", ids: ["interbank.gw-a.console-listener", "interbank.gw-a.egress", "interbank.gw-a.egress-token", "interbank.gw.tracing"] },
  "bank-b-gateway": { title: "Bank B gateway", ids: ["interbank.gw-b.ingress", "interbank.gw-b.ingress-extproc"] },
  "ai-defense-extproc": { title: "AI Defense ExtProc", ids: ["interbank.extproc.text", "interbank.extproc.verdict", "interbank.extproc.hops"] },
  "ai-defense-api": { title: "Inspection API call", ids: ["interbank.defense.inspect"] },
  collector: { title: "Gateway collector", ids: ["interbank.collector"] },
  console: { title: "Operations console", ids: ["interbank.console.kickoff"] },
  compose: { title: "Containers and networks", ids: ["interbank.compose"] },
  pki: { title: "Per-bank CAs and tokens", ids: ["interbank.labctl.pki"] },
};

const evidenceLabel = (id: string) => {
  const item = interbankEvidence[id];
  return item ? `${item.file.split("/").pop()} · ${item.symbol}` : id;
};

type Viewer = { title: string; ids: string[]; current: string };

function viewerFor(keys: string[]): Viewer | null {
  const ids = [...new Set(keys.flatMap((key) => EVIDENCE[key]?.ids ?? []))];
  return ids.length ? { title: EVIDENCE[keys[0]]?.title ?? "Source evidence", ids, current: ids[0] } : null;
}

function EvidencePanel({ viewer, onSelect, onClose }: { viewer: Viewer; onSelect: (id: string) => void; onClose: () => void }) {
  const [width, setWidth] = useState(() => Math.min(960, Math.round(window.innerWidth * 0.7)));
  const [viewport, setViewport] = useState(() => window.innerWidth);
  useEffect(() => {
    const onResize = () => setViewport(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);
  const item = interbankEvidence[viewer.current];
  return (
    <div className="ib-evidence" role="dialog" aria-modal="true" aria-label={`${viewer.title} source`} onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <SourceInspector
        sourceId={viewer.current}
        sourceIds={viewer.ids}
        labels={Object.fromEntries(viewer.ids.map((id) => [id, evidenceLabel(id)]))}
        attribution={{ subject: viewer.title, platforms: [], mechanism: item ? `${item.symbol} in ${item.file}` : "", effect: item?.proves ?? "" }}
        width={Math.min(width, viewport - 40)}
        maxWidth={viewport - 40}
        drawer={false}
        onWidth={setWidth}
        onSelect={onSelect}
        onClose={onClose}
      />
    </div>
  );
}

const INTEGRATION_POINTS: { integration: string; title: string; detail: string; ids: string[] }[] = [
  { integration: "deepagents", title: "LangChain Deep Agents", detail: "create_deep_agent, prompts, tools, and the Responses API model with reasoning summaries.", ids: ["deep-agent-builder", "bank-a-agent", "bank-b-agent"] },
  { integration: "observability", title: "Splunk Agent Observability", detail: "SplunkAOSpanProcessor, OpenInference, W3C context across A2A, and the gateways' collector.", ids: ["telemetry", "genai", "collector", "console"] },
  { integration: "ai-defense", title: "Cisco AI Defense at the gateway", detail: "agentgateway ExtProc on every listener, fail closed, and the Inspection API call.", ids: ["bank-a-gateway", "bank-b-gateway", "ai-defense-extproc", "ai-defense-api"] },
  { integration: "agent-control", title: "Splunk Agent Control", detail: "Server-side controls evaluated before each outbound A2A message.", ids: ["partner-tool", "agent-control", "controls-setup"] },
  { integration: "a2a", title: "A2A protocol", detail: "A2A SDK client and server between the banks.", ids: ["a2a-send", "a2a-receive"] },
];

const pretty = (text: string) => text
  .replace(/bank-([ab])(-gateway)?/g, (_, letter: string, gateway?: string) => `Bank ${letter.toUpperCase()}${gateway ? " gateway" : ""}`)
  .replace(/operations-console/g, "Ops desk");

function laneOf(event: LabEvent): Lane {
  if (event.component === "bank-a-agent") return "a";
  if (event.component === "bank-b-agent") return "b";
  return "wire";
}

function rowsLabel(body: string) {
  try {
    const rows = JSON.parse(body);
    if (Array.isArray(rows)) return `${rows.length} row${rows.length === 1 ? "" : "s"} returned`;
  } catch { /* not JSON: the tool's own message */ }
  return body.split("\n")[0].slice(0, 140);
}

/** One event → one terminal line, or null when another line already shows the same thing. */
function toLine(event: LabEvent): Line | null {
  if (event.kind === "model.failover") {
    const shared = defaultLine(event);
    return shared && { ...shared, event, sources: ["deep-agent-builder"] };
  }
  const lane = laneOf(event);
  const bank = lane === "wire" ? (event.organization === "bank-b" ? BANKS.b : BANKS.a) : BANKS[lane];
  const data = event.data ?? {};
  const body = event.body ?? "";
  const tool = typeof data.tool === "string" ? data.tool : "";
  const args = (data.arguments ?? {}) as Record<string, unknown>;
  const rich = event.kind === "agent.message" || event.kind === "a2a.reply" || event.kind === "a2a.receive";
  const line = (tag: string, tone: string, title: string, sources: string[], extra: Partial<Line> = {}): Line => ({ event, tag, tone, title, sources, rich, ...extra });
  switch (event.kind) {
    case "agent.thinking":
      return line("THINK", "think", event.title, ["deep-agent-builder", bank.agent], { body: body.replace(/^\*\*[^*\n]+\*\*\s*/, "") });
    case "agent.tool_call":
      if (tool === "query_settlement_records") return line("SQL", "tool", `${bank.name} records · query_settlement_records`, ["records", bank.records], { code: String(args.sql ?? "") });
      if (tool.startsWith("send_message_to_")) return line("TOOL", "tool", `${tool} · checked by Agent Control before sending`, ["partner-tool", "agent-control"], { body: String(args.message ?? "") });
      if (tool === "write_todos" && Array.isArray(args.todos)) {
        return line("PLAN", "think", "write_todos · Deep Agent plan", ["deep-agent-builder"], { body: (args.todos as { content?: string; status?: string }[]).map((t) => `${t.status === "completed" ? "[x]" : t.status === "in_progress" ? "[>]" : "[ ]"} ${t.content ?? ""}`).join("\n") });
      }
      return line("TOOL", "tool", `${tool || event.title}`, ["deep-agent-builder"], { hidden: JSON.stringify(args, null, 2) });
    case "tool.result":
      if (tool.startsWith("send_message_to_") || tool === "write_todos") return null;
      if (tool === "query_settlement_records") return line("ROWS", body.startsWith("Rejected") ? "warn" : "result", rowsLabel(body), ["records"], { hidden: body });
      return line("RESULT", "result", `${tool} returned`, ["deep-agent-builder"], { hidden: body });
    case "db.query":
    case "llm.call":
      return null;
    case "control": {
      const controls = (data.controls ?? []) as { control: string; matched: boolean }[];
      return line("CONTROL", event.status === "denied" ? "deny" : "ok", event.title, ["agent-control", "controls-setup"], { body: controls.map((c) => `${c.control} · ${c.matched ? "matched → deny" : "no match"}`).join("\n") || body });
    }
    case "a2a.send":
      if (lane === "wire") return line("CONSOLE", "a2a", `Ops desk → Bank A gateway${data.via ? ` · ${String(data.via).replace(/^https:\/\//, "")}` : ""}`, ["console", "a2a-send"]);
      return line("A2A →", "a2a", `SendMessage to ${lane === "a" ? "Bank B" : "Bank A"} through ${bank.name}'s gateway${data.via ? ` (${String(data.via).replace(/^https:\/\//, "")})` : ""}`, ["a2a-send", bank.gateway]);
    case "a2a.receive":
      return line("A2A ←", "a2a", pretty(event.title), ["a2a-receive", bank.agent], { body });
    case "a2a.reply":
      if (lane === "wire") return line("CONSOLE", "a2a", "Report returned to the Ops desk", ["console"]);
      return line("A2A ←", "a2a", `Reply from ${lane === "a" ? "Bank B" : "Bank A"}`, ["a2a-send"], { body });
    case "a2a.respond":
      return line("A2A →", "a2a", `Reply sent back through ${bank.name}'s gateway`, ["a2a-receive", bank.gateway]);
    case "agent.message":
      return line("ANSWER", "answer", `${bank.name} agent's answer`, [bank.agent], { body });
    case "a2a.denied":
      return line("DENIED", "deny", event.title, [bank.gateway, "ai-defense-extproc"], { body });
    case "guardrail": {
      const hop = HOPS[String(data.hop)] ?? String(data.hop ?? "");
      const stage = data.agent_card ? "Agent Card" : String(data.stage ?? "");
      const verdict = event.status === "allowed" ? "Allowed" : event.status === "denied" ? "Blocked" : "Unavailable → fail closed";
      const rules = ((data.rules as unknown[]) ?? []).map((r) => typeof r === "string" ? r : String((r as { rule?: string }).rule ?? JSON.stringify(r)));
      const findings = [...((data.classifications as string[]) ?? []), ...rules];
      return line("AI DEFENSE", event.status === "allowed" ? "ok" : "deny", `${verdict} · ${stage}`, [bank.gateway, "ai-defense-extproc", "ai-defense-api"], {
        body: [hop, findings.length ? `Findings: ${findings.join(", ")}` : "", data.event_id ? `Event ${String(data.event_id)}` : ""].filter(Boolean).join("\n"),
        hidden: body,
      });
    }
    case "run":
      return line("CONSOLE", event.status === "denied" || event.status === "error" ? "deny" : "a2a", pretty(event.title), ["console"], event.status === "started" ? { body } : {});
    default:
      return line(event.kind.toUpperCase(), "result", pretty(event.title), [], { body });
  }
}

function agentStatus(lines: Line[], running: boolean): string {
  const last = lines.at(-1);
  if (!last) return running ? "Waiting" : "Idle";
  if (!running) return "Done";
  return ({ THINK: "Thinking", PLAN: "Planning", SQL: "Querying own records", ROWS: "Reading rows", TOOL: "Checking Agent Control", CONTROL: "Sending over A2A", "A2A →": last.event.kind === "a2a.respond" ? "Replied · idle" : "Waiting for the other bank", "A2A ←": "Working on a message", ANSWER: "Replying", DENIED: "Message not delivered" } as Record<string, string>)[last.tag] ?? "Working";
}

type Denial = { error?: string; gateway?: string; hop?: string; stage?: string; classifications?: string[]; rules?: { rule?: string }[]; event_id?: string };

function parseDenial(report?: string): Denial | null {
  try {
    const value = JSON.parse(report ?? "");
    return value && typeof value === "object" && "error" in value ? value as Denial : null;
  } catch {
    return null;
  }
}

/** A blocked kickoff's report is the gateway's JSON refusal; show it as facts rather than raw JSON. */
function Report({ run }: { run: Run }) {
  const denial = run.status === "blocked" ? parseDenial(run.report) : null;
  if (!denial) return <RichText text={run.report ?? ""} />;
  return <div className="rt-rich">
    <p>{denial.error}</p>
    <dl className="fact-grid">
      <div><dt>Gateway · hop</dt><dd>{pretty(denial.gateway ?? "")} · {HOPS[denial.hop ?? ""] ?? denial.hop}</dd></div>
      <div><dt>Stage</dt><dd>{denial.stage}</dd></div>
      <div><dt>Classifications</dt><dd>{denial.classifications?.join(", ") || "—"}</dd></div>
      <div><dt>Rules</dt><dd>{denial.rules?.map((r) => r.rule).join(", ") || "—"}</dd></div>
      <div><dt>AI Defense event</dt><dd><code>{denial.event_id ?? "—"}</code></dd></div>
    </dl>
    <p>Neither bank&apos;s agent received the message, so nothing was investigated or sent to Bank B.</p>
  </div>;
}

function Terminal({ lane, lines, run, active, expanded, toggle, onSource }: { lane: "a" | "b"; lines: Line[]; run: Run | null; active: boolean; expanded: Set<string>; toggle: (id: string) => void; onSource: (ids: string[]) => void }) {
  const bank = BANKS[lane];
  const running = run?.status === "running";
  const { ref, onScroll } = useStickToBottom(lines.length);
  return (
    <section className={`ib-terminal ${active ? "active" : ""}`} aria-label={`${bank.name} agent terminal`}>
      <header>
        <span className="ib-terminal-icon"><Landmark size={17} /></span>
        <div><strong>{bank.name} · {bank.org}</strong><span className="ib-sub"><small>{bank.role}</small><span className={`ib-agent-state ${running && active ? "busy" : ""}`}>{running && active && <Loader2 size={13} className="ib-spin" />}{agentStatus(lines, !!running)}</span></span></div>
        <button className="ib-mini ib-source" onClick={() => onSource([bank.agent, "deep-agent-builder", "telemetry"])} aria-label={`${bank.name} agent source`}><CodeXml size={14} /> Agent</button>
      </header>
      <ol ref={ref} onScroll={onScroll} aria-live="polite">
        {lines.length ? lines.map((line) => <TimelineItem key={line.event.id} line={line} start={run?.started_at} expanded={expanded.has(line.event.id)} onToggle={() => toggle(line.event.id)} onSource={onSource} />)
          : <li className="ib-empty">{!run ? `${bank.name}'s Deep Agent is idle. Start an investigation.`
            : running ? (lane === "b" ? "Waiting for Bank A to reach out over A2A…" : "Waiting for the kickoff to pass Bank A's gateway…")
            : lane === "a" ? "Nothing reached Bank A's agent: the kickoff stopped at Bank A's gateway." : "Bank A's agent never contacted Bank B."}</li>}
      </ol>
    </section>
  );
}

function Wire({ lines, run, expanded, toggle, onSource }: { lines: Line[]; run: Run | null; expanded: Set<string>; toggle: (id: string) => void; onSource: (ids: string[]) => void }) {
  const { ref, onScroll } = useStickToBottom(lines.length);
  return (
    <section className="ib-wire" aria-label="Gateways and AI Defense">
      <header>
        <span className="ib-terminal-icon"><ShieldCheck size={17} /></span>
        <div><strong>Gateways · Cisco AI Defense</strong><small>Every A2A hop, request and response</small></div>
        <button className="ib-mini ib-source" onClick={() => onSource(["bank-a-gateway", "bank-b-gateway", "ai-defense-extproc", "ai-defense-api"])} aria-label="Gateway configuration"><CodeXml size={14} /> Config</button>
      </header>
      <ol ref={ref} onScroll={onScroll} aria-live="polite">
        {lines.length ? lines.map((line) => <TimelineItem key={line.event.id} line={line} start={run?.started_at} expanded={expanded.has(line.event.id)} onToggle={() => toggle(line.event.id)} onSource={onSource} />)
          : <li className="ib-empty">Gateway inspections appear here as each message crosses a listener.</li>}
      </ol>
    </section>
  );
}

const isNumber = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value);
const AGENT_KINDS = new Set(["agent.thinking", "agent.tool_call", "agent.message"]);

/** Everything here is counted from the run's own events, as far as they have been shown. */
function observeRun(run: Run, visible: LabEvent[], replaying: boolean, traceId: string | undefined, runtime: Runtime | null, recorded: boolean): ObservedRun {
  const of = (kind: string) => visible.filter((event) => event.kind === kind);
  const llm = of("llm.call");
  const running = replaying || run.status === "running";
  // Lab builds before llm.call events existed still show agent activity; their model calls are unknown, not zero.
  const agentsRan = visible.some((event) => AGENT_KINDS.has(event.kind));
  const llmCalls = llm.length ? llm.length : agentsRan || running ? undefined : 0;
  const tokens = (key: string) => {
    if (llmCalls === 0) return 0;
    const values = llm.map((event) => event.data?.[key]).filter(isNumber);
    return values.length ? values.reduce((a, b) => a + b, 0) : undefined;
  };
  const guardrails = of("guardrail");
  const blocked = guardrails.filter((event) => event.status === "denied").length;
  const errors = guardrails.filter((event) => event.status !== "allowed" && event.status !== "denied").length;
  const checks = guardrails.length - errors;
  const eventIds = [...new Set(guardrails.map((event) => event.data?.event_id).filter((id): id is string => typeof id === "string" && Boolean(id)))];
  const controls = of("control");
  const started = Date.parse(run.started_at);
  const finished = run.finished_at ? Date.parse(run.finished_at) : NaN;
  return {
    id: run.id,
    label: run.prompt,
    status: running ? "running" : run.status,
    replay: recorded,
    ...(recorded ? { provenance: "recorded" as const, recordedAt: run.started_at, note: "Replay of a recorded lab run · nothing was re-run" } : {}),
    servedBy: servedByFromEvents(visible),
    startedAt: started,
    durationMs: !running && Number.isFinite(finished) ? finished - started : undefined,
    traceId,
    llmCalls,
    inputTokens: tokens("input_tokens"),
    outputTokens: tokens("output_tokens"),
    toolCalls: of("agent.tool_call").length,
    counts: {
      a2a: of("a2a.send").length,
      sql: of("db.query").length,
      controls: controls.length,
      controlsDenied: controls.filter((event) => event.status === "denied").length,
      thoughts: of("agent.thinking").length,
    },
    defense: {
      mode: runtime?.ai_defense.mode,
      status: running ? undefined : errors ? "inspection_unavailable" : blocked ? "blocked" : checks ? "allowed" : "not_checked",
      checks, blocked, errors, eventIds,
    },
  };
}

function interbankStats(labUp: boolean | null, runtime: Runtime | null): { observability: StatsCard; defense: StatsCard } {
  const offline: Integration | null = labUp === false
    ? { state: "unknown", summary: "Lab offline", notice: "The interbank lab is not running. Start it with npm run interbank:up, then reload." }
    : !runtime ? { state: "unknown", summary: "Checking the lab…" } : null;
  const ao: Integration = offline ?? (runtime!.observability.project
    ? { state: "on", summary: `Project ${runtime!.observability.project} · stream ${runtime!.observability.agent_stream}`,
        link: runtime!.observability.console_url ? { label: "Open Splunk Agent Observability", href: runtime!.observability.console_url } : undefined }
    : { state: "missing", summary: "Not configured", notice: "The lab has no Splunk Agent Observability project. Add the API key in Studio settings.", settings: "st-splunk-ao" });
  const mode = runtime?.ai_defense.mode ?? "";
  const defense: Integration = offline ?? (/^off\b/i.test(mode)
    ? { state: "off", summary: "Off", notice: "AI Defense is off at the gateways. Enable it in Studio settings.", settings: "st-ai-defense" }
    : { state: "on", summary: `${mode.charAt(0).toUpperCase()}${mode.slice(1)}${runtime!.ai_defense.region ? ` · ${runtime!.ai_defense.region}` : ""} · every gateway hop` });
  return {
    observability: {
      integration: ao,
      tiles: [
        { label: "LLM calls", value: (run) => run.llmCalls },
        { label: "Tool calls", value: (run) => run.toolCalls },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
        { label: "A2A sends", value: (run) => run.counts?.a2a },
        { label: "SQL queries", value: (run) => run.counts?.sql },
        { label: "Controls", value: (run) => run.counts?.controls, hint: "Agent Control evaluations" },
        { label: "Denials", value: (run) => run.counts?.controlsDenied, alert: "deny", hint: "Agent Control denials" },
        { label: "Reasoning", value: (run) => run.counts?.thoughts, hint: "Reasoning summaries" },
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg" },
      ],
      facts: (run) => [
        { label: "Session", value: run?.id, mono: true },
        { label: "Trace", value: run?.traceId, mono: true },
      ],
      source: "Counted from this run's events. One trace covers the Ops desk, both gateways, every AI Defense hop, both Deep Agents, and each control; the session is the run ID.",
      footer: (run) => run && <span>Verify from a terminal: <code>npm run interbank:verify -- {run.id}{run.status === "blocked" ? " blocked" : ""}</code></span>,
    },
    defense: {
      integration: defense,
      tiles: [
        { label: "Inspections", value: (run) => run.defense?.checks, hint: "Gateway inspections that returned a verdict" },
        { label: "Blocked", value: (run) => run.defense?.blocked, alert: "deny" },
        { label: "Errors", value: (run) => run.defense?.errors, alert: "warn", hint: "Inspections that failed closed without a verdict" },
        { label: "Event IDs", value: (run) => run.defense?.eventIds?.length },
      ],
      facts: defenseFacts,
      source: "Counted from the ExtProc verdicts both banks' gateways emitted for this run.",
    },
  };
}

export default function InterbankDemo({ embedded = false }: InterbankDemoProps) {
  const [labUp, setLabUp] = useState<boolean | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState("allowed");
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<Run[]>([]);
  const { expanded, toggle, reset: resetExpanded } = useExpanded();
  const [starting, setStarting] = useState(false);
  const [viewer, setViewer] = useState<Viewer | null>(null);
  const openSources = useCallback((keys: string[]) => setViewer(viewerFor(keys)), []);
  const closeSources = useCallback(() => setViewer(null), []);

  const loadHistory = useCallback(() => {
    fetch("/api/interbank/runs", { signal: AbortSignal.timeout(8000) }).then((r) => (r.ok ? r.json() : [])).then(setHistory).catch(() => undefined);
  }, []);

  useEffect(() => {
    fetch("/api/interbank/health", { signal: AbortSignal.timeout(5000) })
      .then((response) => {
        if (!response.ok) throw new Error();
        setLabUp(true);
        fetch("/api/interbank/runtime").then((r) => r.json()).then(setRuntime).catch(() => undefined);
        fetch("/api/interbank/examples").then((r) => r.json()).then((body) => { setExamples(body); setPrompt(body.allowed ?? ""); }).catch(() => undefined);
        loadHistory();
      })
      .catch(() => setLabUp(false));
  }, [loadHistory]);

  const { run, mode, effectiveRun, visible, replaying, error, setError, open: follow, skip } = useRun<Run, LabEvent>({
    pageUrl: (id, after) => `/api/interbank/runs/${id}?after=${after}`,
    pace: 160,
    onSettled: loadHistory,
    lostContact: "Lost contact with the interbank lab. Check npm run interbank:status.",
  });
  const open = (id: string, replay: boolean) => { resetExpanded(); follow(id, replay); };

  async function start() {
    if (!prompt.trim() || starting) return;
    setStarting(true); setError("");
    try {
      const response = await fetch("/api/interbank/kickoff", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ prompt }), signal: AbortSignal.timeout(15000) });
      if (!response.ok) throw new Error((await response.json().catch(() => ({}))).detail || `Kickoff failed (${response.status}).`);
      const created = await response.json() as Run;
      open(created.id, false);
      loadHistory();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Kickoff failed.");
    } finally {
      setStarting(false);
    }
  }

  const lanes = useMemo(() => {
    const out: Record<Lane, Line[]> = { a: [], wire: [], b: [] };
    for (const event of visible) { const line = toLine(event); if (line) out[laneOf(event)].push(line); }
    return out;
  }, [visible]);
  const servedBy = useMemo(() => servedByFromEvents(visible), [visible]);
  const lastAgentLane = [...visible].reverse().map(laneOf).find((lane) => lane !== "wire");
  const traceId = run?.trace_id ?? visible.find((e) => e.trace_id)?.trace_id;
  const done = effectiveRun && effectiveRun.status !== "running";
  const ledger = useRunLedger();
  const { record } = ledger;
  const recorded = mode === "replay";
  const observed = useMemo(() => (run ? observeRun(run, visible, replaying, traceId, runtime, recorded) : null), [run, visible, replaying, traceId, runtime, recorded]);
  useEffect(() => { if (observed) record(observed); }, [observed, record]);
  const stats = useMemo(() => interbankStats(labUp, runtime), [labUp, runtime]);

  return (
    <div className={`banking-demo interbank-demo ${embedded ? "banking-embedded" : ""}`}>
      <section className="ib-controls proof-card">
        <div className="ib-controls-head">
          <div>
            <span className="review-kicker">OPERATIONS DESK · BANK A</span>
            <h3>Investigate a failed settlement with the counterparty&apos;s agent</h3>
            <p>The kickoff is an A2A message to Bank A&apos;s Deep Agent through Bank A&apos;s gateway. Bank A&apos;s agent decides when to ask Bank B&apos;s agent over A2A. Both agents are read-only; people approve any fix.</p>
            <p className="ib-synthetic-note">Fictional banks · synthetic settlement records in each bank&apos;s own database · live agents, gateways, and Cisco and Splunk calls</p>
          </div>
          <span className={`ib-lab-state ${labUp ? "up" : labUp === false ? "down" : ""}`}><span className={labUp ? "status-dot ready" : "status-dot"} />{labUp ? `Lab running · ${runtime?.model.name ?? "model"}` : labUp === false ? "Lab offline" : "Checking lab…"}</span>
        </div>
        {labUp === false && <div className="banking-error"><CircleAlert size={14} /><div>The interbank lab runs in Docker and is not running. Start it with <code>npm run interbank:up</code>, then reload. The source and configuration viewer below still works.</div></div>}
        <div className="ib-scenarios" role="group" aria-label="Scenario">
          {[["allowed", "Allowed investigation", "TRD-847 · both banks investigate"], ["blocked", "Prompt-injection kickoff", "AI Defense blocks it at Bank A's gateway"]].map(([key, label, detail]) => (
            <button key={key} className={scenario === key ? "active" : ""} aria-pressed={scenario === key} disabled={!examples[key]} onClick={() => { setScenario(key); setPrompt(examples[key] ?? ""); }}>
              <strong>{label}</strong><small>{detail}</small>
            </button>
          ))}
        </div>
        <label className="ib-prompt"><span>Kickoff message</span>
          <textarea id="interbank-kickoff" rows={2} value={prompt} onChange={(event) => { setPrompt(event.target.value); setScenario("custom"); }} disabled={!labUp} />
        </label>
        <div className="ib-actions">
          <button className="ib-primary" onClick={start} disabled={!labUp || starting || !prompt.trim() || effectiveRun?.status === "running"}>
            {starting ? <><Loader2 size={15} className="ib-spin" /> Starting…</> : effectiveRun?.status === "running" && !replaying ? <><Loader2 size={15} className="ib-spin" /> Investigation running…</> : <><Play size={15} /> Start investigation</>}
          </button>
          {history.length > 0 && <label className="ib-history"><span>Replay a recent run</span>
            <select value="" onChange={(event) => { if (event.target.value) open(event.target.value, true); }}>
              <option value="">Choose a run…</option>
              {history.slice(0, 12).map((item) => <option key={item.id} value={item.id}>{item.id} · {item.status}</option>)}
            </select>
          </label>}
          {replaying && <button className="ib-mini" onClick={skip}><RotateCcw size={13} /> Skip replay</button>}
        </div>
        {error && <div className="banking-error"><CircleAlert size={14} /><div>{error}</div><button onClick={() => setError("")} aria-label="Dismiss"><X size={14} /></button></div>}
      </section>

      <section className="ib-stage" aria-label="Agents and gateways">
        <Terminal lane="a" lines={lanes.a} run={effectiveRun} active={effectiveRun?.status === "running" && lastAgentLane === "a"} expanded={expanded} toggle={toggle} onSource={openSources} />
        <Wire lines={lanes.wire} run={effectiveRun} expanded={expanded} toggle={toggle} onSource={openSources} />
        <Terminal lane="b" lines={lanes.b} run={effectiveRun} active={effectiveRun?.status === "running" && lastAgentLane === "b"} expanded={expanded} toggle={toggle} onSource={openSources} />
      </section>

      <section className="ib-results">
        <div className={`proof-card ib-report status-${done ? effectiveRun.status : "pending"}`}>
          <span className="review-kicker">JOINT REPORT · FOR HUMAN APPROVAL</span>
          {done && run?.report ? <>
            {recorded ? <ProvenanceBadge provenance={{ kind: "recorded", recordedAt: run.started_at, servedBy }} /> : servedBy && <ProvenanceBadge provenance={{ kind: "live", servedBy }} />}
            <span className={`ib-status ${run.status}`}>{run.status === "completed" ? "Completed" : run.status === "blocked" ? "Blocked at Bank A's gateway" : "Failed"}</span>
            <Report run={run} />
          </> : <p>{effectiveRun ? "The report appears when Bank A's agent replies to the Ops desk." : "Start or replay an investigation to see the joint report."}</p>}
        </div>
        <aside className="ib-side">
          {runtime && <div className="proof-card ib-runtime">
            <span className="review-kicker">RUNTIME</span>
            <dl className="fact-grid">
              <div><dt>Model</dt><dd>{runtime.model.label ? `${runtime.model.label} · ` : ""}{runtime.model.name} · {runtime.model.api}{runtime.model.fallback ? " (fallback)" : ""}</dd></div>
              {runtime.model.chain && runtime.model.chain.length > 1 && <div><dt>Model chain</dt><dd>{runtime.model.chain.join(" → ")}</dd></div>}
              <div><dt>Reasoning</dt><dd>{runtime.model.reasoning_summary === "none" ? "No reasoning summaries on Chat Completions" : `${runtime.model.reasoning_effort} effort · ${runtime.model.reasoning_summary} summaries`}</dd></div>
              <div><dt>Agents</dt><dd>{runtime.agents.framework} · {runtime.agents.protocol}</dd></div>
              <div><dt>Gateway</dt><dd>{runtime.gateway.product} · {runtime.gateway.transport}</dd></div>
              <div><dt>AI Defense</dt><dd>{runtime.ai_defense.mode}{runtime.ai_defense.region ? ` · ${runtime.ai_defense.region}` : ""}</dd></div>
              <div><dt>Agent Control</dt><dd>{runtime.agent_control.execution} · {runtime.agent_control.step} · {runtime.agent_control.stage}</dd></div>
            </dl>
          </div>}
        </aside>
      </section>

      <RunStats ledger={ledger} {...stats} empty="Start or replay an investigation. Counts fill in as each event arrives." />

      <section className="proof-card ib-integrations" aria-label="Integration points">
        <div className="ib-integrations-head">
          <span className="review-kicker"><SquareTerminal size={13} /> INTEGRATION POINTS · SOURCE AND CONFIGURATION</span>
          <p>Every <CodeXml size={13} /> button opens the same captured excerpt the architecture map cites, and says when the file has changed since.</p>
        </div>
        <div className="ib-integration-grid">
          {INTEGRATION_POINTS.map((point) => (
            <article key={point.integration} className={`integration-${point.integration}`}>
              <div className="ib-integration-copy"><strong>{point.title}</strong><p>{point.detail}</p></div>
              <div className="ib-integration-sources">{point.ids.map((id) => <button key={id} onClick={() => openSources([id])}><CodeXml size={15} /> {EVIDENCE[id]?.title ?? id}</button>)}</div>
            </article>
          ))}
        </div>
      </section>
      {viewer && <EvidencePanel viewer={viewer} onSelect={(current) => setViewer({ ...viewer, current })} onClose={closeSources} />}
    </div>
  );
}
