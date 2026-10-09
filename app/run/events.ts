/**
 * The shared run event schema (plan Appendix B). Python emits these through
 * services/common/runs.py; the interbank lab's lab/events.py is a subset. One event
 * per agent step, tool call, model call, guardrail verdict, or human decision.
 */

export const RUN_KINDS = [
  "run", "agent.thinking", "agent.tool_call", "agent.message", "tool.result", "llm.call", "guardrail", "control",
  "hitl.request", "hitl.decision", "model.failover", "claim.verdict", "result",
  "a2a.send", "a2a.receive", "a2a.reply", "a2a.respond", "a2a.denied", "db.query",
] as const;
export type RunKind = (typeof RUN_KINDS)[number];
export type RunStatus = "info" | "started" | "ok" | "allowed" | "flagged" | "blocked" | "denied" | "error";
export type RunLane = "agent" | "tools" | "model" | "security" | "human";

/** Which model answered a request (services/llm/studio_models.py Selection.served_by). */
export type ServedBy = {
  provider: string | null; label: string; model: string | null; kind?: string; private?: boolean; external?: boolean;
  fallback?: boolean; reason?: string; source?: "saved" | "default"; egress?: string; ai_defense?: string | null;
};

export type RunEvent = {
  v?: number; id: string; at: string; ns?: number; run_id: string; component: string; kind: RunKind | string;
  status: RunStatus | string; title: string; lane?: RunLane; source?: string | null; target?: string | null;
  body?: string | null; data?: Record<string, unknown>; organization?: string; trace_id?: string; span_id?: string;
};

export type RunInfo = {
  id: string; status: "running" | "completed" | "blocked" | "failed" | string; started_at: string; finished_at?: string | null;
  service?: string; label?: string; scenario?: string; meta?: Record<string, unknown>; result?: unknown;
};

export type RunPage<R extends RunInfo = RunInfo, E extends RunEvent = RunEvent> = { run: R; events: E[]; total: number };

/** One entry of GET /api/<svc>/recordings → {recordings: RecordingMeta[]}. */
export type RecordingMeta = {
  name: string; title: string; scenario?: string | null; recorded_at: string; served_by?: ServedBy | null;
  events: number; duration_ms?: number | null; synthetic?: boolean;
};
/** services/<svc>/data/recorded/<name>.json as written by RunStore.record_golden, served at GET /api/<svc>/recordings/<name>. */
export type Recording<R = unknown> = {
  v?: number; name: string; title: string; scenario?: string | null; recorded_at: string; served_by?: ServedBy | null;
  synthetic?: boolean; note?: string; run?: RunInfo; events: RunEvent[]; result?: R;
};

const LANE_BY_KIND: Record<string, RunLane> = {
  "agent.thinking": "agent", "agent.message": "agent", run: "agent", result: "agent", "claim.verdict": "agent",
  "agent.tool_call": "tools", "tool.result": "tools", "db.query": "tools",
  "llm.call": "model", "model.failover": "model",
  guardrail: "security", control: "security", "a2a.denied": "security",
  "hitl.request": "human", "hitl.decision": "human",
};

export const laneOf = (event: RunEvent): RunLane => event.lane ?? LANE_BY_KIND[event.kind] ?? "agent";

export function offset(event: RunEvent, start?: string) {
  if (!start) return "";
  const delta = (Date.parse(event.at) - Date.parse(start)) / 1000;
  return Number.isFinite(delta) ? `+${Math.max(0, delta).toFixed(1)}s` : "";
}

/** The model that answered last in a run: from llm.call / model.failover events. */
export function servedByFromEvents(events: RunEvent[]): ServedBy | null {
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const served = events[index].data?.served_by;
    if (served && typeof served === "object") return served as ServedBy;
  }
  return null;
}

/** Replay delay before an event: half the recorded gap, clamped so a replay never drags or blurs. */
export function replayDelay(previous: RunEvent | undefined, next: RunEvent, { min = 90, max = 1400 } = {}) {
  if (!previous) return min;
  const gap = Date.parse(next.at) - Date.parse(previous.at);
  return Number.isFinite(gap) ? Math.min(max, Math.max(min, gap / 2)) : min;
}

export function newRunId(prefix: string) {
  const stamp = new Date().toISOString().replace(/[-:TZ.]/g, "").slice(0, 14);
  const random = Math.random().toString(36).slice(2, 8);
  return `${prefix}-${stamp}-${random}`;
}
