import { agentTraceIntegration, defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, servedByFrom, traceFacts, usageFrom, type ObservedRun, type StatsCard } from "./RunStats";

/** Raw wealth health fields: the normalized health rewrites status strings for display. */
export type WealthService = { reachable: boolean; galileo?: string; security?: { status?: string; mode?: string; fail_open?: boolean } };

export const wealthService = (body: unknown): WealthService => {
  const value = (body && typeof body === "object" ? body : {}) as Record<string, unknown>;
  return { reachable: true, galileo: typeof value.galileo === "string" ? value.galileo : undefined, security: value.security as WealthService["security"] };
};

/** One research or advisory call from the wealth service's response, including refusals. */
export function observeWealth(run: ObservedRun, status: number, payload: unknown): ObservedRun {
  const body = (payload && typeof payload === "object" ? payload : {}) as Record<string, unknown>;
  const telemetry = (body.telemetry ?? {}) as { galileo?: string; splunk?: { status?: string; trace_id?: string; span_count?: number } };
  const usage = usageFrom(body.usage);
  return {
    ...run,
    status: status < 300 ? "completed" : status === 403 ? "blocked" : "failed",
    durationMs: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
    ...usage,
    agentTrace: telemetry.galileo,
    otlp: telemetry.splunk?.status,
    traceId: telemetry.splunk?.trace_id,
    spans: telemetry.splunk?.span_count,
    defense: defenseFrom(body.security),
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

export function wealthStats(service: WealthService | null, endpoint: string, link?: string | null): { observability: StatsCard; defense: StatsCard } {
  const reachable = service?.reachable !== false;
  return {
    observability: {
      integration: agentTraceIntegration(service?.galileo, reachable, link),
      tiles: [
        { label: "LLM calls", value: (run) => run.llmCalls },
        { label: "Tokens in", value: (run) => run.inputTokens, format: "tokens" },
        { label: "Tokens out", value: (run) => run.outputTokens, format: "tokens" },
        { label: "Latency", value: (run) => run.durationMs, format: "ms", total: "avg", hint: "Measured by the wealth service" },
      ],
      facts: traceFacts,
      source: `From each ${endpoint} response: model calls and tokens are counted at the model client as the provider reported them.`,
    },
    defense: {
      integration: defenseIntegration(service?.security, "model input and output", reachable),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the security summary on each response.",
    },
  };
}
