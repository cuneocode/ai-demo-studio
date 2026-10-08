"use client";

import { Fragment, useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import {
  ArrowUpRight,
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
import "./banking.css";
import "./interbank.css";

type LabEvent = {
  id: string; at: string; run_id: string; organization: string; component: string; kind: string;
  status: string; title: string; source?: string | null; target?: string | null; body?: string | null;
  data?: Record<string, unknown>; trace_id?: string; span_id?: string;
};
type Run = { id: string; prompt: string; status: "running" | "completed" | "blocked" | "failed"; started_at: string; finished_at?: string; report?: string; trace_id?: string };
type Runtime = {
  model: { name: string; api: string; reasoning_effort: string; reasoning_summary: string };
  agents: { framework: string; protocol: string; bank_a: string[]; bank_b: string[] };
  gateway: { product: string; transport: string; admission: string };
  ai_defense: { mode: string; region: string; hops: Record<string, string[]> };
  agent_control: { execution: string; step: string; stage: string; sinks: string[] };
  observability: { project: string; agent_stream: string; console_url: string; exporters: string[] };
};
type Lane = "a" | "wire" | "b";
/** body: always shown (clamped when long) · code: always shown · hidden: revealed on demand. */
type Line = { event: LabEvent; tag: string; tone: string; title: string; body?: string; code?: string; hidden?: string; sources: string[] };
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
  const [width, setWidth] = useState(620);
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
        width={width}
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
  const lane = laneOf(event);
  const bank = lane === "wire" ? (event.organization === "bank-b" ? BANKS.b : BANKS.a) : BANKS[lane];
  const data = event.data ?? {};
  const body = event.body ?? "";
  const tool = typeof data.tool === "string" ? data.tool : "";
  const args = (data.arguments ?? {}) as Record<string, unknown>;
  const line = (tag: string, tone: string, title: string, sources: string[], extra: Partial<Line> = {}): Line => ({ event, tag, tone, title, sources, ...extra });
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

function inline(text: string): ReactNode[] {
  return text.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.length > 4 && part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}

/** Headings, bullets, and bold: enough for the agents' reports without a Markdown dependency. */
function Rich({ text }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) blocks.push(<ul key={blocks.length}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = []; };
  for (const raw of text.split("\n")) {
    const lineText = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(lineText);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    const heading = /^#{1,4}\s+(.*)$/.exec(lineText);
    if (heading) blocks.push(<h4 key={blocks.length}>{inline(heading[1])}</h4>);
    else if (lineText.trim()) blocks.push(<p key={blocks.length}>{inline(lineText)}</p>);
  }
  flush();
  return <div className="ib-rich">{blocks}</div>;
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
  if (!denial) return <Rich text={run.report ?? ""} />;
  return <div className="ib-rich">
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

function seconds(event: LabEvent, start?: string) {
  if (!start) return "";
  const delta = (Date.parse(event.at) - Date.parse(start)) / 1000;
  return Number.isFinite(delta) ? `+${Math.max(0, delta).toFixed(1)}s` : "";
}

function TerminalLine({ line, start, expanded, onToggle, onSource }: { line: Line; start?: string; expanded: boolean; onToggle: () => void; onSource: (ids: string[]) => void }) {
  const long = (line.body?.length ?? 0) > 520;
  const rich = line.tone === "answer" || line.event.kind === "a2a.reply" || line.event.kind === "a2a.receive";
  return (
    <li className={`ib-line tone-${line.tone}`} title={line.event.span_id ? `span ${line.event.span_id}` : undefined}>
      <div className="ib-line-head">
        <span className="ib-time">{seconds(line.event, start)}</span>
        <span className="ib-tag">{line.tag}</span>
        <span className="ib-title">{line.title}</span>
        {line.hidden && <button className="ib-mini" onClick={onToggle} aria-expanded={expanded}>{expanded ? "Hide" : "Show"}</button>}
        {line.sources.length > 0 && <button className="ib-mini ib-source" onClick={() => onSource(line.sources)} aria-label={`Source for: ${line.title}`}><CodeXml size={13} /></button>}
      </div>
      {line.body && <div className={`ib-body ${long && !expanded ? "clamped" : ""}`}>{rich ? <Rich text={line.body} /> : line.body}</div>}
      {long && !line.hidden && <button className="ib-more" onClick={onToggle}>{expanded ? "Show less" : "Show all"}</button>}
      {line.code && <pre className="ib-code">{line.code}</pre>}
      {line.hidden && expanded && <pre className="ib-code">{line.hidden.length > 6000 ? `${line.hidden.slice(0, 6000)}\n…` : line.hidden}</pre>}
    </li>
  );
}

function useStickToBottom(dep: number) {
  const ref = useRef<HTMLOListElement>(null);
  const stick = useRef(true);
  useEffect(() => { const el = ref.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [dep]);
  const onScroll = () => { const el = ref.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
  return { ref, onScroll };
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
        {lines.length ? lines.map((line) => <TerminalLine key={line.event.id} line={line} start={run?.started_at} expanded={expanded.has(line.event.id)} onToggle={() => toggle(line.event.id)} onSource={onSource} />)
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
        {lines.length ? lines.map((line) => <TerminalLine key={line.event.id} line={line} start={run?.started_at} expanded={expanded.has(line.event.id)} onToggle={() => toggle(line.event.id)} onSource={onSource} />)
          : <li className="ib-empty">Gateway inspections appear here as each message crosses a listener.</li>}
      </ol>
    </section>
  );
}

export default function InterbankDemo({ embedded = false }: InterbankDemoProps) {
  const [labUp, setLabUp] = useState<boolean | null>(null);
  const [runtime, setRuntime] = useState<Runtime | null>(null);
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [scenario, setScenario] = useState("allowed");
  const [prompt, setPrompt] = useState("");
  const [history, setHistory] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<LabEvent[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
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

  useEffect(() => {
    if (!runId) return;
    let live = true, total = 0, finishedAt = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(`/api/interbank/runs/${runId}?after=${total}`, { signal: AbortSignal.timeout(10000) });
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as { run: Run; events: LabEvent[]; total: number };
        if (!live) return;
        total = body.total;
        setRun(body.run);
        if (body.events.length) setEvents((previous) => {
          const seen = new Set(previous.map((e) => e.id));
          return [...previous, ...body.events.filter((e) => !seen.has(e.id))];
        });
        if (body.run.status !== "running") {
          finishedAt ||= Date.now();
          if (Date.now() - finishedAt > 3000) { loadHistory(); return; }
        }
      } catch {
        if (live) setError("Lost contact with the interbank lab. Check npm run interbank:status.");
      }
      if (live) timer = setTimeout(poll, 1000);
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [runId, loadHistory]);

  useEffect(() => {
    if (shown === null || shown >= events.length) return;
    const timer = setTimeout(() => setShown((value) => (value === null ? null : value + 1)), 160);
    return () => clearTimeout(timer);
  }, [shown, events.length]);

  function open(id: string, replay: boolean) {
    setEvents([]); setRun(null); setExpanded(new Set()); setError("");
    setShown(replay ? 0 : null);
    setRunId(id);
  }

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

  const toggle = (id: string) => setExpanded((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  const visible = useMemo(() => (shown === null ? events : events.slice(0, shown)), [events, shown]);
  const lanes = useMemo(() => {
    const out: Record<Lane, Line[]> = { a: [], wire: [], b: [] };
    for (const event of visible) { const line = toLine(event); if (line) out[laneOf(event)].push(line); }
    return out;
  }, [visible]);
  const replaying = shown !== null && shown < events.length;
  const effectiveRun = run && replaying ? { ...run, status: "running" as const } : run;
  const lastAgentLane = [...visible].reverse().map(laneOf).find((lane) => lane !== "wire");
  const counts = useMemo(() => ({
    inspections: visible.filter((e) => e.kind === "guardrail").length,
    blocked: visible.filter((e) => e.kind === "guardrail" && e.status !== "allowed").length + visible.filter((e) => e.kind === "control" && e.status === "denied").length,
    controls: visible.filter((e) => e.kind === "control").length,
    hops: visible.filter((e) => e.kind === "a2a.send").length,
    queries: visible.filter((e) => e.kind === "db.query").length,
    thoughts: visible.filter((e) => e.kind === "agent.thinking").length,
  }), [visible]);
  const traceId = run?.trace_id ?? visible.find((e) => e.trace_id)?.trace_id;
  const done = effectiveRun && effectiveRun.status !== "running";

  return (
    <div className={`banking-demo interbank-demo ${embedded ? "banking-embedded" : ""}`}>
      <section className="ib-controls proof-card">
        <div className="ib-controls-head">
          <div>
            <span className="review-kicker">OPERATIONS DESK · BANK A</span>
            <h3>Investigate a failed settlement with the counterparty&apos;s agent</h3>
            <p>The kickoff is an A2A message to Bank A&apos;s Deep Agent through Bank A&apos;s gateway. Bank A&apos;s agent decides when to ask Bank B&apos;s agent over A2A. Both agents are read-only; people approve any fix.</p>
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
          {replaying && <button className="ib-mini" onClick={() => setShown(null)}><RotateCcw size={13} /> Skip replay</button>}
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
            <span className={`ib-status ${run.status}`}>{run.status === "completed" ? "Completed" : run.status === "blocked" ? "Blocked at Bank A's gateway" : "Failed"}</span>
            <Report run={run} />
          </> : <p>{effectiveRun ? "The report appears when Bank A's agent replies to the Ops desk." : "Start or replay an investigation to see the joint report."}</p>}
        </div>
        <aside className="ib-side">
          <div className="proof-card ib-trace">
            <span className="review-kicker">SPLUNK AGENT OBSERVABILITY</span>
            <dl className="fact-grid">
              <div><dt>Session</dt><dd><code>{run?.id ?? "—"}</code></dd></div>
              <div><dt>Trace</dt><dd><code>{traceId ?? "—"}</code></dd></div>
              <div><dt>Project</dt><dd>{runtime?.observability.project ?? "—"}</dd></div>
              <div><dt>Agent Stream</dt><dd>{runtime?.observability.agent_stream ?? "—"}</dd></div>
            </dl>
            <div className="ib-counts">
              <span><strong>{counts.inspections}</strong> AI Defense inspections</span>
              <span><strong>{counts.controls}</strong> Agent Control checks</span>
              <span><strong>{counts.hops}</strong> A2A sends</span>
              <span><strong>{counts.queries}</strong> SQL queries</span>
              <span><strong>{counts.thoughts}</strong> reasoning summaries</span>
              <span className={counts.blocked ? "deny" : ""}><strong>{counts.blocked}</strong> blocked</span>
            </div>
            <p>One trace covers the Ops desk, both gateways, every AI Defense hop, both Deep Agents, every LLM and tool call, and each control execution. The session is the run ID.</p>
            {runtime?.observability.console_url && <a href={runtime.observability.console_url} target="_blank" rel="noreferrer">Open Splunk Agent Observability <ArrowUpRight size={14} /></a>}
            {run && <small>Check the trace from a terminal: <code>npm run interbank:verify -- {run.id}{run.status === "blocked" ? " blocked" : ""}</code></small>}
          </div>
          {runtime && <div className="proof-card ib-runtime">
            <span className="review-kicker">RUNTIME</span>
            <dl className="fact-grid">
              <div><dt>Model</dt><dd>{runtime.model.name} · {runtime.model.api}</dd></div>
              <div><dt>Reasoning</dt><dd>{runtime.model.reasoning_effort} effort · {runtime.model.reasoning_summary} summaries</dd></div>
              <div><dt>Agents</dt><dd>{runtime.agents.framework} · {runtime.agents.protocol}</dd></div>
              <div><dt>Gateway</dt><dd>{runtime.gateway.product} · {runtime.gateway.transport}</dd></div>
              <div><dt>AI Defense</dt><dd>{runtime.ai_defense.mode}{runtime.ai_defense.region ? ` · ${runtime.ai_defense.region}` : ""}</dd></div>
              <div><dt>Agent Control</dt><dd>{runtime.agent_control.execution} · {runtime.agent_control.step} · {runtime.agent_control.stage}</dd></div>
            </dl>
          </div>}
        </aside>
      </section>

      <section className="proof-card ib-integrations" aria-label="Integration points">
        <div className="ib-integrations-head">
          <span className="review-kicker"><SquareTerminal size={13} /> INTEGRATION POINTS · SOURCE AND CONFIGURATION</span>
          <p>Every <CodeXml size={13} /> button opens the same captured excerpt the architecture map cites, and says when the file has changed since.</p>
        </div>
        <div className="ib-integration-grid">
          {INTEGRATION_POINTS.map((point) => (
            <article key={point.integration} className={`integration-${point.integration}`}>
              <strong>{point.title}</strong>
              <p>{point.detail}</p>
              <div>{point.ids.map((id) => <button key={id} onClick={() => openSources([id])}><CodeXml size={13} /> {EVIDENCE[id]?.title ?? id}</button>)}</div>
            </article>
          ))}
        </div>
      </section>
      {viewer && <EvidencePanel viewer={viewer} onSelect={(current) => setViewer({ ...viewer, current })} onClose={closeSources} />}
    </div>
  );
}
