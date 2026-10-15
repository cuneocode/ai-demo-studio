"use client";

import { Fragment, useState, type ReactNode } from "react";
import { CodeXml } from "lucide-react";
import type { AnchorId } from "../guide/anchors";
import { laneOf, offset, type RunEvent, type RunLane, type ServedBy } from "./events";
import { useStickToBottom } from "./useRun";
import "./run.css";

/** body: always shown (clamped when long) · code: always shown · hidden: revealed on demand. */
export type TimelineLine = {
  event: RunEvent; tag: string; tone: string; title: string;
  body?: string; code?: string; hidden?: string; sources?: string[]; rich?: boolean;
};
export type ToLine = (event: RunEvent) => TimelineLine | null;

export const LANE_LABEL: Record<RunLane, string> = { agent: "Agent", tools: "Tools", model: "Model", security: "Security", human: "Human" };

const text = (value: unknown) => (typeof value === "string" ? value : value == null ? "" : JSON.stringify(value, null, 2));

/** The default rendering of every Appendix B kind; demos pass their own toLine for domain wording. */
export function defaultLine(event: RunEvent): TimelineLine | null {
  const data = event.data ?? {};
  const body = event.body ?? "";
  const line = (tag: string, tone: string, extra: Partial<TimelineLine> = {}): TimelineLine => ({ event, tag, tone, title: event.title, ...extra });
  const denied = event.status === "denied" || event.status === "blocked" || event.status === "error";
  switch (event.kind) {
    case "agent.thinking": return line("THINK", "think", { body });
    case "agent.tool_call": return line("TOOL", "tool", { body: body || undefined, hidden: data.arguments ? text(data.arguments) : undefined });
    case "tool.result": return line("RESULT", denied ? "warn" : "result", { hidden: body || undefined });
    case "agent.message": return line("ANSWER", "answer", { body, rich: true });
    case "llm.call": {
      const served = data.served_by as ServedBy | undefined;
      const tokens = [data.input_tokens, data.output_tokens].every((value) => typeof value === "number") ? ` · ${data.input_tokens} in / ${data.output_tokens} out` : "";
      return line("MODEL", denied ? "deny" : "model", { title: served ? `${event.title} · ${served.label}${served.model ? ` (${served.model})` : ""}${tokens}` : `${event.title}${tokens}` });
    }
    case "model.failover": return line("FAILOVER", "warn", { body });
    case "guardrail": return line("AI DEFENSE", event.status === "allowed" || event.status === "ok" ? "ok" : event.status === "flagged" ? "warn" : "deny", { body, hidden: data.raw ? text(data.raw) : undefined });
    case "control": return line("CONTROL", event.status === "denied" ? "deny" : "ok", { body });
    case "hitl.request": return line("APPROVAL", "human", { body });
    case "hitl.decision": return line("DECISION", event.status === "denied" ? "deny" : "human", { body });
    case "claim.verdict": return line("CHECK", event.status === "ok" ? "ok" : event.status === "flagged" ? "warn" : "deny", { body });
    case "result": return line("RESULT", denied ? "deny" : "answer", { body, rich: true });
    case "run": return line("RUN", denied ? "deny" : "a2a", event.status === "started" ? { body } : {});
    case "db.query": return null;
    default: return line(event.kind.toUpperCase(), "result", { body });
  }
}

function inline(value: string): ReactNode[] {
  return value.split(/(\*\*[^*]+\*\*)/g).map((part, i) => part.length > 4 && part.startsWith("**") && part.endsWith("**") ? <strong key={i}>{part.slice(2, -2)}</strong> : <Fragment key={i}>{part}</Fragment>);
}

/** Headings, bullets, and bold: enough for agent reports without a Markdown dependency. */
export function RichText({ text: source }: { text: string }) {
  const blocks: ReactNode[] = [];
  let bullets: string[] = [];
  const flush = () => { if (bullets.length) blocks.push(<ul key={blocks.length}>{bullets.map((b, i) => <li key={i}>{inline(b)}</li>)}</ul>); bullets = []; };
  for (const raw of source.split("\n")) {
    const lineText = raw.trimEnd();
    const bullet = /^\s*[-*]\s+(.*)$/.exec(lineText);
    if (bullet) { bullets.push(bullet[1]); continue; }
    flush();
    const heading = /^#{1,4}\s+(.*)$/.exec(lineText);
    if (heading) blocks.push(<h4 key={blocks.length}>{inline(heading[1])}</h4>);
    else if (lineText.trim()) blocks.push(<p key={blocks.length}>{inline(lineText)}</p>);
  }
  flush();
  return <div className="rt-rich">{blocks}</div>;
}

