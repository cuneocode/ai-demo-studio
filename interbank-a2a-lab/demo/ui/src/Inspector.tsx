import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { api, type DemoEvent, type Run, type Source, type Telemetry } from "./api";
import { COMPONENTS, ORG_LABEL, type Component } from "./architecture";
import { CodeView } from "./CodeView";

const sourceCache = new Map<string, Promise<Source>>();
const loadSource = (id: string) => {
  if (!sourceCache.has(id)) sourceCache.set(id, api.source(id));
  return sourceCache.get(id)!;
};

export function ComponentInspector({ component, onClose }: { component: Component; onClose: () => void }) {
  const [tab, setTab] = useState(component.sources[0]);
  const [source, setSource] = useState<Source | null>(null);
  const [titles, setTitles] = useState<Record<string, string>>({});

  useEffect(() => setTab(component.sources[0]), [component]);
  useEffect(() => {
    Promise.all(component.sources.map(loadSource)).then((all) =>
      setTitles(Object.fromEntries(all.map((s) => [s.id, s.path.split("/").pop() ?? s.path]))),
    );
  }, [component]);
  useEffect(() => {
    setSource(null);
    if (tab) loadSource(tab).then(setSource);
  }, [tab]);

  return (
    <div className="inspector">
      <header className="inspector-head">
        <div>
          <span className={`org-pill org-${component.org}`}>{ORG_LABEL[component.org]}</span>
          <h2>{component.label}</h2>
          <p className="sub">{component.subtitle}</p>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>
      <div className="inspector-scroll">
        <p className="summary">{component.summary}</p>
        {component.enforcement && (
          <div className="enforcement">
            {component.enforcement.map((item) => (
              <span key={item} className="chip enforce">{item}</span>
            ))}
          </div>
        )}
        {component.facts.length > 0 && (
          <dl className="facts">
            {component.facts.map((f) => (
              <div key={f.label}>
                <dt>{f.label}</dt>
                <dd>{f.value}</dd>
              </div>
            ))}
          </dl>
        )}
        {component.routes && (
          <div className="routes">
            <h3>Listeners and routes</h3>
            {component.routes.map((r) => (
              <div key={r.listener} className="route">
                <div className="route-head">
                  <code>{r.listener}</code>
                  <span>{r.from} → {r.to}</span>
                </div>
                <ul>
                  {r.checks.map((c) => (
                    <li key={c}>{c}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        )}
        {component.sources.length > 0 && (
          <div className="sources">
            <div className="tabs">
              {component.sources.map((id) => (
                <button key={id} className={id === tab ? "active" : ""} onClick={() => setTab(id)}>
                  {titles[id] ?? id}
                  <small>{id}</small>
                </button>
              ))}
            </div>
            {source ? (
              <>
                <p className="source-title">{source.title}</p>
                <CodeView source={source} />
              </>
            ) : (
              <p className="muted">Loading source…</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function EventInspector({ event, onClose, onComponent }: { event: DemoEvent; onClose: () => void; onComponent: (id: string) => void }) {
  const involved = COMPONENTS.filter((c) => [event.component, event.source, event.target].includes(c.id));
  const { arguments: args, result, ...rest } = event.data as Record<string, unknown>;
  return (
    <div className="inspector">
      <header className="inspector-head">
        <div>
          <span className={`chip ${event.status}`}>{event.kind} · {event.status}</span>
          <h2>{event.title}</h2>
          <p className="sub">
            {event.source} → {event.target ?? event.component} · {new Date(event.at).toLocaleTimeString()}
          </p>
        </div>
        <button className="icon" onClick={onClose} aria-label="Close">
          <X size={18} />
        </button>
      </header>
      <div className="inspector-scroll">
        <dl className="facts">
          <div><dt>Reported by</dt><dd>{event.component}</dd></div>
          <div><dt>Trace ID</dt><dd className="mono">{event.trace_id ?? "—"}</dd></div>
          <div><dt>Span ID</dt><dd className="mono">{event.span_id ?? "—"}</dd></div>
        </dl>
        <div className="enforcement">
          {involved.map((c) => (
            <button key={c.id} className="chip link" onClick={() => onComponent(c.id)}>Open {c.label}</button>
          ))}
        </div>
        {event.body && (
          <>
            <h3>Content</h3>
            <pre className="block">{event.body}</pre>
          </>
        )}
        {args !== undefined && (
          <>
            <h3>Tool arguments</h3>
            <pre className="block">{JSON.stringify(args, null, 2)}</pre>
          </>
        )}
        {result !== undefined && (
          <>
            <h3>Result</h3>
            <pre className="block">{typeof result === "string" ? result : JSON.stringify(result, null, 2)}</pre>
          </>
        )}
        {Object.keys(rest).length > 0 && (
          <>
            <h3>Details</h3>
            <pre className="block">{JSON.stringify(rest, null, 2)}</pre>
          </>
        )}
      </div>
    </div>
  );
}

export function RunOverview({ run, telemetry, events }: { run: Run | null; telemetry: Telemetry | null; events: DemoEvent[] }) {
  const count = (kind: string, status?: string) => events.filter((e) => e.kind === kind && (!status || e.status === status)).length;
  return (
    <div className="inspector">
      <header className="inspector-head">
        <div>
          <span className="org-pill org-shared">Investigation</span>
          <h2>{run ? run.id : "No investigation yet"}</h2>
          <p className="sub">{run ? `Started ${new Date(run.started_at).toLocaleTimeString()}` : "Start one with the buttons above"}</p>
        </div>
        {run && <span className={`status-badge ${run.status}`}>{run.status}</span>}
      </header>
      <div className="inspector-scroll">
        {run && (
          <>
            <h3>Kickoff</h3>
            <pre className="block">{run.prompt}</pre>
            <div className="stats">
              <Stat label="A2A messages" value={count("a2a.send")} />
              <Stat label="AI Defense checks" value={count("guardrail")} />
              <Stat label="AI Defense blocks" value={count("guardrail", "denied")} tone="denied" />
              <Stat label="Agent Control checks" value={count("control")} />
              <Stat label="SQL queries" value={count("db.query")} />
            </div>
            {run.report && (
              <>
                <h3>{run.status === "blocked" ? "Gateway response" : "Bank A report"}</h3>
                <pre className={`block ${run.status === "blocked" ? "denied" : ""}`}>{pretty(run.report)}</pre>
              </>
            )}
          </>
        )}
        {telemetry && (
          <>
            <h3>Splunk Agent Observability</h3>
            <dl className="facts">
              <div><dt>Project</dt><dd>{telemetry.project}</dd></div>
              <div><dt>Agent Stream</dt><dd>{telemetry.agent_stream}</dd></div>
              <div><dt>Session</dt><dd className="mono">{run?.id ?? "—"}</dd></div>
              <div><dt>Trace ID</dt><dd className="mono">{run?.trace_id ?? "—"}</dd></div>
            </dl>
            {telemetry.console_url && (
              <a className="secondary-button" href={telemetry.console_url} target="_blank" rel="noreferrer">
                Open Splunk Agent Observability
              </a>
            )}
          </>
        )}
        <p className="muted hint">Click any component on the map for its code and configuration, or any timeline event for its full content.</p>
      </div>
    </div>
  );
}

function Stat({ label, value, tone }: { label: string; value: number; tone?: string }) {
  return (
    <div className={`stat ${tone && value ? tone : ""}`}>
      <strong>{value}</strong>
      <span>{label}</span>
    </div>
  );
}

function pretty(text: string) {
  try {
    return JSON.stringify(JSON.parse(text), null, 2);
  } catch {
    return text;
  }
}
