import type { CaseMap, Entity, Mode, Role, Scope } from "./types.ts";
import { brahe } from "./brahe.ts";

function row(ids: string[], y = 80, gap = 320): Scope["nodes"] {
  return ids.map((id, index) => ({ id, entityId: id, x: index * gap, y }));
}

function chain(ids: string[], kind: Scope["edges"][number]["kind"] = "sequence"): Scope["edges"] {
  return ids.slice(1).map((id, index) => ({
    id: `${ids[index]}-${id}`,
    from: ids[index],
    to: id,
    label: "next",
    kind,
  }));
}

function entity(id: string, title: string, subtitle: string, detail: string, role: Role, status: Entity["status"] = "implemented", extra: Partial<Entity> = {}): Entity {
  return { id, title, subtitle, detail, role, status, ...extra };
}

function process(id: string, title: string, blurb: string, modes: Mode[], entities: Entity[], edgeKind: Scope["edges"][number]["kind"] = "sequence"): CaseMap {
  const scope: Scope = {
    id: `${id}.process`,
    title,
    level: 0,
    blurb,
    modes,
    nodes: row(entities.map((item) => item.id)),
    edges: chain(entities.map((item) => item.id), edgeKind),
  };
  return {
    id,
    root: scope.id,
    entities: Object.fromEntries(entities.map((item) => [item.id, item])),
    scopes: { [scope.id]: scope },
  };
}

