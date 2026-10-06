import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ReactFlowProvider } from "@xyflow/react";
import { Play, ShieldAlert } from "lucide-react";
import { api, type DemoEvent, type Run, type Telemetry } from "./api";
import { COMPONENTS, eventFootprint } from "./architecture";
import { ArchitectureMap } from "./Map";
import { Timeline } from "./Timeline";
import { ComponentInspector, EventInspector, RunOverview } from "./Inspector";

export function App() {
  const [examples, setExamples] = useState<Record<string, string>>({});
  const [runs, setRuns] = useState<Run[]>([]);
  const [runId, setRunId] = useState<string | null>(null);
  const [run, setRun] = useState<Run | null>(null);
  const [events, setEvents] = useState<DemoEvent[]>([]);
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [selectedEvent, setSelectedEvent] = useState<string | null>(null);
  const [showTelemetry, setShowTelemetry] = useState(false);
  const [custom, setCustom] = useState("");
  const [error, setError] = useState<string | null>(null);
  const received = useRef(0);

  useEffect(() => {
    api.examples().then(setExamples).catch((e) => setError(String(e)));
    api.telemetry().then(setTelemetry).catch(() => undefined);
    api.runs().then((all) => {
      setRuns(all);
      if (all[0]) setRunId(all[0].id);
    });
  }, []);

  useEffect(() => {
    received.current = 0;
    setEvents([]);
    setRun(null);
    setSelectedEvent(null);
    if (!runId) return;
    let live = true;
    let timer: number | undefined;
    const poll = async () => {
      try {
        const data = await api.run(runId, received.current);
        if (!live) return;
        received.current = data.total;
        setRun(data.run);
        if (data.events.length) setEvents((prev) => [...prev, ...data.events]);
        if (data.run.status === "running") timer = window.setTimeout(poll, 1200);
        else api.runs().then(setRuns);
      } catch (e) {
        if (live) setError(String(e));
      }
    };
    poll();
    return () => {
      live = false;
      window.clearTimeout(timer);
    };
  }, [runId]);

  const start = useCallback(async (prompt: string) => {
    setError(null);
    try {
      const created = await api.kickoff(prompt);
      setRuns((prev) => [created, ...prev]);
      setRunId(created.id);
      setSelectedNode(null);
    } catch (e) {
      setError(String(e));
    }
  }, []);

  const ordered = useMemo(() => [...events].sort((a, b) => a.at.localeCompare(b.at)), [events]);

  const highlight = useMemo(() => {
    const used = new Set<string>();
    const denied = new Set<string>();
    for (const e of ordered) {
      const fp = eventFootprint(e);
      fp.links.forEach((l) => used.add(l));
      if (e.status === "denied") [...fp.links, ...fp.nodes].forEach((x) => denied.add(x));
    }
    const focus = selectedEvent
      ? ordered.filter((e) => e.id === selectedEvent)
      : run?.status === "running"
        ? ordered.slice(-3)
        : [];
    const active = new Set<string>();
    const activeNodes = new Set<string>();
    for (const e of focus) {
      const fp = eventFootprint(e);
      fp.links.forEach((l) => active.add(l));
      fp.nodes.forEach((n) => activeNodes.add(n));
    }
    return { used, denied, active, activeNodes };
  }, [ordered, selectedEvent, run?.status]);

  const component = COMPONENTS.find((c) => c.id === selectedNode);
  const event = ordered.find((e) => e.id === selectedEvent);

  return (
    <div className="app">
      <header className="topbar">
        <div className="brand">
          <span className="mark" aria-hidden>
            <span />
            <span />
            <span />
          </span>
          <div>
            <h1>Interbank settlement investigation</h1>
            <p>Two banks · LangChain Deep Agents · A2A through each bank's AI gateway · Cisco AI Defense · Splunk Agent Observability</p>
          </div>
        </div>
        <div className="kickoff">
          <button className="primary-button" disabled={!examples.allowed} onClick={() => start(examples.allowed)} title={examples.allowed}>
            <Play size={16} /> Run investigation
          </button>
          <button className="danger-button" disabled={!examples.blocked} onClick={() => start(examples.blocked)} title={examples.blocked}>
            <ShieldAlert size={16} /> Run blocked kickoff
          </button>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (custom.trim()) start(custom.trim());
            }}
          >
            <input value={custom} onChange={(e) => setCustom(e.target.value)} placeholder="Or type your own kickoff…" />
          </form>
          <select value={runId ?? ""} onChange={(e) => setRunId(e.target.value || null)}>
            {runs.length === 0 && <option value="">No runs</option>}
            {runs.map((r) => (
              <option key={r.id} value={r.id}>
                {r.id} · {r.status}
              </option>
            ))}
          </select>
        </div>
      </header>
      {error && <div className="error-bar" onClick={() => setError(null)}>{error}</div>}
      <main className="layout">
        <section className="left">
          <div className="map-panel">
            <div className="map-toolbar">
              <span className="legend">
                <i className="l-a2a" /> A2A path <i className="l-used" /> used in this run <i className="l-denied" /> blocked
                <i className="l-tel" /> telemetry
              </span>
              <label>
                <input type="checkbox" checked={showTelemetry} onChange={(e) => setShowTelemetry(e.target.checked)} /> Show telemetry paths
              </label>
            </div>
            <ReactFlowProvider>
              <ArchitectureMap
                used={highlight.used}
                active={highlight.active}
                denied={highlight.denied}
                activeNodes={highlight.activeNodes}
                selected={selectedNode}
                onSelect={(id) => {
                  setSelectedNode(id);
                  if (id) setSelectedEvent(null);
                }}
                showTelemetry={showTelemetry}
              />
            </ReactFlowProvider>
          </div>
          <Timeline
            events={ordered}
            selected={selectedEvent}
            startedAt={run?.started_at}
            onSelect={(id) => {
              setSelectedEvent(id);
              if (id) setSelectedNode(null);
            }}
          />
        </section>
        <aside className="right">
          {component ? (
            <ComponentInspector component={component} onClose={() => setSelectedNode(null)} />
          ) : event ? (
            <EventInspector event={event} onClose={() => setSelectedEvent(null)} onComponent={(id) => setSelectedNode(id)} />
          ) : (
            <RunOverview run={run} telemetry={telemetry} events={ordered} />
          )}
        </aside>
      </main>
    </div>
  );
}
