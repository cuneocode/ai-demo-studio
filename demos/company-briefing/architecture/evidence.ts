import type { EvidenceRef } from "../../../app/map/types.ts";
import { evidenceRef as ref } from "../../../app/map/evidence-ref.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.briefing-agent": {
    id: "platform.briefing-agent", file: "demos/company-briefing/backend/agent.py", symbol: "build_agent", start: 211, end: 232,
    proves: "The briefing supervisor and theme subagents receive the same protected model client.", proofRole: "Setup", evidenceKind: "source",
  },
  "platform.briefing-routing": {
    id: "platform.briefing-routing", file: "demos/company-briefing/backend/model_backend.py", symbol: "model_settings", start: 19, end: 34,
    proves: "Briefing resolves its Studio model chain and falls back to environment configuration when no backend resolves.", proofRole: "Setup", evidenceKind: "source",
  },
  "platform.briefing-inspection": ref("platform.briefing-inspection", "demos/company-briefing/backend/security.py", "ProtectedChatOpenAI", 149, 162, "The protected application client inspects each model prompt and completed output before execution continues."),
  "platform.briefing-trace": ref("platform.briefing-trace", "demos/company-briefing/backend/server.py", "telemetry.delivery", 296, 304, "The server passes briefing tool trail spans to its run telemetry adapter after execution."),
  "platform.briefing-export": ref("platform.briefing-export", "demos/company-briefing/backend/telemetry.py", "export", 64, 79, "The briefing adapter sends OTLP JSON to its configured HTTP destination and reports success or failure. It does not use the Galileo agent callback."),
};
