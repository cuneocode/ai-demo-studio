"use client";

import { useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  Activity,
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
  Zap,
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

const useCases: UseCase[] = [
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
    <article className={`use-case-card accent-${useCase.accent}`}>
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
      <button className="card-action" onClick={() => onOpen(useCase)}>
        Open preview <ArrowRight size={16} />
      </button>
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
        <span className="live-chip"><StatusDot /> Connected</span>
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

export default function HomePage() {
  const [activeView, setActiveView] = useState<View>("overview");
  const [filter, setFilter] = useState<Category>("All");
  const [query, setQuery] = useState("");
  const [selectedCase, setSelectedCase] = useState<UseCase | null>(null);
  const [launcherOpen, setLauncherOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [storyItems, setStoryItems] = useState<string[]>(["kyc-processing", "sar-support", "client-advisory"]);

  const filteredCases = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return useCases.filter((item) => {
      const matchesFilter = filter === "All" || item.category === filter;
      const matchesQuery = !normalized || `${item.title} ${item.description} ${item.solutions.join(" ")}`.toLowerCase().includes(normalized);
      return matchesFilter && matchesQuery;
    });
  }, [filter, query]);

  const switchView = (view: View) => {
    setActiveView(view);
    setSidebarOpen(false);
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const addToStory = (id: string) => {
    setStoryItems((items) => items.includes(id) ? items : [...items, id]);
    setSelectedCase(null);
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
          <div className="organization-card">
            <span className="org-icon"><Building2 size={18} /></span>
            <div><small>DEMO ENVIRONMENT</small><strong>worldwide-ai</strong></div>
            <ChevronDown size={15} />
          </div>

          <nav className="side-nav" aria-label="Main navigation">
            <span className="nav-group-label">Workspace</span>
            {navItems.map((item) => {
              const Icon = item.icon;
              return (
                <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => switchView(item.id)}>
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
          {activeView === "overview" && (
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
                <div><span className="metric-icon blue"><Library size={18} /></span><p><strong>06</strong><span>Use cases</span></p><small>Modular library</small></div>
                <div><span className="metric-icon violet"><Workflow size={18} /></span><p><strong>03</strong><span>Stories</span></p><small>Flexible sequences</small></div>
                <div><span className="metric-icon mint"><ShieldCheck size={18} /></span><p><strong>03</strong><span>Cisco solutions</span></p><small>Mapped to each demo</small></div>
                <div><span className="metric-icon amber"><Radio size={18} /></span><p><strong>Live</strong><span>Demo environment</span></p><small><StatusDot /> Systems nominal</small></div>
              </section>

              <div className="overview-grid">
                <section className="use-case-section">
                  <div className="section-heading">
                    <div><span className="eyebrow">MODULAR DEMO LIBRARY</span><h2>Featured use cases</h2></div>
                    <button className="text-button" onClick={() => switchView("library")}>View all six <ArrowRight size={15} /></button>
                  </div>
                  <div className="use-case-grid">
                    {useCases.slice(0, 4).map((item) => <UseCaseCard key={item.id} useCase={item} onOpen={setSelectedCase} />)}
                  </div>
                </section>
                <PlatformRail />
              </div>
            </>
          )}

          {activeView === "library" && (
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
                {filteredCases.map((item) => <UseCaseCard key={item.id} useCase={item} onOpen={setSelectedCase} />)}
                {filteredCases.length === 0 && <div className="empty-state"><Search size={26} /><h2>No matching use cases</h2><p>Try a broader search or reset the category filter.</p><button className="secondary-button" onClick={() => { setQuery(""); setFilter("All"); }}>Reset filters</button></div>}
              </section>
            </>
          )}

          {activeView === "stories" && (
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
                        <button aria-label={`Open ${item.title}`} onClick={() => setSelectedCase(item)}><ArrowUpRight size={17} /></button>
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

      {selectedCase && (
        <div className="modal-backdrop" role="presentation" onMouseDown={() => setSelectedCase(null)}>
          <section className="detail-modal" role="dialog" aria-modal="true" aria-labelledby="detail-title" onMouseDown={(event) => event.stopPropagation()}>
            <button className="modal-close" onClick={() => setSelectedCase(null)} aria-label="Close"><X size={20} /></button>
            <div className={`modal-icon ${selectedCase.accent}`}>{(() => { const Icon = selectedCase.icon; return <Icon size={26} />; })()}</div>
            <span className="eyebrow">{selectedCase.category}</span>
            <h2 id="detail-title">{selectedCase.title}</h2>
            <p className="modal-lede">{selectedCase.description}</p>
            <div className="modal-frame">
              <div><small>01</small><span>Business moment</span><strong>{selectedCase.signal}</strong></div>
              <ArrowRight size={17} />
              <div><small>02</small><span>AI transformation</span><strong>Guided agent experience</strong></div>
              <ArrowRight size={17} />
              <div><small>03</small><span>Platform proof</span><strong>{selectedCase.solutions.join(" + ")}</strong></div>
            </div>
            <div className="modal-note"><Zap size={18} /><div><strong>Prototype UI</strong><p>Interactive workflow coming next.</p></div></div>
            <div className="modal-actions"><button className="secondary-button" onClick={() => setSelectedCase(null)}>Close preview</button><button className="primary-button" onClick={() => addToStory(selectedCase.id)}>{storyItems.includes(selectedCase.id) ? <><Check size={17} /> In your story</> : <><Plus size={17} /> Add to story</>}</button></div>
          </section>
        </div>
      )}
    </div>
  );
}
