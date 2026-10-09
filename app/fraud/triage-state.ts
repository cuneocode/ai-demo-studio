import type { RunEvent, ServedBy } from "../run/events";
import type { FraudCaseHandoff } from "../lifecycle-handoff";

/** Shapes the fraud service (services/fraud/triage.py, tools.py) puts on the shared timeline. */
export type FraudCase = {
  id: string; label: string; account: string; merchant: string; amount: number; channel: string; scenario?: string;
  at?: string; as_of?: string; mcc_label?: string; customer?: string; customer_id?: string; situation?: string; neighborhood?: string;
  scoreable_by_model?: boolean; illustrative?: boolean;
};
export type Scenario = {
  id: string; case_id: string; title: string; situation: string; expected: string; kind: "story" | "illustrative" | "attack";
  model_scope?: string; dispute_text?: string; analyst_note?: string;
};
export type RiskBand = "high" | "elevated" | "low";
export type QueueRow = {
  case: FraudCase; probability: number; risk_band: RiskBand; risk_label: string; rules: { score: number; decision: string };
  suggested_action: string; backend: string; label: string; latency_ms?: number; model_ms?: number | null; device?: string | null;
};
export type GraphNode = { id: string; kind: "merchant" | "scored" | "fraud" | "clean"; label: string; detail?: string; bought_at?: string; confirmed_at?: string };
export type Graph = {
  nodes: GraphNode[]; edges: { source: string; target: string; kind: string }[]; merchant: string; cards_seen: number;
  cards_confirmed_fraud: number; fraud_share?: number | null; dispute_ratio?: number | null; window_days?: number | null;
  as_of?: string; small_auths?: number | null; other_cards_to_reissue?: number | null; shown?: { fraud: number; clean: number; clean_total: number };
  source: string; temporal_filter?: boolean;
};
export type Reason = { code: string; text: string; value: number; feature: string; label: string; direction: "risk" | "protective"; network?: boolean };
export type RulesResult = { score: number; max: number; decision: string; fired: { rule: string; text: string; points: number }[]; thresholds: { review: number; decline: number } };
export type ScoreEvidence = {
  probability: number; risk_band: RiskBand; backend: string; label: string; latency_ms?: number; model_ms?: number | null;
  device?: string | null; recorded_at?: string | null; synthetic?: boolean;
};
export type Verdict = { title: string; status: string; body?: string | null; data: Record<string, unknown>; id: string };
export type HitlRequest = { id: string; requestId: string; title: string; body?: string | null; options: { id: string; label: string; policy?: string }[]; recommended?: string; data: Record<string, unknown> };
export type ActionLog = { id: string; at: string; title: string; status: string; kind: string; body?: string | null };

export type TriageState = {
  scenario?: Scenario;
  queue: QueueRow[];
  opened?: FraudCase;
  score?: ScoreEvidence;
  rules?: RulesResult;
  graph?: Graph;
  reasons?: { reasons: Reason[]; how?: string; method?: string | null };
  similar?: { id: string; summary: string; outcome: string }[];
  playbook?: { title: string; body: string };
  draft?: { action: string; why?: string | null; script?: string };
  dispute?: { text: string; verdict?: Verdict };
  guardrails: Verdict[];
  controls: Verdict[];
  summary?: { text: string; servedBy?: ServedBy | null; mode?: string };
  citations?: { total: number; cited: number };
  servedBy?: ServedBy | null;
  pending: HitlRequest[];
  requests: HitlRequest[];
  decisions: Verdict[];
  audit: ActionLog[];
  result?: Record<string, unknown> & { disposition?: string; handoff?: FraudCaseHandoff | null; duration_ms?: number; investigated_ms?: number };
  handoff?: FraudCaseHandoff;
  reveal?: string;
  notes: Verdict[];
  usage?: { llm_calls?: number; input_tokens?: number; output_tokens?: number; tool_calls?: number };
  security?: Record<string, unknown>;
  agentTrace?: string;
  investigatedMs?: number;
};

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});
const verdict = (event: RunEvent): Verdict => ({ id: event.id, title: event.title, status: event.status, body: event.body, data: event.data ?? {} });

