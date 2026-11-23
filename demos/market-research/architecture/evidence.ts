import type { EvidenceRef } from "../../../app/map/types.ts";
import { evidenceRef as ref } from "../../../app/map/evidence-ref.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.research-calls": {
    id: "platform.research-calls", file: "services/wealth/market_research.py", symbol: "analyze", start: 228, end: 256,
    proves: "Market analysis makes structured Assessment calls with one repair attempt and conditionally regenerates an Outlook from verified facts.", proofRole: "Call", evidenceKind: "source",
  },
  "platform.research-controls": ref("platform.research-controls", "services/wealth/market_research.py", "analyze_packet", 210, 220, "The application submits research precheck verdicts before loading screened news and making assessment calls."),
};
