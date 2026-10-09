import { agentTraceIntegration, defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, servedByFrom, traceFacts, usageFrom, type ObservedRun, type StatsCard } from "./RunStats";
import type { FraudCaseHandoff } from "./lifecycle-handoff";
import type { RunEvent, ServedBy } from "./run/events";

export const SAR_API = "/api/sar";
export const INVESTIGATOR = "Theo Marsh";
export const QA_REVIEWER = "Lena Ortiz";
export const SECTION_ORDER = ["who", "what", "when", "where", "why", "how"] as const;

export type Deadline = { detected: string; due: string; as_of: string; day: number; of: number; days_left: number };

export type ScenarioCard = {
  id: string; kind: "case" | "control" | "attack"; title: string; summary: string; case_id: string; label: string;
  subject: { name: string; kind: string }; alert: { id: string; source: string; priority: string }; deadline: Deadline;
  inbound_total?: number; expected?: { typology?: string | null; recommendation?: string; ai_defense?: string[]; policy?: string }; synthetic?: boolean;
};

export type SarHealth = {
  ready: boolean;
  model?: { status: string; label?: string; model?: string | null; private?: boolean | null; fallback?: boolean; reason?: string };
  hosted_fallback?: string;
  security?: { status?: string; mode?: string; fail_open?: boolean };
  controls?: { status: string; names: string[]; detail?: string };
  galileo?: string;
  splunk?: { status?: string };
  recordings?: number;
  filing?: string;
  perimeter?: string;
  detail?: string | null;
  error?: string | null;
};

export type Evidence = { id: string; kind: string; title: string; text: string | null; source: string; untrusted: boolean; withheld: boolean; flagged_by: string[] };
export type Indicator = { id: string; label: string; observed: number | null; observed_text: string; threshold_text: string; status: "fired" | "clear" | "not_applicable" };
export type Typology = { id: string; label: string; reference?: string; matched: boolean; fired: number; total: number; rule: string; indicators: Indicator[] };
export type Sentence = { id: string; section: string; text: string; cites: string[]; valid_cites?: string[]; unverified?: string[]; problems?: string[]; ok?: boolean };
export type Section = { section: string; sentences: Sentence[] };
export type PolicyVerdict = { policy: string; name: string; label: string; allowed: boolean; failed: string[]; engine: "hosted" | "local"; reason: string };

export type Draft = {
  sections: Section[]; dropped: Sentence[]; verification: { total: number; kept: number; failing: number; cited_share: number; missing_sections: string[] };
  recommendation: "file" | "no_file"; indicator_recommendation: "file" | "no_file"; agrees: boolean; rationale: Sentence;
  next_steps: string[]; removed_steps: string[]; policies: PolicyVerdict[]; released: boolean; contact_attempts: number;
};

export type CaseHeader = {
  id: string; label: string; scenario: string; kind: string; title: string;
  subject: { name: string; kind: string; detail?: string; location: string; ssn_masked: string };
  alert: { id: string; detected: string; source: string; summary: string; queue: string; priority: string };
  deadline: Deadline; accounts: string[]; handoff: boolean; synthetic: boolean;
};

export type Security = { mode?: string; status?: string; checks?: number; blocked?: number; errors?: number; withheld_segments?: number; local_flags?: number; event_ids?: string[]; forced?: boolean };

export type AuditEntry = { at: string; actor: string; role: string; action: string; detail: string };

export type SarPackage = {
  case: CaseHeader; mode: "live" | "sample"; typologies: Typology[]; evidence: Evidence[]; security: Security;
  usage: { llm_calls: number; input_tokens: number | null; output_tokens: number | null };
  telemetry: { splunk?: { status?: string; trace_id?: string; span_count?: number }; galileo?: string };
  served_by: ServedBy | null; would_serve: ServedBy | null; duration_ms: number; tools_used: string[];
  draft?: Draft; provenance?: "live" | "sample";
  outcome?: "filed_simulated" | "closed_no_sar" | "open" | "refused" | "blocked" | "failed" | "held"; reason?: string;
  confirmation?: string; final_sections?: Section[];
  decision?: { choice: "file" | "no_file"; rationale: string; investigator: string; qa: string }; audit?: AuditEntry[];
};

export type PendingRequest = { requestId: string; stage: "investigator" | "qa"; round: number; title: string; qaNote?: string | null; decision?: "file" | "no_file"; investigator?: string; rationale?: string; reason?: string };

const record = (value: unknown): Record<string, unknown> => (value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {});

/** The package the service released for review (round-1 hitl.request), or the run result once it finished. */
export function packageFrom(events: RunEvent[], result: unknown): SarPackage | null {
  const finished = record(result);
  if (finished.case && finished.evidence) return finished as unknown as SarPackage;
  for (const event of events) {
    const pkg = record(event.data).package;
    if (event.kind === "hitl.request" && pkg && typeof pkg === "object") return pkg as SarPackage;
  }
  return null;
}

