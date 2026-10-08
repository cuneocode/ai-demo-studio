/**
 * One map, three altitudes. Regions are system boundaries for that use case.
 * Tools, SDKs, judges, and guardrail models appear only inside their parent.
 */
export type ZoomKind = "service" | "ai" | "store" | "human" | "cisco" | "failure";

export type ZoomChip = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind?: ZoomKind;
};

export type ZoomBox = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind?: ZoomKind;
  optional?: boolean;
  from?: string;
  chips?: ZoomChip[];
};

export type ZoomEdge = {
  from: string;
  to: string;
  label: string;
  kind?: "data" | "control" | "telemetry" | "placement";
};

export type ZoomInterior = {
  title: string;
  note: string;
  entities: ZoomBox[];
  edges: ZoomEdge[];
  stubs: ZoomBox[];
};

export type ZoomMap = {
  implemented: boolean;
  note: string;
  cores: ZoomBox[];
  coreEdges: ZoomEdge[];
  interiors: Record<string, ZoomInterior>;
};

const chip = (id: string, title: string, subtitle: string, detail = subtitle, kind?: ZoomKind): ZoomChip => ({ id, title, subtitle, detail, kind });
const box = (id: string, title: string, subtitle: string, detail: string, kind: ZoomKind = "service", extra: Partial<ZoomBox> = {}): ZoomBox => ({ id, title, subtitle, detail, kind, ...extra });

function defenseInterior(hops: string, never: string): ZoomInterior {
  return {
    title: "Cisco AI Defense",
    note: `Guardrail models inspect only ${hops}. ${never}`,
    entities: [
      box("call", "Inspection call", "App calls the API", `The workload sends ${hops}. ${never}`, "cisco"),
      box("guards", "Guardrail models", "Runtime inspection", "These models live in AI Defense. They are not peers of the application.", "ai", {
        chips: [
          chip("in", "Request inspect", "When this use case sends a question"),
          chip("hop", "Model-hop inspect", hops),
          chip("out", "Answer inspect", "Deny or unavailability fails closed"),
        ],
      }),
      box("stop", "Fail closed", "No release", "A deny or an unavailable inspection stops the model output. It does not invent a fallback answer.", "failure"),
    ],
    edges: [
      { from: "call", to: "guards", label: "inspect", kind: "control" },
      { from: "guards", to: "stop", label: "deny / unavailable", kind: "control" },
    ],
    stubs: [],
  };
}

function observeInterior(incoming: string, controls: boolean): ZoomInterior {
  return {
    title: "Splunk Agent Observability",
    note: controls
      ? "Brahe records Agent Control verdicts on the same trace. Evaluators are not verified."
      : "Traces only. This use case does not run Agent Control or eval models.",
    entities: [
      box("in", "Incoming traces", "From the workload", incoming, "service"),
      box("controls", "Control models", controls ? "Agent Control" : "Not used here", controls
        ? "Hosted controls enforce brahe-banking-scope, evidence grounding, and no-approval claims. These are not Luna evaluators."
        : "No control models are drawn because this use case does not call Agent Control.", controls ? "cisco" : "service", {
        chips: controls ? [
          chip("scope", "Banking scope", "Step brahe-banking-scope"),
          chip("ground", "Evidence grounding", "brahe-bank-evidence-grounding-v1"),
          chip("approval", "No approval claims", "brahe-bank-no-approval-claims-v1"),
        ] : [chip("none", "No control models", "Traces only")],
      }),
      box("otlp", "OTLP export", "Only when configured", "A separate exporter sends spans only when SPLUNK_REALM and SPLUNK_ACCESS_TOKEN, or an OTLP endpoint, are set.", "service"),
    ],
    edges: [
      { from: "in", to: "controls", label: controls ? "verdict booleans" : "spans", kind: "telemetry" },
      { from: "in", to: "otlp", label: "optional export", kind: "telemetry" },
    ],
    stubs: [],
  };
}

