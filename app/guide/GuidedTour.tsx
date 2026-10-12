"use client";

import { createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type ReactNode, type RefObject } from "react";
import { createPortal } from "react-dom";
import { ChevronLeft, ChevronRight, Compass, Loader2, MoreHorizontal, X } from "lucide-react";
import type { StudioStatus } from "../studio-status";
import { provenanceText } from "../run/ProvenanceBadge";
import { demoRoot, evaluate, findAnchors, resolveFit, resolveStep, type ConditionContext, type ResolvedFit } from "./conditions";
import { loadPosition, loadPrefs, readDeepLink, savePosition, savePrefs, writeDeepLink, type GuidePosition, type GuidePrefs } from "./persistence";
import { cardWidth, mergeRects, place, scrollDelta, type Placement, type Rect } from "./placement";
import { TOURS, mainTourFor } from "./tours";
import { STATUS_STEP_ID } from "./tours/shared";
import type { Condition, GuideTab, Step, StepAction, Tour } from "./types";
import "./guide.css";

type Host = { caseId: string; tab: GuideTab; selectTab: (tab: GuideTab) => void };
export type GuideActions = {
  /** Replays the recorded run the step names; the same function the demo's own replay control calls. */
  replay?: (arg?: string) => void;
  /** The demo's own "Skip replay" control. */
  skipReplay?: () => void;
  selectScenario?: (id: string) => void;
};

type Active = { tourId: string; index: number; cut: boolean; offline: boolean; pendingResume: boolean };

type GuideContextValue = {
  active: Active | null;
  start: (tourId: string, options?: { stepId?: string; cut?: boolean; resume?: boolean }) => void;
  exit: () => void;
  tourFor: (caseId: string) => Tour | null;
  saved: GuidePosition | null;
  registerHost: (host: Host) => void;
  unregisterHost: (caseId: string) => void;
  registerActions: (caseId: string, actions: GuideActions) => () => void;
};

type GuideControls = Omit<GuideContextValue, "active" | "saved">;

// Controls never change identity, so demos that only register stay out of per-step renders.
const GuideControlContext = createContext<GuideControls | null>(null);
const GuideStateContext = createContext<Pick<GuideContextValue, "active" | "saved"> | null>(null);

/** For callers outside the provider's subtree (the ⌘K launcher lives beside it). */
export type GuideControl = Pick<GuideContextValue, "start" | "exit">;

export function useGuide(): GuideContextValue | null {
  const controls = useContext(GuideControlContext);
  const state = useContext(GuideStateContext);
  return useMemo(() => (controls && state ? { ...controls, ...state } : null), [controls, state]);
}

/** Start and exit without subscribing to every step change. */
export function useGuideControls() {
  return useContext(GuideControlContext);
}

/** The use case workspace registers its tab switcher so steps can change tabs. */
export function useGuideHost(caseId: string, tab: GuideTab, selectTab: (tab: GuideTab) => void) {
  const guide = useContext(GuideControlContext);
  const register = guide?.registerHost;
  const unregister = guide?.unregisterHost;
  const selectRef = useRef(selectTab);
  useLayoutEffect(() => { selectRef.current = selectTab; });
  useEffect(() => {
    register?.({ caseId, tab, selectTab: (next) => selectRef.current(next) });
  }, [register, caseId, tab]);
  useEffect(() => () => unregister?.(caseId), [unregister, caseId]);
}

/** Demos register the same functions their own controls call. */
export function useGuideActions(caseId: string, actions: GuideActions) {
  const guide = useContext(GuideControlContext);
  const register = guide?.registerActions;
  const ref = useRef(actions);
  useLayoutEffect(() => { ref.current = actions; });
  useEffect(() => register?.(caseId, {
    replay: (arg) => ref.current.replay?.(arg),
    skipReplay: () => ref.current.skipReplay?.(),
    selectScenario: (id) => ref.current.selectScenario?.(id),
  }), [register, caseId]);
}

const typing = (target: EventTarget | null) =>
  target instanceof HTMLElement && Boolean(target.closest("input, textarea, select, [contenteditable='true']"));

function stepsOf(tour: Tour, active: Pick<Active, "cut" | "offline">): Step[] {
  const steps = active.offline && tour.offline?.length ? tour.offline : tour.steps;
  if (!active.cut) return steps;
  const cut = steps.filter((step) => step.story);
  return cut.length ? cut : steps;
}