/** The newest human request nobody has answered yet. */
export function pendingRequest(events: RunEvent[]): PendingRequest | null {
  const answered = new Set(events.filter((event) => event.kind === "hitl.decision").map((event) => String(record(event.data).request_id)));
  for (let index = events.length - 1; index >= 0; index -= 1) {
    const event = events[index];
    if (event.kind === "result") return null;
    if (event.kind !== "hitl.request") continue;
    const data = record(event.data);
    const requestId = String(data.request_id ?? "");
    if (!requestId || answered.has(requestId)) return null;
    return {
      requestId, stage: data.stage === "qa" ? "qa" : "investigator", round: Number(data.round) || 1, title: event.title,
      qaNote: typeof data.qa_note === "string" ? data.qa_note : null,
      decision: data.decision === "file" || data.decision === "no_file" ? data.decision : undefined,
      investigator: typeof data.investigator === "string" ? data.investigator : undefined,
      rationale: typeof data.rationale === "string" ? data.rationale : undefined,
      reason: typeof data.reason === "string" ? data.reason : undefined,
    };
  }
  return null;
}

/** Policy verdicts as the timeline reported them, newest last. */
export function controlEvents(events: RunEvent[]) {
  return events.filter((event) => event.kind === "control").map((event) => ({
    id: event.id, title: event.title, allowed: event.status === "allowed", body: event.body ?? "",
    engine: String(record(event.data).engine ?? (event.title.startsWith("Agent Control") ? "hosted" : "local")),
  }));
}

/** The audit trail: the service's once the run finished, otherwise rebuilt from human and policy events. */
export function auditTrail(pkg: SarPackage | null, events: RunEvent[]): AuditEntry[] {
  if (pkg?.audit?.length) return pkg.audit;
  return events.filter((event) => ["hitl.decision", "control", "result"].includes(event.kind) || (event.kind === "hitl.request")).map((event) => {
    const data = record(event.data);
    const role = event.kind === "control" ? "control" : event.kind === "result" ? "system" : data.stage === "qa" ? "qa" : "investigator";
    return { at: event.at, actor: event.kind === "hitl.decision" ? String(data.by ?? "Reviewer") : event.kind === "control" ? "Policy" : "Case", role, action: event.title, detail: event.body ?? String(data.rationale ?? data.note ?? "") };
  });
}

export const shortDate = (iso: string) => {
  const date = new Date(`${iso}T12:00:00Z`);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric", timeZone: "UTC" });
};

/** Only what the referral needs: the service sanitizes again and keeps it as untrusted evidence. */
export function handoffPayload(handoff: FraudCaseHandoff) {
  return {
    id: handoff.id, kind: handoff.kind, createdAt: handoff.createdAt, customerId: handoff.customerId, caseId: handoff.caseId,
    title: handoff.title, summary: handoff.summary, disposition: handoff.disposition, score: handoff.score, band: handoff.band,
    evidence: handoff.evidence.slice(0, 12), transactions: handoff.transactions.slice(0, 12),
  };
}

/** One investigation for the stats row: model calls, tools, time to a reviewable draft, and AI Defense verdicts. */
export function observeSar(run: ObservedRun, pkg: SarPackage, finalStatus?: string): ObservedRun {
  const usage = usageFrom(pkg.usage);
  const security = defenseFrom(pkg.security);
  const status = finalStatus === "blocked" ? "blocked" : finalStatus === "failed" ? "failed" : finalStatus === "running" ? "running" : "completed";
  return {
    ...run, status, durationMs: pkg.duration_ms, ...usage, toolCalls: pkg.tools_used?.length,
    agentTrace: pkg.mode === "sample" ? "disabled" : pkg.telemetry?.galileo, otlp: pkg.mode === "sample" ? "not_configured" : pkg.telemetry?.splunk?.status,
    traceId: pkg.telemetry?.splunk?.trace_id, spans: pkg.telemetry?.splunk?.span_count,
    defense: security, counts: { withheld: pkg.security?.withheld_segments, local: pkg.security?.local_flags },
    servedBy: usage.llmCalls ? servedByFrom(pkg.served_by) ?? null : null,
    provenance: pkg.mode === "sample" ? "sample" : "live",
    note: pkg.mode === "sample" ? "Sample narrative: no model call; tools, checks, and policies ran live." : undefined,
  };
}

export function observeRecordedSar(run: ObservedRun, pkg: SarPackage, recordedAt: string): ObservedRun {
  return { ...observeSar(run, pkg), replay: true, provenance: "recorded", recordedAt, servedBy: servedByFrom(pkg.served_by) ?? null, note: "Recorded run: figures are from the recording, not a call made now." };
}

export function sarStats(health: SarHealth | null, reachable: boolean, link?: string | null): { observability: StatsCard; defense: StatsCard } {
  return {
    observability: {
      integration: agentTraceIntegration(health?.galileo, reachable, link),
      tiles: [
        { label: "LLM calls", value: (run) => run.llmCalls },
        { label: "Tool calls", value: (run) => run.toolCalls },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
        { label: "Time to draft", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "From Investigate to a reviewable, verified draft" },
      ],
      facts: traceFacts,
      source: "From each investigation's review package: model calls and tokens are counted at the model client as the provider reported them.",
    },
    defense: {
      integration: defenseIntegration(health?.security, "customer documents, memos, and hosted model hops", reachable),
      tiles: [...DEFENSE_TILES, { label: "Withheld", value: (run) => run.counts?.withheld, alert: "warn", hint: "Document or memo segments kept from the agent (AI Defense or the local check)" }],
      facts: defenseFacts,
      source: "From the security summary in each review package.",
    },
  };
}
