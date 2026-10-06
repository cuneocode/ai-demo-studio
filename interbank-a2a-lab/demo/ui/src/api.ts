export type DemoEvent = {
  id: string;
  at: string;
  run_id: string;
  organization: string;
  component: string;
  kind: string;
  status: string;
  title: string;
  source: string;
  target: string | null;
  body: string | null;
  data: Record<string, unknown>;
  trace_id?: string;
  span_id?: string;
};

export type Run = {
  id: string;
  prompt: string;
  status: "running" | "completed" | "blocked" | "failed";
  started_at: string;
  finished_at?: string;
  report?: string;
  trace_id?: string;
};

export type Source = {
  id: string;
  path: string;
  title: string;
  language: string;
  code: string;
  focus: { label: string; start: number; end: number }[];
};

export type Telemetry = { project: string; agent_stream: string; console_url: string };

async function json<T>(response: Response): Promise<T> {
  if (!response.ok) throw new Error(`${response.status} ${await response.text()}`);
  return response.json() as Promise<T>;
}

export const api = {
  examples: () => fetch("/api/examples").then(json<Record<string, string>>),
  runs: () => fetch("/api/runs").then(json<Run[]>),
  run: (id: string, after: number) =>
    fetch(`/api/runs/${id}?after=${after}`).then(json<{ run: Run; events: DemoEvent[]; total: number }>),
  kickoff: (prompt: string) =>
    fetch("/api/kickoff", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ prompt }),
    }).then(json<Run>),
  source: (id: string) => fetch(`/api/sources/${id}`).then(json<Source>),
  telemetry: () => fetch("/api/telemetry").then(json<Telemetry>),
};