export function GuidedTourProvider({ children, currentCase, openCase, presenting, paused, status, onPresenterNext, onControl }: {
  children: ReactNode;
  currentCase: string | null;
  openCase: (id: string) => void;
  presenting: boolean;
  paused: boolean;
  status: StudioStatus | null;
  onPresenterNext?: () => void;
  onControl?: (control: GuideControl) => void;
}) {
  const [active, setActive] = useState<Active | null>(null);
  const [saved, setSaved] = useState<GuidePosition | null>(null);
  const [toast, setToast] = useState<GuidePosition | null>(null);
  const [prefs, setPrefsState] = useState<GuidePrefs>({ showCiscoFit: true });
  const hostRef = useRef<Host | null>(null);
  const [hostVersion, setHostVersion] = useState(0);
  const actionsRef = useRef(new Map<string, GuideActions>());
  const returnFocus = useRef<HTMLElement | null>(null);
  const direction = useRef<1 | -1>(1);
  const expectedCase = useRef<string | null>(null);
  const statusRef = useRef(status);
  useLayoutEffect(() => { statusRef.current = status; });

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      setPrefsState(loadPrefs());
      const position = loadPosition();
      setSaved(position);
      if (!readDeepLink(window.location.search) && position && TOURS[position.tourId]) setToast(position);
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  const registerHost = useCallback((host: Host) => {
    hostRef.current = host;
    setHostVersion((value) => value + 1);
  }, []);
  const unregisterHost = useCallback((caseId: string) => {
    if (hostRef.current?.caseId !== caseId) return;
    hostRef.current = null;
    setHostVersion((value) => value + 1);
  }, []);
  const getHost = useCallback(() => hostRef.current, []);
  const getActions = useCallback((caseId: string) => actionsRef.current.get(caseId), []);
  const registerActions = useCallback((caseId: string, actions: GuideActions) => {
    actionsRef.current.set(caseId, actions);
    return () => { if (actionsRef.current.get(caseId) === actions) actionsRef.current.delete(caseId); };
  }, []);

  const start = useCallback((tourId: string, options: { stepId?: string; cut?: boolean; resume?: boolean } = {}) => {
    const tour = TOURS[tourId];
    if (!tour) return;
    const context: ConditionContext = { root: null, status: statusRef.current };
    const offline = Boolean(tour.offline?.length && tour.offlineWhen && evaluate(tour.offlineWhen, context));
    const steps = stepsOf(tour, { cut: Boolean(options.cut), offline });
    const found = options.stepId ? steps.findIndex((step) => step.id === options.stepId) : -1;
    if (!returnFocus.current) returnFocus.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    direction.current = 1;
    setToast(null);
    setActive({ tourId, index: Math.max(0, found), cut: Boolean(options.cut), offline, pendingResume: Boolean(options.stepId) && found > 0 });
  }, []);

  const exit = useCallback((keepPosition = false) => {
    setActive(null);
    writeDeepLink(null);
    if (keepPosition) setSaved(loadPosition());
    else { savePosition(null); setSaved(null); }
    const focus = returnFocus.current;
    returnFocus.current = null;
    if (focus?.isConnected) requestAnimationFrame(() => focus.focus({ preventScroll: true }));
  }, []);

  const tour = active ? TOURS[active.tourId] : null;
  const steps = useMemo(() => (tour && active ? stepsOf(tour, active) : []), [tour, active]);

  /** `from` makes the move a no-op if another path already left that step. */
  const move = useCallback((delta: 1 | -1 | "home", from?: number) => {
    setActive((current) => {
      if (!current || (from !== undefined && current.index !== from)) return current;
      const list = stepsOf(TOURS[current.tourId], current);
      const index = delta === "home" ? 0 : current.index + delta;
      direction.current = delta === -1 ? -1 : 1;
      if (index < 0) return { ...current, index: 0, pendingResume: false };
      if (index >= list.length) return current;
      return { ...current, index, pendingResume: false };
    });
  }, []);

  const finish = useCallback(() => {
    const wasCut = active?.cut;
    exit();
    if (wasCut && presenting) onPresenterNext?.();
  }, [active?.cut, exit, presenting, onPresenterNext]);

  // Position and deep link follow the step.
  useEffect(() => {
    if (!active || !steps[active.index]) return;
    const position = { tourId: active.tourId, stepId: steps[active.index].id, at: Date.now() };
    savePosition(position);
    writeDeepLink(active.tourId, position.stepId);
  }, [active, steps]);

  // Deep links: ?guide=<tour>&step=<id>, read once.
  useEffect(() => {
    const link = readDeepLink(window.location.search);
    if (!link || !TOURS[link.tourId]) return;
    const timer = setTimeout(() => start(link.tourId, { stepId: link.stepId }), 50);
    return () => clearTimeout(timer);
  }, [start]);

  // The case each step runs in; story tours cross cases.
  const stepCase = active && tour ? (steps[active.index]?.case ?? tour.useCaseId) : null;
  useEffect(() => { expectedCase.current = stepCase; }, [stepCase]);

  // Leaving the case mid-tour: a handoff into the next step's case advances; anything else ends with a resume toast.
  const lastCase = useRef(currentCase);
  useEffect(() => {
    const previous = lastCase.current;
    lastCase.current = currentCase;
    if (!active || !tour || previous === currentCase || currentCase === expectedCase.current) return;
    const next = steps[active.index + 1];
    if (currentCase && next && (next.case ?? tour.useCaseId) === currentCase) {
      move(1, active.index);
      return;
    }
    if (previous && previous === expectedCase.current) {
      // Present mode is opt-in per moment, so moving on ends the tour quietly.
      exit(true);
      const position = loadPosition();
      if (position && !presenting) requestAnimationFrame(() => setToast(position));
    }
  }, [currentCase, active, tour, steps, move, exit, presenting]);

  // G starts or resumes the open case's tour.
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (active || event.key.toLowerCase() !== "g" || event.metaKey || event.ctrlKey || event.altKey || typing(event.target)) return;
      if (!currentCase) return;
      const caseTour = mainTourFor(currentCase);
      if (!caseTour) return;
      event.preventDefault();
      const position = loadPosition();
      if (position?.tourId === caseTour.id) start(caseTour.id, { stepId: position.stepId, resume: true });
      else start(caseTour.id, { cut: presenting });
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [active, currentCase, start, presenting]);

  const setPrefs = useCallback((next: GuidePrefs) => { setPrefsState(next); savePrefs(next); }, []);
  useEffect(() => { onControl?.({ start, exit: () => exit() }); }, [onControl, start, exit]);

  const controls = useMemo<GuideControls>(() => ({
    start, exit: () => exit(), tourFor: mainTourFor, registerHost, unregisterHost, registerActions,
  }), [start, exit, registerHost, unregisterHost, registerActions]);
  const state = useMemo(() => ({ active, saved }), [active, saved]);

  return (
    <GuideControlContext.Provider value={controls}>
    <GuideStateContext.Provider value={state}>
      {children}
      {active && tour && steps[active.index] ? (
        <GuideOverlay
          key={`${active.tourId}:${active.cut}:${active.offline}`}
          tour={tour}
          steps={steps}
          active={active}
          getHost={getHost}
          hostVersion={hostVersion}
          getActions={getActions}
          openCase={openCase}
          presenting={presenting}
          paused={paused}
          status={status}
          prefs={prefs}
          setPrefs={setPrefs}
          direction={direction}
          move={move}
          jump={(stepId) => setActive((current) => {
            if (!current) return current;
            const index = stepsOf(TOURS[current.tourId], current).findIndex((step) => step.id === stepId);
            return index < 0 ? { ...current, pendingResume: false } : { ...current, index, pendingResume: false };
          })}
          restart={() => { direction.current = 1; setActive((current) => current && { ...current, index: 0, pendingResume: false }); }}
          exit={() => exit()}
          finish={finish}
          startEncore={(id) => start(id)}
        />
      ) : null}
      {toast && !active && TOURS[toast.tourId] ? (
        <div className="guide-toast" role="status">
          <Compass size={16} aria-hidden="true" />
          <span>Resume guided tour: <b>{TOURS[toast.tourId].title}</b></span>
          <button type="button" className="primary" onClick={() => start(toast.tourId, { stepId: toast.stepId, resume: true })}>Resume</button>
          <button type="button" onClick={() => { setToast(null); savePosition(null); setSaved(null); }}>Dismiss</button>
        </div>
      ) : null}
    </GuideStateContext.Provider>
    </GuideControlContext.Provider>
  );
}