export const zoomMaps: Record<string, ZoomMap> = {
  "brahe-bank": {
    implemented: true,
    note: "Live path: AI Defense inspects the question and the answer. The application judge stays in the workload and only produces a boolean. Agent Control enforces brahe-banking-scope.",
    cores: [
      box("workload", "Bank workload", "FastAPI and LangGraph", "The chat API, supervisor, specialists, tools, and application judges live here."),
      box("model", "Hosted model", "OpenAI today", "ProtectedChatOpenAI calls the configured hosted model. No NVIDIA NIM is on this path.", "ai"),
      box("defense", "Cisco AI Defense", "Inspect question and answer", "Guardrail models live in this platform. Filing-style tools and the mock score are not sent here.", "cisco"),
      box("observe", "Splunk Agent Observability", "Traces and Agent Control", "Control models enforce scope and answer checks. Export is only when configured.", "cisco"),
    ],
    coreEdges: [
      { from: "workload", to: "model", label: "infer" },
      { from: "workload", to: "defense", label: "inspect", kind: "control" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "trace", kind: "telemetry" },
    ],
    interiors: {
      workload: {
        title: "Bank workload",
        note: "The application judge stays in the workload. It does not live inside AI Defense.",
        entities: [
          box("api", "FastAPI /chat", "Session and timeout", "POST /api/banking/chat validates the question, locks the session, and times out at 100s.", "service", {
            chips: [chip("state", "InMemorySaver", "Checkpoints lost on restart")],
          }),
          box("judge", "Application judges", "Booleans only", "A hosted judge returns in_scope, then later checks evidence and no-approval claims. Enforcement is Agent Control, step brahe-banking-scope.", "ai", {
            chips: [
              chip("scope", "Scope judge", "in_scope boolean"),
              chip("quality", "Answer judge", "Grounding and no approval"),
            ],
          }),
          box("supervisor", "Bank supervisor", "Route and explain", "LangGraph routes to the card specialist and the score specialist. There is no approval engine.", "ai", {
            chips: [
              chip("cards", "Card specialist", "Product questions"),
              chip("score", "Score specialist", "Mock score questions"),
            ],
          }),
          box("tools", "Workload tools", "Evidence for the answer", "Product retrieval is local Markdown, or Pinecone when configured. The score tool returns fictional 550.", "store", {
            chips: [
              chip("docs", "Product retrieval", "Local Markdown or Pinecone"),
              chip("mock", "Mock score", "Returns 550"),
            ],
          }),
        ],
        edges: [
          { from: "api", to: "judge", label: "question" },
          { from: "judge", to: "supervisor", label: "in scope", kind: "control" },
          { from: "supervisor", to: "tools", label: "delegate" },
        ],
        stubs: [
          box("defense", "Cisco AI Defense", "Inspect", "Question, model hop, and answer.", "cisco", { from: "api" }),
          box("model", "Hosted model", "Infer", "OpenAI through ProtectedChatOpenAI.", "ai", { from: "supervisor" }),
          box("observe", "Agent Observability", "Enforce and trace", "brahe-banking-scope and answer checks.", "cisco", { from: "judge" }),
        ],
      },
      model: {
        title: "Hosted model",
        note: "This is the inference endpoint. Guardrail models are not inside it.",
        entities: [
          box("chat", "ProtectedChatOpenAI", "Every model hop", "Inspects the model-bound prompt and the completion before tools continue.", "ai"),
          box("openai", "OpenAI hosted model", "Configured MODEL_NAME", "No NVIDIA NIM and no UCS GPU are on the running Brahe path.", "ai"),
        ],
        edges: [{ from: "chat", to: "openai", label: "model call" }],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "The hop is inspected. The model does not contain the guardrails.")],
      },
      defense: defenseInterior("the question, the model hop, and the answer", "Product documents and the mock score never enter Inspection."),
      observe: observeInterior("Galileo SDK callbacks on the bank request, plus Agent Control verdicts.", true),
    },
  },
  "fraud-modeling": {
    implemented: true,
    note: "The score path is GraphSAGE, XGBoost, and Captum Shapley. It does not enter AI Defense and it does not call an LLM. Defense inspects only the optional narrative.",
    cores: [
      box("score", "Scoring service", "FastAPI /score", "Selects a TabFormer case, chooses a backend, and releases a probability plus Shapley groups."),
      box("graph", "Graph model", "Live sidecar, else Triton", "auto uses the HTTP sidecar when it is up, otherwise a ready Triton endpoint. Fixture and cache run only when forced. A down stack returns HTTP 503.", "ai"),
      box("defense", "Cisco AI Defense", "Narrative only", "Optional and off unless FRAUD_ENABLE_NARRATIVE is true. The score path does not arrow here.", "cisco", { optional: true }),
      box("observe", "Splunk Agent Observability", "Optional export", "Spans export only when configured. No control models and no eval models.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "score", to: "graph", label: "score the edge" },
      { from: "score", to: "defense", label: "optional narrative", kind: "control" },
      { from: "score", to: "observe", label: "optional spans", kind: "telemetry" },
    ],
    interiors: {
      score: {
        title: "Scoring service",
        note: "Score this payment never starts training. Auto does not silently swap in fixtures.",
        entities: [
          box("api", "FastAPI /score", "Case in, score out", "The workbench posts a case_id. Unknown cases do not score.", "service"),
          box("route", "Backend choice", "auto, else 503", "Live sidecar, else Triton, else HTTP 503. Fixture and cache only when FRAUD_BACKEND forces them.", "service"),
          box("band", "Threshold band", "Not a fraud flag", "hold at or above 0.50, review at or above 0.35, otherwise clear.", "human", {
            chips: [chip("narrative", "Optional narrative", "Off by default", "FRAUD_ENABLE_NARRATIVE drafts two sentences. Deny or model failure omits the text. The score still releases.", "ai")],
          }),
        ],
        edges: [
          { from: "api", to: "route", label: "case" },
          { from: "route", to: "band", label: "probability" },
        ],
        stubs: [
          box("graph", "Graph model", "Score", "No LLM on this hop.", "ai", { from: "route" }),
          box("defense", "Cisco AI Defense", "Narrative only", "Not on the score path.", "cisco", { from: "band" }),
        ],
      },
      graph: {
        title: "Graph model",
        note: "Training is offline. Score this payment never starts the NVIDIA training container.",
        entities: [
          box("client", "Score client", "POST :8000/score", "Sends src, dst, and the edge feature vector.", "service"),
          box("gnn", "GraphSAGE + XGBoost", "No LLM", "Neighborhood embedding, then the classifier. This hop does not call an LLM.", "ai"),
          box("shap", "Captum Shapley", "Seven groups", "Attributes the probability. The score releases with no LLM.", "ai"),
        ],
        edges: [
          { from: "client", to: "gnn", label: "features" },
          { from: "gnn", to: "shap", label: "no LLM" },
        ],
        stubs: [],
      },
      defense: defenseInterior("the optional narrative draft", "The GNN and XGBoost score never enter Inspection."),
      observe: observeInterior("Optional score and narrative spans. Configuration only.", false),
    },
  },
  "company-briefing": {
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
  },
  "market-research": {
    implemented: true,
    note: "Allowlisted Yahoo and FRED, a write-through cache, CPU tools, then local NIM. This map does not assert live Yahoo, FRED, or NIM availability. Demo recommendation — not financial advice. No vector index and no Tavily.",
    cores: [
      box("market", "Market data", "Yahoo and FRED", "Named providers and a gitignored cache. Not a snapshot pack.", "store"),
      box("workload", "Research workload", "Tools, conflicts, gate", "Deterministic math and cite-or-abstain. Indicators remain if the note is omitted."),
      box("model", "Local NIM", "127.0.0.1:8003", "LangChain ChatOpenAI to Nemotron. dev:studio does not start NIM.", "ai"),
      box("defense", "Cisco AI Defense", "NIM hops only", "Fetch, cache, FRED, tools, conflicts, and grounding never enter Inspection.", "cisco"),
      box("observe", "Splunk Agent Observability", "Galileo when keyed", "Callbacks on the NIM hop when GALILEO_API_KEY is set. No control models. OTLP only when configured.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "market", to: "workload", label: "snapshot" },
      { from: "workload", to: "model", label: "tool JSON" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "optional traces", kind: "telemetry" },
    ],
    interiors: {
      market: {
        title: "Market data",
        note: "No committed snapshot pack. Empty Yahoo history fails closed. A missing FRED key leaves macro absent.",
        entities: [
          box("yahoo", "Yahoo", "Named functions", "history, earnings, info, and peer discovery. No arbitrary HTTP.", "store"),
          box("fred", "FRED", "Four series", "FEDFUNDS, CPI, 10-year, unemployment. An empty keyed series fails closed.", "store"),
          box("cache", "Write-through cache", "Same UTC day", "Gitignored .cache/snapshots and .cache/fred. Refresh forces a pull.", "store"),
        ],
        edges: [
          { from: "yahoo", to: "cache", label: "write snapshot" },
          { from: "fred", to: "cache", label: "write series" },
        ],
        stubs: [],
      },
      workload: {
        title: "Research workload",
        note: "Conflict rows are structured. There is no keyword scan over prose.",
        entities: [
          box("tools", "CPU tools", "Earnings, peers, returns", "Beat-rate, peer median, and horizon returns versus SPY.", "service"),
          box("conflicts", "Conflict rows", "Before the model", "Cross-dimension rows only. Off Inspection.", "service"),
          box("grounding", "Grounding verifier", "Cache values", "Claims must match the snapshot or FRED payload.", "service"),
          box("gate", "Accept research note", "Presenter gate", "Stored only after this click. Not financial advice.", "human"),
        ],
        edges: [
          { from: "tools", to: "conflicts", label: "tool JSON" },
          { from: "conflicts", to: "grounding", label: "rows" },
          { from: "grounding", to: "gate", label: "cited note" },
        ],
        stubs: [box("model", "Local NIM", "Draft the note", "Indicators remain if the note is omitted.")],
      },
      model: {
        title: "Local NIM",
        note: "Health is not ready when GET /v1/models fails. Address 127.0.0.1:8003.",
        entities: [box("nim", "Nemotron Super", "Temperature 0", "langchain_openai pointed at NIM_BASE_URL. No hosted OpenAI default.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "Model hops only.")],
      },
      defense: defenseInterior("the NIM note hop", "Fetch, cache, FRED, tools, conflicts, and grounding never enter Inspection."),
      observe: observeInterior("GalileoAsyncCallback on the NIM hop when GALILEO_API_KEY is set. OTLP only when configured.", false),
    },
  },
  "client-advisory": {
    implemented: true,
    note: "Entitled briefing and research note, presenter holdings, suitability rules, then local NIM. Demo brief — not advice. No household CRM catalog. This map does not assert live Yahoo or NIM availability.",
    cores: [
      box("context", "Entitled context", "Accepted briefing and note", "Posted only after those accept-gates. No CRM catalog.", "store"),
      box("workload", "Advisory workload", "Rules and accept-gate", "Suitability is CPU. Holdings remain if the brief is omitted."),
      box("model", "Local NIM", "127.0.0.1:8003", "The meeting brief is drafted here. Not hosted OpenAI.", "ai"),
      box("defense", "Cisco AI Defense", "NIM hop only", "Entitled context, holdings, suitability, and grounding never enter Inspection.", "cisco"),
      box("observe", "Splunk Agent Observability", "Optional traces", "Callbacks when Galileo is keyed. No control models.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "context", to: "workload", label: "accepted context" },
      { from: "workload", to: "model", label: "draft brief" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "optional traces", kind: "telemetry" },
    ],
    interiors: {
      context: {
        title: "Entitled context",
        note: "No household CRM catalog and no vector index.",
        entities: [
          box("briefing", "Accepted briefing", "After Use this company", "Theme excerpts already accepted in the studio.", "store"),
          box("research", "Accepted note", "After Accept research note", "The published research snapshot, not a fresh browse.", "store"),
        ],
        edges: [],
        stubs: [box("workload", "Advisory workload", "Assemble", "Off Inspection.")],
      },
      workload: {
        title: "Advisory workload",
        note: "Suitability rules are not an LLM and are not sent to AI Defense.",
        entities: [
          box("holdings", "Live holdings", "Ticker and weight", "Presenter-entered. Prices come from the research cache as a tool, not a second platform.", "human"),
          box("suitability", "Suitability rules", "CPU checks", "Concentration, single-name cap, and missing IPS fields.", "service"),
          box("grounding", "Grounding verifier", "Excerpts and fields", "Brief claims must match posted excerpts or cached holding fields.", "service"),
          box("gate", "Accept meeting brief", "Advisor gate", "Stored only after this click. Not advice.", "human"),
        ],
        edges: [
          { from: "holdings", to: "suitability", label: "weights" },
          { from: "suitability", to: "grounding", label: "findings" },
          { from: "grounding", to: "gate", label: "cited brief" },
        ],
        stubs: [box("model", "Local NIM", "Draft", "Holdings remain if the brief is omitted.")],
      },
      model: {
        title: "Local NIM",
        note: "127.0.0.1:8003. The server attaches the disclaimer.",
        entities: [box("nim", "Nemotron Super", "Meeting brief", "ProtectedChatOpenAI. The model does not author the legal line.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "This hop only.")],
      },
      defense: defenseInterior("the NIM meeting-brief hop", "Entitled context, holdings, suitability, and grounding never enter Inspection."),
      observe: observeInterior("Optional brief spans when Galileo is configured.", false),
    },
  },
  "kyc-processing": {
    implemented: false,
    note: "Proposed. Analysts still approve onboarding. Registry checks stay deterministic.",
    cores: [
      box("workload", "Onboarding workload", "Case workflow", "Intake, exception summary, and the analyst gate. Proposed.", "service"),
      box("model", "Document model", "Extract fields", "Proposed OCR and field extraction. Not running in this studio.", "ai"),
      box("registry", "Registry and sanctions", "External checks", "Identity and screening stay outside the model.", "store"),
      box("defense", "Cisco AI Defense", "Proposed inspection", "Would inspect model hops only. Not connected to the local demo.", "cisco"),
      box("observe", "Splunk Agent Observability", "Proposed traces", "Not connected. No control models are claimed.", "cisco"),
    ],
    coreEdges: [
      { from: "workload", to: "model", label: "extract" },
      { from: "registry", to: "workload", label: "screen" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "proposed traces", kind: "telemetry" },
    ],
    interiors: {
      workload: {
        title: "Onboarding workload",
        note: "Proposed. An LLM does not approve onboarding.",
        entities: [
          box("case", "Case workflow", "Intake and exceptions", "Documents in, cited discrepancies out.", "service"),
          box("gate", "Analyst gate", "Approval stays human", "The analyst owns onboarding.", "human"),
        ],
        edges: [{ from: "case", to: "gate", label: "review" }],
        stubs: [
          box("model", "Document model", "Extract", "Proposed."),
          box("registry", "Registry and sanctions", "Screen", "Deterministic."),
        ],
      },
      model: {
        title: "Document model",
        note: "Proposed. Not a live extractor.",
        entities: [box("ocr", "Field extraction", "Proposed model", "Would return fields and evidence locations.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect", "Proposed model hop.")],
      },
      registry: {
        title: "Registry and sanctions",
        note: "Proposed external systems. Authorization stays here.",
        entities: [box("lists", "Screening sources", "Registry and lists", "The model does not approve a match.", "store")],
        edges: [],
        stubs: [box("workload", "Onboarding workload", "Results", "Cited discrepancies.")],
      },
      defense: defenseInterior("a proposed document-model hop", "Registry results and the analyst decision never enter Inspection."),
      observe: observeInterior("Proposed case spans. No control models.", false),
    },
  },
  "sar-support": {
    implemented: false,
    note: "Proposed. The investigator owns filing. No automatic SAR.",
    cores: [
      box("evidence", "Case evidence", "Transactions and notes", "The system of record for the investigation.", "store"),
      box("workload", "Investigation workload", "Timeline and draft", "Builds a chronology and a narrative from case evidence only."),
      box("model", "Narrative model", "Draft only", "Proposed LLM. It does not file.", "ai"),
      box("defense", "Cisco AI Defense", "Proposed draft inspect", "Would inspect the narrative hop only.", "cisco"),
      box("observe", "Splunk Agent Observability", "Proposed traces", "Not connected.", "cisco"),
    ],
    coreEdges: [
      { from: "evidence", to: "workload", label: "case facts" },
      { from: "workload", to: "model", label: "draft" },
      { from: "model", to: "defense", label: "inspect draft", kind: "control" },
      { from: "workload", to: "observe", label: "proposed traces", kind: "telemetry" },
    ],
    interiors: {
      evidence: {
        title: "Case evidence",
        note: "Proposed. Transaction queries stay structured.",
        entities: [box("graph", "Transaction graph", "Linked activity", "Feeds the draft. The model does not query freely.", "store")],
        edges: [],
        stubs: [box("workload", "Investigation workload", "Evidence", "Cited chronology.")],
      },
      workload: {
        title: "Investigation workload",
        note: "Proposed. Unsupported claims route back to the investigator.",
        entities: [
          box("timeline", "Timeline builder", "From case evidence", "Links accounts and transactions.", "service"),
          box("gate", "Investigator gate", "Owns the filing", "No automatic SAR.", "human"),
        ],
        edges: [{ from: "timeline", to: "gate", label: "review" }],
        stubs: [box("model", "Narrative model", "Draft", "From evidence only.")],
      },
      model: {
        title: "Narrative model",
        note: "Proposed. Draft only.",
        entities: [box("llm", "Narrative draft", "Cited chronology", "The investigator edits before anything is filed.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect draft", "Proposed.")],
      },
      defense: defenseInterior("a proposed narrative draft", "Transaction records never enter Inspection."),
      observe: observeInterior("Proposed investigation spans. No control models.", false),
    },
  },
  "transaction-llm": {
    implemented: false,
    note: "Proposed. Deterministic validation publishes the payment path. AI Defense is not on authorization.",
    cores: [
      box("pipeline", "Payment pipeline", "Validate and publish", "Schema checks gate the volume path. No model in authorization."),
      box("reference", "Reference data", "Codes and counterparties", "The system of record for entities and purpose codes.", "store"),
      box("model", "Extraction model", "Payment text", "Proposed batched extraction. Exceptions only need an agent.", "ai"),
      box("observe", "Splunk Agent Observability", "Proposed spans", "Not connected. No control models.", "cisco"),
      box("exception", "Exception agent", "Low confidence only", "Optional. Not on the authorization path.", "ai", { optional: true }),
      box("defense", "Cisco AI Defense", "Exception hop only", "Optional. The payment authorization path does not enter Inspection.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "pipeline", to: "reference", label: "lookup" },
      { from: "pipeline", to: "model", label: "extract" },
      { from: "pipeline", to: "observe", label: "proposed spans", kind: "telemetry" },
      { from: "exception", to: "defense", label: "inspect exception", kind: "control" },
    ],
    interiors: {
      pipeline: {
        title: "Payment pipeline",
        note: "Proposed. Invalid schema quarantines the record.",
        entities: [
          box("validate", "Schema validation", "Before publish", "Deterministic. Low confidence routes aside.", "service"),
          box("publish", "Publish", "Governed fields", "The authorization path has no LLM.", "service"),
        ],
        edges: [{ from: "validate", to: "publish", label: "valid rows" }],
        stubs: [box("exception", "Exception agent", "Low confidence", "Not authorization.")],
      },
      reference: {
        title: "Reference data",
        note: "Proposed versioned codes and counterparties.",
        entities: [box("codes", "Code sets", "Entities and purpose", "Lookup stays structured.", "store")],
        edges: [],
        stubs: [box("pipeline", "Payment pipeline", "Matches", "Before publish.")],
      },
      model: {
        title: "Extraction model",
        note: "Proposed. Benchmark a CPU path before assuming a GPU.",
        entities: [box("extract", "Payment extraction", "Text to fields", "Proposed fields still pass schema validation.", "ai")],
        edges: [],
        stubs: [],
      },
      observe: observeInterior("Proposed pipeline spans. No control models.", false),
      exception: {
        title: "Exception agent",
        note: "Proposed and optional. Not on the payment authorization path.",
        entities: [box("agent", "Resolution agent", "Low confidence", "Proposes fields with evidence. Operations decides.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect", "This hop only.")],
      },
      defense: defenseInterior("a proposed exception-agent hop", "The payment authorization path never enters Inspection."),
    },
  },
};

export const zoomCaseIds = Object.keys(zoomMaps);

export type SceneNode = {
  id: string;
  title: string;
  subtitle: string;
  detail: string;
  kind: ZoomKind;
  x: number;
  y: number;
  w: number;
  h: number;
  depth: 0 | 1 | 2;
  titleSize: number;
  optional?: boolean;
  zoomable: boolean;
  targetId?: string;
};

export type SceneEdge = {
  from: string;
  to: string;
  label: string;
  depth: 0 | 1 | 2;
  kind?: ZoomEdge["kind"];
};

export type ZoomScene = {
  width: number;
  height: number;
  nodes: SceneNode[];
  edges: SceneEdge[];
};

const CORE_W = 320;
const CORE_H = 176;
const CORE_GAP = 48;
const STEP_GAP = 56;
const CARD_W = 168;
const CARD_H = 96;
const CARD_GAP = 22;

type LocalNode = { id: string; x: number; y: number; w: number; h: number; box: ZoomBox | ZoomChip; stub?: boolean };
type Rect = { x: number; y: number; w: number; h: number };

function gridShape(count: number) {
  if (count <= 1) return { cols: 1, rows: 1 };
  if (count === 2) return { cols: 2, rows: 1 };
  if (count === 3) return { cols: 3, rows: 1 };
  if (count === 4) return { cols: 2, rows: 2 };
  return { cols: 3, rows: Math.ceil(count / 3) };
}

function sharesSide(a: Pick<SceneNode, "x" | "y" | "w" | "h">, b: Pick<SceneNode, "x" | "y" | "w" | "h">) {
  const overlapY = Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y);
  const overlapX = Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x);
  const gapX = Math.max(a.x, b.x) - Math.min(a.x + a.w, b.x + b.w);
  const gapY = Math.max(a.y, b.y) - Math.min(a.y + a.h, b.y + b.h);
  const beside = gapX > 2 && gapX < Math.max(a.w, b.w) && overlapY > Math.min(a.h, b.h) * 0.55;
  const stacked = gapY > 2 && gapY < Math.max(a.h, b.h) && overlapX > Math.min(a.w, b.w) * 0.55;
  return beside || stacked;
}

function layoutInterior(interior: ZoomInterior) {
  const nodes: LocalNode[] = [];
  interior.entities.forEach((entity, column) => {
    const x = column * (CARD_W + CARD_GAP);
    nodes.push({ id: entity.id, x, y: 0, w: CARD_W, h: CARD_H, box: entity });
    (entity.chips ?? []).forEach((item, index) => {
      nodes.push({
        id: `${entity.id}:${item.id}`,
        x,
        y: (index + 1) * (CARD_H + CARD_GAP),
        w: CARD_W,
        h: CARD_H,
        box: item,
      });
    });
  });
  const stubCount = new Map<string, number>();
  interior.stubs.forEach((stub) => {
    const source = stub.from ?? interior.entities[0]?.id ?? "";
    const column = Math.max(0, interior.entities.findIndex((entity) => entity.id === source));
    const entity = interior.entities[column];
    const used = stubCount.get(source) ?? 0;
    stubCount.set(source, used + 1);
    const chipCount = entity?.chips?.length ?? 0;
    nodes.push({
      id: `stub:${stub.id}`,
      x: column * (CARD_W + CARD_GAP),
      y: (chipCount + 1 + used) * (CARD_H + CARD_GAP),
      w: CARD_W,
      h: CARD_H,
      box: stub,
      stub: true,
    });
  });
  const edges: { from: string; to: string; label: string; kind?: ZoomEdge["kind"] }[] = [
    ...interior.edges,
    ...interior.entities.flatMap((entity) => (entity.chips ?? []).map((item, index, list) => ({
      from: index === 0 ? entity.id : `${entity.id}:${list[index - 1].id}`,
      to: `${entity.id}:${item.id}`,
      label: index === 0 ? "includes" : "and",
    }))),
    ...interior.stubs.flatMap((stub) => {
      const from = stub.from ?? interior.entities[0]?.id;
      if (!from) return [];
      return [{ from, to: `stub:${stub.id}`, label: stub.subtitle }];
    }),
  ];
  const columns = Math.max(interior.entities.length, 1);
  const stack = Math.max(1, ...nodes.map((node) => Math.round(node.y / (CARD_H + CARD_GAP)) + 1));
  const width = Math.max(CARD_W, columns * CARD_W + Math.max(0, columns - 1) * CARD_GAP);
  const height = Math.max(CARD_H, stack * CARD_H + Math.max(0, stack - 1) * CARD_GAP);
  return { nodes, edges, width, height };
}

function fitInterior(local: ReturnType<typeof layoutInterior>, area: Rect) {
  if (!local.nodes.length) return [];
  const scale = Math.min(area.w / local.width, area.h / local.height);
  const ox = area.x + (area.w - local.width * scale) / 2;
  const oy = area.y + (area.h - local.height * scale) / 2;
  return local.nodes.map((item) => ({
    ...item,
    x: ox + item.x * scale,
    y: oy + item.y * scale,
    w: item.w * scale,
    h: item.h * scale,
  }));
}

function titleFont(text: string, cardW: number, preferred: number) {
  const fitted = (cardW * 0.9) / (Math.max(text.length, 1) * 0.48);
  return Math.min(preferred, fitted);
}

export function buildZoomScene(map: ZoomMap, steps: { title: string; detail: string }[]): ZoomScene {
  const measured = map.cores.map((core) => layoutInterior(map.interiors[core.id] ?? { title: core.title, note: "", entities: [], edges: [], stubs: [] }));
  const { cols: coreCols, rows: coreRows } = gridShape(Math.max(map.cores.length, 1));
  const stepW = 56 + coreCols * CORE_W + Math.max(0, coreCols - 1) * CORE_GAP;
  const stepH = 78 + coreRows * CORE_H + Math.max(0, coreRows - 1) * CORE_GAP;
  const sceneW = 64 + Math.max(steps.length, 1) * stepW + Math.max(0, steps.length - 1) * STEP_GAP;
  const sceneH = 80 + stepH;
  const homeScale = Math.min(1100 / sceneW, 640 / sceneH);
  const stepScale = Math.min(1100 / (stepW * 1.2), 640 / (stepH * 1.24));
  const nodes: SceneNode[] = [];
  const edges: SceneEdge[] = [];
  const seen = new Set<string>();
  const keep = (from: SceneNode, to: SceneNode, label: string, kind: SceneEdge["kind"], depth: 0 | 1 | 2) => {
    if (!sharesSide(from, to)) return;
    const key = [from.id, to.id].sort().join("|");
    if (seen.has(key)) return;
    seen.add(key);
    edges.push({ from: from.id, to: to.id, label, kind, depth });
  };
  steps.forEach((step, index) => {
    const stepNode: SceneNode = {
      id: `p${index}`,
      title: step.title,
      subtitle: step.detail,
      detail: step.detail,
      kind: "human",
      x: 32 + index * (stepW + STEP_GAP),
      y: 40,
      w: stepW,
      h: stepH,
      depth: 0,
      titleSize: titleFont(step.title, stepW, 22 / homeScale),
      zoomable: true,
    };
    nodes.push(stepNode);
    if (index > 0) {
      const previous = nodes.find((node) => node.id === `p${index - 1}`);
      if (previous) keep(previous, stepNode, "next step", undefined, 0);
    }
    const body: Rect = { x: stepNode.x + 28, y: stepNode.y + 70, w: stepW - 56, h: stepH - 92 };
    map.cores.forEach((core, coreIndex) => {
      const column = coreIndex % coreCols;
      const row = Math.floor(coreIndex / coreCols);
      const cellW = (body.w - CORE_GAP * (coreCols - 1)) / coreCols;
      const cellH = (body.h - CORE_GAP * (coreRows - 1)) / coreRows;
      const rect = {
        x: body.x + column * (cellW + CORE_GAP),
        y: body.y + row * (cellH + CORE_GAP),
        w: cellW,
        h: cellH,
      };
      const interior = map.interiors[core.id];
      const local = measured[coreIndex];
      const coreId = `${stepNode.id}:${core.id}`;
      const coreNode: SceneNode = {
        id: coreId,
        title: core.title,
        subtitle: core.subtitle,
        detail: core.detail,
        kind: core.kind ?? "service",
        ...rect,
        depth: 1,
        titleSize: titleFont(core.title, rect.w, Math.min(rect.h * 0.2, 18 / stepScale)),
        optional: core.optional,
        zoomable: Boolean(interior && (interior.entities.length || interior.stubs.length)),
      };
      nodes.push(coreNode);
      const content: Rect = { x: rect.x + 16, y: rect.y + rect.h * 0.28, w: rect.w - 32, h: rect.h * 0.66 };
      const placed = fitInterior(local, content);
      const coreFrame = Math.min(1100 / (rect.w * 1.2), 640 / (rect.h * 1.24));
      for (const item of placed) {
        const targetId = item.stub && map.interiors[item.box.id] ? `${stepNode.id}:${item.box.id}` : undefined;
        nodes.push({
          id: `${coreId}:${item.id}`,
          title: item.box.title,
          subtitle: item.box.subtitle,
          detail: item.box.detail,
          kind: item.box.kind ?? "service",
          x: item.x,
          y: item.y,
          w: item.w,
          h: item.h,
          depth: 2,
          titleSize: Math.min(titleFont(item.box.title, item.w, item.h * 0.34), 10 / stepScale, Math.max(14 / coreFrame, 1)),
          optional: "optional" in item.box ? item.box.optional : undefined,
          zoomable: Boolean(targetId),
          targetId,
        });
      }
      const localNodes = nodes.filter((node) => node.depth === 2 && node.id.startsWith(`${coreId}:`));
      for (const edge of local.edges) {
        const from = localNodes.find((node) => node.id === `${coreId}:${edge.from}`);
        const to = localNodes.find((node) => node.id === `${coreId}:${edge.to}`);
        if (from && to) keep(from, to, edge.label, edge.kind, 2);
      }
    });
    const coreNodes = nodes.filter((node) => node.depth === 1 && node.id.startsWith(`${stepNode.id}:`));
    for (const edge of map.coreEdges) {
      const from = coreNodes.find((node) => node.id === `${stepNode.id}:${edge.from}`);
      const to = coreNodes.find((node) => node.id === `${stepNode.id}:${edge.to}`);
      if (from && to) keep(from, to, edge.label, edge.kind, 1);
    }
  });
  return { width: sceneW, height: sceneH, nodes, edges };
}

export function routeSceneEdge(from: SceneNode, to: SceneNode) {
  if (!sharesSide(from, to)) return null;
  const overlapY = Math.min(from.y + from.h, to.y + to.h) - Math.max(from.y, to.y);
  const overlapX = Math.min(from.x + from.w, to.x + to.w) - Math.max(from.x, to.x);
  if (overlapY > overlapX) {
    const y = Math.max(from.y, to.y) + overlapY / 2;
    const x1 = from.x < to.x ? from.x + from.w : from.x;
    const x2 = from.x < to.x ? to.x : to.x + to.w;
    return { d: `M${x1},${y} L${x2},${y}`, label: [(x1 + x2) / 2, y] as [number, number] };
  }
  const x = Math.max(from.x, to.x) + overlapX / 2;
  const y1 = from.y < to.y ? from.y + from.h : from.y;
  const y2 = from.y < to.y ? to.y : to.y + to.h;
  return { d: `M${x},${y1} L${x},${y2}`, label: [x, (y1 + y2) / 2] as [number, number] };
}
