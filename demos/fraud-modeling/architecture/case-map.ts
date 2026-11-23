import type { CaseMap } from "../../../app/map/types.ts";
import { row, chain, entity } from "../../../app/map/case-helpers.ts";

export const fraud: CaseMap = {
  id: "fraud-modeling",
  root: "fraud.process",
  entities: {
    select: entity("select", "Triage the alert queue", "Analyst picks a scenario", "The workbench starts a triage run. Synthetic data only.", "human"),
    score: entity("score", "Score and investigate", "Graph model + triage agent", "GraphSAGE and XGBoost score every payment, then a triage agent gathers evidence. Scoring does not call an LLM and does not start training.", "ai", "implemented", { childScopeId: "fraud.score" }),
    read: entity("read", "Read rules vs graph", "Evidence, not a verdict", "The rules verdict, the graph risk band, the point-in-time network, and TreeSHAP reasons in plain English.", "human"),
    decide: entity("decide", "Analyst owns the disposition", "Policy-gated actions", "Contact, block and reissue, false positive, or escalate. Agent Control denies irreversible actions without the analyst.", "decision"),
    entry: entity("entry", "Triage API", "POST /api/fraud/runs", "Scores the queue, opens the alert, and inspects the untrusted dispute note before any model call.", "service", "implemented", { evidenceId: "fraud.score" }),
    model: entity("model", "GraphSAGE + XGBoost", "No LLM on this hop", "The live sidecar scores each payment with exact TreeSHAP; recorded or sample scores answer when it is down, labelled.", "model"),
    narrative: entity("narrative", "Fraud triage agent", "Deep Agent · Studio model chain", "Calls the scoring and evidence tools and drafts a cited summary. AI Defense inspects its prompt and summary. Scripted when no model is reachable.", "ai", "implemented", { evidenceId: "fraud.narrative" }),
    trace: entity("trace", "Agent trace", "Does not block the run", "One trace per run with tool spans in Splunk Agent Observability when configured.", "telemetry"),
  },
  scopes: {
    "fraud.process": {
      id: "fraud.process",
      title: "Business process",
      level: 0,
      blurb: "An analyst triages a card alert queue: rules vs a graph model, plain-English reasons, a cited agent summary, then a policy-gated disposition. The demo does not start training.",
      modes: ["implemented", "proposed"],
      nodes: row(["select", "score", "read", "decide"]),
      edges: chain(["select", "score", "read", "decide"]),
    },
    "fraud.score": {
      id: "fraud.score",
      title: "Score and investigate",
      level: 1,
      blurb: "The probability is produced first and never touches an LLM. The triage agent works on top of it; AI Defense inspects the agent's text, not the score.",
      modes: ["implemented", "proposed"],
      nodes: [
        { id: "entry", entityId: "entry", x: 0, y: 80 },
        { id: "model", entityId: "model", x: 320, y: 80 },
        { id: "narrative", entityId: "narrative", x: 320, y: 280 },
        { id: "trace", entityId: "trace", x: 0, y: 280 },
      ],
      edges: [
        { id: "f1", from: "entry", to: "model", label: "score the edge", kind: "data" },
        { id: "f2", from: "model", to: "narrative", label: "evidence tools", kind: "data" },
        { id: "f3", from: "entry", to: "trace", label: "spans", kind: "telemetry" },
      ],
    },
  },
};