type Entry = {
  key: string;
  readyAt: number | null;
  enteredAt: number;
  caseRequested: boolean;
  /** When the engine last scrolled a target into view; it scrolls again if results push every target off screen. */
  scrolledAt: number;
  tabRequested: boolean;
  autoDone: boolean;
  scrolled: boolean;
  metAtEntry: boolean | null;
  advanced: boolean;
  settledTicks: number;
  needsChecked: boolean;
  focused: boolean;
};

type View = {
  key: string;
  ready: boolean;
  step: Step;
  holes: Rect[];
  placement: Placement | null;
  missing: boolean;
  offscreen: "above" | "below" | null;
  met: boolean;
  run: string;
  source: string;
  recordedAt: string | null;
  fits: ResolvedFit[];
  elapsed: number;
  expanded: boolean;
  /** Steps left out of the count: ones skipped so far, and the status step when nothing is offline. */
  hidden: string[];
  /** Which actions the demo has registered, so the card re-renders once they arrive. */
  actions: string[];
};

/**
 * Card heights for placement. Measured while docked, the taller docked height also stands in for full
 * width, which errs toward keeping the card docked rather than flipping between modes every frame.
 */
function cardHeights(measured: { h: number; w: number }, fullW: number, dockW: number | null) {
  if (dockW === null) return { h: measured.h };
  const docked = measured.w > 0 && Math.abs(measured.w - dockW) <= 4;
  return { h: measured.h, dockH: docked ? measured.h : Math.round(measured.h * (fullW / Math.max(180, dockW)) * 0.92) };
}

/** Conditions on live status alone can be judged before their step is reached. */
/** Marks the current targets for CSS, tests, and screen readers; anchors that re-mount are marked again. */
function markTargets(marked: Map<HTMLElement, string | null>, elements: HTMLElement[]) {
  const wanted = new Set(elements);
  marked.forEach((before, element) => {
    if (wanted.has(element) && element.isConnected) return;
    element.removeAttribute("data-guide-active");
    if (before) element.setAttribute("aria-describedby", before);
    else element.removeAttribute("aria-describedby");
    marked.delete(element);
  });
  elements.forEach((element) => {
    if (marked.has(element)) return;
    const before = element.getAttribute("aria-describedby");
    marked.set(element, before);
    element.setAttribute("data-guide-active", "true");
    element.setAttribute("aria-describedby", [before, "guide-card-body"].filter(Boolean).join(" "));
  });
}

function statusOnly(condition: Condition): boolean {
  if ("status" in condition) return true;
  if ("all" in condition) return condition.all.every(statusOnly);
  if ("any" in condition) return condition.any.every(statusOnly);
  if ("not" in condition) return statusOnly(condition.not);
  return false;
}

const PAD = 6;
const SETTLE_MS = 320;
const reducedMotion = () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

