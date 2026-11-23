import type { EvidenceRef } from "../../../app/map/types.ts";
import { evidenceRef as ref } from "../../../app/map/evidence-ref.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.advisory-agents": {
    id: "platform.advisory-agents", file: "services/wealth/advisory_agent.py", symbol: "run_deep_agent", start: 283, end: 307,
    proves: "The meeting-prep supervisor, planner, and compliance reviewer share the selected model and enforcement settings.", proofRole: "Setup", evidenceKind: "source",
  },
  "platform.advisory-inspection": ref("platform.advisory-inspection", "services/wealth/nim.py", "ProtectedChatOpenAI._agenerate", 92, 122, "The shared Wealth client inspects input and completed output for structured research calls and advisory agents, using the selected enforcement mode."),
  "platform.advisory-controls": ref("platform.advisory-controls", "services/wealth/advisory.py", "supervise", 340, 348, "The application submits suitability and supervisor approval verdicts to Agent Control before recording a recommendation."),
};
