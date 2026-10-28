"use client";

import { readStored, writeStored, appStorageKey } from "./storage.ts";


import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState, lazy, Suspense, type KeyboardEvent as ReactKeyboardEvent } from "react";
import DemoCustomerContext from "../DemoCustomerContext";
const CompanyBriefing = lazy(() => import("../CompanyBriefing"));
import { vulnerabilityStory } from "../vulnerability-story";
import ArchitectureMap from "../ArchitectureMap";
import CapacityPlanning from "../CapacityPlanning";
import StudioSettings from "../StudioSettings";
import InferenceIndicator from "../InferenceIndicator";
import DemoNarrativeLayout from "../DemoNarrative";
import { demoNarratives } from "../demo-narratives";
import { ControlsPage, HelpDrawer, PresenterBar, ServiceBell, TelemetryPage } from "../StudioShell";
import { presenterNotes } from "../presenter-notes";
import { momentReady, platformSummary, presenterStatus, useStudioStatus, type StudioStatus, type Tone } from "../studio-status";
import { StudioNavContext, USE_CASE_TABS, type UseCaseTab as CaseTab } from "../studio-nav";
import { IllustrativeRunStats, type ObservedRun } from "../RunStats";
import { PlanningRunContext } from "../planning-evidence";
import { setTheme, useTheme } from "../theme";
import { loadCompanyProfile, type StoredCompanyProfile } from "../company-profile";
import { loadResearchNote, switcherContextLabel, type StoredResearchNote } from "../research-note";
import { loadAdvisoryBrief, type StoredAdvisoryBrief } from "../advisory-brief";
import { GuidedTourProvider, useGuide, useGuideControls, useGuideHost, type GuideControl } from "../guide/GuidedTour";
import { guideAnchor } from "../guide/anchors";
import { LIFECYCLE_TOUR_ID, TOURS, mainTourFor } from "../guide/tours";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
  ArrowDown,
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  ArrowUpRight,
  BrainCircuit,
  Building2,
  Check,
  ChevronDown,
  CircleGauge,
  CircleHelp,
  Compass,
  Eye,
  Grid2X2,
  Home,
  Library,
  Menu,
  Moon,
  Network,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  Plus,
  Radio,
  Search,
  ServerCog,
  Settings2,
  Shield,
  ShieldCheck,
  Sparkles,
  Sun,
  Trash2,
  Workflow,
  X,
} from "lucide-react";

import { useRouter } from "next/navigation";
import Link from "next/link";
import { useStudioLocation } from "./location";
import { apps, appById, appForDemo } from "../../config/apps.ts";
import { lifecycleStory } from "../../verticals/fsi/stories.ts";
import { allUseCases, catalogForApp, iconFor, type UseCase, type Category } from "./catalog";
import { useCaseFrames, type UseCaseFrame } from "./frames";
import { parseStudioRoute, studioPath, type StudioView as View } from "./route";
import { AppHome, EmptyApp } from "./AppHome";
import DemoWorkspace from "./workspaces";
import KeepAliveWorkspace from "./KeepAliveWorkspace";
import "./studio-apps.css";
const useCases = allUseCases;

export const storySteps = lifecycleStory.steps.map(step => ({ ...step, icon: iconFor(step.iconKey) }));

/** Present mode's three acts for a moment, falling back to the frame's copy, then what is live right now. */
function presenterTalk(item: UseCase, status: StudioStatus | null) {
  const note = presenterNotes[item.id];
  const frame = useCaseFrames[item.id];
  return [
    { label: "Problem", text: note?.problem ?? frame.transformation.friction },
    { label: "AI changes", text: note?.ai ?? frame.transformation.aiShift },
    { label: "Cisco value", text: note?.cisco ?? frame.transformation.humanControl },
    ...(note?.lifecycle ? [{ label: "In the story", text: note.lifecycle }] : []),
    { label: "Right now", text: presenterStatus(status, item.id, Boolean(frame.liveExperience)) },
  ];
}

const baseNavItems: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "overview", label: "Overview", icon: Home },
  { id: "briefing", label: "Company briefing", icon: Building2 },
  { id: "library", label: "Use case library", icon: Library },
  { id: "stories", label: "Story builder", icon: Workflow },
  { id: "settings", label: "Studio settings", icon: Settings2 },
];

const shellPages: { id: View; label: string; icon: LucideIcon }[] = [
  { id: "controls", label: "Controls", icon: Shield },
  { id: "telemetry", label: "Telemetry", icon: Activity },
];

const COLLAPSED_KEY = "fsi-studio.sidebar-collapsed";
const OUTLINE_MINUTES: Record<string, number> = { "kyc-processing": 3, "fraud-modeling": 6, "sar-support": 5, "client-advisory": 5 };

type Solution = "AI Defense" | "Splunk observability" | "AI Infrastructure";
const SOLUTIONS: Solution[] = ["AI Defense", "Splunk observability", "AI Infrastructure"];
const solutionOf = (name: string): Solution | null =>
  name.includes("AI Defense") ? "AI Defense" : name.includes("AI Infrastructure") ? "AI Infrastructure" : /Splunk|Galileo/.test(name) ? "Splunk observability" : null;

type LiveExperience = NonNullable<UseCaseFrame["liveExperience"]>;

/** Catalog maturity is independent of live-service readiness and replay availability. */
function liveExperienceStatus(useCaseId: string, experience: UseCaseFrame["liveExperience"], status: StudioStatus | null): { label: string; tone: Tone; title: string } {
  const stage = useCases.find((item) => item.id === useCaseId)?.stage;
  if (stage === "Planned" || !experience) return { label: "Planned", tone: "amber", title: "Planned experience; illustrative example only, with no live service or measured results" };
  const { ready, reason } = momentReady(status, useCaseId, true);
  return { label: ready ? "Ready" : "Live unavailable", tone: ready ? "mint" : "blue", title: `${reason}.${useCaseId === "code-vulnerability" ? " Live analysis uses the configured model." : " Recorded fallback available."}` };
}

/** Each demo's section and the control its header CTA should focus. */
const FOCUS_TARGETS: Record<LiveExperience, { section: string; control: string }> = {
  banking: { section: "banking-experience", control: ".chat-composer input" },
  fraud: { section: "fraud-experience", control: "#triage-queue" },
  briefing: { section: "briefing-experience", control: "#company-briefing-query" },
  research: { section: "research-experience", control: "#research-run" },
  advisory: { section: "advisory-experience", control: "input[name='advisory-household']:checked" },
  interbank: { section: "interbank-experience", control: "#interbank-kickoff" },
  sar: { section: "sar-experience", control: "#sar-investigate" },
  vulnerability: { section: "vulnerability-experience", control: "#vulnerability-run" },
};
const FOCUSABLE = "input, select, textarea, button, [href], [tabindex]:not([tabindex='-1'])";

const focusable = (element: Element | null): element is HTMLElement =>
  element instanceof HTMLElement && !element.matches(":disabled, [aria-disabled='true']") && element.getClientRects().length > 0;

/** Scrolls to the demo and focuses its first control, or the first enabled control when that one is disabled. */
function focusLiveExperience(experience: LiveExperience) {
  const target = FOCUS_TARGETS[experience];
  const section = document.getElementById(target.section);
  if (!section) return;
  section.scrollIntoView({ behavior: "smooth" });
  const preferred = section.querySelector(target.control);
  const control = focusable(preferred) ? preferred : Array.from(section.querySelectorAll(FOCUSABLE)).find(focusable);
  control?.focus({ preventScroll: true });
}

