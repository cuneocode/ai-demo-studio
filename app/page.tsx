"use client";

import { useMemo, useState } from "react";
import BankingDemo from "./BankingDemo";
import ArchitectureMap from "./ArchitectureMap";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Boxes,
  BrainCircuit,
  Check,
  ChevronDown,
  CircleGauge,
  CircleHelp,
  Eye,
  FileSearch,
  Fingerprint,
  Grid2X2,
  Home,
  Landmark,
  Library,
  LockKeyhole,
  Menu,
  Network,
  PanelLeftClose,
  Play,
  Plus,
  Radio,
  ReceiptText,
  Search,
  ServerCog,
  Settings2,
  Shield,
  ShieldCheck,
  SlidersHorizontal,
  Sparkles,
  WalletCards,
  Workflow,
  X,
} from "lucide-react";

type View = "overview" | "library" | "stories";
type Category = "All" | "Risk & compliance" | "Wealth & advisory" | "Operations";

type UseCase = {
  id: string;
  title: string;
  category: Exclude<Category, "All">;
  description: string;
  outcome: string;
  icon: LucideIcon;
  accent: "blue" | "violet" | "mint" | "amber";
  solutions: string[];
  signal: string;
  stage: string;
};

type UseCaseFrame = {
  liveExperience?: "banking";
  transformation: {
    friction: string;
    aiShift: string;
    humanControl: string;
  };
  architecture: {
    process: { title: string; detail: string }[];
    ai: { point: string; label: string; detail: string }[];
  };
  metrics: { label: string; value: string; detail: string }[];
  rows: { name: string; stage: string; signal: string; status: string; tone: "ready" | "review" | "pending" }[];
  workbenchLabel: string;
  workbenchTitle: string;
  workbenchSummary: string;
  evidence: string[];
  primaryAction: string;
};

/**
 * IMPLEMENTATION BOUNDARY — keep this explicit for future contributors and coding agents.
 * The catalog data, local state, handlers, work queues, and AI outputs below are prototype-only.
 * A real deployment may replace the frontend flow, routes, data model, services, and backend behavior.
 * Preserve the shared component class contracts and the established ink/navy/slate/cobalt/violet
 * design theme unless an intentional product redesign is requested.
 */
const useCases: UseCase[] = [
  {
    id: "brahe-bank", title: "Brahe Bank assistant", category: "Operations",
    description: "Explore product questions and credit eligibility with a supervisor and specialist agents.",
    outcome: "See retrieval, agent handoffs, and evaluation in a working conversation.",
    icon: Landmark, accent: "blue", solutions: ["AI Defense", "Splunk OTLP (optional)", "Galileo"],
    signal: "Interactive banking", stage: "Interactive",
  },
  {
    id: "kyc-processing",
    title: "KYC processing",
    category: "Risk & compliance",
    description: "Review documents, verify entities, and route exceptions through a governed AI workflow.",
    outcome: "Faster onboarding with reviewable decisions.",
    icon: Fingerprint,
    accent: "blue",
    solutions: ["AI Defense", "AI Infrastructure"],
    signal: "Document intake",
    stage: "Ready",
  },
  {
    id: "sar-support",
    title: "SAR reporting support",
    category: "Risk & compliance",
    description: "Draft analyst-ready narratives from transaction signals and case notes, with human approval.",
    outcome: "More time for investigation and escalation.",
    icon: FileSearch,
    accent: "violet",
    solutions: ["Splunk Observability", "AI Defense"],
    signal: "Case investigation",
    stage: "Ready",
  },
  {
    id: "fraud-modeling",
    title: "Fraud model operations",
    category: "Operations",
    description: "Enrich alerts, compare models, and detect drift before it affects decisions.",
    outcome: "Observable, explainable model decisions.",
    icon: CircleGauge,
    accent: "mint",
    solutions: ["Splunk Observability", "AI Infrastructure"],
    signal: "Model signal",
    stage: "Concept",
  },
  {
    id: "client-advisory",
    title: "Client advisory",
    category: "Wealth & advisory",
    description: "Combine trusted client context, opportunity signals, and compliant next steps.",
    outcome: "Personalized service with protected client data.",
    icon: WalletCards,
    accent: "amber",
    solutions: ["AI Defense", "AI Infrastructure"],
    signal: "Advisor briefing",
    stage: "Ready",
  },
  {
    id: "market-research",
    title: "Wealth market research",
    category: "Wealth & advisory",
    description: "Synthesize filings, market events, and house views in an evidence-linked workspace.",
    outcome: "Faster research with source visibility.",
    icon: Landmark,
    accent: "blue",
    solutions: ["AI Defense", "Splunk Observability"],
    signal: "Research synthesis",
    stage: "Concept",
  },
  {
    id: "transaction-llm",
    title: "Transaction intelligence",
    category: "Operations",
    description: "Turn high-volume transaction data into searchable context for operations and risk teams.",
    outcome: "Clearer payment activity and faster action.",
    icon: ReceiptText,
    accent: "violet",
    solutions: ["AI Infrastructure", "Splunk Observability"],
    signal: "Data enrichment",
    stage: "Concept",
  },
];