/** Folds the run's events into what the case file renders; a replay folds the same events at recorded pacing. */
export function triageState(events: RunEvent[]): TriageState {
  const state: TriageState = { queue: [], guardrails: [], controls: [], pending: [], requests: [], decisions: [], audit: [], notes: [] };
  const decided = new Set<string>();
  for (const event of events) {
    const data = event.data ?? {};
    const evidence = typeof data.evidence === "string" ? data.evidence : "";
    if (event.kind === "run" && data.scenario && !state.scenario) state.scenario = data.scenario as Scenario;
    if (event.kind === "run" && data.opened) state.opened = data.case as FraudCase;
    if (event.kind === "run" && typeof data.tabformer_label === "string") state.reveal = data.tabformer_label;
    if (data.queue_row) {
      const row = data.queue_row as QueueRow;
      state.queue = [...state.queue.filter((item) => item.case.id !== row.case.id), row];
    }
    if (event.kind === "tool.result") {
      if (evidence === "score") state.score = data as unknown as ScoreEvidence;
      else if (evidence === "rules") state.rules = data as unknown as RulesResult;
      else if (evidence === "neighborhood") state.graph = data.graph as Graph;
      else if (evidence === "reasons") state.reasons = { reasons: (data.reasons as Reason[]) ?? [], how: data.how as string, method: data.method as string | null };
      else if (evidence === "similar") state.similar = (data.cases as TriageState["similar"]) ?? [];
      else if (evidence.startsWith("playbook#")) state.playbook = { title: event.title.replace(/^Playbook · /, ""), body: event.body ?? "" };
      else if (evidence === "draft") state.draft = { action: String(data.recommended ?? ""), why: event.body, script: data.outreach_script as string };
      if (data.tool === "get_dispute") state.dispute = { text: event.body ?? "" };
      if (data.tool === "add_note") state.notes.push(verdict(event));
      if (data.handoff) state.handoff = data.handoff as FraudCaseHandoff;
      if (data.tool === "take_action") state.audit.push({ id: event.id, at: event.at, title: event.title, status: event.status, kind: "action" });
    }
    if (event.kind === "guardrail") {
      state.guardrails.push(verdict(event));
      if (data.stage === "dispute_text" && state.dispute) state.dispute.verdict = verdict(event);
      if (data.stage === "analyst_note") state.notes.push(verdict(event));
    }
    if (event.kind === "control") {
      state.controls.push(verdict(event));
      if (data.policy === "fraud.note_pii") state.notes.push(verdict(event));
      else state.audit.push({ id: event.id, at: event.at, title: event.title, status: event.status, kind: "policy", body: event.body });
    }
    if (event.kind === "llm.call" && data.served_by) state.servedBy = data.served_by as ServedBy;
    if (event.kind === "agent.message") state.summary = { text: event.body ?? "", servedBy: (data.served_by as ServedBy) ?? null, mode: data.mode as string };
    if (event.kind === "claim.verdict") {
      const citations = record(data.citations);
      state.citations = { total: Number(citations.total ?? 0), cited: Number(citations.cited ?? 0) };
    }
    if (event.kind === "hitl.request") {
      const request: HitlRequest = {
        id: event.id, requestId: String(data.request_id ?? ""), title: event.title, body: event.body,
        options: (data.options as HitlRequest["options"]) ?? [], recommended: data.recommended as string | undefined, data,
      };
      state.requests.push(request);
      if (data.usage) state.usage = data.usage as TriageState["usage"];
      if (data.security) state.security = record(data.security);
      if (typeof data.agent_trace === "string") state.agentTrace = data.agent_trace;
      if (typeof data.investigated_ms === "number") state.investigatedMs = data.investigated_ms;
    }
    if (event.kind === "hitl.decision") {
      decided.add(String(data.request_id ?? ""));
      state.decisions.push(verdict(event));
      state.audit.push({ id: event.id, at: event.at, title: event.title, status: event.status, kind: "decision", body: typeof data.note === "string" ? data.note : null });
    }
    if (event.kind === "result") {
      state.result = data as TriageState["result"];
      if (data.usage) state.usage = data.usage as TriageState["usage"];
      if (data.security) state.security = record(data.security);
      if (data.handoff) state.handoff = data.handoff as FraudCaseHandoff;
    }
  }
  state.pending = state.requests.filter((request) => !decided.has(request.requestId) && !state.result);
  return state;
}
