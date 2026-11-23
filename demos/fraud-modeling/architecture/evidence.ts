import type { EvidenceRef } from "../../../app/map/types.ts";
import { evidenceRef as ref } from "../../../app/map/evidence-ref.ts";

export const evidence: Record<string, EvidenceRef> = {
  "platform.fraud-agent": {
    id: "platform.fraud-agent", file: "demos/fraud-modeling/backend/agent.py", symbol: "investigate", start: 155, end: 162,
    proves: "The triage service builds a Deep Agent with the selected model and investigation tools, then streams its execution.", proofRole: "Call", evidenceKind: "source",
  },
  "fraud.score": {
    id: "fraud.score",
    file: "demos/fraud-modeling/backend/triage.py",
    symbol: "start",
    start: 180,
    end: 214,
    proves: "A triage run scores the queue before any model call, opens the alert, and inspects the untrusted dispute note; a blocked note is withheld from the agent.",
  },
  "fraud.narrative": {
    id: "fraud.narrative",
    file: "demos/fraud-modeling/backend/triage.py",
    symbol: "start",
    start: 216,
    end: 259,
    proves: "The triage agent runs on the Studio model chain only after the egress policy and AI Defense prompt inspection allow it; otherwise the same tools run scripted, labelled.",
  },
  "platform.fraud-inspection": ref("platform.fraud-inspection", "demos/fraud-modeling/backend/triage.py", "start", 207, 217, "The triage application screens the untrusted dispute note and withholds flagged text before the agent sees it."),
  "platform.fraud-boundary": ref("platform.fraud-boundary", "demos/fraud-modeling/backend/triage.py", "start", 227, 238, "The application inspects the initial Deep Agent prompt before a hosted call when AI Defense is configured. Egress enforcement can require this inspection."),
  "platform.fraud-summary": ref("platform.fraud-summary", "demos/fraud-modeling/backend/triage.py", "start", 265, 275, "The application inspects the completed Deep Agent summary for hosted inference when AI Defense is configured."),
  "platform.fraud-trace": ref("platform.fraud-trace", "demos/fraud-modeling/backend/telemetry.py", "AgentTrace", 45, 82, "The Galileo callback captures the Deep Agent; application tool spans and a final SDK flush belong to the same agent trace."),
  "platform.fraud-otlp-status": ref("platform.fraud-otlp-status", "demos/fraud-modeling/backend/telemetry.py", "FraudTelemetry", 13, 36, "The optional OTLP helper checks configuration and returns status. It performs no span export."),
  "platform.fraud-controls": ref("platform.fraud-controls", "demos/fraud-modeling/backend/controls.py", "enforce", 178, 207, "The application evaluates hosted controls and applies action and case-note verdicts. These checks are separate from trace export."),
};