const useCaseFrames: Record<string, UseCaseFrame> = {
  // Every demo uses UseCaseWorkspace and ArchitectureMap. Live frontends/backends
  // may evolve independently; never bypass the shared mapping or design theme.
  "brahe-bank": {
    liveExperience: "banking",
    transformation: {
      friction: "Customers navigate product documents and separate score checks to understand card eligibility.",
      aiShift: "A supervisor routes the question to product and score specialists, then combines evidence into an answer.",
      humanControl: "Customers review the explanation; actual applications and credit decisions remain outside this demo.",
    },
    architecture: {
      process: [
        { title: "Ask a banking question", detail: "Product, score, or eligibility request" },
        { title: "Gather product and score facts", detail: "Card terms + mock customer score" },
        { title: "Explain eligibility", detail: "Compare score with documented criteria" },
        { title: "Review next steps", detail: "Customer review; no application submitted" },
      ],
      ai: [
        { point: "01 → 02", label: "Supervisor routing", detail: "The LLM delegates product questions and score checks to specialist agents." },
        { point: "02 → 03", label: "Retrieval + context assembly", detail: "Product documents, score-tool results, and conversation history ground the explanation. Local search today; Pinecone vector retrieval when configured." },
        { point: "03 → 04", label: "Evidence-based response", detail: "The supervisor synthesizes facts and eligibility criteria. OpenAI hosts inference today; private GPU inference is a deployment option." },
      ],
    },
    metrics: [], rows: [], evidence: [], workbenchLabel: "Banking assistant",
    workbenchTitle: "Brahe Bank", workbenchSummary: "Product and eligibility guidance",
    primaryAction: "Open assistant",
  },
  "kyc-processing": {
    transformation: {
      friction: "Analysts move between documents, registries, and screening tools to assemble a case.",
      aiShift: "AI extracts evidence, reconciles entities, and sends only uncertain matches to review.",
      humanControl: "Analysts retain approval authority with source evidence and policy context attached.",
    },
    architecture: {
      process: [
        { title: "Intake documents", detail: "Identity and entity records" },
        { title: "Verify identity", detail: "Registry and sanctions checks" },
        { title: "Assess exceptions", detail: "Risk and discrepancy review" },
        { title: "Approve onboarding", detail: "Analyst-owned decision" },
      ],
      ai: [
        { point: "01 → 02", label: "Document intelligence", detail: "GPU-accelerated OCR and document models extract fields and detect mismatches." },
        { point: "02 → 03", label: "RAG + context engineering", detail: "Build an entitled case context from registry, ownership, policy, and prior-case data." },
        { point: "03 → 04", label: "Exception review", detail: "Summarize discrepancies with cited evidence; the analyst retains approval." },
      ],
    },
    metrics: [
      { label: "Open reviews", value: "24", detail: "7 need analyst review" },
      { label: "Median age", value: "2h 18m", detail: "Down 16% this week" },
      { label: "Auto-verified", value: "71%", detail: "Within policy threshold" },
    ],
    rows: [
      { name: "Northstar Imports LLC", stage: "Business verification", signal: "2 documents missing", status: "Review", tone: "review" },
      { name: "Avery Chen", stage: "Identity match", signal: "Selfie mismatch", status: "Review", tone: "review" },
      { name: "Morrow Family Trust", stage: "Beneficial ownership", signal: "1 owner unverified", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Next case",
    workbenchTitle: "Northstar Imports LLC",
    workbenchSummary: "Registration data matched. Two ownership documents are still required before approval.",
    evidence: ["Registry match", "Sanctions clear", "Ownership incomplete"],
    primaryAction: "Review next case",
  },
  "sar-support": {
    transformation: {
      friction: "Investigators manually connect transaction patterns, notes, and supporting evidence.",
      aiShift: "AI builds a cited event timeline and drafts a narrative from approved case evidence.",
      humanControl: "Investigators validate every claim and own escalation, filing, and final language.",
    },
    architecture: {
      process: [
        { title: "Triage alert", detail: "Prioritize suspicious activity" },
        { title: "Investigate activity", detail: "Link accounts and transactions" },
        { title: "Draft narrative", detail: "Build chronology and rationale" },
        { title: "Review and file", detail: "Investigator-owned filing" },
      ],
      ai: [
        { point: "01 → 02", label: "Alert enrichment", detail: "Models rank alerts and identify linked accounts, parties, and transaction patterns." },
        { point: "02 → 03", label: "RAG + context engineering", detail: "Assemble transactions, KYC, case history, typologies, and guidance as cited evidence." },
        { point: "03 → 04", label: "Narrative generation", detail: "GPU-hosted LLM drafts from approved evidence; the investigator edits and approves." },
      ],
    },
    metrics: [
      { label: "Open investigations", value: "18", detail: "3 due today" },
      { label: "Narratives ready", value: "6", detail: "Awaiting approval" },
      { label: "Evidence linked", value: "94%", detail: "Across open cases" },
    ],
    rows: [
      { name: "SAR-2481", stage: "Structuring pattern", signal: "Narrative ready", status: "Ready", tone: "ready" },
      { name: "SAR-2476", stage: "Rapid movement", signal: "5 linked accounts", status: "Review", tone: "review" },
      { name: "SAR-2469", stage: "Wire destination", signal: "Evidence incomplete", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Investigation brief",
    workbenchTitle: "SAR-2481",
    workbenchSummary: "Repeated deposits below the reporting threshold were followed by same-day outbound wires across three beneficiaries.",
    evidence: ["12 transactions", "3 beneficiaries", "90-day timeline"],
    primaryAction: "Open next investigation",
  },
  "fraud-modeling": {
    transformation: {
      friction: "Model drift and alert quality are reviewed across disconnected operational tools.",
      aiShift: "AI correlates performance signals, isolates affected segments, and explains likely causes.",
      humanControl: "Model owners approve thresholds, deployment changes, and rollback decisions.",
    },
    architecture: {
      process: [
        { title: "Build features", detail: "Behavior, device, and account data" },
        { title: "Score transactions", detail: "Real-time fraud decision" },
        { title: "Investigate alerts", detail: "Review high-risk activity" },
        { title: "Update models", detail: "Monitor drift and performance" },
      ],
      ai: [
        { point: "01 → 02", label: "Accelerated scoring", detail: "GPU inference evaluates high-dimensional features inside the decision window." },
        { point: "02 → 03", label: "RAG + case context", detail: "Retrieve history, device signals, prior alerts, rules, and model explanations." },
        { point: "03 → 04", label: "Model operations agent", detail: "Compare cohorts, explain drift, and propose investigation or rollback steps." },
      ],
    },
    metrics: [
      { label: "Active models", value: "03", detail: "All serving traffic" },
      { label: "Drift alerts", value: "01", detail: "Review required" },
      { label: "Alerts reviewed", value: "86%", detail: "Current cycle" },
    ],
    rows: [
      { name: "Card-not-present v4", stage: "Population drift", signal: "+8.2% PSI", status: "Review", tone: "review" },
      { name: "Account takeover v2", stage: "Performance", signal: "Precision 92.8%", status: "Stable", tone: "ready" },
      { name: "ACH mule v1", stage: "Shadow mode", signal: "Validation running", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Model finding",
    workbenchTitle: "Card-not-present v4",
    workbenchSummary: "International e-commerce traffic shifted beyond the monitored baseline. Precision remains within tolerance.",
    evidence: ["PSI 0.082", "Precision stable", "Segment isolated"],
    primaryAction: "Review drift alert",
  },
  "client-advisory": {
    transformation: {
      friction: "Advisors assemble client context, market views, and compliance notes before each meeting.",
      aiShift: "AI creates a grounded briefing and surfaces relevant opportunities and constraints.",
      humanControl: "The advisor validates suitability and decides what guidance reaches the client.",
    },
    architecture: {
      process: [
        { title: "Gather client context", detail: "CRM, portfolio, goals, notes" },
        { title: "Prepare briefing", detail: "Changes and discussion points" },
        { title: "Review suitability", detail: "Constraints and candidate actions" },
        { title: "Meet and document", detail: "Advisor-owned recommendation" },
      ],
      ai: [
        { point: "01 → 02", label: "RAG + context engineering", detail: "Entitled retrieval combines client data, approved research, portfolio facts, and policy." },
        { point: "02 → 03", label: "GPU briefing generation", detail: "An LLM synthesizes a sourced briefing and candidate discussion points." },
        { point: "03 → 04", label: "Suitability copilot", detail: "Check proposed actions against constraints and draft notes; the advisor decides." },
      ],
    },
    metrics: [
      { label: "Briefings due", value: "08", detail: "Across 5 advisors" },
      { label: "Priority follow-ups", value: "03", detail: "Due today" },
      { label: "Compliance checks", value: "02", detail: "Need review" },
    ],
    rows: [
      { name: "Carter household", stage: "Portfolio review", signal: "Meeting today", status: "Ready", tone: "ready" },
      { name: "Meridian Dental Partners", stage: "Liquidity event", signal: "Follow-up due", status: "Review", tone: "review" },
      { name: "Elena Ruiz", stage: "Distribution request", signal: "Suitability check", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Advisor brief",
    workbenchTitle: "Carter household",
    workbenchSummary: "Concentrated technology exposure increased after recent gains. The household also has a liquidity need in Q4.",
    evidence: ["Portfolio snapshot", "Meeting notes", "House view"],
    primaryAction: "Open next briefing",
  },
  "market-research": {
    transformation: {
      friction: "Researchers scan filings, transcripts, and market feeds before forming a house view.",
      aiShift: "AI synthesizes changes, compares sources, and links every assertion to evidence.",
      humanControl: "Research staff challenge conclusions and approve anything distributed downstream.",
    },
    architecture: {
      process: [
        { title: "Monitor sources", detail: "Filings, transcripts, and events" },
        { title: "Extract evidence", detail: "Facts, changes, and citations" },
        { title: "Form investment view", detail: "Compare themes and conflicts" },
        { title: "Review and publish", detail: "Analyst-owned house view" },
      ],
      ai: [
        { point: "01 → 02", label: "Accelerated ingestion", detail: "GPU document and embedding models process filings, transcripts, and market events." },
        { point: "02 → 03", label: "RAG + context engineering", detail: "Hybrid retrieval applies time, entitlement, and citation metadata to research context." },
        { point: "03 → 04", label: "Research synthesis", detail: "Compare evidence, expose conflicts, and draft a cited note for analyst review." },
      ],
    },
    metrics: [
      { label: "New sources", value: "12", detail: "Since last review" },
      { label: "Draft notes", value: "04", detail: "2 ready to publish" },
      { label: "Watchlist events", value: "02", detail: "Material changes" },
    ],
    rows: [
      { name: "Regional banks", stage: "Quarterly data", signal: "Ratios extracted", status: "Ready", tone: "ready" },
      { name: "Investment-grade credit", stage: "Spread movement", signal: "Draft ready", status: "Review", tone: "review" },
      { name: "AI infrastructure", stage: "Earnings transcripts", signal: "3 citations needed", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Research note",
    workbenchTitle: "Regional banks — Q3 update",
    workbenchSummary: "Net interest margins stabilized across the tracked group while deposit costs remained uneven by institution size.",
    evidence: ["8 filings", "3 transcripts", "Market data"],
    primaryAction: "Review research queue",
  },
  "transaction-llm": {
    transformation: {
      friction: "Operations teams interpret inconsistent payment descriptions and fragmented records.",
      aiShift: "AI normalizes transaction context, resolves entities, and explains exceptions in plain language.",
      humanControl: "Operations and risk teams decide disposition for exceptions and sensitive actions.",
    },
    architecture: {
      process: [
        { title: "Ingest transactions", detail: "Payment records at volume" },
        { title: "Normalize and enrich", detail: "Entities, purpose, and codes" },
        { title: "Resolve exceptions", detail: "Review low-confidence records" },
        { title: "Publish downstream", detail: "Governed enriched data" },
      ],
      ai: [
        { point: "01 → 02", label: "Accelerated extraction", detail: "GPU models parse payment text, resolve entities, and classify purpose at volume." },
        { point: "02 → 03", label: "RAG + context engineering", detail: "Ground exceptions in account, counterparty, policy, codes, and transaction history." },
        { point: "03 → 04", label: "Resolution agent", detail: "Propose normalized fields with evidence; low-confidence cases route to operations." },
      ],
    },
    metrics: [
      { label: "Transactions today", value: "184,203", detail: "Across 12 sources" },
      { label: "Exceptions", value: "42", detail: "0.02% of volume" },
      { label: "Median processing", value: "380 ms", detail: "Within target" },
    ],
    rows: [
      { name: "TXN-88421", stage: "Wire description", signal: "Entity unresolved", status: "Review", tone: "review" },
      { name: "TXN-88397", stage: "Merchant payment", signal: "Category confirmed", status: "Ready", tone: "ready" },
      { name: "TXN-88364", stage: "Cross-border transfer", signal: "Purpose review", status: "Pending", tone: "pending" },
    ],
    workbenchLabel: "Exception summary",
    workbenchTitle: "TXN-88421",
    workbenchSummary: "The payment narrative references a supplier name that does not resolve to the beneficiary record.",
    evidence: ["Payment message", "Entity graph", "Account history"],
    primaryAction: "Investigate exception",
  },
};

const storySteps = [
  { title: "KYC intake", label: "Know the client", icon: Fingerprint, color: "blue" },
  { title: "Transaction screening", label: "See the signal", icon: ReceiptText, color: "violet" },
  { title: "SAR support", label: "Investigate & report", icon: FileSearch, color: "mint" },
  { title: "Client advisory", label: "Serve with context", icon: WalletCards, color: "amber" },
];

const navItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "library", label: "Use case library", icon: Library },
  { id: "stories", label: "Story builder", icon: Workflow },
];

function CiscoMark() {
  return (
    <span className="cisco-mark" aria-hidden="true">
      {[7, 12, 17, 11, 7, 13, 8].map((height, index) => (
        <span key={index} style={{ height }} />
      ))}
    </span>
  );
}

function StatusDot({ tone = "mint" }: { tone?: "mint" | "blue" | "violet" | "amber" }) {
  return <span className={`status-dot ${tone}`} aria-hidden="true" />;
}

function UseCaseCard({ useCase, onOpen }: { useCase: UseCase; onOpen: (item: UseCase) => void }) {
  const Icon = useCase.icon;

  return (
    <article
      className={`use-case-card accent-${useCase.accent}`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${useCase.title} experience`}
      onClick={() => onOpen(useCase)}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onOpen(useCase);
        }
      }}
    >
      <div className="card-topline">
        <span className="category-label">{useCase.category}</span>
        <span className="stage-label"><StatusDot tone={useCase.stage === "Ready" ? "mint" : "amber"} />{useCase.stage}</span>
      </div>
      <div className="use-case-heading">
        <span className="use-case-icon"><Icon size={21} strokeWidth={1.8} /></span>
        <div>
          <span className="signal-label">{useCase.signal}</span>
          <h3>{useCase.title}</h3>
        </div>
      </div>
      <p>{useCase.description}</p>
      <div className="outcome-row">
        <ArrowUpRight size={15} />
        <span>{useCase.outcome}</span>
      </div>
      <div className="solution-pills" aria-label="Supporting Cisco solutions">
        {useCase.solutions.map((solution) => <span key={solution}>{solution}</span>)}
      </div>
      <div className="card-action">Explore AI experience <ArrowRight size={16} /></div>
    </article>
  );
}

function PlatformRail() {
  const capabilities = [
    {
      title: "Cisco AI Defense",
      label: "Runtime protection",
      description: "Policy, model, and data protection across each AI interaction.",
      icon: ShieldCheck,
      tone: "blue" as const,
    },
    {
      title: "Splunk Agent Observability",
      label: "End-to-end visibility",
      description: "Trace agent actions, tool calls, latency, quality, and outcomes.",
      icon: Activity,
      tone: "violet" as const,
    },
    {
      title: "Cisco AI Infrastructure",
      label: "Built to scale",
      description: "Secure compute, networking, and operations for AI workloads.",
      icon: ServerCog,
      tone: "mint" as const,
    },
  ];

  return (
    <aside className="platform-rail">
      <div className="rail-heading">
        <div>
          <span className="eyebrow">PLATFORM CONTROL PLANE</span>
          <h2>Cisco platform</h2>
        </div>
        <span className="live-chip">Architecture mapping</span>
      </div>
      <p className="rail-intro">Security, observability, and infrastructure mapped to each demo.</p>
      <div className="capability-list">
        {capabilities.map((capability, index) => {
          const Icon = capability.icon;
          return (
            <div className="capability-row" key={capability.title}>
              <div className={`capability-icon ${capability.tone}`}><Icon size={18} /></div>
              <div className="capability-copy">
                <span>{capability.label}</span>
                <strong>{capability.title}</strong>
                <p>{capability.description}</p>
              </div>
              <span className="capability-index">0{index + 1}</span>
            </div>
          );
        })}
      </div>
      <div className="rail-footer">
        <div className="coverage-ring"><span>100%</span><small>mapped</small></div>
        <div><strong>Platform coverage</strong><p>Every demo includes at least two Cisco capabilities.</p></div>
      </div>
    </aside>
  );
}

function StoryMap({ compact = false }: { compact?: boolean }) {
  return (
    <div className={`story-map ${compact ? "compact" : ""}`}>
      {storySteps.map((step, index) => {
        const Icon = step.icon;
        return (
          <div className="story-segment" key={step.title}>
            <div className={`story-node ${step.color}`}>
              <span className="node-number">0{index + 1}</span>
              <Icon size={compact ? 18 : 22} />
            </div>
            <div className="story-label">
              <strong>{step.title}</strong>
              <span>{step.label}</span>
            </div>
            {index < storySteps.length - 1 && <div className="story-connector"><span /></div>}
          </div>
        );
      })}
    </div>
  );
}

function UseCaseWorkspace({
  useCase,
  inStory,
  onBack,
  onAdd,
}: {
  useCase: UseCase;
  inStory: boolean;
  onBack: () => void;
  onAdd: () => void;
}) {
  const frame = useCaseFrames[useCase.id];
  const Icon = useCase.icon;

  return (
    <div className="case-frame-page">
      <button className="case-back-button" onClick={onBack}><ArrowLeft size={15} /> Back to library</button>

      <header className="case-frame-heading">
        <div className="case-title-lockup">
          <span className={`case-title-icon ${useCase.accent}`}><Icon size={24} /></span>
          <div>
            <span className="eyebrow">{useCase.category}</span>
            <h1>{useCase.title}</h1>
            <p>{useCase.description}</p>
          </div>
        </div>
        <div className="heading-actions">
          <span className="prototype-chip"><StatusDot tone="amber" /> {frame.liveExperience ? "Live AI · fictional bank" : "Prototype data"}</span>
          <button className="secondary-button" onClick={onAdd}>{inStory ? <><Check size={16} /> In story</> : <><Plus size={16} /> Add to story</>}</button>
          <button className="primary-button" onClick={frame.liveExperience ? () => { document.getElementById("banking-experience")?.scrollIntoView({ behavior: "smooth" }); document.querySelector<HTMLInputElement>('.chat-composer input')?.focus({ preventScroll: true }); } : undefined}>{frame.primaryAction} <ArrowRight size={16} /></button>
        </div>
      </header>

      <ArchitectureMap key={useCase.id} caseId={useCase.id} title={useCase.title} frame={frame} />

      {frame.liveExperience === "banking" ? <section id="banking-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Banking assistant</h2></div><span>Fictional products · mock score 550</span></div>
        <BankingDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section> : <>
      <div className="experience-label">
        <div><span className="eyebrow">ILLUSTRATIVE EXPERIENCE</span><h2>How the use case could appear</h2></div>
        <span>Frontend and data are prototype-only</span>
      </div>

      <section className="case-metrics" aria-label={`${useCase.title} summary metrics`}>
        {frame.metrics.map((metric, index) => (
          <article key={metric.label}>
            <span>0{index + 1}</span>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <small>{metric.detail}</small>
          </article>
        ))}
      </section>

      <div className="case-workspace-grid">
        <section className="case-queue-panel">
          <div className="case-panel-heading">
            <div><span className="eyebrow">WORK QUEUE</span><h2>Priority items</h2></div>
            <button className="icon-button" aria-label="Queue settings"><SlidersHorizontal size={17} /></button>
          </div>
          <div className="case-table" role="table" aria-label={`${useCase.title} priority work queue`}>
            <div className="case-table-header" role="row">
              <span role="columnheader">Item</span><span role="columnheader">Stage</span><span role="columnheader">Signal</span><span role="columnheader">Status</span><span />
            </div>
            {frame.rows.map((row) => (
              <button className="case-table-row" role="row" key={row.name}>
                <strong role="cell">{row.name}</strong>
                <span role="cell">{row.stage}</span>
                <span role="cell">{row.signal}</span>
                <em className={row.tone} role="cell"><StatusDot tone={row.tone === "ready" ? "mint" : row.tone === "review" ? "amber" : "violet"} />{row.status}</em>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
          <div className="queue-footer"><span>Showing highest-priority items</span><button>Open full queue <ArrowRight size={14} /></button></div>
        </section>

        <aside className="ai-workbench-panel">
          <div className="workbench-heading">
            <span className="workbench-icon"><BrainCircuit size={19} /></span>
            <div><span className="eyebrow">AI-ASSISTED REVIEW</span><h2>{frame.workbenchLabel}</h2></div>
            <span className="trace-chip"><Activity size={12} /> Trace active</span>
          </div>
          <div className="workbench-body">
            <span className="workbench-kicker">SELECTED ITEM</span>
            <h3>{frame.workbenchTitle}</h3>
            <p>{frame.workbenchSummary}</p>
            <div className="evidence-list">
              {frame.evidence.map((item) => <span key={item}><Check size={13} />{item}</span>)}
            </div>
            <div className="workbench-recommendation"><Sparkles size={16} /><div><small>SUGGESTED ACTION</small><strong>{frame.primaryAction}</strong></div></div>
          </div>
          <div className="workbench-actions"><button className="secondary-button">View evidence</button><button className="primary-button">Continue <ArrowRight size={15} /></button></div>
        </aside>
      </div>

      </>}
    </div>
  );
}

export default function HomePage() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [filter, setFilter] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<UseCase | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storyItems, setStoryItems] = useState<string[]>(["kyc-processing", "sar-support", "client-advisory"]);

  const openUseCase = (item: UseCase) => {
    setSelectedCase(item);
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" })));
  };

  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return useCases.filter((item) => {
      const matchesFilter = filter === "All" || item.category === filter;
      const matchesQuery = !normalized || `${item.title} ${item.description} ${item.solutions.join(" ")}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  const switchView = (view: View) => {
    setSelectedCase(null);
    setActiveView(view);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand-lockup">
          <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button>
          <CiscoMark />
          <div className="brand-copy"><strong>FSI</strong><span>AI Demo Studio</span></div>
          <span className="top-divider" />
          <button className="tenant-switcher">Global Financial Services <ChevronDown size={14} /></button>
        </div>
        <nav className="product-nav" aria-label="Product areas">
          <button className="app-launcher-button" aria-label="Open app launcher" onClick={() => setLauncherOpen(true)}><Grid2X2 size={18} /></button>
          <button className="active"><CircleGauge size={17} /> Studio</button>
          <button><Shield size={17} /> Controls</button>
          <button><Activity size={17} /> Telemetry</button>
        </nav>
        <div className="top-actions">
          <span className="demo-mode"><StatusDot /> Demo mode</span>
          <button aria-label="Help"><CircleHelp size={18} /></button>
          <button className="notification-button" aria-label="Notifications"><Bell size={18} /><span /></button>
          <button className="avatar" aria-label="User profile">JC</button>
        </div>
      </header>

      <div className="shell-body">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <nav className="side-nav" aria-label="Main navigation">
            <span className="nav-group-label">Workspace</span>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={!selectedCase && activeView === item.id ? "active" : ""} onClick={() => switchView(item.id)}>
                  <Icon size={18} /><span>{item.label}</span>
                  {item.id === "stories" && <em>{storyItems.length}</em>}
                </button>
              );
            })}
            <span className="nav-separator" />
            <span className="nav-group-label">Explore by domain</span>
            <button onClick={() => { setFilter("Risk & compliance"); switchView("library"); }}><LockKeyhole size={18} /><span>Risk & compliance</span></button>
            <button onClick={() => { setFilter("Wealth & advisory"); switchView("library"); }}><Landmark size={18} /><span>Wealth & advisory</span></button>
            <button onClick={() => { setFilter("Operations"); switchView("library"); }}><Boxes size={18} /><span>Operations</span></button>
          </nav>

          <div className="sidebar-platform">
            <span className="nav-group-label">Cisco platform</span>
            <div><ShieldCheck size={17} /><span>AI Defense</span><StatusDot /></div>
            <div><Activity size={17} /><span>Agent Observability</span><StatusDot tone="violet" /></div>
            <div><ServerCog size={17} /><span>AI Infrastructure</span><StatusDot tone="blue" /></div>
          </div>
          <button className="collapse-button" aria-label="Collapse navigation"><PanelLeftClose size={17} /> Collapse</button>
        </aside>

        {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

        <main className="main-content">
          {selectedCase && (
            <UseCaseWorkspace
              useCase={selectedCase}
              inStory={storyItems.includes(selectedCase.id)}
              onBack={() => { setSelectedCase(null); setActiveView("library"); }}
              onAdd={() => setStoryItems(items => items.includes(selectedCase.id) ? items : [...items, selectedCase.id])}
            />
          )}

          {!selectedCase && activeView === "overview" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="breadcrumb">FSI AI Demo Studio <span>/</span> Overview</span>
                  <h1>Financial services AI demos</h1>
                  <p>Modular use cases connected by security, observability, and infrastructure.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary-button" onClick={() => switchView("library")}><Library size={17} /> Browse use cases</button>
                  <button className="primary-button" onClick={() => switchView("stories")}><Play size={16} fill="currentColor" /> Start guided story</button>
                </div>
              </div>

              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="eyebrow"><Sparkles size={13} /> FEATURED DEMO NARRATIVE</span>
                  <h2>Client lifecycle</h2>
                  <p>Connect onboarding, monitoring, investigation, and advisory. Each module works alone or as part of the full story.</p>
                  <div className="hero-meta">
                    <span><Workflow size={15} /> 4 connected moments</span>
                    <span><CircleGauge size={15} /> 18–22 minutes</span>
                    <span><Eye size={15} /> Executive + technical views</span>
                  </div>
                </div>
                <div className="hero-story">
                  <div className="story-title"><span>CLIENT LIFECYCLE STORY</span><strong>Four use cases. One client journey.</strong></div>
                  <StoryMap compact />
                </div>
              </section>

              <section className="signal-strip" aria-label="Platform summary">
                <div><span className="metric-icon blue"><Library size={18} /></span><p><strong>{String(useCases.length).padStart(2, "0")}</strong><span>Use cases</span></p><small>Modular library</small></div>
                <div><span className="metric-icon violet"><Workflow size={18} /></span><p><strong>03</strong><span>Stories</span></p><small>Flexible sequences</small></div>
                <div><span className="metric-icon mint"><ShieldCheck size={18} /></span><p><strong>03</strong><span>Cisco solutions</span></p><small>Mapped to each demo</small></div>
                <div><span className="metric-icon amber"><Radio size={18} /></span><p><strong>Local</strong><span>Studio runtime</span></p><small>Integration status in each demo</small></div>
              </section>

              <div className="overview-grid">
                <section className="use-case-section">
                  <div className="section-heading">
                    <div><span className="eyebrow">MODULAR DEMO LIBRARY</span><h2>Featured use cases</h2></div>
                    <button className="text-button" onClick={() => switchView("library")}>View all {useCases.length} <ArrowRight size={15} /></button>
                  </div>
                  <div className="use-case-grid">
                    {useCases.slice(0, 4).map((item) => <UseCaseCard key={item.id} useCase={item} onOpen={openUseCase} />)}
                  </div>
                </section>
                <PlatformRail />
              </div>
            </>
          )}

          {!selectedCase && activeView === "library" && (
            <>
              <div className="page-heading library-heading">
                <div>
                  <span className="breadcrumb">FSI AI Demo Studio <span>/</span> Library</span>
                  <h1>Use case library</h1>
                  <p>Select a standalone demo or add it to a client story.</p>
                </div>
                <button className="primary-button" onClick={() => switchView("stories")}><Workflow size={17} /> Open story builder <span className="button-count">{storyItems.length}</span></button>
              </div>
              <section className="library-toolbar">
                <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search use cases, outcomes, or Cisco solutions" /><kbd>⌘ K</kbd></label>
                <div className="filter-row" aria-label="Use case filters">
                  {(["All", "Risk & compliance", "Wealth & advisory", "Operations"] as Category[]).map((item) => (
                    <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
                  ))}
                </div>
                <button className="filter-button" aria-label="More filters"><SlidersHorizontal size={18} /></button>
              </section>
              <div className="library-summary"><span><strong>{filteredCases.length}</strong> use cases</span><span>Modular and searchable</span></div>
              <section className="library-grid">
                {filteredCases.map((item) => <UseCaseCard key={item.id} useCase={item} onOpen={openUseCase} />)}
                {filteredCases.length === 0 && <div className="empty-state"><Search size={26} /><h2>No matching use cases</h2><p>Try a broader search or reset the category filter.</p><button className="secondary-button" onClick={() => { setQuery(""); setFilter("All"); }}>Reset filters</button></div>}
              </section>
            </>
          )}

          {!selectedCase && activeView === "stories" && (
            <>
              <div className="page-heading story-page-heading">
                <div>
                  <span className="breadcrumb">FSI AI Demo Studio <span>/</span> Story builder</span>
                  <h1>Build a demo story</h1>
                  <p>Sequence use cases and choose where to show the supporting technology.</p>
                </div>
                <div className="heading-actions"><button className="secondary-button"><Settings2 size={17} /> Story settings</button><button className="primary-button"><Play size={16} fill="currentColor" /> Present story</button></div>
              </div>

              <section className="story-builder-panel">
                <div className="story-builder-top">
                  <div><span className="eyebrow">GUIDED STORY 01</span><h2>Client lifecycle</h2><p>From onboarding to personalized advice.</p></div>
                  <div className="story-score"><span>Demo readiness</span><strong>82%</strong><div><i /></div></div>
                </div>
                <StoryMap />
                <div className="story-builder-bottom">
                  <div><BrainCircuit size={18} /><span><strong>Business view</strong> Focus on client and employee outcomes.</span></div>
                  <div><Network size={18} /><span><strong>Platform view</strong> Show security, telemetry, and infrastructure.</span></div>
                  <button><Plus size={17} /> Add a moment</button>
                </div>
              </section>

              <div className="builder-grid">
                <section className="story-outline">
                  <div className="section-heading"><div><span className="eyebrow">RUN OF SHOW</span><h2>Story outline</h2></div><button className="text-button">Edit sequence <ArrowRight size={15} /></button></div>
                  {storyItems.map((id, index) => {
                    const item = useCases.find((candidate) => candidate.id === id)!;
                    const Icon = item.icon;
                    return (
                      <div className="outline-item" key={id}>
                        <span className="drag-handle">⠿</span><span className={`outline-icon ${item.accent}`}><Icon size={18} /></span>
                        <div><small>MOMENT {index + 1}</small><strong>{item.title}</strong><p>{item.outcome}</p></div>
                        <span className="outline-time">{index === 0 ? "05" : "04"} min</span>
                        <button aria-label={`Open ${item.title}`} onClick={() => openUseCase(item)}><ArrowUpRight size={17} /></button>
                      </div>
                    );
                  })}
                  <button className="add-frame-button" onClick={() => switchView("library")}><Plus size={18} /> Add a use case from the library</button>
                </section>
                <section className="presenter-panel">
                  <span className="eyebrow">PRESENTER VIEW</span>
                  <h2>Talk track</h2>
                  <div className="presenter-card"><span className="presenter-tag">OPENING</span><p>One governed AI foundation across the client lifecycle.</p></div>
                  <div className="talk-track"><span><Check size={15} /> Start with client and employee outcomes</span><span><Check size={15} /> Show architecture when relevant</span><span><Check size={15} /> Close with end-to-end observability</span></div>
                  <button className="secondary-button"><Eye size={17} /> Preview presenter mode</button>
                </section>
              </div>
            </>
          )}
        </main>
      </div>

      {launcherOpen && (
        <div className="launcher-overlay" role="dialog" aria-modal="true" aria-label="App launcher">
          <button className="launcher-close" onClick={() => setLauncherOpen(false)} aria-label="Close app launcher"><X size={22} /></button>
          <div className="launcher-content">
            <label className="launcher-search"><Search size={20} /><input autoFocus placeholder="Search demos, stories, and platform tools..." /><kbd>⌘ + F</kbd></label>
            <div className="launcher-columns">
              <div><h2>Workspace</h2>{navItems.map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { switchView(item.id); setLauncherOpen(false); }}><Icon size={18} /><span>{item.label}</span><ArrowRight size={15} /></button>; })}</div>
              <div><h2>Use case domains</h2><button onClick={() => { setFilter("Risk & compliance"); switchView("library"); setLauncherOpen(false); }}><LockKeyhole size={18} /><span>Risk & compliance</span><ArrowRight size={15} /></button><button onClick={() => { setFilter("Wealth & advisory"); switchView("library"); setLauncherOpen(false); }}><Landmark size={18} /><span>Wealth & advisory</span><ArrowRight size={15} /></button><button onClick={() => { setFilter("Operations"); switchView("library"); setLauncherOpen(false); }}><Boxes size={18} /><span>Operations</span><ArrowRight size={15} /></button></div>
              <div><h2>Cisco solutions</h2><button><ShieldCheck size={18} /><span>AI Defense</span><StatusDot /></button><button><Activity size={18} /><span>Agent Observability</span><StatusDot tone="violet" /></button><button><ServerCog size={18} /><span>AI Infrastructure</span><StatusDot tone="blue" /></button></div>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
