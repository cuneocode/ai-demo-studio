import { useEffect, useRef, useState } from "react";
import type { DemoEvent } from "./api";

const KIND: Record<string, string> = {
  run: "Run",
  "a2a.send": "A2A send",
  "a2a.receive": "A2A receive",
  "a2a.respond": "A2A respond",
  "a2a.reply": "A2A reply",
  "a2a.denied": "Gateway denied",
  "agent.tool_call": "Tool call",
  "agent.message": "Agent answer",
  "tool.result": "Tool result",
  "db.query": "SQL",
  guardrail: "Cisco AI Defense",
  control: "Agent Control",
};

const FILTERS: Record<string, (e: DemoEvent) => boolean> = {
  All: () => true,
  "A2A messages": (e) => e.kind.startsWith("a2a.") || e.kind === "run",
  Enforcement: (e) => e.kind === "guardrail" || e.kind === "control" || e.kind === "a2a.denied" || e.status === "denied",
  "Agent work": (e) => e.kind.startsWith("agent.") || e.kind === "tool.result" || e.kind === "db.query",
};

const OPEN_BY_DEFAULT = new Set(["run", "a2a.send", "a2a.receive", "a2a.respond", "a2a.reply", "a2a.denied", "agent.message"]);

export function Timeline({
  events,
  selected,
  onSelect,
  startedAt,
}: {
  events: DemoEvent[];
  selected: string | null;
  onSelect: (id: string | null) => void;
  startedAt?: string;
}) {
  const [filter, setFilter] = useState("All");
  const [follow, setFollow] = useState(true);
  const list = useRef<HTMLDivElement>(null);
  const t0 = startedAt ? Date.parse(startedAt) : events[0] ? Date.parse(events[0].at) : 0;
  const shown = events.filter(FILTERS[filter]);

  useEffect(() => {
    if (follow && list.current) list.current.scrollTop = list.current.scrollHeight;
  }, [events.length, follow]);

  return (
    <section className="timeline">
      <header>
        <h2>Message timeline</h2>
        <span className="count">{events.length} events</span>
        <div className="segmented">
          {Object.keys(FILTERS).map((name) => (
            <button key={name} className={filter === name ? "active" : ""} onClick={() => setFilter(name)}>
              {name}
            </button>
          ))}
        </div>
        <label className="follow">
          <input type="checkbox" checked={follow} onChange={(e) => setFollow(e.target.checked)} /> Follow
        </label>
      </header>
      <div className="events" ref={list}>
        {shown.length === 0 && <p className="empty">Start an investigation to see every A2A message, tool call, query and guardrail verdict here.</p>}
        {shown.map((event) => (
          <EventRow key={event.id} event={event} t0={t0} selected={selected === event.id} onSelect={onSelect} />
        ))}
      </div>
    </section>
  );
}

function EventRow({ event, t0, selected, onSelect }: { event: DemoEvent; t0: number; selected: boolean; onSelect: (id: string | null) => void }) {
  const [open, setOpen] = useState(OPEN_BY_DEFAULT.has(event.kind) || event.status === "denied");
  const seconds = ((Date.parse(event.at) - t0) / 1000).toFixed(1);
  const lane = event.component.startsWith("bank-a") ? "bank-a" : event.component.startsWith("bank-b") ? "bank-b" : "console";
  const args = event.data?.arguments as Record<string, unknown> | undefined;
  const detail = event.kind === "agent.tool_call" && args ? String(args.sql ?? args.message ?? JSON.stringify(args, null, 2)) : event.body;
  return (
    <article
      className={`event lane-${lane} status-${event.status} ${selected ? "selected" : ""}`}
      onClick={() => onSelect(selected ? null : event.id)}
    >
      <div className="event-head">
        <span className="t">+{seconds}s</span>
        <span className={`who lane-${lane}`}>{event.component}</span>
        <span className={`kind kind-${event.kind.replace(".", "-")}`}>{KIND[event.kind] ?? event.kind}</span>
        <span className="title">{event.title}</span>
        <Verdict event={event} />
        {detail && (
          <button
            className="toggle"
            onClick={(e) => {
              e.stopPropagation();
              setOpen(!open);
            }}
          >
            {open ? "Hide" : "Show"}
          </button>
        )}
      </div>
      {open && detail && <pre className="event-body">{detail}</pre>}
    </article>
  );
}

function Verdict({ event }: { event: DemoEvent }) {
  if (event.kind === "guardrail") {
    const classes = (event.data.classifications as string[] | undefined) ?? [];
    return (
      <span className={`chip ${event.status}`}>
        {event.data.hop as string} · {event.data.agent_card ? "Agent Card" : (event.data.stage as string)} ·{" "}
        {event.status === "allowed" ? "allowed" : event.status === "denied" ? "BLOCKED" : "error"}
        {classes.length ? ` · ${classes.join(", ")}` : ""}
      </span>
    );
  }
  if (event.kind === "control" || event.kind === "a2a.denied" || event.status === "denied" || event.status === "completed")
    return <span className={`chip ${event.status}`}>{event.status}</span>;
  return null;
}
