import type { EvidenceRef } from "../../../app/map/types.ts";
import { interbankEvidence } from "./interbank-evidence.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.interbank-agent": {
    id: "platform.interbank-agent", file: "demos/interbank-a2a/backend/lab/agents.py", symbol: "DeepAgent.current", start: 69, end: 74,
    proves: "Each bank's Deep Agent selects its configured backend and rebuilds its graph when that endpoint changes.", proofRole: "Setup", evidenceKind: "source",
  },
  ...interbankEvidence,
};
