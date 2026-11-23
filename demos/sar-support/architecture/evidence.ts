import type { EvidenceRef } from "../../../app/map/types.ts";
import { evidenceRef as ref } from "../../../app/map/evidence-ref.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.sar-agent": {
    id: "platform.sar-agent", file: "demos/sar-support/backend/agent.py", symbol: "run_live", start: 136, end: 151,
    proves: "The SAR agent selects its configured model, applies egress admission, builds the protected client, and invokes the agent graph.", proofRole: "Call", evidenceKind: "source",
  },
  "platform.sar-inspection": ref("platform.sar-inspection", "demos/sar-support/backend/security.py", "Defense.screen", 207, 235, "The application screens individual untrusted evidence segments. It applies withholding locally using the inspection verdict and configured enforcement mode."),
  "platform.sar-model-inspection": ref("platform.sar-model-inspection", "demos/sar-support/backend/model.py", "ProtectedChatOpenAI._agenerate", 103, 129, "The SAR agent's protected client inspects every model prompt and completed output before continuing."),
  "platform.sar-trace": ref("platform.sar-trace", "demos/sar-support/backend/observe.py", "attach_galileo", 12, 36, "The application passes Galileo callbacks into the agent and concludes and flushes the SDK trace after the run."),
  "platform.sar-otlp": ref("platform.sar-otlp", "demos/sar-support/backend/telemetry.py", "SarTelemetry.start", 62, 96, "The SAR service instruments LangChain with Splunk GenAI instrumentation and configures OTLP trace and metric exporters."),
  "platform.sar-controls": ref("platform.sar-controls", "demos/sar-support/backend/controls.py", "check", 131, 160, "Deterministic SAR verdicts are optionally submitted to hosted Agent Control. The application applies the returned decision and fails closed on unavailable configured enforcement."),
};