const fraud: CaseMap = {
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

const briefing = process(
  "company-briefing",
  "Business process",
  "A presenter picks an issuer or uploads a filing, reviews a cited briefing, and chooses whether to keep that company in the studio. The model does not approve the filing.",
  ["implemented", "proposed"],
  [
    entity("issuer", "Select an issuer or upload", "Person chooses the source", "Ticker lookup or an uploaded PDF, HTML, or TXT file. An empty text layer stops the run.", "human"),
    entity("brief", "Draft a cited briefing", "Subagents read filing nodes. Ungrounded themes abstain.", "Theme notes must quote the filing. This is not a web search and not a vector index.", "ai"),
    entity("accept", "Accept the company", "Presenter-owned", "Studio context is stored only after this click. Skipping leaves the prior context unchanged.", "decision"),
    entity("stop", "Briefing or abstention", "No automatic filing decision", "The outcome is a cited note or an abstention. It does not submit anything to the SEC.", "outcome"),
  ],
);

const research = process(
  "market-research",
  "Business process",
  "A presenter picks a ticker, reviews live or cached indicators, and chooses whether to keep a research note. The note is not financial advice.",
  ["implemented", "proposed"],
  [
    entity("ticker", "Select a ticker", "Person chooses the symbol", "Any US ticker. An accepted briefing can prefill it. The presenter can change it.", "human"),
    entity("note", "Draft a research note", "Local model writes from tool rows. The note is not advice.", "Yahoo and FRED data are fetched or reused from the same-day cache. Conflicts are computed before the model writes.", "ai"),
    entity("accept", "Accept the research note", "Presenter-owned", "The note is stored only after this click. Indicators remain if the note is omitted.", "decision"),
    entity("stop", "Note or indicators only", "Not a recommendation to trade", "The demo labels the text as not financial advice. It does not place an order.", "outcome"),
  ],
);

const advisory = process(
  "client-advisory",
  "Business process",
  "An advisor enters holdings and optional accepted context, reviews a meeting brief, and chooses whether to keep it. The brief is not advice and there is no household CRM catalog.",
  ["implemented", "proposed"],
  [
    entity("holdings", "Enter holdings", "Advisor types tickers and weights", "There is no imported book of business. Prices are looked up for the symbols entered here.", "human"),
    entity("brief", "Draft a meeting brief", "Rules run first. The model does not give advice.", "Suitability checks are CPU rules. The local model may phrase a brief around those results and any accepted context.", "ai"),
    entity("accept", "Accept the meeting brief", "Advisor-owned", "The brief is stored only after this click. Holdings remain if the brief is omitted.", "decision"),
    entity("stop", "Brief or holdings only", "Not a client recommendation", "The demo states the text is not advice. It does not rebalance an account.", "outcome"),
  ],
);

const proposed = (id: string, title: string, blurb: string, steps: [string, string, string, Role][]) => process(
  id,
  "Proposed process",
  blurb,
  ["proposed"],
  steps.map(([stepId, label, line, role]) => entity(
    stepId,
    label,
    line,
    `${label}. This use case is a proposed design in the studio, not a running integration.`,
    role,
    "proposed",
  )),
);

const kyc = proposed("kyc-processing", "Proposed process", "A proposed onboarding review. No KYC system is running in this studio, and a model would not approve the customer.", [
  ["intake", "Intake documents", "Person submits identity records", "human"],
  ["extract", "Extract fields", "A model would propose fields, not a decision.", "ai"],
  ["review", "Analyst decides", "A person would approve or reject onboarding.", "decision"],
  ["stop", "Decision outside the model", "The model would not clear the customer.", "outcome"],
]);

const sar = process(
  "sar-support",
  "Business process",
  "A BSA/AML investigator works a synthetic alert or fraud referral: the investigation agent assembles the case and drafts a cited narrative, the investigator decides file or no SAR, and a separate QA reviewer approves. E-filing is simulated.",
  ["implemented", "proposed"],
  [
    entity("case", "Open the case", "Alert or fraud referral", "Scenario cards or the fraud inbox. A fraud handoff seeds the case and its evidence. Synthetic data, obviously fake PII.", "human"),
    entity("draft", "Assemble, draft, and verify", "Investigation Deep Agent", "Case tools return evidence items with stable ids. Typology rules are deterministic. Every narrative sentence must cite evidence that contains its figures, or it is dropped.", "ai"),
    entity("decide", "Investigator decides", "File or no SAR, with a rationale", "The investigator can edit the narrative; edits are re-verified. Contacting the subject is denied (no tipping off).", "decision"),
    entity("stop", "QA approves · simulated e-file", "Separate reviewer required", "Agent Control denies filing until a different second-line reviewer approves. Nothing is sent to FinCEN.", "outcome"),
  ],
);

const transactions = proposed("transaction-llm", "Proposed process", "A proposed enrichment path. Authorization stays on the existing pipeline, which has no LLM.", [
  ["ingest", "Ingest payments", "Existing pipeline, no model", "service"],
  ["enrich", "Propose fields", "A model would suggest fields for exceptions only.", "ai"],
  ["review", "Operations accepts fields", "People accept or reject suggestions.", "decision"],
  ["stop", "Authorization unchanged", "The payment path would not wait on a model.", "outcome"],
]);

const vulnerability = process("code-vulnerability", "Business process", "A reviewer validates payments vulnerability evidence, prepares HEC events, and tracks remediation under a stable finding identity.", ["implemented", "proposed"], [
  entity("source", "Inspect payments source", "Synthetic merchant settlements", "Each run copies the bundled Python and SQLite sample.", "human"),
  entity("scan", "Validate finding evidence", "Visa VVAH and scoped Foundry profile", "Model findings receive revision-bound citation checks and independent HTTP validation.", "ai"),
  entity("review", "Prepare approved evidence", "Agent Control publication gate", "Verified evidence produces a local HEC envelope. Invalid citations block publication.", "decision"),
  entity("test", "Review remediation", "Patch checks and rescan history", "A person applies the reviewed diff. Trusted regression and HTTP checks record the result under the stable finding identity.", "outcome"),
]);

export const caseMaps: Record<string, CaseMap> = {
  "code-vulnerability": vulnerability,
  "brahe-bank": brahe,
  "fraud-modeling": fraud,
  "company-briefing": briefing,
  "market-research": research,
  "client-advisory": advisory,
  "kyc-processing": kyc,
  "sar-support": sar,
  "transaction-llm": transactions,
};
