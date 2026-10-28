"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowUpRight, Loader2, Plus, RotateCcw } from "lucide-react";
import type { ObservedRun } from "./RunStats";
import { useTheme } from "./theme";
import { useStudioNav } from "./studio-nav";
import { PLANNER_SECTIONS, plannerAssessmentId, plannerInitialization, type PlannerConnection, type PlannerElement, type PlannerInitialization, type PlannerSection } from "./planner-integration";

const bundles = new Map<string, Promise<void>>();
function loadBundle(url: string): Promise<void> {
  if (customElements.get("ai-infrastructure-planner")) return Promise.resolve();
  const pending = bundles.get(url);
  if (pending) return pending;
  const loading = new Promise<void>((resolve, reject) => {
    const script = document.createElement("script");
    const failed = () => { clearTimeout(timer); script.remove(); reject(new Error("The planner browser bundle could not be loaded.")); };
    const timer = setTimeout(failed, 20000);
    script.type = "module";
    script.src = url;
    script.crossOrigin = "anonymous";
    script.onload = () => {
      clearTimeout(timer);
      if (customElements.get("ai-infrastructure-planner")) resolve();
      else failed();
    };
    script.onerror = failed;
    document.head.append(script);
  });
  bundles.set(url, loading);
  void loading.catch(() => bundles.delete(url));
  return loading;
}

function browserStorage(): Storage | null {
  try { return localStorage; } catch { return null; }
}

type Session = { connection: PlannerConnection; seed: PlannerInitialization };
type Phase = "loading" | "ready" | "error" | "unconfigured";

export default function CapacityPlanning({ useCaseId, title, objective, run }: { useCaseId: string; title: string; objective: string; run?: ObservedRun }) {
  const { appId = "fsi" } = useStudioNav();
  const theme = useTheme();
  const themeRef = useRef(theme);
  const host = useRef<HTMLDivElement>(null);
  const element = useRef<PlannerElement | null>(null);
  const [input] = useState({ useCaseId, title, objective, run, appId });
  const [session, setSession] = useState<Session | null>(null);
  const [phase, setPhase] = useState<Phase>("loading");
  const [error, setError] = useState("");
  const [current, setCurrent] = useState(false);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    themeRef.current = theme;
    element.current?.setAttribute("theme", theme);
  }, [theme]);

  useEffect(() => {
    const controller = new AbortController();
    void (async () => {
      try {
        const response = await fetch("/api/studio/planner", { signal: controller.signal, cache: "no-store" });
        if (!response.ok) throw new Error();
        const connection = await response.json() as PlannerConnection;
        if (controller.signal.aborted) return;
        if (!connection.configured || !connection.bundleUrl || !connection.apiBaseUrl) {
          setError(connection.error || "Configure the planner browser bundle and API URLs in Studio's local configuration.");
          setPhase("unconfigured");
          return;
        }
        const id = plannerAssessmentId(browserStorage(), input.useCaseId, false, undefined, input.appId ?? "fsi");
        setSession({ connection, seed: plannerInitialization(input.useCaseId, id, input.title, input.objective, input.run) });
      } catch {
        if (!controller.signal.aborted) { setError("Studio could not read the planner connection. Retry to reconnect."); setPhase("error"); }
      }
    })();
    return () => controller.abort();
  }, [input, attempt]);

  useEffect(() => {
    if (!session?.connection.bundleUrl || !session.connection.apiBaseUrl) return;
    let cancelled = false;
    let planner: PlannerElement | undefined;
    const ready = () => { if (!cancelled) setPhase("ready"); };
    const changed = (event: Event) => {
      // Snapshot and assessment text stay inside the planner's own draft storage.
      const detail = (event as CustomEvent<{ current?: boolean }>).detail;
      if (!cancelled) setCurrent(detail?.current === true);
    };
    const failed = (event: Event) => {
      const detail = (event as CustomEvent<{ message?: string }>).detail;
      if (!cancelled) { setError(detail?.message || "The planner needs attention. Retry to restore the assessment."); setPhase("error"); }
    };
    void loadBundle(session.connection.bundleUrl).then(() => {
      if (cancelled || !host.current) return;
      planner = document.createElement("ai-infrastructure-planner") as PlannerElement;
      planner.addEventListener("planner-ready", ready);
      planner.addEventListener("assessment-changed", changed);
      planner.addEventListener("planner-error", failed);
      planner.setAttribute("theme", themeRef.current);
      host.current.replaceChildren(planner);
      element.current = planner;
      planner.initialize(session.seed, {
        apiBaseUrl: session.connection.apiBaseUrl!,
        analytics: { enabled: false, endpoint: new URL("/api/business-events", session.connection.apiBaseUrl).href },
        initialSection: "/genai-sizing", showNavigation: false,
      });
    }).catch(() => {
      if (!cancelled) { setError("The planner could not load. Check its browser bundle and API services, then retry."); setPhase("error"); }
    });
    return () => {
      cancelled = true;
      planner?.removeEventListener("planner-ready", ready);
      planner?.removeEventListener("assessment-changed", changed);
      planner?.removeEventListener("planner-error", failed);
      planner?.remove();
      if (element.current === planner) element.current = null;
    };
  }, [session]);

  const retry = () => { setSession(null); setPhase("loading"); setError(""); setAttempt(value => value + 1); };
  const newAssessment = () => {
    if (!session) return;
    const id = plannerAssessmentId(browserStorage(), useCaseId, true, undefined, appId ?? "fsi");
    setPhase("loading"); setError(""); setCurrent(false);
    setSession({ connection: session.connection, seed: plannerInitialization(useCaseId, id, title, objective, run) });
  };
  const navigate = (path: PlannerSection) => element.current?.navigate(path);

  return <section className="capacity-planning" aria-labelledby="capacity-planning-title">
    <header className="capacity-planning-header">
      <div>
        <h2 id="capacity-planning-title">Capacity planning for {title}</h2>
        <p>{phase === "ready" ? current ? "Calculations current" : "Review workload and production assumptions" : "AI Infrastructure Planner"}</p>
      </div>
      <div className="capacity-planning-actions">
        <button type="button" className="secondary-button" onClick={newAssessment} disabled={phase !== "ready"}><Plus size={16} aria-hidden="true" /> New assessment</button>
        <a className="secondary-button" href="https://www.ai-infrastructure-planner.com/" target="_blank" rel="noopener noreferrer" aria-label="Open AI Infrastructure Planner in a new tab">Open planner <ArrowUpRight size={16} aria-hidden="true" /></a>
      </div>
    </header>
    <nav className="capacity-planning-sections" aria-label="Capacity planning sections">
      {PLANNER_SECTIONS.map(item => <button key={item.path} type="button" disabled={phase !== "ready"} onClick={() => navigate(item.path)}>{item.label}</button>)}
    </nav>
    {phase === "loading" && <p className="capacity-planning-status" role="status"><Loader2 size={18} className="spin" aria-hidden="true" /> Loading planner…</p>}
    {(phase === "error" || phase === "unconfigured") && <div className="capacity-planning-status" role="alert"><p>{error}</p><button type="button" className="secondary-button" onClick={retry}><RotateCcw size={16} aria-hidden="true" /> Retry connection</button></div>}
    <div className="capacity-planning-host" ref={host} aria-label="AI Infrastructure Planner workspace" />
  </section>;
}
