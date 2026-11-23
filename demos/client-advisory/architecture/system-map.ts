import { box, defenseInterior, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const advisory: ZoomMap = {
  summary: "Rules check suitability and size actions before the meeting brief is drafted. The advisor and supervisor approve release.",
    implemented: true,
    note: "A synthetic household, CRM notes screened by AI Defense, code suitability rules and sized actions, then a meeting-prep Deep Agent on the Studio model chain (a hosted model only with AI Defense forced to enforce). A supervisor approves under advisory.recommendation. Not advice; nothing is executed. No household CRM catalog beyond three synthetic households. This map does not assert live Yahoo or model availability.",
    cores: [
      box("context", "Client context", "Household, notes, update", "Synthetic household record, screened CRM notes, and the published house-view update.", "store"),
      box("workload", "Meeting-prep workload", "Rules, actions, agent, approvals", "Suitability and actions are code. Findings and actions remain if the brief is written by code."),
      box("model", "Studio model chain", "Sparky vLLM 127.0.0.1:8003 → OpenAI API", "The brief is drafted on Sparky when it is up; the hosted fallback is used only with Cisco AI Defense forced to enforce, otherwise the request is refused.", "ai"),
      box("defense", "Cisco AI Defense", "Model hops and CRM notes", "Detects PII and injected instructions in notes before any model call, and inspects every model hop.", "cisco"),
      box("observe", "Splunk Agent Observability", "Optional traces", "Tool and model spans when Galileo is keyed. OTLP only when configured.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "context", to: "workload", label: "screened context" },
      { from: "workload", to: "model", label: "draft brief" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "context", to: "defense", label: "notes as tool results", kind: "control" },
      { from: "workload", to: "observe", label: "optional traces", kind: "telemetry" },
    ],
    interiors: {
      context: {
        title: "Client context",
        note: "Three synthetic households with test PII only. A fraud case arrives only as a customer-visible service event (card reissued); SAR context never does.",
        entities: [
          box("household", "Household record", "Profile and holdings", "Risk profile, horizon, goals, holdings.", "store"),
          box("notes", "CRM notes", "Screened", "Kept, masked, or withheld before any model call.", "store"),
          box("research", "House-view update", "Published by the strategist", "Verified claims only.", "store"),
        ],
        edges: [
          { from: "household", to: "notes", label: "notes" },
        ],
        stubs: [box("workload", "Meeting-prep workload", "Rules", "Off Inspection.")],
      },
      workload: {
        title: "Meeting-prep workload",
        note: "Suitability rules are not an LLM and are not sent to AI Defense.",
        entities: [
          box("suitability", "Suitability rules", "Reg BI care", "Concentration against the profile cap, horizon, liquidity, affiliate restrictions.", "service"),
          box("nba", "Next-best actions", "Sized in dollars", "Unsuitable actions are excluded and shown.", "service"),
          box("grounding", "Brief verifier", "Every statement", "Statements must match the cited record; callouts must cite a finding.", "service"),
          box("gate", "Advisor, then supervisor", "advisory.recommendation", "Agent Control on approval. Not advice.", "human"),
        ],
        edges: [
          { from: "suitability", to: "nba", label: "findings" },
          { from: "nba", to: "grounding", label: "actions" },
          { from: "grounding", to: "gate", label: "checked brief" },
        ],
        stubs: [box("model", "Studio model chain", "Draft", "Findings remain if no model may answer.")],
      },
      model: {
        title: "Studio model chain",
        note: "Sparky vLLM at 127.0.0.1:8003 first; a hosted fallback only with AI Defense forced to enforce. The server attaches the disclaimer.",
        entities: [box("nim", "First healthy backend", "Meeting-prep Deep Agent", "Planner and compliance-reviewer subagents. The model does not author the legal line.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "Model hops and notes.")],
      },
      defense: defenseInterior("the meeting-prep model hops and each CRM note as a tool result", "Suitability rules, actions, and the verifier never enter Inspection."),
      observe: observeInterior("Optional tool and model spans when Galileo is configured.", ["advisory.recommendation"]),
    },
  };