/** Brings the tab row back below the top bar when a switch left it scrolled off screen. */
function scrollTabsIntoView(tablist: HTMLElement | null) {
  if (!tablist) return;
  const topbar = document.querySelector(".topbar")?.getBoundingClientRect().bottom ?? 0;
  const top = tablist.getBoundingClientRect().top;
  if (top < topbar) window.scrollTo({ top: Math.max(0, window.scrollY + top - topbar - 12), behavior: "instant" });
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

function UseCaseCard({ useCase, onOpen, status }: { status: StudioStatus | null; useCase: UseCase; onOpen: (item: UseCase) => void }) {
  const Icon = useCase.icon;
  const developmentStage = useCase.stage === "Interactive" ? null : useCase.stage;
  const availability = liveExperienceStatus(useCase.id, useCaseFrames[useCase.id]?.liveExperience, status);
  const guide = useGuideControls();
  const tour = mainTourFor(useCase.id);

  return (
    <div className="use-case-card-wrap">
    <article
      className={`use-case-card accent-${useCase.accent}${developmentStage ? " in-development" : ""}`}
      role="button"
      tabIndex={0}
      aria-label={`Open ${useCase.title} experience${developmentStage ? `, ${developmentStage.toLowerCase()}` : ""}`}
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
        <span className="stage-label" title={availability.title}><StatusDot tone={availability.tone} />{availability.label}</span>
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
      {developmentStage && <div className="card-dev-overlay"><span>{developmentStage}</span></div>}
    </article>
    {tour && guide ? (
      <button type="button" className="card-guide" aria-label={`Guided overview: ${useCase.title}`} {...guideAnchor(`library.guide.${useCase.id}`)} onClick={() => guide.start(tour.id, { cut: true })}>
        <Compass size={14} aria-hidden="true" /> Guided overview
      </button>
    ) : null}
    </div>
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
  const mapped = useCases.filter((item) => new Set(item.solutions.map(solutionOf).filter(Boolean)).size >= 2).length;

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
        <div className="coverage-ring"><span>{mapped}/{useCases.length}</span><small>mapped</small></div>
        <div><strong>Platform coverage</strong><p>{mapped} of {useCases.length} demos map to two or more Cisco capabilities. Architecture mapping, not a measured deployment.</p></div>
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

type ExampleStats = { observability: { label: string; value: string }[]; defense: { label: string; value: string }[] };
const exampleDefense = (checks: number, blocked: number) => [
  { label: "Inspections", value: String(checks) }, { label: "Blocked", value: String(blocked) }, { label: "Errors", value: "0" }, { label: "Event IDs", value: String(checks) },
];
const ILLUSTRATIVE_STATS: Record<string, ExampleStats> = {
  "kyc-processing": {
    observability: [{ label: "LLM calls", value: "6" }, { label: "Tool calls", value: "9" }, { label: "Input tokens", value: "14.2k" }, { label: "Output tokens", value: "1.8k" }, { label: "Latency", value: "18 s" }],
    defense: exampleDefense(4, 0),
  },
  "transaction-llm": {
    observability: [{ label: "LLM calls", value: "3" }, { label: "Tool calls", value: "4" }, { label: "Input tokens", value: "5.6k" }, { label: "Output tokens", value: "620" }, { label: "Latency", value: "7 s" }],
    defense: exampleDefense(2, 0),
  },
};

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
  status,
  routeTab,
  active,
  onTabChange,
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
  status: StudioStatus | null;
  active: boolean;
  routeTab?: CaseTab;
  onTabChange?: (tab: CaseTab) => void;
}) {
  const frame = useCaseFrames[useCase.id];
  const liveStatus = liveExperienceStatus(useCase.id, frame.liveExperience, status);
  const Icon = useCase.icon;
  const [selectedRow, setSelectedRow] = useState(0);
  const row = frame.rows[selectedRow];
  // The frame's workbench copy describes its first queue item; other items show their queue fields.
  const workbench = selectedRow === 0 || !row
    ? { title: frame.workbenchTitle, summary: frame.workbenchSummary, evidence: frame.evidence }
    : { title: row.name, summary: `${row.stage}: ${row.signal}.`, evidence: [row.stage, row.signal, `Status: ${row.status}`] };
  const scrollTo = (id: string) => document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });

  // Panels stay mounted so runs and diagrams survive tab switches.
  // The explorer mounts on first open, when it can measure.
  const [tab, setTab] = useState<CaseTab>(routeTab ?? "demo");
  const [architectureOpened, setArchitectureOpened] = useState(routeTab === "architecture");
  const [capacityOpened, setCapacityOpened] = useState(routeTab === "capacity");
  const [planningRun, setPlanningRun] = useState<ObservedRun>();
  const tabScroll = useRef<Partial<Record<CaseTab, number>>>({});
  const revealTabs = useRef(false);
  const shownTab = useRef<CaseTab>("demo");
  const tablistRef = useRef<HTMLDivElement>(null);
  const selectTab = (next: CaseTab, options: { reveal?: boolean; syncUrl?: boolean } = {}) => {
    if (options.syncUrl !== false) onTabChange?.(next);
    revealTabs.current = Boolean(options.reveal);
    if (next === "architecture") setArchitectureOpened(true);
    if (next === "capacity") setCapacityOpened(true);
    if (next === tab) {
      if (options.reveal) scrollTabsIntoView(tablistRef.current);
      return;
    }
    tabScroll.current[tab] = window.scrollY;
    setTab(next);
  };
  const selectTabRef = useRef(selectTab);
  useLayoutEffect(() => { selectTabRef.current = selectTab; });
  useEffect(() => {
    if (!routeTab) return;
    const frame = requestAnimationFrame(() => selectTabRef.current(routeTab, { syncUrl: false }));
    return () => cancelAnimationFrame(frame);
  }, [routeTab]);
  useLayoutEffect(() => {
    if (shownTab.current === tab) return;
    shownTab.current = tab;
    const saved = tabScroll.current[tab];
    if (revealTabs.current || saved === undefined) scrollTabsIntoView(tablistRef.current);
    else window.scrollTo({ top: saved, behavior: "instant" });
    revealTabs.current = false;
  }, [tab]);
  const onTabKeyDown = (event: ReactKeyboardEvent<HTMLButtonElement>) => {
    const index = USE_CASE_TABS.findIndex(({ id }) => id === tab);
    const next = event.key === "ArrowRight" ? USE_CASE_TABS[(index + 1) % USE_CASE_TABS.length].id
      : event.key === "ArrowLeft" ? USE_CASE_TABS[(index + USE_CASE_TABS.length - 1) % USE_CASE_TABS.length].id
      : event.key === "Home" ? USE_CASE_TABS[0].id
      : event.key === "End" ? USE_CASE_TABS[USE_CASE_TABS.length - 1].id
      : null;
    if (!next) return;
    event.preventDefault();
    selectTab(next);
    document.getElementById(`case-tab-${next}`)?.focus({ preventScroll: true });
  };
  useGuideHost(useCase.id, tab, (next) => selectTab(next), active);
  const startPrimaryAction = () => {
    const run = () => {
      const replay = document.querySelector<HTMLElement>("#case-panel-demo [data-demo-replay]");
      if (replay) { replay.scrollIntoView({ behavior: "smooth", block: "center" }); replay.focus({ preventScroll: true }); replay.click(); }
      else if (frame.liveExperience) focusLiveExperience(frame.liveExperience);
      else scrollTo("illustrative-experience");
    };
    if (tab === "demo") { run(); return; }
    selectTab("demo");
    requestAnimationFrame(run);
  };

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
          <span className="prototype-chip live-status-chip" title={liveStatus.title} {...guideAnchor("case.status")}><StatusDot tone={liveStatus.tone} /> {liveStatus.label}</span>
          <button className="secondary-button" onClick={onAdd}>{inStory ? <><Check size={16} /> In story</> : <><Plus size={16} /> Add to story</>}</button>
          {!frame.liveExperience && <button className="primary-button" onClick={startPrimaryAction}>Review example <ArrowRight size={16} /></button>}
        </div>
      </header>

      <PlanningRunContext.Provider value={setPlanningRun}>
      <DemoNarrativeLayout narrative={useCase.id === "code-vulnerability" ? vulnerabilityStory : demoNarratives[useCase.id]}>
      <div className="case-tab-row" {...guideAnchor("case.tabs")}>
      <div className="case-tabs" role="tablist" aria-label={`${useCase.title} views`} ref={tablistRef}>
        {USE_CASE_TABS.map(({ id, label }) => (
          <button
            key={id}
            id={`case-tab-${id}`}
            type="button"
            role="tab"
            aria-selected={tab === id}
            aria-controls={`case-panel-${id}`}
            tabIndex={tab === id ? 0 : -1}
            onClick={() => selectTab(id)}
            onKeyDown={onTabKeyDown}
            {...(id === "architecture" ? guideAnchor("case.tab.architecture") : id === "capacity" ? guideAnchor("case.tab.capacity") : {})}
          >
            {label}
          </button>
        ))}
      </div>
      <CaseGuideActions caseId={useCase.id} />
      </div>

      <div className="case-tabpanel" id="case-panel-demo" role="tabpanel" aria-labelledby="case-tab-demo" hidden={tab !== "demo"}>
      {frame.liveExperience && <DemoWorkspace workspaceKey={frame.liveExperience} inStory={inStory} onBack={onBack} onAdd={onAdd}
        companyProfile={companyProfile} onCompanyProfileChange={onCompanyProfileChange} researchNote={researchNote} onResearchNoteChange={onResearchNoteChange}
        advisoryBrief={advisoryBrief} onAdvisoryBriefChange={onAdvisoryBriefChange} />}

      {!frame.liveExperience ? <>
      <div className="experience-label" id="illustrative-experience" {...guideAnchor("kyc.label")}>
        <div><span className="eyebrow">ILLUSTRATIVE EXPERIENCE</span><h2>How the use case could appear</h2></div>
        <span>Frontend and data are prototype-only</span>
      </div>

      <section className="case-metrics" aria-label={`${useCase.title} summary metrics`} {...guideAnchor("kyc.metrics")}>
        {frame.metrics.map((metric, index) => (
          <article key={metric.label}>
            <span>0{index + 1}</span>
            <p>{metric.label}</p>
            <strong>{metric.value}</strong>
            <small>{metric.detail} · Illustrative</small>
          </article>
        ))}
      </section>

      <div className="case-workspace-grid">
        <section className="case-queue-panel" {...guideAnchor("kyc.queue")}>
          <div className="case-panel-heading">
            <div><span className="eyebrow">WORK QUEUE</span><h2>Priority items</h2></div>
          </div>
          <div className="case-table" role="grid" aria-label={`${useCase.title} priority work queue`}>
            <div className="case-table-header" role="row">
              <span role="columnheader">Item</span><span role="columnheader">Stage</span><span role="columnheader">Signal</span><span role="columnheader">Status</span><span />
            </div>
            {frame.rows.map((item, index) => (
              <button className={`case-table-row${index === selectedRow ? " selected" : ""}`} role="row" aria-selected={index === selectedRow} key={item.name} onClick={() => setSelectedRow(index)}>
                <strong role="gridcell">{item.name}</strong>
                <span role="gridcell">{item.stage}</span>
                <span role="gridcell">{item.signal}</span>
                <em className={item.tone} role="gridcell"><StatusDot tone={item.tone === "ready" ? "mint" : item.tone === "review" ? "amber" : "violet"} />{item.status}</em>
                <ArrowRight size={15} />
              </button>
            ))}
          </div>
          <div className="queue-footer"><span>Showing highest-priority items · select one to review it</span></div>
        </section>

        <aside className="ai-workbench-panel" {...guideAnchor("kyc.workbench")}>
          <div className="workbench-heading">
            <span className="workbench-icon"><BrainCircuit size={19} /></span>
            <div><span className="eyebrow">AI-ASSISTED REVIEW</span><h2>{frame.workbenchLabel}</h2></div>
            <span className="trace-chip"><Activity size={12} /> Example trace</span>
          </div>
          <div className="workbench-body">
            <span className="workbench-kicker">SELECTED ITEM</span>
            <h3>{workbench.title}</h3>
            <p>{workbench.summary}</p>
            <div className="evidence-list">
              {workbench.evidence.map((item) => <span key={item}><Check size={13} />{item}</span>)}
            </div>
            <div className="workbench-recommendation"><Sparkles size={16} /><div><small>SUGGESTED ACTION</small><strong>{frame.primaryAction}</strong></div></div>
          </div>
          <div className="workbench-actions"><button className="secondary-button" onClick={() => selectTab("architecture", { reveal: true })}><Network size={15} /> View evidence in the architecture</button></div>
        </aside>
      </div>

      <IllustrativeRunStats {...(ILLUSTRATIVE_STATS[useCase.id] ?? ILLUSTRATIVE_STATS["transaction-llm"])} />

      </> : null}
      </div>

      <div className="case-tabpanel" id="case-panel-architecture" role="tabpanel" aria-labelledby="case-tab-architecture" hidden={tab !== "architecture"}>
        {architectureOpened && <div id="architecture-explorer"><ArchitectureMap key={useCase.id} caseId={useCase.id} title={useCase.title} frame={frame} /></div>}
      </div>
      <div className="case-tabpanel" id="case-panel-capacity" role="tabpanel" aria-labelledby="case-tab-capacity" hidden={tab !== "capacity"}>
        {capacityOpened && <CapacityPlanning useCaseId={useCase.id} title={useCase.title} objective={useCase.outcome} run={planningRun} />}
      </div>
      </DemoNarrativeLayout>
      </PlanningRunContext.Provider>
    </div>
  );
}

