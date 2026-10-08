import { agentTraceIntegration, defenseFacts, defenseFrom, defenseIntegration, DEFENSE_TILES, traceFacts, usageFrom, type ObservedRun, type StatsCard } from "./RunStats";

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
  return {
    ...run,
    status: status < 300 ? "completed" : status === 403 ? "blocked" : "failed",
    durationMs: typeof body.duration_ms === "number" ? body.duration_ms : undefined,
    ...usageFrom(body.usage),
    agentTrace: telemetry.galileo,
    otlp: telemetry.splunk?.status,
    traceId: telemetry.splunk?.trace_id,
    spans: telemetry.splunk?.span_count,
    defense: defenseFrom(body.security),
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
      source: `From each ${endpoint} response: model calls and tokens are counted at the NIM client as the provider reported them.`,
    },
    defense: {
      integration: defenseIntegration(service?.security, "model input and output", reachable),
      tiles: DEFENSE_TILES,
      facts: defenseFacts,
      source: "From the security summary on each response.",
    },
  };
}
