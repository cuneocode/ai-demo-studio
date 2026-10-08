"use client";

import { useEffect, useMemo, useState } from "react";
import BankingDemo from "./BankingDemo";
import FraudDemo from "./FraudDemo";
import CompanyBriefing from "./CompanyBriefing";
import MarketResearch from "./MarketResearch";
import ClientAdvisory from "./ClientAdvisory";
import InterbankDemo from "./InterbankDemo";
import ArchitectureMap from "./ArchitectureMap";
import ModelBackends, { ModelChip } from "./ModelBackends";
import { loadCompanyProfile, type StoredCompanyProfile } from "./company-profile";
import { loadResearchNote, switcherContextLabel, type StoredResearchNote } from "./research-note";
import { loadAdvisoryBrief, type StoredAdvisoryBrief } from "./advisory-brief";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowLeft,
  ArrowRight,
  ArrowUpRight,
  Bell,
  Boxes,
  BrainCircuit,
  Building2,
  Check,
  ChevronDown,
  CircleGauge,
  CircleHelp,
  Cpu,
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

type View = "overview" | "library" | "stories" | "briefing" | "models";
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
  liveExperience?: "banking" | "fraud" | "briefing" | "research" | "advisory" | "interbank";
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
    id: "fraud-modeling",
    title: "Transaction fraud scoring",
    category: "Risk & compliance",
    description: "Score a payment on a graph neighborhood and inspect Shapley evidence.",
    outcome: "Explainable fraud scores without a notebook.",
    icon: CircleGauge,
    accent: "mint",
    solutions: ["AI Infrastructure", "Splunk Observability", "AI Defense"],
    signal: "Graph scoring",
    stage: "Interactive",
  },
  {
    id: "company-briefing",
    title: "Company briefing",
    category: "Operations",
    description: "Extract objectives, risks, obligations, AI initiatives, and XBRL metrics from an EDGAR filing or uploaded annual report.",
    outcome: "Presenter-owned company context after a human accept-gate.",
    icon: Building2,
    accent: "violet",
    solutions: ["AI Defense", "Splunk Observability", "AI Infrastructure"],
    signal: "Filing extract",
    stage: "Interactive",
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
    signal: "Live research · Yahoo + FRED cache",
    stage: "Interactive",
  },
  {
    id: "client-advisory",
    title: "Client advisory",
    category: "Wealth & advisory",
    description: "Combine trusted client context, opportunity signals, and compliant next steps.",
    outcome: "Personalized service with protected client data.",
    icon: WalletCards,
    accent: "amber",
    solutions: ["AI Defense", "Splunk Observability", "AI Infrastructure"],
    signal: "Live advisory · entitled context + holdings",
    stage: "Interactive",
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
  {
    id: "interbank-a2a",
    title: "Interbank settlement investigation",
    category: "Operations",
    description: "Two banks' Deep Agents investigate a failed settlement together over A2A, through each bank's AI gateway.",
    outcome: "A joint root-cause report without either bank opening its systems to the other.",
    icon: Network,
    accent: "violet",
    solutions: ["AI Defense", "Splunk Agent Observability", "Splunk Agent Control"],
    signal: "Agent-to-agent",
    stage: "Interactive",
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
    liveExperience: "fraud",
    transformation: {
      friction: "Each payment is scored in isolation, so a clean customer at a compromised merchant looks safe.",
      aiShift: "GraphSAGE + XGBoost scores the payment from the account–merchant neighborhood; Captum Shapley explains the risk. The score path does not enter Cisco AI Defense.",
      humanControl: "The score is not a fraud flag. An analyst reviews evidence and owns hold, review, or clear.",
    },
    architecture: {
      process: [
        { title: "Select a payment", detail: "Held-out TabFormer card events" },
        { title: "Score the graph edge", detail: "Neighborhood + transaction features" },
        { title: "Inspect evidence", detail: "Probability + Shapley groups" },
        { title: "Decide disposition", detail: "Analyst-owned hold / review / clear" },
      ],
      ai: [
        { point: "01 → 02", label: "GraphSAGE + XGBoost + Shapley", detail: "The live HTTP sidecar embeds the TabFormer neighborhood, classifies with XGBoost, and returns Captum Shapley groups. This hop never calls an LLM or AI Defense." },
        { point: "02 → 03", label: "Threshold band", detail: "hold ≥ 0.50, review ≥ 0.35, otherwise clear. The probability is evidence, not a fraud flag." },
        { point: "03 → 04", label: "Optional narrative", detail: "Off unless FRAUD_ENABLE_NARRATIVE=true. AI Defense inspects only this draft. Deny or LLM failure omits the text; the score still releases." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Fraud scoring",
    workbenchTitle: "Graph payment scorer",
    workbenchSummary: "Score TabFormer payments with GraphSAGE + XGBoost and review Shapley evidence.",
    primaryAction: "Review next alert",
  },
  "client-advisory": {
    liveExperience: "advisory",
    transformation: {
      friction: "Advisors assemble entitled briefing context, a research note, and live holdings by hand before each meeting.",
      aiShift: "Suitability rules run on presenter-entered weights. Local NIM drafts a cited meeting brief from accepted context only.",
      humanControl: "The advisor accept-gate owns the brief. This is a demo brief — not advice. No auto-trade.",
    },
    architecture: {
      process: [
        { title: "Enter live holdings", detail: "Ticker + weight rows · no household catalog" },
        { title: "Assemble entitled context", detail: "Accepted briefing + accepted research note" },
        { title: "Run suitability rules", detail: "Concentration, single-name cap, IPS fields" },
        { title: "Accept meeting brief", detail: "Advisor-owned localStorage write" },
      ],
      ai: [
        { point: "01 → 02", label: "Entitled context assembly", detail: "Posted accepted briefing excerpts and research snapshot fields. Off Inspection. No CRM catalog and no Tavily." },
        { point: "02 → 03", label: "Suitability rules", detail: "CPU rules on concentration and missing IPS fields. Not an LLM and not sent to AI Defense." },
        { point: "03 → 04", label: "NIM brief + advisor gate", detail: "ProtectedChatOpenAI on 127.0.0.1:8003. Defense inspects this hop only. Holdings remain if the brief is omitted." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Advisor brief",
    workbenchTitle: "Live holdings + entitled context",
    workbenchSummary: "Prepare a meeting brief from accepted studio context and presenter-entered holdings.",
    primaryAction: "Prepare meeting brief",
  },
  "market-research": {
    liveExperience: "research",
    transformation: {
      friction: "Researchers pull Yahoo prints, FRED series, and peer multiples by hand before writing a note.",
      aiShift: "Allowlisted yfinance + FRED write through a cache. CPU tools emit conflict rows. Local NIM drafts a cited note.",
      humanControl: "Accept research note is required. Demo recommendation — not financial advice. Numbers stay if the note is omitted.",
    },
    architecture: {
      process: [
        { title: "Select a ticker", detail: "Any US ticker · briefing ticker when accepted" },
        { title: "Fetch or reuse cache", detail: "Yahoo + FRED write-through · same UTC day" },
        { title: "Review indicators + conflicts", detail: "Earnings, peers, returns, macro, structured rows" },
        { title: "Accept research note", detail: "Presenter-owned localStorage write" },
      ],
      ai: [
        { point: "01 → 02", label: "Fetch + snapshot cache", detail: "Named yfinance functions and allowlisted FRED series. Off Inspection. Empty provider responses fail closed." },
        { point: "02 → 03", label: "CPU tools + conflicts", detail: "Beat-rate, peer P/E, horizon vs SPY, and structured conflicts. Not a keyword scan and not sent to Defense." },
        { point: "03 → 04", label: "NIM note + accept-gate", detail: "LangChain ChatOpenAI to local NIM on :8003. Defense inspects model hops only. Grounding drops ungrounded claims." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Research note",
    workbenchTitle: "Live Yahoo + FRED research",
    workbenchSummary: "Analyze a ticker from cache-if-fresh or a forced refresh, then accept the note.",
    primaryAction: "Analyze ticker",
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
  "company-briefing": {
    liveExperience: "briefing",
    transformation: {
      friction: "Presenters assemble issuer context from 10-Ks, tables, and notes by hand.",
      aiShift: "A Deep Agent navigates the filing TOC, reads titled nodes, and pulls XBRL facts. No open-web browse.",
      humanControl: "Nothing is stored until the presenter clicks Use this company. Refresh and clear do not skip that gate.",
    },
    architecture: {
      process: [
        { title: "Select issuer or upload", detail: "Ticker/name via EDGAR or PDF/HTML/TXT" },
        { title: "Navigate the filing", detail: "TOC nodes + companyfacts" },
        { title: "Review grounded themes", detail: "Cite-or-abstain + Defense verdict" },
        { title: "Accept company context", detail: "Presenter-owned localStorage write" },
      ],
      ai: [
        { point: "01 → 02", label: "Ingest + TOC navigator", detail: "EDGAR fetch or staged upload becomes titled nodes. No vector index over the filing." },
        { point: "02 → 03", label: "Theme subagents + XBRL", detail: "Isolated specialists read bounded nodes. Metrics come from companyfacts, not LLM arithmetic." },
        { point: "03 → 04", label: "Grounding + accept-gate", detail: "Ungrounded claims are dropped. Studio context is written only after Use this company." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Company briefing",
    workbenchTitle: "Filing extract",
    workbenchSummary: "Review a grounded issuer profile, then accept it before the tenant switcher changes.",
    primaryAction: "Extract briefing",
  },
  "interbank-a2a": {
    liveExperience: "interbank",
    transformation: {
      friction: "Settlement fails are chased by email and phone between banks, each re-keying the other's records.",
      aiShift: "Each bank's Deep Agent investigates its own records and asks the other bank's agent over A2A, through both banks' AI gateways.",
      humanControl: "Agents are read-only. Named operations teams approve SSI and instruction fixes; no funds move.",
    },
    architecture: {
      process: [
        { title: "Open the failed settlement", detail: "Ops desk kickoff to Bank A's agent" },
        { title: "Investigate own records", detail: "Read-only SQL on Bank A's data" },
        { title: "Coordinate with the counterparty", detail: "A2A to Bank B through both gateways" },
        { title: "Approve remediation", detail: "Each bank's team decides" },
      ],
      ai: [
        { point: "01 → 02", label: "Bank A Deep Agent", detail: "Plans the investigation, queries Bank A's settlement records, and decides what to ask Bank B." },
        { point: "02 → 03", label: "Counterparty agent over A2A", detail: "Bank B's Deep Agent answers from its own records. Every message passes Agent Control, both gateways, and AI Defense." },
        { point: "03 → 04", label: "Joint root-cause report", detail: "Bank A's agent reports root cause, evidence, exposure, and proposed fixes for human approval." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Interbank investigation",
    workbenchTitle: "TRD-847",
    workbenchSummary: "A delivery-versus-payment trade failed to match between Harbor Point Bank and Meridian Trust.",
    primaryAction: "Start investigation",
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
  { id: "briefing", label: "Company briefing", icon: Building2 },
  { id: "library", label: "Use case library", icon: Library },
  { id: "stories", label: "Story builder", icon: Workflow },
  { id: "models", label: "Model backends", icon: Cpu },
];

function liveExperienceLabel(experience?: UseCaseFrame["liveExperience"]) {
  if (experience === "banking") return "Live AI · fictional bank";
  if (experience === "fraud") return "Live scoring · TabFormer GNN+XGB";
  if (experience === "briefing") return "Live extract · EDGAR + upload";
  if (experience === "research") return "Live research · Yahoo + FRED cache";
  if (experience === "advisory") return "Live advisory · entitled context + holdings";
  if (experience === "interbank") return "Live A2A · two Deep Agents";
  return "Prototype data";
}

function focusLiveExperience(experience?: UseCaseFrame["liveExperience"]) {
  if (experience === "banking") {
    document.getElementById("banking-experience")?.scrollIntoView({ behavior: "smooth" });
    document.querySelector<HTMLInputElement>(".chat-composer input")?.focus({ preventScroll: true });
    return;
  }
  if (experience === "fraud") {
    document.getElementById("fraud-experience")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("score-payment")?.focus({ preventScroll: true });
    return;
  }
  if (experience === "briefing") {
    document.getElementById("briefing-experience")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("company-briefing-query")?.focus({ preventScroll: true });
    return;
  }
  if (experience === "research") {
    document.getElementById("research-experience")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("research-ticker")?.focus({ preventScroll: true });
    return;
  }
  if (experience === "advisory") {
    document.getElementById("advisory-experience")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("accept-meeting-brief")?.focus({ preventScroll: true });
  }
  if (experience === "interbank") {
    document.getElementById("interbank-experience")?.scrollIntoView({ behavior: "smooth" });
    document.getElementById("interbank-kickoff")?.focus({ preventScroll: true });
  }
}

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
  const inDevelopment = !useCaseFrames[useCase.id]?.liveExperience;

  return (
    <article
      className={`use-case-card accent-${useCase.accent}${inDevelopment ? " in-development" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${useCase.title} experience${inDevelopment ? ", in development" : ""}`}
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
      {inDevelopment && <div className="card-dev-overlay"><span>In development</span></div>}
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
  companyProfile,
  onCompanyProfileChange,
  researchNote,
  onResearchNoteChange,
  advisoryBrief,
  onAdvisoryBriefChange,
  onOpenModels,
}: {
  useCase: UseCase;
  inStory: boolean;
  onBack: () => void;
  onAdd: () => void;
  companyProfile: StoredCompanyProfile | null;
  onCompanyProfileChange: (profile: StoredCompanyProfile | null) => void;
  researchNote: StoredResearchNote | null;
  onResearchNoteChange: (note: StoredResearchNote | null) => void;
  advisoryBrief: StoredAdvisoryBrief | null;
  onAdvisoryBriefChange: (brief: StoredAdvisoryBrief | null) => void;
  onOpenModels: () => void;
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
          <span className="prototype-chip"><StatusDot tone="amber" /> {liveExperienceLabel(frame.liveExperience)}</span>
          <ModelChip experience={frame.liveExperience} onOpen={onOpenModels} />
          <button className="secondary-button" onClick={onAdd}>{inStory ? <><Check size={16} /> In story</> : <><Plus size={16} /> Add to story</>}</button>
          <button className="primary-button" onClick={frame.liveExperience ? () => focusLiveExperience(frame.liveExperience) : undefined}>{frame.primaryAction} <ArrowRight size={16} /></button>
        </div>
      </header>

      {frame.liveExperience === "banking" ? <section id="banking-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Banking assistant</h2></div><span>Fictional products · mock score 550</span></div>
        <BankingDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section> : frame.liveExperience === "fraud" ? <section id="fraud-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Fraud scoring</h2></div><span>TabFormer GNN+XGB · score is not a flag</span></div>
        <FraudDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section> : frame.liveExperience === "briefing" ? <section id="briefing-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Company briefing</h2></div><span>EDGAR + upload only · accept before store</span></div>
        <CompanyBriefing embedded inStory={inStory} onBack={onBack} onAdd={onAdd} profile={companyProfile} onProfileChange={onCompanyProfileChange} />
      </section> : frame.liveExperience === "research" ? <section id="research-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Wealth market research</h2></div><span>Yahoo + FRED cache · not financial advice</span></div>
        <MarketResearch embedded inStory={inStory} companyProfile={companyProfile} note={researchNote} onNoteChange={onResearchNoteChange} />
      </section> : frame.liveExperience === "advisory" ? <section id="advisory-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Client advisory</h2></div><span>Entitled context + holdings · not advice</span></div>
        <ClientAdvisory embedded inStory={inStory} companyProfile={companyProfile} researchNote={researchNote} brief={advisoryBrief} onBriefChange={onAdvisoryBriefChange} />
      </section> : frame.liveExperience === "interbank" ? <section id="interbank-experience">
        <div className="experience-label"><div><span className="eyebrow">INTERACTIVE EXPERIENCE</span><h2>Agent-to-agent investigation</h2></div><span>Fictional banks · read-only agents · live Splunk trace</span></div>
        <InterbankDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section> : null}

      <ArchitectureMap key={useCase.id} caseId={useCase.id} title={useCase.title} frame={frame} />

      {!frame.liveExperience ? <>
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

      </> : null}
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
  const [companyProfile, setCompanyProfile] = useState<StoredCompanyProfile | null>(null);
  const [researchNote, setResearchNote] = useState<StoredResearchNote | null>(null);
  const [advisoryBrief, setAdvisoryBrief] = useState<StoredAdvisoryBrief | null>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setCompanyProfile(loadCompanyProfile());
      setResearchNote(loadResearchNote());
      setAdvisoryBrief(loadAdvisoryBrief());
    });
    return () => cancelAnimationFrame(frame);
  }, []);

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
          <button className="tenant-switcher" onClick={() => switchView("briefing")} aria-label="Open company briefing">
            <span>{switcherContextLabel(companyProfile, researchNote, Boolean(advisoryBrief))}</span>
            <ChevronDown size={14} />
          </button>
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
              companyProfile={companyProfile}
              onCompanyProfileChange={setCompanyProfile}
              researchNote={researchNote}
              onResearchNoteChange={setResearchNote}
              advisoryBrief={advisoryBrief}
              onAdvisoryBriefChange={setAdvisoryBrief}
              onOpenModels={() => switchView("models")}
            />
          )}

          {!selectedCase && activeView === "models" && <ModelBackends />}

          {!selectedCase && activeView === "briefing" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="breadcrumb">FSI AI Demo Studio <span>/</span> Company briefing</span>
                  <h1>Company briefing</h1>
                  <p>Extract a grounded issuer profile from EDGAR or an uploaded annual report. Studio context is stored only after you accept it.</p>
                </div>
              </div>
              <CompanyBriefing profile={companyProfile} onProfileChange={setCompanyProfile} />
            </>
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
                    {useCases.map((item) => <UseCaseCard key={item.id} useCase={item} onOpen={openUseCase} />)}
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