/** The workspace's tour launcher; kept apart so a step change re-renders only these buttons. */
function CaseGuideActions({ caseId }: { caseId: string }) {
  const guide = useGuide();
  const caseTour = mainTourFor(caseId);
  if (!caseTour || !guide) return null;
  const resumable = guide.saved?.tourId === caseTour.id && !guide.active
    ? caseTour.steps.findIndex((step) => step.id === guide.saved?.stepId) : -1;
  return (
    <div className="case-guide-actions">
      {resumable > 0 ? <button type="button" className="case-guide-resume" onClick={() => guide.start(caseTour.id, { stepId: guide.saved?.stepId, resume: true })}>Resume at step {resumable + 1}</button> : null}
      <button type="button" className="case-guide-button" {...guideAnchor("guide.launch")} aria-keyshortcuts="G" onClick={() => guide.start(caseTour.id, { cut: true })}>
        <Compass size={16} aria-hidden="true" /> Guided overview
      </button>
      <button type="button" className="case-guide-resume" onClick={() => guide.start(caseTour.id)}>Full walkthrough</button>
    </div>
  );
}

/** The presenter bar, with "Guide this moment" when the moment has a tour. */
function GuidedPresenterBar({ caseId, ...props }: Parameters<typeof PresenterBar>[0] & { caseId: string }) {
  const guide = useGuide();
  const tour = mainTourFor(caseId);
  const guiding = Boolean(guide?.active);
  return (
    <PresenterBar
      {...props}
      guiding={guiding}
      onGuide={tour && guide ? () => (guiding ? guide.exit() : guide.start(tour.id, { cut: true })) : undefined}
    />
  );
}

