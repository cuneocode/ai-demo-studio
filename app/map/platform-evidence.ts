import type { EvidenceRef } from "./types.ts";

const ref = (id: string, file: string, symbol: string, start: number, end: number, proves: string): EvidenceRef => ({ id, file, symbol, start, end, proves, evidenceKind: "source", proofRole: "Full context" });

/** Runtime evidence for platform callers and telemetry transports. */
export const platformEvidence = Object.fromEntries([
  ref("platform.fraud-inspection", "services/fraud/triage.py", "start", 207, 217, "The triage application screens the untrusted dispute note and withholds flagged text before the agent sees it."),
  ref("platform.fraud-boundary", "services/fraud/triage.py", "start", 227, 238, "The application inspects the initial Deep Agent prompt before a hosted call when AI Defense is configured. Egress enforcement can require this inspection."),
  ref("platform.fraud-summary", "services/fraud/triage.py", "start", 265, 275, "The application inspects the completed Deep Agent summary for hosted inference when AI Defense is configured."),
  ref("platform.fraud-trace", "services/fraud/telemetry.py", "AgentTrace", 45, 82, "The Galileo callback captures the Deep Agent; application tool spans and a final SDK flush belong to the same agent trace."),
  ref("platform.fraud-otlp-status", "services/fraud/telemetry.py", "FraudTelemetry", 13, 36, "The optional OTLP helper checks configuration and returns status. It performs no span export."),
  ref("platform.fraud-controls", "services/fraud/controls.py", "enforce", 178, 207, "The application evaluates hosted controls and applies action and case-note verdicts. These checks are separate from trace export."),
  ref("platform.briefing-inspection", "services/briefing/security.py", "ProtectedChatOpenAI", 149, 162, "The protected application client inspects each model prompt and completed output before execution continues."),
  ref("platform.briefing-trace", "services/briefing/server.py", "telemetry.delivery", 296, 304, "The server passes briefing tool trail spans to its run telemetry adapter after execution."),
  ref("platform.briefing-export", "services/briefing/telemetry.py", "export", 64, 79, "The briefing adapter sends OTLP JSON to its configured HTTP destination and reports success or failure. It does not use the Galileo agent callback."),
  ref("platform.wealth-screen", "services/wealth/untrusted.py", "_screen", 49, 65, "The application screens untrusted news and CRM text through AI Defense and local checks before model use."),
  ref("platform.advisory-inspection", "services/wealth/nim.py", "ProtectedChatOpenAI._agenerate", 92, 122, "The shared Wealth client inspects input and completed output for structured research calls and advisory agents, using the selected enforcement mode."),
  ref("platform.wealth-trace", "services/wealth/server.py", "attach_galileo", 74, 98, "The application attaches Galileo callbacks to model execution, then concludes and flushes the agent trace separately from control decisions."),
  ref("platform.wealth-otlp", "services/wealth/telemetry.py", "WealthTelemetry.start", 62, 96, "Splunk GenAI instrumentation exports traces and metrics through configured OTLP endpoints or a Splunk realm and token."),
  ref("platform.research-controls", "services/wealth/market_research.py", "analyze_packet", 210, 220, "The application submits research precheck verdicts before loading screened news and making assessment calls."),
  ref("platform.advisory-controls", "services/wealth/advisory.py", "supervise", 340, 348, "The application submits suitability and supervisor approval verdicts to Agent Control before recording a recommendation."),
  ref("platform.sar-inspection", "services/sar/security.py", "Defense.screen", 207, 235, "The application screens individual untrusted evidence segments. It applies withholding locally using the inspection verdict and configured enforcement mode."),
  ref("platform.sar-model-inspection", "services/sar/model.py", "ProtectedChatOpenAI._agenerate", 103, 129, "The SAR agent's protected client inspects every model prompt and completed output before continuing."),
  ref("platform.sar-trace", "services/sar/observe.py", "attach_galileo", 12, 36, "The application passes Galileo callbacks into the agent and concludes and flushes the SDK trace after the run."),
  ref("platform.sar-otlp", "services/sar/telemetry.py", "SarTelemetry.start", 62, 96, "The SAR service instruments LangChain with Splunk GenAI instrumentation and configures OTLP trace and metric exporters."),
  ref("platform.sar-controls", "services/sar/controls.py", "check", 131, 160, "Deterministic SAR verdicts are optionally submitted to hosted Agent Control. The application applies the returned decision and fails closed on unavailable configured enforcement."),
].map(item => [item.id, item]));
