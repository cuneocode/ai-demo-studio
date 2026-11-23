import { box, defenseInterior, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const briefing: ZoomMap = {
  summary: "Filing sources feed a supervisor and theme specialists. Grounding checks support the presenter's accept decision.",
    implemented: true,
    note: "Navigation-first Deep Agent. No vector index and no open web. This map does not assert live SEC or OpenAI availability. Defense inspects model hops only.",
    cores: [
      box("filings", "Filing sources", "EDGAR or upload", "The selected accession or the uploaded file. These bytes never enter AI Defense.", "store"),
      box("workload", "Briefing workload", "Supervisor and verifier", "TOC navigation, theme notes, XBRL facts, cite-or-abstain, and the accept-gate."),
      box("model", "Hosted model", "Protected model hops", "The local demo calls a hosted model. This map does not assert that endpoint is up.", "ai"),
      box("defense", "Cisco AI Defense", "Model hops only", "Plan, delegate, extract, and assemble. EDGAR, upload, the navigator, XBRL, and grounding stay off Inspection.", "cisco"),
      box("observe", "Splunk Agent Observability", "Optional spans", "A briefing does not require a dashboard. No control models.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "filings", to: "workload", label: "annual report" },
      { from: "workload", to: "model", label: "model hops" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "optional spans", kind: "telemetry" },
    ],
    interiors: {
      filings: {
        title: "Filing sources",
        note: "No vector index. The filing map is titled nodes, not embeddings.",
        entities: [
          box("edgar", "EDGAR", "Latest annual report", "Ticker catalog, submissions, and archives. Unknown issuers fail closed.", "store"),
          box("upload", "Upload", "PDF, HTML, or TXT", "The file wins over EDGAR. An empty text layer fails closed.", "store"),
          box("nodes", "Filing nodes", "Not embeddings", "Item titles become node files. The supervisor never reads node bodies.", "store"),
        ],
        edges: [
          { from: "edgar", to: "nodes", label: "build map" },
          { from: "upload", to: "nodes", label: "build map" },
        ],
        stubs: [box("workload", "Briefing workload", "Read nodes", "Subagents call read_filing_node.")],
      },
      workload: {
        title: "Briefing workload",
        note: "Grounding is cite-or-abstain against node files. It is not an LLM and it is not inspected.",
        entities: [
          box("supervisor", "Deep Agent supervisor", "Plan and delegate", "It never calls read_filing_node. It tasks the five theme specialists.", "ai"),
          box("subagents", "Theme subagents", "read_filing_node", "Objectives, risks, regulatory, AI initiatives, and metrics. Each fact needs a verbatim excerpt.", "ai"),
          box("xbrl", "companyfacts", "FY metrics", "Allowlisted concepts for that fiscal year. The model does not do the arithmetic.", "store"),
          box("grounding", "Grounding verifier", "Cite or abstain", "Excerpts must be substrings of the node file. Ungrounded-only themes abstain.", "service"),
          box("gate", "Accept-gate", "Use this company", "Studio context is stored only after this click.", "human"),
        ],
        edges: [
          { from: "supervisor", to: "subagents", label: "delegate" },
          { from: "subagents", to: "grounding", label: "theme notes" },
          { from: "xbrl", to: "grounding", label: "FY metrics" },
          { from: "grounding", to: "gate", label: "cited briefing" },
        ],
        stubs: [box("defense", "Cisco AI Defense", "Model hops", "Not EDGAR, not the node files, not grounding.")],
      },
      model: {
        title: "Hosted model",
        note: "This map does not assert live OpenAI availability.",
        entities: [box("chat", "Protected model hops", "Temperature 0", "Supervisor and subagent calls. No filing embeddings.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "Every model hop.")],
      },
      defense: defenseInterior("model hops for plan, delegate, extract, and assemble", "EDGAR, upload, the navigator, XBRL, and grounding never enter Inspection."),
      observe: observeInterior("Optional agent and tool spans. No control models.", false),
    },
  };