export default function StudioApplication() {
  const { pathname, search } = useStudioLocation();
  const router = useRouter();
  const route = parseStudioRoute(pathname, search);
  const [enabledApps, setEnabledApps] = useState<string[] | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    fetch("/api/studio/catalog", { signal: controller.signal }).then(response => response.ok ? response.json() : null).then(scope => { if (Array.isArray(scope?.appIds)) setEnabledApps(scope.appIds); }).catch(() => {});
    return () => controller.abort();
  }, []);
  const availableApps = apps.filter(app => !enabledApps || enabledApps.includes(app.id));
  const activeApp = appById(route.appId);
  const activeView = activeApp && enabledApps && !enabledApps.includes(activeApp.id) ? "unavailable" : route.view;
  const useCases = catalogForApp(activeApp?.id ?? null);
  const selectedCase = activeView === "unavailable" ? null : useCases.find(item => item.id === route.demoId) ?? null;
  const navItems = activeApp ? baseNavItems.filter(item => item.id !== "briefing" || activeApp.context === "company") : [
    { id: "apps" as View, label: "Industry apps", icon: Grid2X2 },
    { id: "settings" as View, label: "Studio settings", icon: Settings2 },
  ];
  const [hydrated, setHydrated] = useState(false);
  const [cachedCases, setCachedCases] = useState<{ appId: string; demoId: string }[]>(() => route.demoId && route.appId ? [{ appId: route.appId, demoId: route.demoId }] : []);
  const selectedSession = selectedCase && activeApp ? { appId: activeApp.id, demoId: selectedCase.id } : null;
  const workspaceSessions = selectedSession && !cachedCases.some(item => item.appId === selectedSession.appId && item.demoId === selectedSession.demoId) ? [...cachedCases, selectedSession] : cachedCases;
  useEffect(() => {
    if (!route.demoId || !route.appId) return;
    const session = { appId: route.appId, demoId: route.demoId };
    const frame = requestAnimationFrame(() => setCachedCases(previous => previous.some(item => item.appId === session.appId && item.demoId === session.demoId) ? previous : [...previous, session]));
    return () => cancelAnimationFrame(frame);
  }, [route.appId, route.demoId]);
  const [filter, setFilter] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [appStories, setAppStories] = useState<Record<string, string[]>>({});
  const storyItems = activeApp ? appStories[activeApp.id] ?? [...activeApp.defaultStory] : [];
  const setStoryItems = (update: string[] | ((previous: string[]) => string[])) => {
    if (!activeApp) return;
    setAppStories(previous => {
      const current = previous[activeApp.id] ?? [...activeApp.defaultStory];
      const next = typeof update === "function" ? update(current) : update;
      writeStored(localStorage, appStorageKey(activeApp.id, "story"), JSON.stringify(next));
      return { ...previous, [activeApp.id]: next };
    });
  };
  const [companyProfile, setCompanyProfile] = useState<StoredCompanyProfile | null>(null);
  const [researchNote, setResearchNote] = useState<StoredResearchNote | null>(null);
  const [advisoryBrief, setAdvisoryBrief] = useState<StoredAdvisoryBrief | null>(null);
  const [collapsed, setCollapsed] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [presenting, setPresenting] = useState<number | null>(null);
  const [launcherQuery, setLauncherQuery] = useState("");
  const [liveOnly, setLiveOnly] = useState(false);
  const [solution, setSolution] = useState<Solution | "">("");
  const [editingStory, setEditingStory] = useState(false);
  const [dragging, setDragging] = useState<string | null>(null);
  const { status } = useStudioStatus(10000, activeApp?.id ?? null);
  const theme = useTheme();
  const platform = platformSummary(status);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setHydrated(true);
      setCompanyProfile(loadCompanyProfile());
      setResearchNote(loadResearchNote());
      setAdvisoryBrief(loadAdvisoryBrief());
      setCollapsed(readStored(localStorage, COLLAPSED_KEY) === "1");
      const drafts = Object.fromEntries(apps.flatMap(app => {
        try {
          const value = JSON.parse(readStored(localStorage, appStorageKey(app.id, "story")) ?? "null");
          return Array.isArray(value) ? [[app.id, [...new Set(value.filter(id => typeof id === "string" && app.catalog.some(entry => entry.demoId === id)))]]] : [];
        } catch { return []; }
      }));
      setAppStories(drafts);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setLauncherQuery("");
        setLauncherOpen((open) => !open);
      }
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, []);

  const toggleCollapsed = () => setCollapsed((value) => {
    writeStored(localStorage, COLLAPSED_KEY, value ? "0" : "1");
    return !value;
  });

  const activeAppId = activeApp ? String(activeApp.id) : null;
  const openUseCase = useCallback((item: UseCase) => {
    const owner = appById(activeAppId) ?? appForDemo(item.id);
    if (!owner || !owner.catalog.some(entry => entry.demoId === item.id)) return;
    setCachedCases(previous => previous.some(session => session.appId === owner.id && session.demoId === item.id) ? previous : [...previous, { appId: owner.id, demoId: item.id }]);
    const params = new URLSearchParams(window.location.search);
    params.delete("tab");
    const suffix = params.has("guide") ? `?${params.toString()}` : "";
    router.push(`${studioPath(owner.id, "overview", item.id)}${suffix}`, { scroll: false });
    requestAnimationFrame(() => requestAnimationFrame(() => window.scrollTo({ top: 0, behavior: "auto" })));
  }, [activeAppId, router]);

  const filteredCases = (() => {
    const normalized = query.trim().toLowerCase();
    return useCases.filter((item) => {
      const matchesFilter = filter === "All" || item.category === filter;
      const matchesQuery = !normalized || `${item.title} ${item.description} ${item.solutions.join(" ")}`.toLowerCase().includes(normalized);
      const matchesLive = !liveOnly || (Boolean(useCaseFrames[item.id]?.liveExperience) && momentReady(status, item.id, true).ready);
      const matchesSolution = !solution || item.solutions.some((name) => solutionOf(name) === solution);
      return matchesFilter && matchesQuery && matchesLive && matchesSolution;
    });
  })();

  const switchView = useCallback((view: View) => {
    router.push(studioPath(activeAppId, view), { scroll: false });
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, [activeAppId, router]);

  const openSettings = useCallback((section?: string) => {
    const shared = section && !["st-models", "st-services"].includes(section);
    const path = studioPath(shared ? null : activeAppId, "settings");
    router.push(`${path}${section ? `#${section}` : ""}`, { scroll: false });
    setSidebarOpen(false);
  }, [activeAppId, router]);

  const openCaseById = (id: string) => {
    const item = useCases.find((candidate) => candidate.id === id);
    if (!item) return;
    setSidebarOpen(false);
    // A handoff during Present mode (fraud → SAR) advances the presenter to that step.
    const step = presenting === null ? -1 : storyItems.indexOf(id);
    if (step >= 0) setPresenting(step);
    openUseCase(item);
  };

  const story = storyItems.map((id) => useCases.find((candidate) => candidate.id === id)).filter((item): item is UseCase => Boolean(item));
  const storyStates = story.map((item) => momentReady(status, item.id, Boolean(useCaseFrames[item.id]?.liveExperience)));
  const storyReady = story.length ? Math.round((storyStates.filter((state, index) => state.ready && useCaseFrames[story[index].id]?.liveExperience).length / story.length) * 100) : 0;

  const present = (index: number) => {
    if (index < 0 || index >= story.length) return;
    setPresenting(index);
    openUseCase(story[index]);
  };
  const startPresenting = () => {
    if (!story.length) return;
    document.documentElement.requestFullscreen?.().catch(() => undefined);
    present(0);
  };
  const stopPresenting = useCallback(() => {
    setPresenting(null);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => undefined);
    switchView("stories");
  }, [switchView]);
  const presenterNext = () => {
    if (presenting === null) return;
    if (presenting === story.length - 1) stopPresenting();
    else present(presenting + 1);
  };
  const openCaseForGuide = useCallback((id: string) => {
    const item = catalogForApp(activeAppId).find((candidate) => candidate.id === id);
    if (!item) return;
    setSidebarOpen(false);
    openUseCase(item);
  }, [openUseCase, activeAppId]);

  const moveStoryItem = (id: string, to: number) => setStoryItems((items) => {
    const from = items.indexOf(id);
    if (from < 0 || to < 0 || to >= items.length) return items;
    const next = [...items];
    next.splice(to, 0, ...next.splice(from, 1));
    return next;
  });

  const [guideControl, setGuideControl] = useState<GuideControl | null>(null);
  const startGuide = useCallback((tourId: string) => guideControl?.start(tourId), [guideControl]);
  const resetForStudioHome = useCallback(() => {
    guideControl?.exit();
    setPresenting(null);
    setSidebarOpen(false);
    setLauncherOpen(false);
    setLauncherQuery("");
    setFilter("All");
    setQuery("");
  }, [guideControl]);
  const openStudioHome = useCallback(() => {
    resetForStudioHome();
    router.push("/");
  }, [resetForStudioHome, router]);
  const launcherResults = (() => {
    const normalized = launcherQuery.trim().toLowerCase();
    if (!normalized) return [];
    const appResults = availableApps.map(app => ({ key: `app-${app.id}`, icon: iconFor(app.iconKey), title: app.name, detail: "Industry app", open: () => { guideControl?.exit(); router.push(`/apps/${app.id}`); } }));
    const pages = [
      ...(activeApp ? [{ key: "studio-home", icon: Grid2X2, title: "All industry apps", detail: "Studio home", open: openStudioHome, text: "dashboard home" }] : []),
      ...[...navItems, ...shellPages].map((item) => ({ key: `view-${item.id}`, icon: item.icon, title: item.label, detail: "Page", open: () => switchView(item.id) })),
    ];
    const cases = useCases.map((item) => ({ key: `case-${item.id}`, icon: item.icon, title: item.title, detail: `${item.category} · ${liveExperienceStatus(item.id, useCaseFrames[item.id]?.liveExperience, status).label}`, open: () => openUseCase(item), text: `${item.description} ${item.solutions.join(" ")}` }));
    const guides = [
      ...useCases.flatMap((item) => {
        const tour = mainTourFor(item.id);
        return tour ? [{ key: `guide-${tour.id}`, icon: Compass, title: `Guide: ${item.title}`, detail: `Guided tour${tour.label ? ` · ${tour.label}` : " · recorded run"}`, open: () => startGuide(tour.id), text: "guided tour walkthrough" }] : [];
      }),
      ...(activeApp?.storyId === "lifecycle" ? [{ key: `guide-${LIFECYCLE_TOUR_ID}`, icon: Compass, title: `Guide: ${TOURS[LIFECYCLE_TOUR_ID].title}`, detail: "Guided tour across four demos · recorded runs", open: () => startGuide(LIFECYCLE_TOUR_ID), text: "guided tour walkthrough story lifecycle" }] : []),
    ];
    const rank = (item: (typeof pages)[number] | (typeof cases)[number]) => {
      const title = item.title.toLowerCase();
      if (title.startsWith(normalized)) return 0;
      if (title.split(/[^a-z0-9]+/).some((word) => word.startsWith(normalized))) return 1;
      if (title.includes(normalized)) return 2;
      return `${title} ${item.detail} ${"text" in item ? item.text : ""}`.toLowerCase().includes(normalized) ? 3 : -1;
    };
    return [...appResults, ...pages, ...cases, ...guides]
      .map((item, order) => ({ item, order, score: rank(item) }))
      .filter((entry) => entry.score >= 0)
      .sort((a, b) => a.score - b.score || a.order - b.order)
      .slice(0, 8)
      .map((entry) => entry.item);
  })();
  const closeLauncher = () => { setLauncherOpen(false); setLauncherQuery(""); };
  const links = status?.links ?? null;
  const openCaseRef = useRef(openCaseById);
  useLayoutEffect(() => { openCaseRef.current = openCaseById; });
  const openUseCaseById = useCallback((id: string) => openCaseRef.current(id), []);
  const isPresenting = presenting !== null;
  const studioNav = useMemo(() => ({ appId: activeAppId, openSettings, links, openUseCase: openUseCaseById, presenting: isPresenting, preview: status?.mode === "preview" }), [activeAppId, openSettings, links, openUseCaseById, isPresenting, status?.mode]);

  return (
    <StudioNavContext.Provider value={studioNav}>
    <GuidedTourProvider
      currentCase={selectedCase?.id ?? null}
      openCase={openCaseForGuide}
      presenting={presenting !== null}
      paused={helpOpen || launcherOpen}
      status={status}
      onPresenterNext={presenterNext}
      onControl={setGuideControl}
    >
    <div inert={!hydrated} data-studio-ready={hydrated ? "true" : "false"} className={`app-shell${collapsed ? " sidebar-collapsed" : ""}${presenting !== null ? " presenting" : ""}`}>
      <header className="topbar">
        <div className="brand-lockup">
          <button className="mobile-menu" aria-label="Toggle navigation" onClick={() => setSidebarOpen(!sidebarOpen)}><Menu size={20} /></button>
          <Link href="/" className="studio-brand-home" aria-label="AI Demo Studio home" title="All industry apps" onClick={resetForStudioHome}>
            <CiscoMark />
            <div className="brand-copy"><strong>AI Demo Studio</strong><span>Industry applications</span></div>
          </Link>
          <span className="top-divider" />
          {activeApp?.context === "company" && <button className="tenant-switcher" onClick={() => switchView("briefing")} aria-label="Open company briefing">
            <span>{switcherContextLabel(companyProfile, researchNote, Boolean(advisoryBrief))}</span>
            <ChevronDown size={14} />
          </button>}
        </div>
        <nav className="product-nav" aria-label="Product areas">
          <button className="app-launcher-button" aria-label="Open app launcher" title="Apps and search (⌘K)" onClick={() => setLauncherOpen(true)}><Grid2X2 size={18} /><span>{activeApp?.shortName ?? "Apps"}</span><ChevronDown size={14} /></button>
          <button className={selectedCase || !["controls", "telemetry"].includes(activeView) ? "active" : ""} aria-current={selectedCase || !["controls", "telemetry"].includes(activeView) ? "page" : undefined} aria-label="Studio" onClick={() => switchView("overview")}><CircleGauge size={17} /><span>Studio</span></button>
          <button className={!selectedCase && activeView === "controls" ? "active" : ""} aria-current={!selectedCase && activeView === "controls" ? "page" : undefined} aria-label="Controls" onClick={() => switchView("controls")}><Shield size={17} /><span>Controls</span></button>
          <button className={!selectedCase && activeView === "telemetry" ? "active" : ""} aria-current={!selectedCase && activeView === "telemetry" ? "page" : undefined} aria-label="Telemetry" onClick={() => switchView("telemetry")}><Activity size={17} /><span>Telemetry</span></button>
        </nav>
        <div className="top-actions">
          <InferenceIndicator useCaseId={selectedCase ? (useCaseFrames[selectedCase.id]?.liveExperience ? selectedCase.id : "prototype") : activeView === "briefing" ? "company-briefing" : undefined} preview={status?.mode === "preview"} onOpen={() => openSettings("st-models")} />
          <button aria-label={theme === "light" ? "Switch to dark theme" : "Switch to light theme"} title={theme === "light" ? "Dark theme" : "Light theme"} onClick={() => setTheme(theme === "light" ? "dark" : "light")}>{theme === "light" ? <Moon size={18} /> : <Sun size={18} />}</button>
          <button aria-label="Help: run this demo" onClick={() => setHelpOpen(true)}><CircleHelp size={18} /></button>
          <ServiceBell status={status} onOpenSettings={() => openSettings("st-services")} />
        </div>
      </header>

      <div className="shell-body">
        <aside className={`sidebar ${sidebarOpen ? "open" : ""}`}>
          <nav className="side-nav" aria-label="Main navigation">
            {activeApp && <Link href="/" className="studio-home-link" aria-label="All industry apps" title="All industry apps" onClick={resetForStudioHome}><ArrowLeft size={18} /><span>All industry apps</span></Link>}
            <span className="nav-group-label">Workspace</span>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={!selectedCase && activeView === item.id ? "active" : ""} title={collapsed ? item.label : undefined} onClick={() => switchView(item.id)}>
                  <Icon size={18} /><span>{item.label}</span>
                  {item.id === "stories" && <em>{storyItems.length}</em>}
                </button>
              );
            })}
            {!!activeApp?.categories.length && <><span className="nav-separator" /><span className="nav-group-label">Explore by domain</span>
              {activeApp.categories.map(category => { const Icon = iconFor(category.iconKey); return <button key={category.id} title={collapsed ? category.label : undefined} onClick={() => { setFilter(category.label); switchView("library"); }}><Icon size={18} /><span>{category.label}</span></button>; })}
            </>}
            {!activeApp && <><span className="nav-separator" /><span className="nav-group-label">Industry apps</span>
              {availableApps.map(app => { const Icon = iconFor(app.iconKey); return <button key={app.id} title={collapsed ? app.name : undefined} onClick={() => { guideControl?.exit(); setFilter("All"); setQuery(""); setPresenting(null); setSidebarOpen(false); router.push(`/apps/${app.id}`); }}><Icon size={18} /><span>{app.name}</span></button>; })}
            </>}
          </nav>

          <div className="sidebar-platform">
            <span className="nav-group-label">Cisco platform</span>
            <button title={`AI Defense: ${platform.defense.detail}`} onClick={() => switchView("controls")}><ShieldCheck size={17} /><span>AI Defense<small>{platform.defense.detail}</small></span><StatusDot tone={platform.defense.tone} /></button>
            <button title={`Agent Observability: ${platform.observability.detail}`} onClick={() => switchView("telemetry")}><Activity size={17} /><span>Agent Observability<small>{platform.observability.detail}</small></span><StatusDot tone={platform.observability.tone} /></button>
            <button title={`AI Infrastructure: ${platform.infrastructure.detail}`} onClick={() => openSettings("st-models")}><ServerCog size={17} /><span>AI Infrastructure<small>{platform.infrastructure.detail}</small></span><StatusDot tone={platform.infrastructure.tone} /></button>
          </div>
          <button className="collapse-button" aria-label={collapsed ? "Expand navigation" : "Collapse navigation"} aria-expanded={!collapsed} onClick={toggleCollapsed}>{collapsed ? <PanelLeftOpen size={17} /> : <PanelLeftClose size={17} />}<span>{collapsed ? "Expand" : "Collapse"}</span></button>
        </aside>

        {sidebarOpen && <button className="sidebar-scrim" aria-label="Close navigation" onClick={() => setSidebarOpen(false)} />}

        <main className="main-content">
          {activeView === "apps" && <AppHome enabledApps={enabledApps} />}
          {activeView === "unavailable" && <section className="industry-empty"><h1>Page unavailable</h1><p>This page or use case is outside the selected app library.</p><button className="primary-button" onClick={() => router.push("/")}>All industry apps</button></section>}
          {workspaceSessions.map(session => {
            const id = session.demoId;
            const owner = appById(session.appId)!;
            const item = catalogForApp(owner.id).find(candidate => candidate.id === id)!;
            const active = activeApp?.id === owner.id && selectedCase?.id === id;
            return <KeepAliveWorkspace key={`${owner.id}/${id}`} demoId={id} active={active}>
              <StudioNavContext.Provider value={{ ...studioNav, appId: owner.id, demoId: id, active }}>
              <Suspense fallback={<p role="status" className="st-muted">Loading {item.title}…</p>}>
              <UseCaseWorkspace
                useCase={item}
                active={active}
                routeTab={active ? route.tab : undefined}
                onTabChange={tab => {
                  if (!active) return;
                  const params = new URLSearchParams(window.location.search);
                  if (tab === "demo") params.delete("tab"); else params.set("tab", tab);
                  const suffix = params.toString();
                  window.history.replaceState(window.history.state, "", `${studioPath(owner.id, "overview", id)}${suffix ? `?${suffix}` : ""}`);
                }}
                inStory={storyItems.includes(id)}
                onBack={() => switchView("library")}
                onAdd={() => setStoryItems(items => items.includes(id) ? items : [...items, id])}
                companyProfile={companyProfile}
                onCompanyProfileChange={setCompanyProfile}
                researchNote={researchNote}
                onResearchNoteChange={setResearchNote}
                advisoryBrief={advisoryBrief}
                onAdvisoryBriefChange={setAdvisoryBrief}
                status={status}
              />
              </Suspense>
              </StudioNavContext.Provider>
            </KeepAliveWorkspace>;
          })}

          {!selectedCase && activeView === "settings" && <StudioSettings key={activeApp?.id ?? "platform"} />}
          {!selectedCase && activeView === "controls" && <ControlsPage status={status} onOpenCase={openCaseById} onOpenSettings={() => openSettings("st-ai-defense")} />}
          {!selectedCase && activeView === "telemetry" && <TelemetryPage status={status} onOpenCase={openCaseById} onOpenSettings={() => openSettings("st-splunk-ao")} />}

          {!selectedCase && activeView === "briefing" && activeApp?.context === "company" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="breadcrumb">AI Demo Studio <span>/</span> {activeApp?.name && <>{activeApp.name} <span>/</span></>} Company briefing</span>
                  <h1>Company briefing</h1>
                  <p>Extract a grounded issuer profile from EDGAR or an uploaded annual report. Studio context is stored only after you accept it.</p>
                </div>
              </div>
              <Suspense fallback={<p role="status">Loading company briefing…</p>}><CompanyBriefing profile={companyProfile} onProfileChange={setCompanyProfile} /></Suspense>
            </>
          )}

          {!selectedCase && activeView === "overview" && activeApp?.context !== "company" && activeApp && <>
            <div className="page-heading"><div><span className="breadcrumb">AI Demo Studio <span>/</span> {activeApp.name}</span><h1>{activeApp.name}</h1><p>{activeApp.description}</p></div></div>
            {useCases.length ? <section className="use-case-section"><div className="section-heading"><h2>Use cases</h2><button className="text-button" onClick={() => switchView("library")}>Browse library <ArrowRight size={15} /></button></div><div className="use-case-grid">{useCases.map(item => <UseCaseCard status={status} key={item.id} useCase={item} onOpen={openUseCase} />)}</div></section> : <EmptyApp app={activeApp} />}
          </>}
          {!selectedCase && activeView === "overview" && activeApp?.context === "company" && (
            <>
              <div className="page-heading">
                <div>
                  <span className="breadcrumb">AI Demo Studio <span>/</span> {activeApp?.name && <>{activeApp.name} <span>/</span></>} Overview</span>
                  <h1>Financial services AI demos</h1>
                  <p>Modular use cases connected by security, observability, and infrastructure.</p>
                </div>
                <div className="heading-actions">
                  <button className="secondary-button" onClick={() => switchView("library")}><Library size={17} /> Browse use cases</button>
                  <button className="primary-button" onClick={() => guideControl?.start(LIFECYCLE_TOUR_ID, { cut: true })}><Play size={16} fill="currentColor" /> Start guided story</button>
                </div>
              </div>

              <section className="hero-panel">
                <div className="hero-copy">
                  <span className="eyebrow"><Sparkles size={13} /> FEATURED DEMO NARRATIVE</span>
                  <h2>Client lifecycle</h2>
                  <DemoCustomerContext />
                  <p>Follow an illustrative KYC review, then run live fraud triage, investigate a separate account holder, and prepare an advisor review. Labelled recordings are fallback options. Each module also works alone.</p>
                  <div className="hero-meta">
                    <span><Workflow size={15} /> 4 connected moments</span>
                    <span><CircleGauge size={15} /> Short overview + full walkthrough</span>
                    <span><Eye size={15} /> Executive + technical views</span>
                  </div>
                </div>
                <div className="hero-story">
                  <div className="story-title"><span>CLIENT LIFECYCLE STORY</span><strong>A client journey across four use cases</strong></div>
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
                    {useCases.map((item) => <UseCaseCard status={status} key={item.id} useCase={item} onOpen={openUseCase} />)}
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
                  <span className="breadcrumb">AI Demo Studio <span>/</span> {activeApp?.name && <>{activeApp.name} <span>/</span></>} Library</span>
                  <h1>Use case library</h1>
                  <p>Select a standalone demo or add it to a client story.</p>
                </div>
                <button className="primary-button" onClick={() => switchView("stories")}><Workflow size={17} /> Open story builder <span className="button-count">{storyItems.length}</span></button>
              </div>
              <section className="library-toolbar">
                <label className="search-box"><Search size={18} /><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search use cases, outcomes, or Cisco solutions" aria-label="Search use cases" /><kbd title="Search everything">⌘ K</kbd></label>
                <div className="filter-row" aria-label="Use case filters">
                  {(["All", ...(activeApp?.categories.map(category => category.label) ?? [])] as Category[]).map((item) => (
                    <button key={item} className={filter === item ? "active" : ""} onClick={() => setFilter(item)}>{item}</button>
                  ))}
                </div>
                <div className="library-extra">
                  <button aria-pressed={liveOnly} onClick={() => setLiveOnly(!liveOnly)}>Live ready</button>
                  <select aria-label="Cisco solution" value={solution} onChange={(event) => setSolution(event.target.value as Solution | "")}>
                    <option value="">All Cisco solutions</option>
                    {SOLUTIONS.map((name) => <option key={name} value={name}>{name}</option>)}
                  </select>
                </div>
              </section>
              <div className="library-summary"><span><strong>{filteredCases.length}</strong> use cases</span><span>Modular and searchable</span></div>
              <section className="library-grid">
                {filteredCases.map((item) => <UseCaseCard status={status} key={item.id} useCase={item} onOpen={openUseCase} />)}
                {useCases.length === 0 && activeApp ? <EmptyApp app={activeApp} /> : filteredCases.length === 0 && <div className="empty-state"><Search size={26} /><h2>No matching use cases</h2><p>Try a broader search or reset the category filter.</p><button className="secondary-button" onClick={() => { setQuery(""); setFilter("All"); setLiveOnly(false); setSolution(""); }}>Reset filters</button></div>}
              </section>
            </>
          )}

          {!selectedCase && activeView === "stories" && activeApp && !useCases.length && <><div className="page-heading"><div><h1>Demo stories</h1><p>{activeApp.name}</p></div></div><EmptyApp app={activeApp} stories /></>}
          {!selectedCase && activeView === "stories" && activeApp && useCases.length > 0 && (
            <>
              <div className="page-heading story-page-heading">
                <div>
                  <span className="breadcrumb">AI Demo Studio <span>/</span> {activeApp?.name && <>{activeApp.name} <span>/</span></>} Story builder</span>
                  <h1>Build a demo story</h1>
                  <p>Sequence use cases and choose where to show the supporting technology.</p>
                </div>
                <div className="heading-actions">
                  {activeApp.storyId === "lifecycle" && <button className="secondary-button" onClick={() => startGuide(LIFECYCLE_TOUR_ID)}><Compass size={16} /> Guided story</button>}
                  <button className="primary-button" disabled={!story.length} onClick={startPresenting}><Play size={16} fill="currentColor" /> Present story</button>
                </div>
              </div>

              {activeApp.storyId === "lifecycle" && <section className="story-builder-panel">
                <div className="story-builder-top">
                  <div><span className="eyebrow">GUIDED STORY 01</span><h2>Client lifecycle</h2>
                  <DemoCustomerContext /><p>From onboarding to personalized advice.</p></div>
                  <div className="story-score" title={storyStates.filter((state) => !state.ready).map((state) => state.reason).join("; ") || "Every moment is ready"}><span>Live service readiness</span><strong>{storyReady}%</strong><div><i style={{ width: `${storyReady}%` }} /></div><small>{storyStates.filter((state, index) => state.ready && useCaseFrames[story[index].id]?.liveExperience).length} of {story.length} moments live-ready · recordings and prototypes remain available</small></div>
                </div>
                <StoryMap />
                <div className="story-builder-bottom">
                  <div><BrainCircuit size={18} /><span><strong>Business view</strong> Focus on client and employee outcomes.</span></div>
                  <div><Network size={18} /><span><strong>Platform view</strong> Show security, telemetry, and infrastructure.</span></div>
                </div>
              </section>}

              <div className="builder-grid">
                <section className="story-outline">
                  <div className="section-heading"><div><span className="eyebrow">RUN OF SHOW</span><h2>Story outline</h2></div><button className="text-button" aria-pressed={editingStory} onClick={() => setEditingStory(!editingStory)}>{editingStory ? <><Check size={15} /> Done</> : <>Edit sequence <ArrowRight size={15} /></>}</button></div>
                  {story.map((item, index) => {
                    const Icon = item.icon;
                    const state = storyStates[index];
                    return (
                      <div
                        className={`outline-item${editingStory ? " editing" : ""}${dragging === item.id ? " dragging" : ""}`}
                        key={item.id}
                        draggable={editingStory}
                        onDragStart={(event) => { setDragging(item.id); event.dataTransfer.effectAllowed = "move"; }}
                        onDragOver={(event) => { if (dragging && dragging !== item.id) { event.preventDefault(); event.currentTarget.classList.add("drop-target"); } }}
                        onDragLeave={(event) => event.currentTarget.classList.remove("drop-target")}
                        onDrop={(event) => { event.preventDefault(); event.currentTarget.classList.remove("drop-target"); if (dragging) moveStoryItem(dragging, index); setDragging(null); }}
                        onDragEnd={() => setDragging(null)}
                      >
                        {editingStory ? <span className="drag-handle" aria-hidden="true">⠿</span> : <span />}
                        <span className={`outline-icon ${item.accent}`}><Icon size={18} /></span>
                        <div><small>MOMENT {index + 1}</small><strong>{item.title}</strong><p>{item.outcome}</p><span className={`moment-state ${state.ready ? "ok" : "warn"}`}><StatusDot tone={state.ready ? "mint" : "amber"} />{state.reason}</span></div>
                        {editingStory ? (
                          <span className="outline-edit">
                            <button aria-label={`Move ${item.title} up`} disabled={index === 0} onClick={() => moveStoryItem(item.id, index - 1)}><ArrowUp size={15} /></button>
                            <button aria-label={`Move ${item.title} down`} disabled={index === story.length - 1} onClick={() => moveStoryItem(item.id, index + 1)}><ArrowDown size={15} /></button>
                            <button className="remove" aria-label={`Remove ${item.title} from the story`} onClick={() => setStoryItems((items) => items.filter((id) => id !== item.id))}><Trash2 size={15} /></button>
                          </span>
                        ) : <span className="outline-time">{String(OUTLINE_MINUTES[item.id] ?? 4).padStart(2, "0")} min</span>}
                        {editingStory ? <span /> : <button aria-label={`Open ${item.title}`} onClick={() => openUseCase(item)}><ArrowUpRight size={17} /></button>}
                      </div>
                    );
                  })}
                  <button className="add-frame-button" onClick={() => switchView("library")}><Plus size={18} /> Add a use case from the library</button>
                </section>
                <section className="presenter-panel">
                  <span className="eyebrow">PRESENTER VIEW</span>
                  <h2>Talk track</h2>
                  <div className="presenter-card"><span className="presenter-tag">OPENING</span><p>{activeApp.storyId === "lifecycle" ? "One customer, four teams, one governed AI foundation. Chuck Robbins is Cisco’s Chair and CEO. The banking relationship, portfolio, and incidents are hypothetical. KYC is illustrative; guided runs use saved examples, not a continuous live transaction." : `Introduce the stakeholder and business outcome for this ${activeApp.name} story, then walk through the selected use cases.`}</p></div>
                  <div className="talk-track"><span><Check size={15} /> Explain the business problem, human ownership, and Cisco contributions in each workflow.</span>{activeApp.storyId === "lifecycle" && <span><Check size={15} /> Fraud hands the case to SAR; the advisor sees only the reissued card</span>}<span><Check size={15} /> Identify live, recorded, or sample execution and the model that answered.</span></div>
                  <button className="secondary-button" disabled={!story.length} onClick={startPresenting}><Play size={16} fill="currentColor" /> Present from moment 1</button>
                </section>
              </div>
            </>
          )}
        </main>
      </div>

      {launcherOpen && (
        <div className="launcher-overlay" role="dialog" aria-modal="true" aria-label="App launcher" onKeyDown={(event) => { if (event.key === "Escape") closeLauncher(); }}>
          <button className="launcher-close" onClick={closeLauncher} aria-label="Close app launcher"><X size={22} /></button>
          <div className="launcher-content">
            <label className="launcher-search">
              <Search size={20} />
              <input
                autoFocus
                aria-label="Search demos and pages"
                value={launcherQuery}
                onChange={(event) => setLauncherQuery(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter" && launcherResults[0]) { launcherResults[0].open(); closeLauncher(); } }}
                placeholder="Search use cases and pages..."
              />
              <kbd>Esc</kbd>
            </label>
            {launcherQuery.trim() ? (
              <div className="launcher-results" role="list" aria-label="Search results">
                {launcherResults.length === 0 ? <p>No use cases or pages match “{launcherQuery.trim()}”.</p> : launcherResults.map((result, index) => {
                  const Icon = result.icon;
                  return <button key={result.key} role="listitem" className={index === 0 ? "active" : ""} onClick={() => { result.open(); closeLauncher(); }}><Icon size={18} /><span>{result.title}<small>{result.detail}</small></span><ArrowRight size={15} /></button>;
                })}
              </div>
            ) : (
              <div className="launcher-columns">
                <div><h2>Workspace</h2>{activeApp && <button onClick={openStudioHome}><Grid2X2 size={18} /><span>All industry apps</span><ArrowRight size={15} /></button>}{[...navItems, ...shellPages].map((item) => { const Icon = item.icon; return <button key={item.id} onClick={() => { switchView(item.id); closeLauncher(); }}><Icon size={18} /><span>{item.label}</span><ArrowRight size={15} /></button>; })}</div>
                <div><h2>Industry apps</h2>{availableApps.map(app => { const Icon = iconFor(app.iconKey); return <button key={app.id} onClick={() => { guideControl?.exit(); router.push(`/apps/${app.id}`); closeLauncher(); }}><Icon size={18} /><span>{app.name}<small className="launcher-detail"> · {app.catalog.length} use cases</small></span><ArrowRight size={15} /></button>; })}</div>
                <div><h2>Cisco solutions</h2>
                  <button onClick={() => { switchView("controls"); closeLauncher(); }}><ShieldCheck size={18} /><span>AI Defense<small className="launcher-detail"> · {platform.defense.detail}</small></span><StatusDot tone={platform.defense.tone} /></button>
                  <button onClick={() => { switchView("telemetry"); closeLauncher(); }}><Activity size={18} /><span>Agent Observability<small className="launcher-detail"> · {platform.observability.detail}</small></span><StatusDot tone={platform.observability.tone} /></button>
                  <button onClick={() => { openSettings("st-models"); closeLauncher(); }}><ServerCog size={18} /><span>AI Infrastructure<small className="launcher-detail"> · {platform.infrastructure.detail}</small></span><StatusDot tone={platform.infrastructure.tone} /></button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {helpOpen && <HelpDrawer status={status} onClose={() => setHelpOpen(false)} onOpenSettings={() => openSettings()} />}

      {presenting !== null && story[presenting] && (
        <GuidedPresenterBar
          caseId={story[presenting].id}
          index={presenting}
          total={story.length}
          title={story[presenting].title}
          talk={presenterTalk(story[presenting], status)}
          onPrev={() => present(presenting - 1)}
          onNext={presenterNext}
          onExit={stopPresenting}
        />
      )}

    </div>
    </GuidedTourProvider>
    </StudioNavContext.Provider>
  );
}
