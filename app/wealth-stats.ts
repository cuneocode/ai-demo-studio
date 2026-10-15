import { agentTraceIntegration, defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, servedByFrom, traceFacts, usageFrom, type Integration, type ObservedRun, type StatsCard } from "./RunStats";

/** Raw wealth health fields: the normalized health rewrites status strings for display. */
export type WealthService = { reachable: boolean; galileo?: string; security?: { status?: string; mode?: string; fail_open?: boolean }; untrusted?: boolean };

export const wealthService = (body: unknown): WealthService => {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return { reachable: true, galileo: typeof value.galileo === "string" ? value.galileo : undefined, security: value.security as WealthService["security"], untrusted: typeof value.untrusted_inspection === "string" && value.untrusted_inspection.startsWith("AI Defense") };
};

/** Untrusted inputs (news, CRM notes) are inspected even when model input and output inspection is off. */
export type WealthDefenseScope = { inputs: string; whenOff: string };

function wealthDefense(service: WealthService | null, reachable: boolean, scope?: WealthDefenseScope): Integration {
  const base = defenseIntegration(service?.security, "model input and output", reachable);
  if (base.state !== "off" || !service?.untrusted || !scope) return base;
  return { state: "on", summary: `On · ${scope.inputs} · model calls off`, notice: `Model input and output inspection is off for this use case; ${scope.whenOff}`, settings: "st-ai-defense" };
}

/** One research or advisory call from the wealth service's response, including refusals. */
export function observeWealth(run: ObservedRun, status: number, payload: unknown): ObservedRun {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const telemetry = (body.telemetry ?? {}) as { galileo?: string; splunk?: { status?: string; trace_id?: string; span_count?: number } };
  const usage = usageFrom(body.usage);
  const toolCalls = (body.usage as { tool_calls?: unknown } | undefined)?.tool_calls;
  // Recordings made before the service skipped empty event IDs still carry "".
  const defense = defenseFrom(body.security);
  return {
    ...run,
    toolCalls: typeof toolCalls === "number" ? toolCalls : undefined,
    status: body.status === "blocked" || status === 403 ? "blocked" : status < 300 ? "completed" : "failed",
    durationMs: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
    ...usage,
    agentTrace: telemetry.galileo,
    otlp: telemetry.splunk?.status,
    traceId: telemetry.splunk?.trace_id,
    spans: telemetry.splunk?.span_count,
    defense: defense && { ...defense, eventIds: defense.eventIds?.filter(Boolean) },
    // A refusal names the model it would have used; only a model that produced output "answered".
    servedBy: usage.llmCalls ? servedByFrom(body.served_by) ?? null : null,
    provenance: "live",
  };
}

/** A recorded wealth run replayed in place of a live call: its numbers are the recording's, not this session's. */
export function observeRecordedWealth(run: ObservedRun, payload: unknown, recordedAt: string): ObservedRun {
  return {
    ...observeWealth(run, 200, payload),
    replay: true,
    provenance: "recorded",
    recordedAt,
    servedBy: servedByFrom((payload as Record<string, unknown> | null)?.served_by) ?? null,
    note: "Recorded run: figures are from the recording, not a call made now.",
  };
}

export function wealthStats(service: WealthService | null, endpoint: string, link?: string | null, scope?: WealthDefenseScope): { observability: StatsCard; defense: StatsCard } {
  const reachable = service?.reachable !== false;
  return {
    observability: {
      integration: agentTraceIntegration(service?.galileo, reachable, link),
      tiles: [
        { label: "LLM calls", value: (run) => run.llmCalls },
        { label: "Tool calls", value: (run) => run.toolCalls, hint: "Agent and policy tools the service ran" },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "Measured by the wealth service" },
      ],
      facts: traceFacts,
      source: `From each ${endpoint} response: model calls and tokens are counted at the model client as the provider reported them.`,
    },
    defense: {
      integration: wealthDefense(service, reachable, scope),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the security summary on each response.",
    },
  };
}