export function TimelineItem({ line, start, expanded, onToggle, onSource, showLane = false }: {
  line: TimelineLine; start?: string; expanded: boolean; onToggle: () => void; onSource?: (ids: string[]) => void; showLane?: boolean;
}) {
  const long = (line.body?.length ?? 0) > 520;
  const lane = laneOf(line.event);
  return (
    <li className={`rt-line tone-${line.tone}`} data-kind={line.event.kind} title={line.event.span_id ? `span ${line.event.span_id}` : undefined}>
      <div className="rt-line-head">
        <span className="rt-time">{offset(line.event, start)}</span>
        <span className="rt-tag">{line.tag}</span>
        {showLane && <span className={`rt-lane lane-${lane}`}>{LANE_LABEL[lane]}</span>}
        <span className="rt-title">{line.title}</span>
        {line.hidden && <button className="rt-mini" onClick={onToggle} aria-expanded={expanded}>{expanded ? "Hide" : "Show"}</button>}
        {onSource && line.sources?.length ? <button className="rt-mini rt-source" onClick={() => onSource(line.sources!)} aria-label={`Source for: ${line.title}`}><CodeXml size={13} /></button> : null}
      </div>
      {line.body && <div className={`rt-body ${long && !expanded ? "clamped" : ""}`}>{line.rich ? <RichText text={line.body} /> : line.body}</div>}
      {long && !line.hidden && <button className="rt-more" onClick={onToggle}>{expanded ? "Show less" : "Show all"}</button>}
      {line.code && <pre className="rt-code">{line.code}</pre>}
      {line.hidden && expanded && <pre className="rt-code">{line.hidden.length > 6000 ? `${line.hidden.slice(0, 6000)}\n…` : line.hidden}</pre>}
    </li>
  );
}

/** Expanded-line state shared by several timelines on one page (interbank's three lanes). */
export function useExpanded() {
  const [expanded, setExpanded] = useState<Set<string>>(new Set());
  const toggle = (id: string) => setExpanded((previous) => { const next = new Set(previous); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  return { expanded, toggle, reset: () => setExpanded(new Set()) };
}

export type RunTimelineProps = {
  /** Accessible name of the list, e.g. "Fraud triage steps". */
  label: string;
  anchor?: AnchorId;
  events: RunEvent[];
  /** The run's started_at, for "+1.2s" offsets. */
  start?: string;
  toLine?: ToLine;
  /** Show only these lanes (default all). */
  lanes?: RunLane[];
  /** Show a lane tag on each line (Agent · Tools · Model · Security · Human). */
  showLane?: boolean;
  empty?: ReactNode;
  onSource?: (ids: string[]) => void;
  className?: string;
  expanded?: Set<string>;
  onToggle?: (id: string) => void;
};

/** A streamed run timeline: one line per event, newest pinned at the bottom, announced politely. */
export default function RunTimeline({ label, anchor, events, start, toLine = defaultLine, lanes, showLane = false, empty, onSource, className = "", expanded: controlled, onToggle }: RunTimelineProps) {
  const own = useExpanded();
  const expanded = controlled ?? own.expanded;
  const toggle = onToggle ?? own.toggle;
  const lines = events.filter((event) => !lanes || lanes.includes(laneOf(event))).map(toLine).filter((line): line is TimelineLine => line !== null);
  const { ref, onScroll } = useStickToBottom(lines.length);
  return (
    <ol tabIndex={0} ref={ref} onScroll={onScroll} className={`rt-list ${className}`} aria-label={label} aria-live="polite" aria-relevant="additions" data-guide={anchor}>
      {lines.length ? lines.map((line) => <TimelineItem key={line.event.id} line={line} start={start} expanded={expanded.has(line.event.id)} onToggle={() => toggle(line.event.id)} onSource={onSource} showLane={showLane} />)
        : <li className="rt-empty">{empty ?? "Steps appear here as the run proceeds."}</li>}
    </ol>
  );
}
