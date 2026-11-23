import type { EvidenceRef } from "./types.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.runtime": {
    id: "platform.runtime", file: "config/use-cases.ts", symbol: "useCasePackages", start: 25, end: 39,
    proves: "The registry assigns each executable demo an independent Compose stack, API route, host port, and scoped configuration. Illustrative modules have no live runtime.", proofRole: "Setup", evidenceKind: "configuration",
  },
  "platform.model-routing": {
    id: "platform.model-routing", file: "services/llm/studio_models.py", symbol: "pick", start: 323, end: 353,
    proves: "Shared routing resolves a use case's provider chain, skips unconfigured or unhealthy providers, and returns the selected backend and fallback reason.", proofRole: "Call", evidenceKind: "source",
  },
  "platform.egress": {
    id: "platform.egress", file: "services/llm/studio_models.py", symbol: "egress_decision", start: 412, end: 430,
    proves: "Private endpoints are allowed. Hosted endpoints follow the configured egress policy; required AI Defense must be available before a hosted call is allowed.", proofRole: "Decision", evidenceKind: "source",
  },
};
