import type { EvidenceRef } from "../../../app/map/types.ts";
import { evidenceRef as ref } from "../../../app/map/evidence-ref.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.wealth-screen": ref("platform.wealth-screen", "services/wealth/untrusted.py", "_screen", 49, 65, "The application screens untrusted news and CRM text through AI Defense and local checks before model use."),
  "platform.wealth-trace": ref("platform.wealth-trace", "services/wealth/server.py", "attach_galileo", 74, 98, "The application attaches Galileo callbacks to model execution, then concludes and flushes the agent trace separately from control decisions."),
  "platform.wealth-otlp": ref("platform.wealth-otlp", "services/wealth/telemetry.py", "WealthTelemetry.start", 62, 96, "Splunk GenAI instrumentation exports traces and metrics through configured OTLP endpoints or a Splunk realm and token."),
};