function performAction(action: StepAction, actions: GuideActions | undefined) {
  if (action.type === "selectScenario") { actions?.selectScenario?.(action.value); return; }
  if (action.type === "setPlatformFocus") {
    const button = document.querySelector<HTMLButtonElement>(`#case-panel-architecture [data-guide~="arch.focus"] button[aria-label="${CSS.escape(action.value)}"]`);
    if (button?.getAttribute("aria-checked") !== "true") button?.click();
    return;
  }
  const element = findAnchors(action.anchor)[0];
  if (!element || element.getAttribute("data-guide-safe") !== "true") return;
  if (action.type === "openDetails") {
    if (element instanceof HTMLDetailsElement) element.open = true;
    return;
  }
  if (["aria-pressed", "aria-checked", "aria-expanded"].some((name) => element.getAttribute(name) === "true")) return;
  element.click();
}

function topbarBottom(presenting: boolean) {
  if (presenting) return 0;
  const bar = document.querySelector(".topbar");
  return bar ? Math.max(0, bar.getBoundingClientRect().bottom) : 64;
}

function GuideOverlay({ tour, steps, active, getHost, hostVersion, getActions, openCase, presenting, paused, status, prefs, setPrefs, direction, move, jump, restart, exit, finish, startEncore }: {
  tour: Tour;
  steps: Step[];
  active: Active;
  getHost: () => Host | null;
  hostVersion: number;
  getActions: (caseId: string) => GuideActions | undefined;
  openCase: (id: string) => void;
  presenting: boolean;
  paused: boolean;
  status: StudioStatus | null;
  prefs: GuidePrefs;
  setPrefs: (prefs: GuidePrefs) => void;
  direction: RefObject<1 | -1>;
  move: (delta: 1 | -1 | "home", from?: number) => void;
  jump: (stepId: string) => void;
  restart: () => void;
  exit: () => void;
  finish: () => void;
  startEncore: (tourId: string) => void;
}) {
  const raw = steps[active.index];
  const stepKey = `${tour.id}:${active.index}:${raw.id}`;
  const caseId = raw.case ?? tour.useCaseId;
  const [view, setView] = useState<View | null>(null);
  // Measured with the width it was measured at, so full-width and docked heights can both be derived without feedback.
  const [cardBox, setCardBox] = useState({ h: 260, w: 0 });
  // Per-step UI state: keyed by step so it resets when the step changes.
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [confirmFor, setConfirmFor] = useState<string | null>(null);
  const [stripFor, setStripFor] = useState<string | null>(null);
  const [pulse, setPulse] = useState(false);
  const [announce, setAnnounce] = useState("");
  const [mapExpanded, setMapExpanded] = useState(false);
  const cardRef = useRef<HTMLDivElement>(null);
  const titleRef = useRef<HTMLHeadingElement>(null);
  const nextRef = useRef<HTMLButtonElement>(null);
  const entry = useRef<Entry | null>(null);
  const lastView = useRef("");
  const firstStep = useRef(true);
  const skipped = useRef(new Set<string>());
  const marked = useRef(new Map<HTMLElement, string | null>());
  const live = useRef({ status, presenting, paused, cardBox, raw, active, caseId, steps, tour });
  useLayoutEffect(() => { live.current = { status, presenting, paused, cardBox, raw, active, caseId, steps, tour }; });

  const tick = useCallback(() => {
    const { status: currentStatus, presenting: isPresenting, paused: isPaused, cardBox: measured, raw: rawStep, active: current, caseId: wantCase, steps: list, tour: currentTour } = live.current;
    const expanded = Boolean(document.querySelector(".map-explorer.is-expanded"));
    setMapExpanded(expanded);
    if (isPaused || expanded) return;
    const now = performance.now();
    let state = entry.current;
    if (!state || state.key !== stepKey) {
      state = { key: stepKey, readyAt: null, enteredAt: now, scrolledAt: 0, caseRequested: false, tabRequested: false, autoDone: false, scrolled: false, metAtEntry: null, advanced: false, settledTicks: 0, needsChecked: !current.pendingResume, focused: false };
      entry.current = state;
    }
    const context: ConditionContext = { root: demoRoot(), status: currentStatus };
    const publish = (next: View) => {
      const serial = JSON.stringify(next);
      if (serial !== lastView.current) { lastView.current = serial; setView(next); }
    };
    const pending = (step: Step): View => ({ key: stepKey, ready: false, step, holes: [], placement: null, missing: false, offscreen: null, met: false, run: "idle", source: "none", recordedAt: null, fits: [], elapsed: 0, expanded: false, hidden: [], actions: [] });

    const currentHost = getHost();
    if (currentHost?.caseId !== wantCase) {
      // A handoff into the next step's case is the provider's to advance, not a reason to go back.
      const following = list[current.index + 1];
      const handoff = Boolean(currentHost && following && (following.case ?? currentTour.useCaseId) === currentHost.caseId);
      if (!state.caseRequested && !handoff) { state.caseRequested = true; openCase(wantCase); }
      publish(pending(rawStep));
      return;
    }
    const step = resolveStep(rawStep, context);
    const tab = step.tab ?? "demo";
    if (currentHost.tab !== tab) {
      if (!state.tabRequested) { state.tabRequested = true; currentHost.selectTab(tab); }
      state.readyAt = null;
      publish(pending(step));
      return;
    }
    if (tab === "architecture") {
      const explorer = document.querySelector<HTMLElement>("#case-panel-architecture [data-testid='architecture-explorer']");
      const settled = explorer && explorer.getBoundingClientRect().height > 0 && explorer.dataset.phase === "idle";
      state.settledTicks = settled ? state.settledTicks + 1 : 0;
      if (state.settledTicks < 2) { publish(pending(step)); return; }
    }
    if (state.readyAt === null) { state.readyAt = now; publish(pending(step)); return; }
    if (now - state.readyAt < SETTLE_MS) return;

    if (!state.needsChecked) {
      state.needsChecked = true;
      if (rawStep.resumeFrom && !evaluate(rawStep.needs, context)) { jump(rawStep.resumeFrom); return; }
    }
    if (rawStep.showIf && state.metAtEntry === null && !evaluate(rawStep.showIf, context)) {
      skipped.current.add(rawStep.id);
      if (direction.current === -1 && current.index === 0) move(1, current.index);
      else move(direction.current, current.index);
      return;
    }
    skipped.current.delete(rawStep.id);
    const ahead = list.slice(current.index + 1).filter((item) => item.showIf && (item.id === STATUS_STEP_ID || statusOnly(item.showIf)) && !evaluate(item.showIf, context));
    const hidden = [...skipped.current, ...ahead.map((item) => item.id)];
    const met = step.waitFor ? evaluate(step.waitFor, context) : true;
    // Auto steps act on entry; wait steps act once what they wait for has landed.
    if ((step.kind === "auto" || (step.kind === "wait" && met)) && step.action && !state.autoDone) {
      state.autoDone = true;
      performAction(step.action, getActions(wantCase));
    }
    if (state.metAtEntry === null) state.metAtEntry = met;
    // Act steps advance once the person's action lands; wait steps turn into a normal step with Next.
    if (step.kind === "act" && met && !state.metAtEntry && !state.advanced) {
      state.advanced = true;
      setTimeout(() => {
        if (entry.current?.key === stepKey) move(1, current.index);
        requestAnimationFrame(() => nextRef.current?.focus({ preventScroll: true }));
      }, 450);
    }

    const vw = window.innerWidth;
    const vh = window.innerHeight;
    const presenterBar = document.querySelector<HTMLElement>(".presenter-bar");
    const presenterTop = isPresenting && presenterBar ? presenterBar.getBoundingClientRect().top : vh;
    const clipTop = topbarBottom(isPresenting);
    const clipBottom = Math.min(vh, presenterTop);
    const elements = [...new Set(step.targets.flatMap((id) => findAnchors(id)))];
    const raws: Rect[] = elements.map((element) => {
      const box = element.getBoundingClientRect();
      return { x: box.left - PAD, y: box.top - PAD, w: box.width + PAD * 2, h: box.height + PAD * 2 };
    }).filter((rect) => rect.w > PAD * 2 && rect.h > PAD * 2);

    const visible = raws.some((rect) => rect.y + rect.h > clipTop + 24 && rect.y < clipBottom - 24);
    if (raws.length && (!state.scrolled || (!visible && now - state.scrolledAt > 1500))) {
      state.scrolled = true;
      state.scrolledAt = now;
      const delta = scrollDelta(raws, { top: clipTop + 16, bottom: clipBottom - 16 }, step.scroll ?? "center");
      if (delta !== null && Math.abs(delta) > 8) window.scrollTo({ top: Math.max(0, window.scrollY + delta), behavior: reducedMotion() ? "auto" : "smooth" });
    }

    const holes = mergeRects(raws.map((rect) => {
      const x = Math.max(0, rect.x);
      const y = Math.max(clipTop, rect.y);
      const right = Math.min(vw, rect.x + rect.w);
      const bottom = Math.min(clipBottom, rect.y + rect.h);
      return { x: Math.round(x), y: Math.round(y), w: Math.round(right - x), h: Math.round(bottom - y) };
    }).filter((rect) => rect.w > 4 && rect.h > 4));

    const others = raws.slice(1);
    const offscreen = others.some((rect) => rect.y > clipBottom - 24) ? "below" : others.some((rect) => rect.y + rect.h < clipTop + 24) ? "above" : null;
    const sidebar = document.querySelector<HTMLElement>(".sidebar");
    const sidebarBox = !isPresenting && sidebar && getComputedStyle(sidebar).display !== "none" ? sidebar.getBoundingClientRect() : null;
    const inSlot = isPresenting && Boolean(document.getElementById("presenter-guide-slot"));
    const fullW = cardWidth(vw);
    const placement = inSlot ? null : place({
      targets: holes,
      viewport: { w: vw, h: vh },
      card: cardHeights(measured, fullW, sidebarBox ? sidebarBox.width - 20 : null),
      obstacles: isPresenting && presenterBar ? [rectOf(presenterBar)] : [],
      sidebar: sidebarBox && sidebarBox.width >= 200 && sidebarBox.right > 0 ? { x: sidebarBox.left, y: sidebarBox.top, w: sidebarBox.width, h: sidebarBox.height } : null,
      top: clipTop,
      hint: step.placement,
    });

    markTargets(marked.current, elements);
    const root = context.root;
    publish({
      key: stepKey,
      ready: true,
      step,
      holes,
      placement,
      missing: step.targets.length > 0 && raws.length === 0 && step.kind !== "wait" && now - state.readyAt > 1500,
      offscreen,
      met,
      run: root?.getAttribute("data-guide-run") ?? "idle",
      source: root?.getAttribute("data-guide-source") ?? "none",
      recordedAt: root?.getAttribute("data-guide-recorded-at") ?? null,
      fits: (step.ciscoFit ?? []).map((fit) => resolveFit(fit, context)),
      elapsed: Math.floor((now - state.enteredAt) / 1000),
      expanded,
      hidden,
      actions: Object.keys(getActions(wantCase) ?? {}).sort(),
    });
  }, [stepKey, getHost, openCase, getActions, direction, move, jump]);

  useEffect(() => {
    let frame = 0;
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(tick); };
    const timer = setInterval(tick, 200);
    schedule();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => { clearInterval(timer); cancelAnimationFrame(frame); window.removeEventListener("scroll", schedule); window.removeEventListener("resize", schedule); };
  }, [tick, hostVersion]);

  const menuOpen = menuFor === stepKey;
  const setMenuOpen = (open: boolean | ((current: boolean) => boolean)) => setMenuFor((current) => ((typeof open === "function" ? open(current === stepKey) : open) ? stepKey : null));
  const confirmSkip = confirmFor === stepKey;
  const setConfirmSkip = useCallback((value: boolean) => setConfirmFor(value ? stepKey : null), [stepKey]);
  const stripOpen = stripFor === stepKey;
  const setStripOpen = (value: boolean) => setStripFor(value ? stepKey : null);

  // Card height feeds placement.
  useEffect(() => {
    const card = cardRef.current;
    if (!card) return;
    let frame = 0;
    // Measured on the next frame: setting state inside the callback can re-enter the observer in the same frame.
    const observer = new ResizeObserver(() => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const box = card.getBoundingClientRect();
        const next = { h: Math.ceil(box.height), w: Math.round(box.width) };
        setCardBox((current) => (current.h === next.h && current.w === next.w ? current : next));
      });
    });
    observer.observe(card);
    return () => { cancelAnimationFrame(frame); observer.disconnect(); };
  });

  const shown = view?.key === stepKey && view.ready ? view : null;
  const step = shown?.step ?? raw;
  const last = active.index === steps.length - 1;
  const hidden = new Set(shown?.hidden ?? []);
  const total = steps.filter((item) => !hidden.has(item.id)).length;
  const number = steps.slice(0, active.index + 1).filter((item) => !hidden.has(item.id)).length;
  const actions_ = getActions(caseId);
  const waiting = Boolean(shown && (step.kind === "wait" || step.kind === "act") && step.waitFor && !shown.met);
  const patience = step.patience ?? 20_000;

  // Announce each step; focus the card on start, the control on act steps.
  useEffect(() => {
    if (!shown) return;
    const state = entry.current;
    if (!state || state.focused) return;
    state.focused = true;
    setAnnounce(`Step ${number} of ${total}. ${step.title}. ${step.body}`);
    if (firstStep.current) {
      firstStep.current = false;
      requestAnimationFrame(() => titleRef.current?.focus({ preventScroll: true }));
      return;
    }
    if (step.kind === "act" && !shown.met) {
      const target = step.targets.flatMap((id) => findAnchors(id))[0];
      const focusable = target?.matches("button, select, input, textarea, a[href]") ? target : target?.querySelector<HTMLElement>("button:not(:disabled), select, input, textarea, a[href]");
      if (focusable) requestAnimationFrame(() => focusable.focus({ preventScroll: true }));
    }
  }, [shown, step, number, total]);

  const metNow = shown?.met;
  const wasMet = useRef<boolean | undefined>(undefined);
  useEffect(() => {
    if (wasMet.current === false && metNow && step.waitFor) {
      setAnnounce(step.kind === "act" ? "Done." : "Result landed.");
      const focus = document.activeElement;
      if (step.kind === "wait" && (!focus || focus === document.body || cardRef.current?.contains(focus))) nextRef.current?.focus({ preventScroll: true });
    }
    wasMet.current = metNow;
  }, [metNow, step]);

  // Marks are dropped when the step changes or the tour closes.
  useEffect(() => () => markTargets(marked.current, []), [stepKey]);

  const next = useCallback(() => {
    if (waiting && step.kind === "act" && step.replay && !confirmSkip) { setConfirmSkip(true); return; }
    if (last) finish();
    else move(1);
  }, [waiting, step, confirmSkip, setConfirmSkip, last, finish, move]);

  // Keys: → Enter Space next, ← back, Home first, Esc exit; Tab stays in the card and the targets.
  useEffect(() => {
    if (paused || mapExpanded) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "Escape") { event.preventDefault(); event.stopImmediatePropagation(); exit(); return; }
      if (event.key === "Tab") {
        const card = cardRef.current;
        if (!card) return;
        const pick = (root: Element) => [...root.querySelectorAll<HTMLElement>("button:not(:disabled), select:not(:disabled), input:not(:disabled), textarea:not(:disabled), a[href], [tabindex]:not([tabindex='-1'])")].filter((element) => element.getClientRects().length > 0);
        const targets = step.targets.flatMap((id) => findAnchors(id));
        const loop = [...pick(card), ...targets.flatMap((target) => (target.matches("button, select, input, textarea, a[href]") ? [target] : pick(target)))];
        if (!loop.length) return;
        event.preventDefault();
        const index = loop.indexOf(document.activeElement as HTMLElement);
        const nextIndex = index < 0 ? 0 : (index + (event.shiftKey ? -1 : 1) + loop.length) % loop.length;
        loop[nextIndex].focus();
        return;
      }
      if (typing(event.target)) return;
      const onControl = event.target instanceof HTMLElement && event.target !== titleRef.current && Boolean(event.target.closest("button, a[href], [role='tab'], [role='radio'], summary"));
      const arrowOwner = event.target instanceof HTMLElement && Boolean(event.target.closest(".react-flow, [role='tab'], [role='radio'], [role='slider']"));
      if ((event.key === "ArrowRight" && !arrowOwner) || ((event.key === "Enter" || event.key === " ") && !onControl)) {
        event.preventDefault(); event.stopImmediatePropagation();
        if (!(waiting && step.kind === "wait" && (shown?.elapsed ?? 0) * 1000 < patience)) next();
        return;
      }
      if (event.key === "ArrowLeft" && !arrowOwner) {
        event.preventDefault(); event.stopImmediatePropagation();
        move(-1);
        return;
      }
      if (event.key === "Home" && !onControl) { event.preventDefault(); move("home"); return; }
    };
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [paused, mapExpanded, exit, next, move, waiting, step, shown?.elapsed, patience]);

  if (paused || mapExpanded) return null;

  const slot = presenting ? document.getElementById("presenter-guide-slot") : null;
  const holes = shown?.holes ?? [];
  const vw = typeof window === "undefined" ? 0 : window.innerWidth;
  const vh = typeof window === "undefined" ? 0 : window.innerHeight;
  const clip = `path(evenodd, "M0 0H${vw}V${vh}H0Z${holes.map((r) => ` M${r.x} ${r.y}H${r.x + r.w}V${r.y + r.h}H${r.x}Z`).join("")}")`;
  const placement = shown?.placement ?? null;
  const strip = placement?.mode === "strip" && !stripOpen;
  const kicker = `${step.moment ? `${step.moment} · ` : `${tour.title} · `}Step ${number} of ${total}`;
  const source = sourceLine(tour, shown);
  const fits = prefs.showCiscoFit ? shown?.fits ?? [] : [];
  const canReplay = Boolean(step.replay && actions_?.replay);
  const replaying = shown?.run === "running" && shown.source === "recorded";
  const waitTooLong = waiting && (shown?.elapsed ?? 0) * 1000 >= patience;
  const nextLabel = last ? (active.cut && presenting ? "Next moment" : "Finish") : waiting && step.kind === "act" ? (confirmSkip ? "Skip anyway" : "Skip") : waiting ? "Skip ahead" : "Next";
  const nextDisabled = waiting && step.kind === "wait" && !waitTooLong;

  const card = (
    <div
      ref={cardRef}
      className={`guide-card mode-${slot ? "presenter" : placement?.mode ?? "pending"}${pulse ? " pulse" : ""}${tour.label ? " illustrative" : ""}`}
      role="dialog"
      aria-modal="false"
      aria-labelledby="guide-card-title"
      aria-describedby="guide-card-body"
      data-guide-step={raw.id}
      data-guide-ready={shown ? "true" : "false"}
      style={slot || !placement ? undefined : { left: placement.x, top: placement.y, width: placement.w, maxHeight: `calc(100vh - ${placement.y + 12}px)` }}
    >
      <header className="guide-kicker">
        <span><Compass size={14} aria-hidden="true" />{kicker}</span>
        <div className="guide-menu">
          <button type="button" aria-label="Tour options" aria-haspopup="menu" aria-expanded={menuOpen} onClick={() => setMenuOpen((open) => !open)}><MoreHorizontal size={16} /></button>
          {menuOpen ? (
            <div className="guide-menu-list" role="menu">
              <button type="button" role="menuitemcheckbox" aria-checked={prefs.showCiscoFit} onClick={() => { setPrefs({ ...prefs, showCiscoFit: !prefs.showCiscoFit }); setMenuOpen(false); }}>
                <span className="guide-check" aria-hidden="true">{prefs.showCiscoFit ? "✓" : ""}</span>Show Cisco fit
              </button>
              <button type="button" role="menuitem" onClick={() => { setMenuOpen(false); restart(); }}>Restart tour</button>
              <p className="guide-keys">→ or Enter next · ← back · Home first · Esc exit</p>
            </div>
          ) : null}
        </div>
        <button type="button" aria-label="Exit guided tour" onClick={exit}><X size={16} /></button>
      </header>
      {tour.label ? <p className="guide-label">{tour.label}</p> : source ? <p className={`guide-source source-${shown?.source ?? "none"}`}>{source}</p> : null}
      <h2 id="guide-card-title" ref={titleRef} tabIndex={-1}>{step.title}</h2>
      {strip ? (
        <button type="button" className="guide-strip-more" aria-expanded={false} onClick={() => setStripOpen(true)}>Show details</button>
      ) : (
        <div id="guide-card-body" className="guide-body">
          <p>{step.body}</p>
          {shown?.missing ? <p className="guide-note">This part of the page isn&apos;t showing in this run. Continue to the next step.</p> : null}
          {shown?.offscreen ? <p className="guide-note">{shown.offscreen === "below" ? "↓ Also highlighted below" : "↑ Also highlighted above"}</p> : null}
          {fits.map((fit) => (
            <div key={fit.product} className={`guide-fit status-${fit.status}`} data-cisco-status={fit.status}>
              <div className="guide-fit-head">
                <span>Cisco fit · {fit.product}</span>
                <b title={FIT_TITLE[fit.status]}>{FIT_LABEL[fit.status]}</b>
              </div>
              <p>{fit.how}</p>
            </div>
          ))}
          {shown?.run === "failed" && waiting ? <p className="guide-note" role="status">The run stopped with an error. The page shows the demo&apos;s own message.</p> : null}
          {waiting ? (
            <p className="guide-wait" role="status">
              {shown?.run === "running" || shown?.run === "starting" || step.kind === "wait" ? <Loader2 size={14} className="guide-spin" aria-hidden="true" /> : null}
              <span>{step.kind === "act" && !(shown?.run === "running") ? (step.waitingText ?? "Waiting for you to use the highlighted control.") : `${step.waitingText ?? "Waiting for the page…"} ${clock(shown?.elapsed ?? 0)}`}</span>
            </p>
          ) : null}
          {last && tour.encores?.length ? (
            <div className="guide-encores">
              <span>Encore</span>
              {tour.encores.filter((id) => TOURS[id]).map((id) => (
                <button key={id} type="button" onClick={() => startEncore(id)}>{TOURS[id].title}</button>
              ))}
            </div>
          ) : null}
          {confirmSkip ? <p className="guide-note">Later steps need this run&apos;s results. Press Skip anyway to continue without them.</p> : null}
          {(canReplay && waiting) || (replaying && actions_?.skipReplay && waiting) ? (
            <div className="guide-actions">
              {canReplay && waiting && shown?.run !== "running" && shown?.run !== "starting" ? (
                <button type="button" className="primary" onClick={() => actions_?.replay?.(step.replay?.arg)}>{step.replay?.label ?? "Replay the recorded run"}</button>
              ) : null}
              {replaying && actions_?.skipReplay ? <button type="button" onClick={() => actions_?.skipReplay?.()}>Skip to the end of the replay</button> : null}
            </div>
          ) : null}
        </div>
      )}
      <footer className="guide-nav">
        <button type="button" onClick={() => move(-1)} disabled={active.index === 0}><ChevronLeft size={15} aria-hidden="true" />Back</button>
        <span className="guide-dots" aria-hidden="true">
          {total <= 14 ? steps.map((item, index) => (hidden.has(item.id) ? null : <i key={item.id} className={index === active.index ? "on" : index < active.index ? "done" : ""} />)) : <i className="on" />}
        </span>
        <button ref={nextRef} type="button" className="primary" onClick={next} disabled={nextDisabled}>{nextLabel}{last ? null : <ChevronRight size={15} aria-hidden="true" />}</button>
      </footer>
    </div>
  );

  return (
    <>
      {createPortal(
        <div className={`guide-layer${reducedMotion() ? " reduce" : ""}`} data-guide-tour={tour.id} data-guide-step={raw.id} data-guide-ready={shown ? "true" : "false"}>
          <svg className="guide-dim-svg" width={vw} height={vh} aria-hidden="true">
            <defs>
              <mask id="guide-mask">
                <rect x="0" y="0" width={vw} height={vh} fill="white" />
                {holes.map((rect, index) => <rect key={index} className="guide-hole" x={rect.x} y={rect.y} width={rect.w} height={rect.h} rx="8" fill="black" />)}
              </mask>
            </defs>
            <rect className="guide-dim" x="0" y="0" width={vw} height={vh} mask="url(#guide-mask)" />
          </svg>
          <div
            className="guide-blocker"
            style={{ clipPath: clip }}
            onClick={() => { setPulse(true); setTimeout(() => setPulse(false), 420); }}
          />
          {holes.map((rect, index) => <div key={index} className="guide-ring" style={{ left: rect.x, top: rect.y, width: rect.w, height: rect.h }} />)}
          {slot ? null : card}
          <div className="guide-sr" aria-live="polite">{announce}</div>
        </div>,
        document.body,
      )}
      {slot ? createPortal(card, slot) : null}
    </>
  );
}

const FIT_LABEL = { running: "Running", proposed: "Proposed", "when-configured": "When configured" } as const;
const FIT_TITLE = {
  running: "Studio status shows this control active on this machine now.",
  proposed: "Part of the proposed architecture; not running in this studio.",
  "when-configured": "Runs here once it is configured; it is not active on this machine now.",
} as const;

const clock = (seconds: number) => `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, "0")}`;
const rectOf = (element: Element): Rect => {
  const box = element.getBoundingClientRect();
  return { x: box.left, y: box.top, w: box.width, h: box.height };
};

function sourceLine(tour: Tour, view: View | null): string | null {
  if (!view) return tour.recording ? "Uses a recorded run" : null;
  if (view.source === "recorded") return view.recordedAt ? provenanceText({ kind: "recorded", recordedAt: view.recordedAt }) : "Recorded run";
  if (view.source === "live") return "Live run";
  if (view.source === "sample") return "Sample data · no model call";
  if (view.source === "scripted") return "Scripted · no model call";
  return tour.recording ? "Uses a recorded run" : null;
}
