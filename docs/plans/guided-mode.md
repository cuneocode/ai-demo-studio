# Guided mode for every demo: plan

Status: **plan only, nothing built** · Branch: `studio-integration` ([PR #1](https://github.com/cuneocode/FSI-AI-demo-platfrom/pull/1)) · Date: 2026-10-12
Companion to [`fsi-demo-redesign.md`](fsi-demo-redesign.md). That plan's narrative arc (business problem → AI transformation → Cisco value, §1.1), honesty rules (§1.2), and Cisco value map (§1.3) apply to every line of copy below.

> **The ask:** "Some of these are hard to follow. Add a 'guided' experience mode for each demo that highlights the focus area for each step and dims the rest of the page. Each click highlights the next area. Each step has a brief, concise explanation, and says how Cisco solutions fit in that step, if they do."

Every `file:line` below was read on the working tree on 2026-10-12. Another worker is editing the same demo files for authenticity, so line numbers will drift. That is why the design anchors on `data-guide` attributes, not on line numbers or CSS selectors (§3.3), and why a test fails when an anchor disappears (§5, Phase 6).

---

## Contents

0. [Summary](#0-summary)
1. [UX design](#1-ux-design)
2. [Step behavior with live and async demos](#2-step-behavior-with-live-and-async-demos)
3. [Architecture](#3-architecture)
4. [Per-demo step scripts](#4-per-demo-step-scripts)
5. [Implementation phases](#5-implementation-phases)
6. [Risks](#6-risks)
7. [Open questions](#7-open-questions)
- [Appendix A: Anchor inventory](#appendix-a-anchor-inventory)
- [Appendix B: What I observed in the running studio](#appendix-b-observed-in-the-running-studio)

---

## 0. Summary

- **What it is.** A per-demo guided tour. A spotlight dims the page except the focus area for the current step, and a step card explains the step in at most 35 words. A separate **Cisco fit** line appears only when a Cisco or Splunk product genuinely acts in that step. Next highlights the next area.
- **Where you start it.** A **Guided tour** button in each use case's tab row; ⌘K ("Guide: Card fraud triage"); a **Guide this moment** button in Present mode; and a deep link `?guide=<tour>`. Keys: → / Enter next, ← back, Esc exits.
- **How it stays honest.** Tours drive the real demo. They never fake a result and never click a consequential button for you: a person always starts runs, makes dispositions, approves, publishes, and files. Tours wait on the demo's real state and say so ("Waiting for the first timeline event…"). The live, recorded, and sample labels stay visible, and the source is chosen once at the start of the tour, with no silent switching.
- **How it is built.** One `GuidedTour` engine and overlay, declarative step files per demo (`app/guide/tours/*.ts`), and `data-guide` anchors plus a small `data-guide-run` state contract on each demo root.
- **Scope.** Nine tours: eight demos plus the Dana Whitfield lifecycle story across four demos. There are 6 to 12 main steps per demo, plus short "encore" tours for each attack scenario.
- **Effort.** About 16–18 engineer-days in 7 phases. Anchor work should land after the authenticity pass, because both touch the same demo files.

---

## 1. UX design

### 1.1 Entering and exiting

| Entry point | Where | Behavior |
|---|---|---|
| **Guided tour button** (primary) | Right end of the case tab row (`.case-tabs`, `app/page.tsx:837-853`), styled as a secondary pill with a compass icon: `Use case demo · Architecture ······ ◎ Guided tour` | Starts the tour for the open use case at step 1 (or offers "Resume at step 5?" when a saved position exists, §3.5). |
| **⌘K launcher** | New result rows "Guide: <demo>" (`launcherResults`, `app/page.tsx:1062`) | Opens the use case, then starts its tour. |
| **Present mode** | New **Guide this moment** button in `PresenterBar` (`app/StudioShell.tsx:243-252`) | Starts the current moment's tour in its "story cut" (§1.6). Story builder gets **Present guided** next to **Present story** (`app/page.tsx:1278`). |
| **Deep link** | `?guide=fraud-modeling[&step=fraud.verdicts][&source=recorded]` | Read once on load in `HomePage`; opens the case and starts the tour. Useful for bookmarks, self-serve links, and tests. |
| **Library card** | Not in v1 (open question Q1) | Cards are already a single `role="button"` (`app/page.tsx:592-604`), so a second action inside them is awkward. |
| **Keyboard** | `G` on a use case page (ignored while typing, using the same guard as `PresenterBar`, `StudioShell.tsx:233-234`) | Starts or resumes the tour. |

**Exit:** Esc, the card's ✕, **Finish** on the last step, or navigating away (Back to library, sidebar, ⌘K to another page). On exit, focus returns to whatever launched the tour. When navigating away mid-tour, a small toast offers "Resume guided tour", which uses the saved position (§3.5).

**Pause:** opening the Help drawer (`page.tsx:1380`), the launcher (`page.tsx:1342`), or the full-screen map (`map.css:2`, z-index 100) hides the overlay and keeps the position; closing them resumes.

### 1.2 The spotlight overlay

- **Dim layer.** A fixed full-viewport layer at z-index 120. That is above the top bar (40), sidebar (30), presenter bar (70), shell scrim (80), launcher (100), and the expanded map (100), so nothing pokes through. The visual is an SVG with a `<mask>`: a full rect at about 62% opacity with one rounded-rect hole per target (8px radius, 6px padding around the target's box).
- **Click behavior.** A second, invisible layer uses CSS `clip-path: path(evenodd, …)` with the same holes. `clip-path` affects hit testing, so **clicks inside a hole reach the real control**, and clicks on the dimmed area are absorbed and do nothing except a brief pulse on the step card. That way a mis-click never triggers a demo control by accident. Scrolling still works, because wheel events on the fixed layer scroll the document.
- **Outline as well as dimming.** Each hole also gets a 3px accent ring with a 2px offset, drawn as an absolutely positioned div. Dimming alone fails in forced-colors and high-contrast modes. Under `@media (forced-colors: active)` the ring uses `outline: 3px solid Highlight` and the dim layer is dropped.
- **Smooth transitions.** Holes morph between steps over 220 ms with Motion, which is already a dependency (`package.json`: `motion`). The card cross-fades.
- **Auto-scroll.** Before a step shows, the engine scrolls so the union of its targets sits below the fixed top bar (`--topbar`, `globals.css:38`, 64px, 58px on narrow screens) with 16px of air. In Present mode it also stays above the presenter bar. Smooth scrolling is used unless reduced motion is on.
- **Fixed top bar and sidebar.** These are dimmed with everything else. They are never a target except in the "status chips" step (the model chip lives in the page header, not the top bar). The sidebar's width, 252px (`.sidebar`, `globals.css:108`), is reused as a last-resort dock for the card (§1.3).
- **Multiple regions.** A step may name several targets, for example the timeline plus the summary. All get holes. The engine scrolls to fit their union; if they cannot fit together, it scrolls to the **first** (primary) target and shows a chip on the card: "↓ Also highlighted below".
- **Tall targets.** Some targets are taller than the viewport. The research timeline, for example, renders thousands of pixels tall (screenshot, Appendix B). For these, the engine scrolls to the target's top and clips the hole to the visible viewport. Steps can instead name a narrower sub-anchor, such as the first lines of a timeline.
- **Live layout.** A `ResizeObserver` on the targets, a `MutationObserver` on the active tab panel, and scroll and resize listeners all feed one rAF-throttled re-measure. Streaming timelines, cards landing, and banners appearing move the holes with the content.
- **Architecture tab.** When a step declares `tab: "architecture"`, the engine calls the workspace's own `selectTab("architecture")` through the guide host (§3.4). It then waits for `[data-testid="architecture-explorer"]` (`Explorer.tsx:889-893`) to have a non-zero box and a settled `data-phase`, plus two animation frames, before measuring. This matters because `selectTab` restores a saved scroll position in a layout effect (`page.tsx:787-795`), and the explorer mounts only on first open, once it can measure (`page.tsx:770-781`, `942-944`). The reverse applies when a later step targets the demo tab.

### 1.3 The step card

```
┌───────────────────────────────────────────────┐
│ CARD FRAUD TRIAGE · STEP 5 OF 12        [⋯][✕]│
│ The payment rules approve                     │
│ Rules approve this purchase; the graph model  │
│ rates it high risk. The risk is in the        │
│ merchant's network, not in the payment.       │
│ ┃ CISCO FIT · Splunk Agent Control            │  ← only when it applies
│ ┃ fraud.take_action denies irreversible card  │
│ ┃ actions without analyst approval.           │
│ ● Waiting for the agent's summary… 0:42       │  ← only on wait steps
│      [Skip ahead]                             │
│ ◀ Back                       ▬▬▬▬▬○○○  Next ▶ │
└───────────────────────────────────────────────┘
```

- **Content.** The kicker carries the demo name and progress ("Step 5 of 12"; in a story it reads "Moment 2 of 4 · Step 3 of 6"). Below it are a **title** (≤ 6 words), a **body** (1–3 sentences, ≤ 35 words), and an optional **Cisco fit** block. The Cisco fit block has a left rule, a product name, a one-sentence "how", and a status chip (**Running**, **Proposed**, or **When configured**) derived from the step definition and live status (§3.2). It never appears on steps where no Cisco product acts. Then come wait text and actions, then **Back / Next** with a dot progress bar.
- **The ⋯ menu.** It holds: Restart tour · Show Cisco fit (toggle, §7 Q3) · Switch run source (live / recorded / sample, where available) · Keyboard shortcuts.
- **Placement never covers a target.** This is a pure function `place(targets, viewport, obstacles, card)` in `app/guide/placement.ts`, unit-tested. It tries, in order:
  1. Right of the target union, then left, if there is at least the card width plus 24px free.
  2. Below, then above, if there is at least the card height plus 16px free.
  3. Docked in the dimmed sidebar column as a 232px-wide compact card when the sidebar is visible, which is the case at 1440 and 1100.
  4. Docked over the dimmed top bar as a one-line strip ("Step 5 of 12 · The payment rules approve · Next ▶"), with the body in an expandable popover above the strip.

  Obstacles are every target rect plus the presenter bar's rect when presenting. Width is 360px at ≥ 1280px and 320px below. Below the studio's narrow breakpoint (`globals.css:581`, 900px), where the sidebar becomes a drawer, the card becomes a bottom sheet and the engine scrolls targets above it.
- **Both themes.** The light theme is generated at build time by recolouring dark rules (`scripts/postcss-light-theme.mjs`). It would turn a dark scrim into a white wash, which flattens the target's edges. So `app/theme-light.css` gets an explicit override, `html:root[data-theme="light"] .guide-dim { fill: rgba(15,23,42,.45) }`, keeping a navy scrim in light mode. The card and the ring colours derive normally. The test matrix (§5) covers both themes.
- **Reduced motion.** With `prefers-reduced-motion: reduce` (precedent: `globals.css:670`), scrolling is instant (`behavior: "auto"`), holes jump without morphing, the card has no fade, and there is no pulse.

### 1.4 Accessibility

- **Roles and announcements.** The card is a `role="dialog"` with `aria-modal="false"` (the page stays operable for "act" steps), `aria-labelledby` pointing at the title and `aria-describedby` at the body and Cisco fit. A visually hidden `aria-live="polite"` region announces each step ("Step 5 of 12. The payment rules approve. …"), wait-state changes ("Result landed"), and degradation ("The live scorer is offline; the tour uses recorded scores").
- **Focus.** On start, focus moves to the card title (`tabindex="-1"`). On Next or Back, focus stays on the button just pressed, so repeated Enter walks the tour. On an **act** step, focus moves to the target control, for example `#triage-queue`, with the hint "Press Enter to run". When the step's wait condition is met, focus returns to Next.
- **Soft focus loop, not a hard trap.** Tab cycles through the card's controls and the current targets' focusable elements only. Esc always exits. Targets sit inside the content they would have to make inert, so `inert` on dimmed regions is not workable.
- **Target state.** Each current target gets `data-guide-active="true"`, used for CSS and tests, and `aria-describedby` pointing at the card body, so a screen reader landing on the control hears why it matters.
- **Contrast.** Card text is at least 4.5:1 in both themes, the ring at least 3:1 against both the dimmed and undimmed background, and the forced-colors path is described in §1.2.
- **Keyboard map.** → / Enter / Space advance; ← goes back; Home jumps to the first step; Esc exits. While a tour is active, `PresenterBar`'s ←/→ handler (`StudioShell.tsx:231-241`) yields to the tour; at the last step, Next becomes **Next moment**. The Help drawer's "Present" section (`StudioShell.tsx:90-96`) documents the keys.

### 1.5 Small screens (1100px)

At 1100 × 900 the sidebar is still visible (≈235px) and the content column is about 760px wide (Appendix B), so most targets span the full content width. Placement therefore falls to **below/above** or the **sidebar dock**, which is why the sidebar dock exists. Steps whose targets are wide two-column regions at 1440, such as the SAR results or the fraud case file, stack at 1100 (redesign §1.4), so the step definitions name the specific card, not the two-column wrapper.

### 1.6 Relationship to Present mode talk tracks

- **Separate copy, shared facts.** `app/presenter-notes.ts` is presenter-only ("Say Illustrative out loud", `presenter-notes.ts:11`); guided copy is shown to the audience. Tours live in `app/guide/tours/*.ts`. A test checks that every Cisco product named in a tour also appears in that demo's presenter note `cisco` text, or in the redesign plan's value map, so the two cannot drift into different claims (§5, Phase 6).
- **Composition.** Present mode moves between moments; Guided moves between steps within a moment. When both are on:
  - The `PresenterBar` hides its talk-track list (`StudioShell.tsx:244`) and shows "Moment 2 of 4 · Step 3 of 6".
  - The step card renders **inside** the presenter bar's notes slot, so it never adds a second floating panel. That space is already reserved by `.app-shell.presenting:has(.presenter-notes) .main-content { padding-bottom: calc(32vh + 150px) }` (`studio-shell.css:78`).
  - The presenter bar's rect is an obstacle for scrolling: targets are scrolled into the space above it. In the screenshot it is 306px tall with notes (Appendix B).
- **Story cut.** Each tour marks a subset of steps `story: true`. "Guide this moment" plays only those, plus bridge steps for handoffs (§4.9).

---

## 2. Step behavior with live and async demos

### 2.1 Step kinds

| Kind | What the person does | When the tour advances | Examples |
|---|---|---|---|
| `observe` | Reads; clicks **Next** | On Next | Business band, rules vs graph, audit trail |
| `act` | Clicks the highlighted real control. Next is relabelled **Skip** (with a confirm when skipping would leave later steps without data). | Automatically, when the step's `waitFor` is met | Run, disposition, Submit for supervision, Publish, Approve |
| `auto` | Nothing. On entering the step the engine performs one **non-consequential UI action**: switch tab, select a scenario card, open a `<details>`, choose an architecture platform focus. | On Next | Select the CPP scenario; open the Architecture tab |
| `wait` | Watches; the card shows honest waiting text and an elapsed timer | When `waitFor` is met; **Skip ahead** is offered after `patience` (default 20s) | First timeline event, result landed, approval gate visible |

**Rule:** the engine never performs an action that starts a run, makes a decision, approves, publishes, files, accepts a company, or sends a message. Those are the human-in-the-loop moments the demos exist to show. `auto` is limited to an allowlist of action types (`selectTab`, `click` on an anchor flagged `data-guide-safe`, `openDetails`, `setPlatformFocus`), and a unit test rejects any tour that uses `auto` on an anchor not flagged safe.

### 2.2 Waiting for async state

- **State contract.** Each demo root gets three attributes, derived from state it already has (§3.3):
  - `data-guide-run`: `idle | starting | running | awaiting-human | done | failed | blocked`
  - `data-guide-source`: `live | recorded | sample | scripted | none`
  - `data-guide-stage`: demo-specific, for example fraud `scored | investigated | decided | handed-off`, or SAR `drafted | investigator | qa | filed | closed`
- **Why attributes.** Wait conditions read these attributes, which update **even while the tab panel is `hidden`**, rather than element visibility, which reads false in a hidden panel. That is what lets a run keep going while the tour visits the Architecture tab and come back to the right step.
- **Waiting copy is specific and honest.** "Waiting for the first timeline event…", "Scoring five payments…", "The agent is drafting its summary (live model, 0:42)…". After `patience` it adds: "This live run is taking longer than usual." with **Keep waiting** · **Skip ahead** · and, where a recording exists, **Replay the recorded run instead**. That last choice is shown as a source switch and the card says so; the tour never swaps it in silently.
- **Errors.** If `data-guide-run` becomes `failed`, the step shows the demo's own error, already rendered in-page (for example `.fx-error`, `FraudDemo.tsx:244`), highlights it, and offers the demo's existing fallback. Fraud already auto-replays a recording when a run fails to start (`FraudDemo.tsx:155-158`). The card names that switch: "The fraud service didn't start a run; showing the recorded run, labelled Recorded."
- **Long runs.** Research and meeting prep POST with a 260s timeout (`MarketResearch.tsx:158`, `ClientAdvisory.tsx:210`). Their run step waits on `data-guide-run=done` with a 30s patience and the elapsed timer, and offers the recorded run at that point.

### 2.3 Never fake results; which source a tour uses

The tour drives the demo's real paths with their existing labels: `ProvenanceBadge` (`app/run/ProvenanceBadge.tsx`), "Recorded run", "Sample narrative · no model call", "Scripted · no model reachable", "Illustrative". The step card repeats the source in its kicker ("Recorded run · 10/9/2026") whenever it is not live.

**Recommendation: choose the source once, on the tour's first card, preselected by readiness.**

- **Preselect Live** when the demo's readiness is green (`momentReady`, `app/studio-status.ts`, used at `page.tsx:531`).
- **Otherwise preselect the best honest fallback**, which differs by demo:

  | Demo | Live | Fallback preselected when live isn't ready | Interactive in fallback? |
  |---|---|---|---|
  | Card fraud triage | Triage queue | Recorded run (`services/fraud/data/recorded/cpp-orbit-*.json`) | No: the disposition replays as recorded (`FraudDemo.tsx:191`, `:510`). |
  | SAR investigation | Investigate | **Sample narrative**: tools, AI Defense screening, rules, policies, and HITL all run live with a pre-written cited draft (`SarInvestigation.tsx:485`, `:489`) | **Yes** |
  | Market research | Run live (even with no model it writes a code-built fixture summary, labelled, `MarketResearch.tsx:245`) | Recorded run (`research-hcyn.json`) | Yes: publish works on a recorded result (`MarketResearch.tsx:200`). |
  | Advisor meeting prep | Prepare meeting | Recorded run (`advisory-dana-whitfield.json`) | Yes: approvals work on a recorded result (`ClientAdvisory.tsx:254`). |
  | Interbank | Start investigation (Docker lab) | Replay a recent run from the lab's own history (`InterbankDemo.tsx:481-486`). There are no golden recordings. | No. If the lab is down there is nothing to replay: the tour switches to its **offline variant** (architecture and source viewer only). |
  | Brahe Bank | Live chat only | No recordings: offline variant | — |
  | Company briefing | Live extract | If a company was already accepted, review it with no new run; otherwise offline variant | — |
  | KYC | Illustrative only | — | — |

- **Why not default everything to recorded?** It would be the most reliable, but for fraud it turns the analyst's decision, the heart of the story, into a replay. And the studio's point is that the demos run. The source picker makes recorded one click away, and `?source=recorded` serves self-serve links.
- **Optional improvement, not required.** Fraud's service already supports a scripted investigation, with live scoring, tools, and HITL and no model call (the `mode: "scripted"` input used by `tests/lifecycle.spec.ts:27-31`). Exposing it as a third source, "Live service · scripted summary", would keep the decision interactive when no model is up. It needs a one-line change in `triage()` (`FraudDemo.tsx:139-147`), and the existing provenance label already reads "Scripted · no model reachable".

### 2.4 Tabs and runs

Both tab panels stay mounted; only `hidden` toggles (`page.tsx:770-771`, `855`, `942`). A run started on the demo tab keeps streaming while the tour visits the Architecture tab. If the run hits an act gate meanwhile (`data-guide-run=awaiting-human`), the card shows a small badge, "The agent is waiting for your decision", with **Go to decision**, which switches back and jumps to that step.

### 2.5 Degraded or offline demos

- **Status step.** Every tour gets an automatic conditional step 1b, `status`, inserted when `[data-guide="status-banner"]` is present. It highlights the `DemoStatusBanner` (`DemoStatusBanner.tsx:35`): "Part of the live path is offline. The banner says what still works; this tour uses that path, and every result keeps its label."
- **Per-step variants.** Steps declare `variants` keyed on conditions, so copy and target adapt. For example, SAR's run step targets **Run with sample narrative** when `#sar-investigate` is disabled because no model is up or a hosted call would be refused (`SarInvestigation.tsx:482`).
- **Offline variants.** Each tour has a short offline variant for when its service is unreachable: problem → status banner → Architecture (Implemented/Proposed) → Cisco recap. No run steps are shown.

---

## 3. Architecture

### 3.1 Files

```
app/guide/
  types.ts              step + tour schema (below)
  GuidedTour.tsx        provider, engine state machine, overlay, step card (portal)
  placement.ts          pure placement function (unit-tested)
  conditions.ts         waitFor / showIf evaluation against DOM attrs + StudioStatus
  anchors.ts            guideAnchor() helper + list of anchor ids (typed union)
  persistence.ts        sessionStorage position, localStorage prefs
  guide.css             overlay, card, ring; reduced-motion and forced-colors rules
  tours/
    fraud.ts sar.ts research.ts advisory.ts interbank.ts banking.ts briefing.ts kyc.ts
    lifecycle.ts        the Dana Whitfield story (composes story cuts)
    index.ts            registry: tourId → Tour
```

### 3.2 Schema

```ts
export type GuideTab = "demo" | "architecture";
export type CiscoProduct =
  | "Cisco AI Defense"
  | "Splunk Agent Control"
  | "Splunk Agent Observability"
  | "Splunk Observability Cloud"   // OTLP export; always status "when-configured"
  | "Cisco AI infrastructure";     // AI POD / UCS / Nexus; always status "proposed"

export type CiscoFit = {
  product: CiscoProduct;
  how: string;                                   // one sentence, ≤ 25 words
  status: "running" | "proposed" | "when-configured";
  /** Shown only if live status / the page proves it; otherwise `otherwise` (or nothing). */
  requires?: Condition;
  otherwise?: string;                            // e.g. "AI Defense is off on this machine; a local check screened it."
};

export type Condition =
  | { state: { run?: RunState[]; source?: Source[]; stage?: string[] } }   // data-guide-* on the demo root
  | { anchor: AnchorId; present?: boolean; enabled?: boolean; count?: number }
  | { dom: string }                                 // escape hatch, scoped to the active panel; lint-limited
  | { status: { service: ServiceId; aiDefense?: "on"; agentControl?: "enforcing"; tracing?: "configured"; otel?: "exporting" } }
  | { all: Condition[] } | { any: Condition[] } | { not: Condition };

export type Step = {
  id: string;                                      // "fraud.verdicts"; stable, used in deep links + persistence
  kind: "observe" | "act" | "auto" | "wait";
  tab?: GuideTab;                                  // default "demo"
  targets: AnchorId[] | { [S in Source]?: AnchorId[] };   // first = primary; may vary by run source
  title: string;                                   // ≤ 6 words
  body: string;                                    // ≤ 35 words
  ciscoFit?: CiscoFit[];                           // 0–2 entries; omitted = no Cisco line
  action?: { type: "selectTab" | "click" | "openDetails" | "setPlatformFocus"; anchor?: AnchorId; value?: string };  // kind "auto" only
  waitFor?: Condition;                             // kind "act" | "wait"
  patience?: number;                               // ms before "Skip ahead"; default 20_000
  waitingText?: string;                            // "Scoring five payments…"
  showIf?: Condition;                              // conditional steps (inbox present, banner present)
  variants?: { when: Condition; patch: Partial<Pick<Step, "targets" | "title" | "body" | "ciscoFit" | "kind">> }[];
  placement?: "auto" | "right" | "left" | "below" | "above";    // hint; the placer may override to avoid overlap
  scroll?: "center" | "start";                     // "start" for tall targets
  story?: boolean;                                 // part of the lifecycle "story cut"
  resumeFrom?: string;                             // on reload, fall back here if this step's data is gone
};

export type Tour = {
  id: string;                                      // "fraud-modeling" (= use case id) or "fraud-modeling.attack-dispute"
  useCaseId: string;
  title: string;
  label?: "Illustrative prototype";                // stamped on every card (KYC)
  sources: Source[];                               // offered on the first card, in preference order
  steps: Step[];
  offline: Step[];                                 // used when the service is unreachable
  encores?: string[];                              // follow-up tour ids offered on the last card
};
```

### 3.3 Anchors and the state contract

- **Anchors.** `data-guide="<demo>.<thing>"` attributes, added through a tiny helper, `guideAnchor("fraud.verdicts")`, that returns `{ "data-guide": id }`. `AnchorId` is a TypeScript union exported from `anchors.ts`, so a tour cannot reference an anchor that is not declared. A node test (Phase 6) then checks that every declared anchor is actually rendered somewhere in `app/**/*.tsx`.
- **Shared anchors live in shared components, so one edit covers every demo:**

  | Anchor | Where |
  |---|---|
  | `status-banner` | `DemoStatusBanner` root |
  | `stats`, `stats.observability`, `stats.defense` | `RunStats` |
  | `case.tabs`, `case.status`, `case.model` | `page.tsx` |
  | `arch.mode`, `arch.rail`, `arch.focus`, `arch.canvas` | `Explorer.tsx` |

- **Scoping.** Anchors resolve inside the active case's tab panel (`#case-panel-demo` or `#case-panel-architecture`), so the shared `stats` anchor never matches a stale instance.
- **No behavior change.** Anchors and `data-guide-*` attributes are attribute-only additions. They change no behavior or styling, which keeps the merge with the authenticity pass trivial.
- **State attributes, from existing state:**

  | Demo | `data-guide-run` from | `data-guide-stage` from |
  |---|---|---|
  | Fraud | `starting`, `runLive`, `steps.replaying`, `state.pending`, `state.result` (`FraudDemo.tsx:55, 68-69, 189-193`) | `state.queue.length`, `state.summary`, `state.result`, `state.handoff` |
  | SAR | `busy`, `runStatus`, `pending`, `pkg.outcome` (`SarInvestigation.tsx:482`, `572`) | `draft`, `pending.stage`, `pkg.outcome` |
  | Research | `loading`, `result`, `publish.status` (`MarketResearch.tsx:97-103`) | `result.status`, `publish.status` |
  | Advisory | `loading`, `prep`, `shownApproval.status` (`ClientAdvisory.tsx:117-124, 177`) | approval status |
  | Interbank | `starting`, `effectiveRun.status`, `replaying` (`InterbankDemo.tsx:394, 416-421, 448`) | lane counts |
  | Banking | `loading`, `messages`, `error` (`BankingDemo.tsx:58-62`) | last turn `ok`, `blocked`, or `failed` |
  | Briefing | `loading`, `displayed`, `isAccepted` | `draft`, `accepted` |
  | KYC | none (illustrative) | — |

- **Source.** `data-guide-source` comes from the same values the demos already pass to `ProvenanceBadge`.

### 3.4 The engine

- **Provider.** `GuidedTourProvider` wraps the app shell in `HomePage` (`page.tsx:1093`). It exposes `start(tourId, opts)`, `exit()`, and `active`.
- **Guide host.** `UseCaseWorkspace` registers a host with the provider: `{ caseId, tab, selectTab, architectureOpened }`, using its existing `selectTab` (`page.tsx:778-786`). This is how `tab` steps switch tabs.
- **Demo actions.** Demos may register small imperative actions with `useGuideActions({ selectScenario, replay })`. These are the same functions their own UI calls, such as `setScenarioId` and `replayRecording` (`FraudDemo.tsx:124-137`), and are used for the `auto` scenario select and the card's "Replay the recorded run" button. That button replaces a long `<select>` (the fraud ReplayPicker has 8 options), and the real picker stays highlighted so the audience sees where it lives.
- **State machine.** `idle → choosing-source → step(n).entering (tab switch, scroll, auto action) → step(n).waiting? → step(n).shown → …`. On every transition the engine re-evaluates `showIf` and `variants`.
- **Conditions.** Condition evaluation subscribes to a `MutationObserver` on the demo root's `data-guide-*` attributes and the active panel's subtree, with a 250ms poll as a backstop. Status conditions read `useStudioStatus()` (`page.tsx:968`).
- **Present mode.** `PresenterBar` takes optional `guide` props to render the card in its notes slot. In `openCaseById` (`page.tsx:1027-1035`), a handoff during a story tour, such as fraud's **Escalate to SAR**, advances the presenter. The provider listens for the new case and continues the story tour at that moment's first step (§4.9).

### 3.5 Persistence, deep links, telemetry

- **Position.** `sessionStorage["fsi-studio.guide"] = { tourId, stepId, source, at }`, written on each step. On re-entry, the toast or the tab-row button offers **Resume at step N**. If the step's data is gone (a run result does not survive reload), the engine resumes at the step's `resumeFrom`, normally the run step.
- **Preferences.** `localStorage["fsi-studio.guide.prefs"] = { showCiscoFit: true, preferredSource: "auto" | "recorded" }`. This follows the existing key prefix (`fsi-studio.sidebar-collapsed`, `fsi-studio.theme`, `fsi-studio.handoffs`).
- **Deep links.** `?guide=…&step=…&source=…` are read once on load. While a tour runs, `history.replaceState` keeps `step` current, so a refresh or a copied URL lands on the same step. The studio has no router today, so this is plain `URLSearchParams`.
- **Telemetry-free.** Nothing is sent anywhere. No analytics, no beacons; tours read only local DOM and the status the page already fetches.

### 3.6 Testability

- Tours are data, so node tests can lint them without a browser:
  - word counts
  - Cisco enum and status rules
  - forbidden claims
  - `auto` only on safe anchors
  - every `AnchorId` rendered somewhere
- Placement is a pure function with table tests.
- Playwright drives tours with `?guide=` deep links, mocked `/api/studio/status` (the pattern in `tests/shell.spec.ts:39-42`), and recorded or scripted backends (the patterns in `tests/lifecycle.spec.ts:27-35`). No paid model calls.

---

## 4. Per-demo step scripts

**How to read the tables.**

- **Anchor** is the `data-guide` id to add, followed by where the target renders today (`file:line`), verified on 2026-10-12.
- **Trigger:**
  - **Next**: observe.
  - **Act: X**: the person clicks X; the tour advances on the wait condition.
  - **Auto: X**: a safe UI action on entering the step.
  - **Wait: X**: the condition the tour waits on.
- **Cisco fit** is "—" when no Cisco or Splunk product acts in that step.
  - *proposed* means proposed placement (redesign §1.2): it is not running here.
  - *when configured* applies to Splunk Observability Cloud OTLP export, which is configured on no service in this environment (live status: `otel: missing_configuration` everywhere).
  - *if on* means the line shows only when live status proves it (`requires`); otherwise the `otherwise` text appears.
- Every tour also gets the automatic **status** step (§2.5) when a banner is present.
- **Live status on 2026-10-12** (`/api/studio/status`) drives which conditional Cisco lines would show today:
  - Fraud and SAR: AI Defense enforce.
  - Wealth and briefing: AI Defense off.
  - Wealth Agent Control: `not_started`.
  - Banking, SAR, and interbank: Agent Control enforcing.
  - Fraud: tracing not configured.

### 4.1 Card fraud triage (`fraud-modeling`), 12 steps

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `fraud.problem` ★ | `fraud.band` → `BusinessBand` `FraudDemo.tsx:341` (rendered `:216`) | Next | The queue Maya works | Rules score one payment at a time, so a clean customer at a compromised merchant sails through and real fraud hides among false positives. Tiles marked Illustrative are targets, not measurements. | — |
| 2 | `fraud.scenario` ★ | `fraud.scenario.cpp-orbit` → scenario button `:221-231` (add `guideAnchor(\`fraud.scenario.${item.id}\`)`) | Auto: select (safe) | A compromised merchant | A six-year customer buys $286.40 online at Orbit Digital Goods. Each card says what the graph model can honestly score, and what to expect. | — |
| 3 | `fraud.run` ★ | live `fraud.run` → `#triage-queue` `:237`; recorded `fraud.replay` → `ReplayPicker` `:241` | Act: Triage queue · Wait: run ≠ idle | Triage the queue | One click scores five flagged payments with the rules engine and the graph model, then starts the triage agent on the top alert. | — |
| 4 | `fraud.queue` | `fraud.queue` → `QueueTable` `:363` (rendered `:246`) | Wait: stage `scored` · Next | Rules and graph, side by side | GraphSAGE + XGBoost scores each payment from its account–merchant neighborhood. The badge says whether scores came live from Sparky, recorded, or sample. | Cisco AI infrastructure (*proposed*): scoring runs on Sparky, an NVIDIA DGX Spark dev box; Cisco UCS / AI POD with NVIDIA GPUs is the proposed production placement. |
| 5 | `fraud.verdicts` ★ | `fraud.verdicts` → `Verdicts` `:420` (rendered `:256`), aha line `:429` | Wait: verdicts present · Next | The payment rules approve | Rules approve this purchase; the graph model rates it high risk. The risk is in the merchant's network, not in the payment itself. | — |
| 6 | `fraud.network` ★ | `fraud.show-network` → `#show-network` `:259`; then `fraud.network` → `NetworkGraph` `:262` | Act: Show network (Next performs the same safe click) | The merchant's network | Cards that shopped here and later had confirmed fraud surround the merchant. That neighborhood is what the graph model sees and rules cannot. | — |
| 7 | `fraud.reasons` | `fraud.reasons` → `Reasons` `:437` (rendered `:265`) | Next | Why, in plain English | Exact XGBoost TreeSHAP contributions become reason codes, signed in log-odds; positive raises risk. No LLM touches the score or its explanation. | — |
| 8 | `fraud.agent` | `fraud.timeline` → `.fx-timeline` `:275` + `fraud.summary` → `SummaryCard` `:469` (rendered `:280`) | Wait: summary present (patience 30s) · Next | The triage agent's draft | The agent calls score, neighborhood, explain, and playbook tools, then drafts a summary where every point cites tool evidence. Without a model it is scripted, and labelled so. | Cisco AI Defense (*if on*): inspects the agent's prompt and its summary; the chip shows the verdict. |
| 9 | `fraud.decide` ★ | `fraud.decision` → `DecisionBar` `:491`, buttons `:494-507` | Act: a disposition (live) · Next (recorded: "replays as made", `:510`) · Wait: stage `decided` | Maya decides | The agent can only propose. Card actions are simulated, and irreversible ones need the analyst's approval. In the lifecycle story, choose Escalate to investigations. | Splunk Agent Control: `fraud.take_action` denies irreversible card actions without analyst approval. |
| 10 | `fraud.audit` | `fraud.audit` → `AuditTrail` `:562` (rendered `:294`) + `fraud.shared` → `:296` | Next | Audit, and what's shared | Every step and decision lands on the audit trail. Only what the customer already knows, a reissued card, is shared with the relationship team. | — |
| 11 | `fraud.stats` | `stats` → `RunStats` `RunStats.tsx:320` (rendered `FraudDemo.tsx:314`) | Next | Measured from this run | Latency, model calls, tool calls, and tokens come from this run's own events. The badge repeats whether the run was live, recorded, or sample. | Splunk Agent Observability (*if on*; otherwise: "Agent tracing isn't configured for fraud on this machine; counts still come from the run's events."). Cisco AI Defense: counts this run's inspections and blocks. |
| 12 | `fraud.architecture` | `arch.mode` → `Explorer.tsx:937-941` | Auto: Architecture tab · Next | Where it would run | Implemented shows what runs in this studio. Proposed shows the production design. Nothing here runs on Cisco hardware today. | Cisco AI infrastructure (*proposed*): GNN training and scoring on Cisco AI POD / UCS with NVIDIA GPUs on a Nexus fabric. |

★ = in the lifecycle story cut.

**Encores:**

- `fraud-modeling.attack-dispute` (3 steps): select **Attack: injected dispute note** → run → `fraud.dispute` (`DisputeCard`, `:451`, rendered `:279`): "The note tells the engine to approve and close. AI Defense blocks it; the agent never sees it." Cisco AI Defense.
- `fraud-modeling.attack-pii` (3 steps): **Attack: card number in a case note** → `fraud.note` (`NoteComposer`, `:537`, rendered `:293`): Cisco AI Defense flags the PAN; Splunk Agent Control `fraud.note_pii` denies the save and offers a masked note.

**Anchors to add:** `fraud.band`, `fraud.scenario.<id>`, `fraud.run`, `fraud.replay`, `fraud.queue`, `fraud.verdicts`, `fraud.show-network` (safe), `fraud.network`, `fraud.reasons`, `fraud.timeline`, `fraud.summary`, `fraud.dispute`, `fraud.decision`, `fraud.note`, `fraud.audit`, `fraud.shared`, `fraud.handoff`, `fraud.escalate` (on `#escalate-to-sar`, `:303`), plus the state attributes on the root `div` (`:196`).

### 4.2 SAR investigation (`sar-support`), 11 steps

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `sar.problem` ★ | `sar.band` → `.sar-band` `SarInvestigation.tsx:373` | Next | Half a day per SAR | Investigators pull KYC, transactions, counterparties, and prior alerts by hand, then write a narrative QA often returns. The 30-day filing clock never stops. | — |
| 2 | `sar.pick` ★ | `sar.inbox` → `.sar-inbox` `:425` when a referral exists (`showIf`); else `sar.scenario.mule-reyes` → `:451` | Act: "Open the linked money-mule case" (`:436`) · or Auto: select (safe) | The money-mule case | Kendall Reyes's new account took card-funded transfers from 17 unrelated senders. Nine funding cards were compromised at Orbit Digital Goods, the merchant from fraud triage. | — |
| 3 | `sar.case` | `sar.case` → `.sar-case` `:464`, clock `:473` | Next | The case and its clock | Subject, alert, and accounts are synthetic, with masked identifiers. The deadline bar shows detection date, due date, and days left. | — |
| 4 | `sar.run` ★ | live `sar.investigate` → `#sar-investigate` `:482`; variant when disabled (no model / refusal) → `sar.sample` `:485`; recorded → `ReplayPicker` `:486` | Act · Wait: run ≠ idle | Start the investigation | Investigate runs the Deep Agent on the Studio model chain. Sample narrative is pre-written with no model call; tools, rules, policies, and approvals still run live. | Cisco AI Defense: case data reaches a hosted model only with AI Defense enforcing on every hop (runtime row "Case data", `:398`). |
| 5 | `sar.timeline` | `sar.timeline` → `.sar-run` `:699` (before result) / `:690` (after) | Wait: first event · Next | The agent assembles the case | Alert, KYC with SSN and street address withheld, account activity, counterparties, prior alerts, allowlisted media, and customer documents arrive as tool calls. | Cisco AI Defense (*if on*): inspects customer documents segment by segment before the agent sees them; flagged segments are withheld. |
| 6 | `sar.typologies` ★ | `sar.typologies` → `:637` | Wait: package landed · Next | Typologies are rules | Money-mule indicators fire from the transactions on CPU, each with a threshold, observed value, and evidence. The model's recommendation is checked against them. | — |
| 7 | `sar.narrative` ★ | `sar.narrative` → `.sar-narrative` `:499`, badges `:505` | Next | A cited narrative | Who, what, when, where, why, how. Every sentence cites evidence whose figures must match; unsupported sentences are dropped and listed. | Splunk Agent Control (*if enforcing*; otherwise "local check" as labelled): `sar.narrative_cited` releases the draft only when every sentence is cited. |
| 8 | `sar.investigator` ★ | `sar.decision` → `.sar-decision` `:565`, choice `:591`, submit `:597`, message `:601` | Act: decide (live/sample) · Next (recorded) · Wait: stage `qa` | The investigator decides | Choose File SAR or No SAR and write a rationale. Try Message the customer to see the no-tipping-off policy refuse it. | Splunk Agent Control: `sar.file_requires_approval` holds filing for QA; `sar.no_tipping_off` denies customer contact. |
| 9 | `sar.qa` ★ | `sar.decision` → switch `:621`, approve `:614` | Act: Switch to QA, then Approve · Wait: stage `filed`/`closed` | Second-line QA approves | A different person approves. Filing is simulated BSA E-Filing with a simulated confirmation number; nothing leaves the laptop. | — |
| 10 | `sar.audit` | `sar.audit` → `.sar-audit` `:706` + `stats` → `:720` | Next | Who did what | The audit trail records every human and agent step. The stats row counts this run's model calls, tool calls, and AI Defense verdicts. | Splunk Agent Observability: the agent run is one trace. |
| 11 | `sar.architecture` | `arch.mode` | Auto: Architecture tab · Next | Scale is proposed | Typology rules and the citation check are CPU code. At bank scale, entity resolution across millions of accounts is where GPU graph analytics would matter. | Cisco AI infrastructure (*proposed*): Cisco AI POD in the bank's data center for private inference and graph analytics. |

**Encore:** `sar-support.attack-injection`: the attack card (`:451`, `kind-attack`) → evidence (`:662`) with withheld segments → recommendation unchanged (`:545`). Cisco AI Defense flags the injection and the card number before the model.

**Anchors to add:** `sar.band`, `sar.runtime`, `sar.inbox`, `sar.inbox.open`, `sar.scenario.<id>`, `sar.case`, `sar.investigate`, `sar.sample`, `sar.replay`, `sar.timeline` (both instances), `sar.typologies`, `sar.evidence`, `sar.narrative`, `sar.recommendation`, `sar.decision`, `sar.qa-switch`, `sar.audit`, plus root state.

### 4.3 Market event → house-view update (`market-research`), 12 steps

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `research.problem` | `research.intro` → `.rx-intro` `MarketResearch.tsx:237` (hidden in story mode; variant falls back to `research.scenarios`) | Next | When an issuer reports | Sam, a CIO-office strategist, must tell advisors what changed and whether the house view moves, with every number sourced and restricted issuers respected. | — |
| 2 | `research.scenario` | `research.scenario.earnings` → `:254` | Auto: select (safe) | Earnings on a Focus List name | Halcyon Interconnect (HCYN) is a fictional issuer with synthetic data. It employs Dana Whitfield, so this update later reaches her advisor. | — |
| 3 | `research.run` | live `research.run` → `#research-run` `:264`; recorded `research.replay` → `:229` (rendered `:267`) | Act · Wait: run ≠ idle (patience 30s) | Run the research desk | A research Deep Agent with fundamentals, valuation, macro, and compliance subagents starts. A restricted issuer would stop before any data or model call. | — |
| 4 | `research.timeline` | `research.timeline` → `RunTimeline` `:289` (`scroll: "start"`, tall) | Wait: first event · Next | Subagents at work | Each plan step, tool call, model call, and policy check streams here with a lane tag. A line's source button highlights its evidence. | Splunk Agent Observability: supervisor and subagent spans form one trace. Splunk Observability Cloud (*when configured*): OTLP spans. |
| 5 | `research.impact` | `research.impact` → `.rx-impact` `:345` | Wait: result · Next | Does the view change? | The update says whether the event trips a thesis point or key risk. The AI never sets ratings or targets; the CIO office owns that call. | — |
| 6 | `research.claims` | `research.claims` → sections `:357-368` + `research.count` → `:369` | Next | Every claim verified | Code checks each claim against its cited field or quote, unit-aware. Claims that fail are struck and shown, not silently dropped. | — |
| 7 | `research.news` | `research.news` → `:383-399` | Next | Screened news | Allowlisted news items are inspected as tool results. A withheld item never reaches the agent, and each row names who checked it. | Cisco AI Defense (*if on*; otherwise: "AI Defense is off for wealth on this machine; each row names the local check that screened it."). |
| 8 | `research.policies` | `research.policies` → `.rx-policies` `:410` | Next | Policy checks | `research.precheck` ran before any data pull; `research.publish` runs when Sam decides. Each list says whether Agent Control or a local check evaluated it. | Splunk Agent Control (*if* the list shows the hosted source, `wealth-evidence.tsx:32`). |
| 9 | `research.affected` | `research.affected` → `.rx-affected` `:420` | Next | Who is affected | Households that hold the name, and how many are concentrated above the threshold. This links the update to advisor meeting prep. | — |
| 10 | `research.publish` | `research.publish` → `PublishBar` `:61-74` (rendered `:414`) | Act: Publish update · Wait: published/denied | Sam publishes | Only verified claims reach advisors. Publishing runs the `research.publish` policies; Prepare client meeting then opens meeting prep with this update attached. | Splunk Agent Control (*if hosted*): `research.publish` blocks restricted issuers and rating or price-target language. |
| 11 | `research.stats` | `stats` → `:293` | Next | Measured from this run | Elapsed time, model calls, tokens, and news inspections come from this run. Compare with the next-business-day baseline. | Splunk Agent Observability; Cisco AI Defense (*if on*) inspection counts. |
| 12 | `research.architecture` | `arch.mode` | Auto: Architecture tab · Next | Private inference, proposed placement | With Sparky up, drafts stay on private inference; otherwise the hosted fallback is allowed here because no client data is involved. | Cisco AI infrastructure (*proposed*): private Nemotron inference on Cisco AI POD / UCS GPU nodes. |

**Encores:**

- `market-research.attack-poisoned` (3 steps): **Poisoned news story** → `research.news` shows the withheld item → the update still publishes. Cisco AI Defense (*if on*).
- `market-research.restricted` (2 steps): **Restricted issuer** → `.rx-blocked` (`:333`): "Blocked before any data or model call." Splunk Agent Control (*if hosted*) `research.precheck`.

**Anchors to add:** `research.intro`, `research.scenarios`, `research.scenario.<id>`, `research.run`, `research.replay`, `research.result`, `research.impact`, `research.claims`, `research.count`, `research.news`, `research.policies`, `research.publish`, `research.evidence`, `research.affected`, `research.blocked`, `research.timeline`, plus root state.

### 4.4 Advisor meeting prep (`client-advisory`), 12 steps

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `advisory.problem` | `advisory.intro` → `.rx-intro` `ClientAdvisory.tsx:288` (hidden in story; falls back to households) | Next | Hours of prep per review | Jordan rebuilds each client's picture from profile, holdings, CRM notes, and the house view, and must document Reg BI care. Supervisors see the rationale days later. | — |
| 2 | `advisory.household` ★ | `advisory.household.dana-whitfield` → radio label `:309-315` | Auto: select (safe) | Dana Whitfield's review | A synthetic executive client with concentrated employer stock. Every identifier is a test value. | — |
| 3 | `advisory.context` ★ | `advisory.context` → `.ax-context` `:318` | Next | What the advisor may see | Context lists the house-view update, the company briefing, and one service event: Dana's card was reissued. Fraud and SAR work never appear here. | — |
| 4 | `advisory.run` ★ | live `advisory.run` → `#advisory-run` `:332`; recorded `advisory.replay` → `:280` (rendered `:335`) | Act · Wait: run ≠ idle (patience 30s) | Prepare the meeting | Code rules compare profile and portfolio and size actions in dollars; then a meeting-prep Deep Agent drafts a one-page brief. | Cisco AI Defense: if private inference is down, client data reaches a hosted model only with AI Defense forced to enforce. |
| 5 | `advisory.notes` ★ | `advisory.notes` → `.ax-notes` `:464-477` | Wait: result · Next | CRM notes, screened first | Notes are inspected before any model call. PII is masked and an injected instruction is withheld; each note names what was found and by which check. | Cisco AI Defense (*if on*; otherwise: "AI Defense is off for wealth on this machine; each note names the local check."). |
| 6 | `advisory.findings` | `advisory.findings` → `.ax-findings` `:394-411` | Next | Profile against portfolio | Each finding names the rule that fired, its category, and the Reg BI care note. These are code rules, not the model. | — |
| 7 | `advisory.actions` | `advisory.actions` → `.ax-actions` `:413-425` | Next | Next-best actions, in dollars | Code sizes each action. Unsuitable ones are flagged, and the supervisor's policy check would deny them. Toggle which go into the plan. | — |
| 8 | `advisory.brief` | `advisory.brief` → `.ax-brief` `:427-447` | Next | A checked one-page brief | Every statement is checked against the household, research, or briefing; struck lines are shown. Code, not the model, writes the line about the card. | — |
| 9 | `advisory.submit` ★ | `advisory.approval` → `ApprovalBar` advisor state `:66-77` (rendered `:460`) | Act: Submit for supervision · Wait: `awaiting_supervisor` | Jordan submits | The advisor checks the brief and chosen actions, then submits them for supervision. | — |
| 10 | `advisory.approve` ★ | `advisory.approval` → supervisor state `:79-89` | Act: Approve and record · Wait: `sent`/`denied` | Supervisor approves | Approval runs the `advisory.recommendation` policies. Nothing is executed: no trade, transfer, or message leaves the studio. | Splunk Agent Control (*if hosted*): blocks guarantees, trade or wire instructions, and unsuitable recommendations. |
| 11 | `advisory.stats` | `advisory.timeline` → `:347` + `stats` → `:351` | Next | Measured from this run | The timeline shows screening, rules, the agent and its reviewer, policies, and both approvals. Stats come from this run. | Splunk Agent Observability: the meeting-prep agent's trace. |
| 12 | `advisory.architecture` | `arch.mode` | Auto: Architecture tab · Next | Client data stays private | The value here is private inference for client data, not speed. Rules and action sizing run on CPU. | Cisco AI infrastructure (*proposed*): Cisco AI POD in the bank's data center for private inference on client data. |

**Encore:** `client-advisory.attack-priya`: the Priya Raman household → `advisory.notes` shows the masked SSN and the withheld "wire proceeds" instruction → Splunk Agent Control denies any wire instruction at approval. Cisco AI Defense (*if on*).

**Anchors to add:** `advisory.intro`, `advisory.households`, `advisory.household.<id>`, `advisory.context`, `advisory.run`, `advisory.replay`, `advisory.result`, `advisory.findings`, `advisory.actions`, `advisory.brief`, `advisory.policies`, `advisory.approval`, `advisory.notes`, `advisory.holdings`, `advisory.timeline`, plus root state.

### 4.5 Interbank settlement investigation (`interbank-a2a`), 10 steps (offline variant: 4)

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `interbank.problem` | `interbank.controls` → `.ib-controls` head `InterbankDemo.tsx:458-463` | Next | Settlement fails, chased by email | Two fictional banks chase a failed trade by phone and email, re-keying each other's records. Here each bank's read-only Deep Agent investigates its own side. | — |
| 2 | `interbank.scenario` | `interbank.scenarios` → `:467-472` + `interbank.kickoff` → `#interbank-kickoff` `:475` | Auto: select Allowed investigation (safe) | Trade TRD-847 | The kickoff is an A2A message to Bank A's agent through Bank A's AI gateway. Bank A's agent decides when to ask Bank B. | — |
| 3 | `interbank.start` | live `interbank.start` → `.ib-primary` `:478`; replay `interbank.history` → `:481-486` | Act · Wait: run ≠ idle | Start the investigation | This runs live in the Docker lab: two Deep Agents, two gateways, and real inspections. Replays come from this lab's own recent runs. | — |
| 4 | `interbank.bank-a` | `interbank.bank-a` → `Terminal` `:254` (rendered `:493`) | Wait: lane A has events · Next | Bank A investigates | Bank A's agent plans, then queries its own settlement records with read-only SQL. It never sees Bank B's database. | — |
| 5 | `interbank.wire` | `interbank.wire` → `Wire` `:273` (rendered `:494`) | Wait: wire has events · Next | Every hop inspected | Each A2A request and response crosses both banks' gateways. Verdicts appear here per listener, with event IDs. | Cisco AI Defense: inspects every A2A hop at agentgateway through an ext-proc, failing closed. |
| 6 | `interbank.bank-b` | `interbank.bank-b` → `Terminal` lane b (rendered `:495`) | Wait: lane B has events · Next | Bank B answers | Bank B's agent answers only from its own data. Before any message leaves a bank, an outbound control checks what may be shared. | Splunk Agent Control: `<bank>.send_a2a_message` evaluates each outbound A2A message before it is sent. |
| 7 | `interbank.report` | `interbank.report` → `.ib-report` `:498-506` | Wait: run done · Next | A joint report for people | Bank A's agent reports root cause, evidence, exposure, and proposed fixes. Agents are read-only; named teams approve fixes, and no funds move. | — |
| 8 | `interbank.stats` | `stats` → `:523` | Next | One trace, two banks | LLM calls, A2A sends, SQL queries, control decisions, and gateway inspections are counted from this run's events. | Splunk Agent Observability: one trace covers the ops desk, both gateways, both agents, and each control. |
| 9 | `interbank.code` | `interbank.integrations` → `:525` | Next | See the code | Each button opens the captured source excerpt the architecture map cites, and says if the file has changed since. | — |
| 10 | `interbank.architecture` | `arch.canvas` → `Explorer.tsx:1029` | Auto: Architecture tab · Next | The system map | Two banks, two gateways, one inspection service, and one control plane. Select a stage to see what runs there. | Cisco AI Defense (running at both gateways). |

**Offline variant** (lab down, `labUp === false`, `:465-466`): problem → the lab-offline notice (`interbank.offline`, the `.banking-error` at `:466`): "The lab isn't running, and runs replay only from the lab itself. Source and architecture still work." → `interbank.code` → `interbank.architecture`.

**Encore:** `interbank-a2a.attack-kickoff`: **Prompt-injection kickoff** → the report (`Report`, `:233-247`) shows the gateway's refusal with its AI Defense event ID; neither agent received it. Cisco AI Defense.

**Anchors to add:** `interbank.controls`, `interbank.scenarios`, `interbank.kickoff`, `interbank.start`, `interbank.history`, `interbank.offline`, `interbank.bank-a`, `interbank.wire`, `interbank.bank-b`, `interbank.report`, `interbank.runtime`, `interbank.integrations`, plus root state.

### 4.6 Brahe Bank assistant (`brahe-bank`), 9 steps (offline variant: 3)

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `banking.problem` | `banking.chat` → `.chat-card` `BankingDemo.tsx:123` | Next | Eligibility, from many places | Customers piece together card eligibility from product documents and separate score checks. A supervisor agent routes each question to product and score specialists. | — |
| 2 | `banking.prompts` | `banking.suggestions` → `.suggestion-grid` `:126` | Next | Three scripted prompts | Each prompt states its expected outcome: an answer, an AI Defense block, or a scope-control block. Every click calls the live service. | — |
| 3 | `banking.ask` | `banking.suggestion.success` → suggestion button `:126` | Act · Wait: an assistant message | Ask a normal question | The supervisor hands off to the score specialist, which reads the mock score of 550 and explains it. | — |
| 4 | `banking.answer` | `banking.answer-meta` → last assistant message meta `:127` | Next | What answered, and what checked it | Below the answer: the model that served it, latency, sources, and each check's verdict. OpenAI hosts inference today. | Cisco AI Defense (*if on*): inspected the question and the answer. Splunk Agent Control (*if enforcing*): scope, evidence-grounding, and no-approval-claims controls checked the reply. |
| 5 | `banking.new` | `banking.new` → `.new-chat` `:124` | Act · Wait: messages empty | Start fresh | Start a new conversation to try a guardrail prompt. | — |
| 6 | `banking.attack` | `banking.suggestion.ai-defense` → `:126` | Act · Wait: turn `blocked` | Try to override the rules | This prompt asks the assistant to reveal hidden instructions and bypass its safety policies. | — |
| 7 | `banking.blocked` | `banking.error` → `.banking-error` `:130` | Next | Refused at the door | The request is refused with the AI Defense verdict and its Cisco event ID. No answer is generated. | Cisco AI Defense: blocks the prompt-injection attempt on the input. |
| 8 | `banking.stats` | `stats` → `:139` | Next | Every turn, measured | Model calls, handoffs, control decisions, and AI Defense verdicts per turn, from the service's own responses. | Splunk Agent Observability: supervisor and specialist spans per turn. Splunk Observability Cloud (*when configured*): OTLP export. |
| 9 | `banking.architecture` | `arch.rail` → `Explorer.tsx:955` | Auto: Architecture tab · Next | Check, build, return | Requests are inspected, scoped, answered by the supervisor and specialists, then inspected and checked again before release. | — (add Cisco AI infrastructure only after confirming the Brahe "hosting-proposed" scene names Cisco AI POD; today the frame copy says only that OpenAI hosts inference, `page.tsx:236`, and the presenter note names only AI Defense and Agent Observability, `presenter-notes.ts:47`). |

**Offline variant:** problem → status (the "Unavailable" chip; there is no banner in embedded mode today, so this needs a `DemoStatusBanner` when health fails, which is in scope for the authenticity worker) → architecture.

**Encore:** the "cake recipe" prompt (`banking-scenarios.json:19`, "Expected: Agent Control block") → the 422 Agent Control block. Splunk Agent Control: the scope control refuses an off-topic request.

**Anchors to add:** `banking.chat`, `banking.new`, `banking.suggestions`, `banking.suggestion.<id>` (from `banking-scenarios.json` ids), `banking.answer-meta` (last assistant message only), `banking.error`, `banking.composer`, `banking.runtime`, plus root state.

### 4.7 Company briefing (`company-briefing`), 9 steps (offline variant: 3)

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `briefing.problem` | `briefing.intake` → `.briefing-card` `CompanyBriefing.tsx:316` | Next | A profile you can defend | Account teams need a company profile before a meeting, and filings are long. This agent reads only EDGAR or an uploaded report, never the open web. | — |
| 2 | `briefing.pick` | `briefing.examples` → `.briefing-chips` `:337`; variant when a company is already accepted: skip to step 3 | Act: JPM · Wait: displayed (patience 45s) | Pick an issuer | JPM resolves through EDGAR. The Deep Agent navigates the filing's table of contents and reads titled sections. | — |
| 3 | `briefing.review` | `briefing.review` → `.briefing-review-head` `:414` | Next | Source and period | The header links the exact filing, its period, and CIK, with the model that answered. | — |
| 4 | `briefing.themes` | `briefing.themes` → `.briefing-panels` `:441-442` | Next | Cite or abstain | Each theme keeps only facts with a verbatim excerpt. A theme with nothing grounded says abstain instead of guessing. | — |
| 5 | `briefing.metrics` | `briefing.metrics` → key metrics panel `:443-466` | Next | Metrics from XBRL | Revenue, income, and EPS come from SEC XBRL facts or a verbatim table line, not model arithmetic. Each metric shows its source. | — |
| 6 | `briefing.trail` | `briefing.trail` → `.briefing-trail` `:469-511` | Next | The agent's trail | Plan, tools, and sections read are listed, and grounding reports how many uncited facts and metrics it dropped. | Cisco AI Defense (*if on*; otherwise: "AI Defense is off for briefing on this machine, and the trail says so."). |
| 7 | `briefing.accept` | `briefing.accept` → Use this company `:433` | Act · Wait: accepted | Nothing stored until you accept | Use this company saves the profile in this browser only. Research and meeting prep can then use it. | — |
| 8 | `briefing.stats` | `stats` → `:515` | Next | Measured from this run | Model calls, tools, and AI Defense verdicts for this extract. | Splunk Agent Observability (*if on*). |
| 9 | `briefing.architecture` | `arch.mode` | Auto: Architecture tab · Next | Implemented and proposed | Implemented shows the EDGAR and upload pipeline as built. Proposed shows where it would run in production. | Cisco AI infrastructure (*proposed*). |

The standalone Company briefing page (`page.tsx:1174-1185`) runs the same tour without step 9, since it has no tabs.

**Anchors to add:** `briefing.runtime`, `briefing.intake`, `briefing.query`, `briefing.examples`, `briefing.upload`, `briefing.extract`, `briefing.picker`, `briefing.review`, `briefing.accept`, `briefing.themes`, `briefing.metrics`, `briefing.trail`, plus root state.

### 4.8 KYC processing (`kyc-processing`, illustrative), 6 steps

Every card carries the kicker **Illustrative prototype · no live service**. There is no run source picker.

| # | Step id | Anchor → today | Trigger | Title | Body | Cisco fit |
|---|---|---|---|---|---|---|
| 1 | `kyc.label` ★ | `kyc.label` → `#illustrative-experience` `page.tsx:880` | Next | An illustrative prototype | No service runs behind this page. The values and the AI review show how KYC could work, not how it works here. | — |
| 2 | `kyc.metrics` | `kyc.metrics` → `.case-metrics` `:885` | Next | Example queue metrics | Open reviews, median age, and auto-verified share are example figures, not measurements. | — |
| 3 | `kyc.queue` ★ | `kyc.queue` → `.case-queue-panel` `:897` (Dana row `:906`) | Next | Dana Whitfield's refresh | The lifecycle customer's periodic KYC refresh: sanctions clear, and a Section 16 officer of HCYN, so her employer-stock trades need pre-clearance. | — |
| 4 | `kyc.workbench` ★ | `kyc.workbench` → `.ai-workbench-panel` `:918-934` | Next | The analyst keeps approval | Proposed: document models extract fields and entity resolution reconciles registries. Only uncertain matches reach a person, who decides with evidence attached. | — |
| 5 | `kyc.stats` | `kyc.stats` → `IllustrativeRunStats` `:936` (`RunStats.tsx:350`) | Next | What would be traced | These cards show what an instrumented run would report. Nothing here is measured. | Splunk Agent Observability (*proposed*); Cisco AI Defense (*proposed*): on document text and model hops. |
| 6 | `kyc.architecture` | `arch.mode` → status label, proposed only (`Explorer.tsx:941`) | Auto: Architecture tab · Next | Proposed design only | The map shows only the proposed design: document intelligence, entity resolution, and exception review. | Cisco AI infrastructure (*proposed*): GPU document models on Cisco AI infrastructure. |

**Anchors to add:** `kyc.label`, `kyc.metrics`, `kyc.queue`, `kyc.workbench`, `kyc.stats` (all in `page.tsx`, inside the illustrative branch).

### 4.9 Dana Whitfield lifecycle story (`lifecycle`), 4 moments, 22 steps

- **How it runs.** Present mode with Guided on (§1.6), over the default story order `kyc-processing → fraud-modeling → sar-support → client-advisory` (`page.tsx:956`). Each moment plays its tour's ★ steps plus bridges. The card kicker reads "Moment 2 of 4 · Step 4 of 7".
- **Source.** One choice applies to the whole story. In recorded mode the handoffs still work, because fraud writes the referral and the service event from a recorded run, labelled (`FraudDemo.tsx:95-103`, `:301`). The SAR inbox and the advisory context read them back.

| Moment | Steps (ids) | Bridge copy |
|---|---|---|
| 1 · KYC (3) | `kyc.label`, `kyc.queue`, `kyc.workbench` | Closing bridge: "Dana is a Medium-risk customer with a clean history. Next: one purchase at a merchant that has been compromised." |
| 2 · Fraud (7) | `fraud.problem`, `fraud.scenario`, `fraud.run`, `fraud.verdicts`, `fraud.network`, `fraud.decide` (variant body: "Choose **Escalate to investigations**"), then bridge `fraud.escalate` → `#escalate-to-sar` (`FraudDemo.tsx:303`, Act) | "Escalate to SAR hands the case to the financial-crimes team. Only 'card compromised and reissued' is shared with Dana's advisor." Clicking it calls `nav.openUseCase("sar-support")` (`:186`), which advances Present mode (`page.tsx:1031-1033`). The tour continues at moment 3. |
| 3 · SAR (7) | `sar.problem`, `sar.pick` (inbox variant: the referral is attached), `sar.run`, `sar.typologies` (variant body cites MM-04, the Orbit Digital Goods link), `sar.narrative`, `sar.investigator`, `sar.qa` | Closing bridge: "The subject is never contacted, and nothing about this case reaches the advisor. That would be tipping off." |
| 4 · Advisory (5) | `advisory.household`, `advisory.context` (variant body: "Only the reissued card appears. No SAR, no investigation."), `advisory.run`, `advisory.notes`, `advisory.approve` | — |
| Close (1, no target) | `lifecycle.recap`: a centered card, no hole | "Four teams, one governed foundation. AI Defense screened untrusted text, Agent Control gated every consequential action, and each run was traced. Production placement on Cisco AI POD is proposed." Cisco fit: AI Defense; Agent Control; Splunk Agent Observability; AI infrastructure (*proposed*). This is the only card allowed four fit entries. |

**Verification tasks:**

1. Confirm that `services/fraud/data/recorded/cpp-orbit-*.json` ends in **Escalate**, so that a recorded story produces a SAR referral. If not, record a story golden run.
2. Confirm that the advisory recording's context matches a session with no fraud run. `ClientAdvisory.tsx:156-161` falls back to the record's sample event, labelled "Sample record".

A second story, **Grow the relationship** (Company briefing → Market research → Advisor meeting prep, redesign §3.2), reuses the same mechanism, with `research.publish` → "Prepare client meeting" (`MarketResearch.tsx:57`) as its bridge. It is out of v1 unless requested.

### 4.10 Step counts

| Tour | Main steps | Offline variant | Encores |
|---|---|---|---|
| Card fraud triage | 12 | 4 | 2 × 3 |
| SAR investigation | 11 | 4 | 1 × 3 |
| Market event → house-view update | 12 | 4 | 3 + 2 |
| Advisor meeting prep | 12 | 4 | 1 × 3 |
| Interbank settlement investigation | 10 | 4 | 1 × 2 |
| Brahe Bank assistant | 9 | 3 | 1 × 2 |
| Company briefing | 9 | 3 | — |
| KYC processing (illustrative) | 6 | — | — |
| Dana Whitfield lifecycle story | 22 across 4 demos | per-moment offline variants | — |

---

## 5. Implementation phases

Effort is in engineer-days for one engineer who knows the repo.

| Phase | Tasks | Files | Acceptance | Effort |
|---|---|---|---|---|
| **0 · Decisions and contract** | Answer §7. Freeze the `AnchorId` naming and the `data-guide-*` state contract. Agree with the authenticity worker that anchors land after their pass. | this doc | Signed-off answers; anchor list in `anchors.ts` stub | 0.5 |
| **1 · Engine, overlay, card** | Provider and state machine; SVG mask plus `clip-path` click layer; rings; placement function; card UI; keyboard; focus handling; live region; reduced-motion and forced-colors CSS; light-theme scrim override. | `app/guide/{GuidedTour.tsx,placement.ts,conditions.ts,guide.css,types.ts}`, `app/theme-light.css` | Node tests for `place()`: never intersects a target at 1440 × 900 or 1100 × 900; falls back to dock or strip. A demo-free harness page passes the a11y checks in Phase 6. | 4.5 |
| **2 · Host integration** | Tab-row **Guided tour** button; ⌘K entries; `G` key; `?guide=` deep link; guide host (`selectTab`); `useGuideActions`; persistence and resume toast; pause on Help, launcher, and full-screen map; Present-mode composition (`PresenterBar` guide slot, arrow-key yield, **Guide this moment**, **Present guided**); Help drawer shortcut docs. | `app/page.tsx`, `app/StudioShell.tsx`, `app/studio-shell.css`, `app/guide/persistence.ts` | Starting and exiting from every entry point; tab auto-switch measures after the explorer settles; Present ←/→ yields while guided | 2.5 |
| **3 · Anchors and state** | `guideAnchor()` on all anchors in Appendix A; `data-guide-run`, `-source`, and `-stage` on the 7 live demo roots; shared anchors in `DemoStatusBanner`, `RunStats`, and `Explorer`; `data-guide-safe` on the safe auto targets. Attribute-only: no behavior change. | 8 demo files, `RunStats.tsx`, `DemoStatusBanner.tsx`, `map/Explorer.tsx`, `page.tsx` | `npm run lint` clean; existing Playwright suite unchanged and green | 1.5 |
| **4 · Tour scripts** | Write the 8 tours, offline variants, and encores; Cisco-fit `requires`/`otherwise`; copy review against redesign §1.2–1.3; SME pass on regulatory phrasing (Reg BI, FinCEN, Rule 144). | `app/guide/tours/*.ts` | The copy lint (Phase 6) passes; one review sign-off per tour | 3.5 |
| **5 · Lifecycle story** | Story cuts, bridges, cross-demo continuation on handoff, recap card; verify the recorded-mode handoffs (§4.9). | `app/guide/tours/lifecycle.ts`, `GuidedTour.tsx` | The story spec below passes in live and recorded modes | 1.5 |
| **6 · Tests** | See below. Add the new specs to `testMatch` in `playwright.config.ts`. | `tests/guide-*.spec.ts`, `tests/guide-*.test.mjs` | All green in CI; the anchor-drift test fails when an anchor is removed (checked by deleting one locally) | 3 |
| **Total** | | | | **≈ 17** |

**Phase 6 tests:**

- **`tests/guide-tours.test.mjs`** (node, no browser):
  - every tour step's `AnchorId` appears as `guideAnchor("…")` or `data-guide="…"` somewhere in `app/**/*.tsx`. This is the **anchor-drift test**: it fails the moment a refactor drops an anchor.
  - bodies ≤ 35 words and titles ≤ 6 words.
  - `ciscoFit` products are from the enum; `Cisco AI infrastructure` always has status `proposed`, and `Splunk Observability Cloud` always has `when-configured`.
  - no forbidden terms: ThousandEyes, AppDynamics, Hyperfabric, Hypershield, Isovalent, "guarantee", "masking" attributed to AI Defense, "UCS" or "AI POD" without "proposed" (redesign §0.2 and §1.3, "What we will not claim").
  - each tour's Cisco products ⊆ that demo's presenter-note `cisco` text, plus the redesign value map.
  - `auto` actions only on `data-guide-safe` anchors.
- **`tests/guide-placement.test.mjs`**: table tests for `place()` covering wide targets, tall targets, multiple targets, the presenter-bar obstacle, and 1100px.
- **`tests/guide.spec.ts`** (Playwright, mocked status, recorded or scripted backends), for each tour in recorded or sample mode:
  - at each step, exactly the declared targets have `data-guide-active`; the dim layer exists; the hole rects match the target boxes ±2px.
  - the card's box intersects no target box at **1440 × 900 and 1100 × 900**, in **dark and light** themes.
  - →, Enter, ←, Esc, and Home behave as specified; Esc returns focus to the launcher.
  - steps with `tab: "architecture"` switch tabs, and the explorer is measured, not zero-sized.
  - act steps keep Next as Skip until the wait condition holds. Fraud uses `mode: "scripted"` via route, as in `lifecycle.spec.ts:27-31`, so the wait for `awaiting-human`, then `decided`, is exercised without a model.
  - a run continues while the tour is on the Architecture tab: returning finds the result landed.
  - the degraded path: with the fraud health route returning a cache backend, the status step appears, and the run step's copy names the recorded or sample source.
  - reduced motion: no transition runs (computed `transition-duration` is 0).
- **`tests/guide-a11y.spec.ts`:**
  - the card has `role="dialog"`, an accessible name, and a description.
  - the live region text updates per step.
  - focus order cycles through the card and the targets.
  - forced-colors emulation (`page.emulateMedia({ forcedColors: "active" })`) shows the outline ring.
  - axe-style checks via `@axe-core/playwright`, if adding the dev dependency is approved; otherwise the manual checks above.
- **`tests/guide-lifecycle.spec.ts`:** the four-moment story in recorded mode:
  - the escalation handoff advances to SAR at the inbox step.
  - the advisory context step contains "reissued" and no tipping-off terms (reusing the `TIPPING_OFF` regex from `lifecycle.spec.ts:11`).

---

## 6. Risks

| Risk | Mitigation |
|---|---|
| **Layout shifts** while streaming (timelines grow, cards land, banners appear) | Re-measure on ResizeObserver, MutationObserver, scroll, and resize (rAF-throttled); holes move with content. Placement is re-run each frame the target moves more than 4px. |
| **React Flow inside a hidden tab** measures as zero size | Measure only after `selectTab` and the explorer's settled `data-phase` plus two frames (§1.2). Never target React Flow nodes by layout position; use explorer chrome (`arch.mode`, `arch.rail`, `arch.focus`, `arch.canvas`) and, if needed, `[data-id]` instance ids from the scene model. |
| **Sticky and fixed headers** hide targets after scroll | Scroll offset = `--topbar` + 16px; the Present-mode presenter bar is an obstacle; both are tested at 1440 and 1100. |
| **Long-running live runs** (research and advisory up to 260s; first-token latency) | Wait steps with elapsed timers, patience thresholds, Keep waiting / Skip ahead / Replay recorded; runs keep going across tabs. |
| **Copy drift** as the UI changes (the authenticity worker is changing these files now) | Anchor-drift node test; `AnchorId` union types; copy lint; the presenter-note consistency check. Each tour file records the commit it was last verified against, in a comment that the lint reads, and Playwright tour smoke tests fail when a step's target is not visible. |
| **Merge conflicts** with the authenticity pass | Phase 3 runs after that pass merges; anchors are attribute-only additions. |
| **Over-claiming Cisco value** on a machine where a product is off | `requires` conditions read live status and the page's own labels (for example the hosted-versus-local policy source); `otherwise` text says what actually happened. |
| **Tall targets** (research timeline, SAR narrative) | `scroll: "start"`, holes clipped to the viewport, narrower sub-anchors where useful. |
| **Overlay z-index fights** (launcher 100, expanded map 100) | Overlay at 120; pause while the launcher or Help is open. |
| **Recorded-mode gaps** (fraud decisions cannot be made on a replay) | The step switches to "observe the recorded decision" automatically, says so, and offers "Run live" when ready. Optional scripted source (§2.3). |
| **Interbank and Brahe have no recordings** | Offline variants keep a useful tour (architecture and source viewer) instead of a dead end. |

---

## 7. Open questions

1. **Entry point.** Is the tab-row **Guided tour** button, plus ⌘K, Present mode, and deep links, enough? Or do you also want a **Guided** action on each library card, or a global "Guided mode on" switch in the top bar that starts the tour whenever a demo opens?
2. **Default run source.** Recommended: **live when the demo is ready, otherwise the best honest fallback**, chosen once on the first card (§2.3). Alternative: always default to **recorded**, which is more reliable for unattended or self-serve use, but fraud's decision becomes a replay. Which should be the default for customer-facing sessions? And should fraud get the "Live service · scripted summary" source (§2.3, a one-line change)?
3. **Cisco fit lines for non-Cisco audiences.** Should they default **on**, with a toggle in the card's ⋯ menu and Studio settings, or should there be a presenter-level "audience" setting (Cisco-led vs. neutral) that hides them by default?
4. **Present mode.** When presenting, should Guided be **on by default**, so the step card replaces the on-screen talk track, or stay opt-in per moment via **Guide this moment**? The talk track is presenter-oriented ("say Illustrative out loud"); the step card is written for the audience.
5. **Copy review.** Who signs off on the Cisco-fit wording and the regulatory phrasing (Reg BI, FinCEN 30-day clock, Rule 144) before external use? The redesign plan still lists several **[confirm]** items that the copy avoids for now.

---

## Appendix A: Anchor inventory

<details>
<summary>All anchors to add, by file (≈ 120 ids). Line numbers are as of 2026-10-12.</summary>

| File | Anchors (→ current line) |
|---|---|
| `app/page.tsx` | `case.heading` 820 · `case.status` 830 · `case.model` 831 · `case.primary` 833 · `case.tabs` 837 · `case.tab.demo` / `case.tab.architecture` 838-852 · `guide.launch` (new button in 837) · `kyc.label` 880 · `kyc.metrics` 885 · `kyc.queue` 897 · `kyc.workbench` 918 · `kyc.stats` 936 |
| `app/StudioShell.tsx` | `present.bar` 243 · `present.guide` (new button) |
| `app/DemoStatusBanner.tsx` | `status-banner` 35 |
| `app/RunStats.tsx` | `stats` 320 · `stats.observability` / `stats.defense` 259 (by `kind`) · `kyc.stats` via `IllustrativeRunStats` 350 |
| `app/map/Explorer.tsx` | `arch.explorer` 889 · `arch.mode` 937 / 941 · `arch.rail` 955 · `arch.focus` 1005 (safe) · `arch.canvas` 1029 · `arch.env` 998 |
| `app/FraudDemo.tsx` | root 196 (state) · `fraud.band` 341 · `fraud.scenario.<id>` 221 (safe) · `fraud.run` 237 · `fraud.replay` 241 · `fraud.queue` 363 · `fraud.verdicts` 420 · `fraud.show-network` 259 (safe) · `fraud.network` 262 · `fraud.reasons` 437 · `fraud.timeline` 275 · `fraud.dispute` 451 · `fraud.summary` 469 · `fraud.decision` 491 · `fraud.bulk` 286 · `fraud.note` 537 · `fraud.audit` 562 · `fraud.shared` 296 · `fraud.handoff` 301 · `fraud.escalate` 303 · `fraud.backtest` (`fraud/ModelCard.tsx:41`) · `fraud.compute` (`fraud/ModelCard.tsx:74`) |
| `app/SarInvestigation.tsx` | root 372 (state) · `sar.band` 373 · `sar.runtime` 396 · `sar.inbox` 425 · `sar.inbox.open` 436 · `sar.scenario.<id>` 451 (safe) · `sar.case` 464 · `sar.clock` 473 · `sar.investigate` 482 · `sar.sample` 485 · `sar.replay` 486 · `sar.narrative` 499 · `sar.recommendation` 545 · `sar.decision` 565 · `sar.qa-switch` 621 · `sar.policies` 628 · `sar.typologies` 637 · `sar.evidence` 662 · `sar.timeline` 690 / 699 · `sar.audit` 706 |
| `app/MarketResearch.tsx` | root 235 (state) · `research.intro` 237 · `research.scenarios` 252 · `research.scenario.<id>` 254 (safe) · `research.run` 264 · `research.replay` 229 · `research.result` 317 · `research.blocked` 333 · `research.impact` 345 · `research.claims` 357 · `research.count` 369 · `research.news` 383 · `research.policies` 410 · `research.publish` 51 / 63 / 82 · `research.evidence` 417 · `research.affected` 420 · `research.timeline` 289 |
| `app/ClientAdvisory.tsx` | root 286 (state) · `advisory.intro` 288 · `advisory.households` 306 · `advisory.household.<id>` 309 (safe) · `advisory.context` 318 · `advisory.run` 332 · `advisory.replay` 280 · `advisory.result` 372 · `advisory.findings` 397 · `advisory.actions` 416 · `advisory.brief` 427 · `advisory.policies` 457 · `advisory.approval` 69 / 81 / 93 / 103 · `advisory.notes` 465 · `advisory.holdings` 479 · `advisory.timeline` 347 |
| `app/InterbankDemo.tsx` | root 456 (state) · `interbank.controls` 457 · `interbank.scenarios` 467 (safe) · `interbank.kickoff` 475 · `interbank.start` 478 · `interbank.history` 481 · `interbank.offline` 466 · `interbank.bank-a` / `interbank.bank-b` 254 (by lane) · `interbank.wire` 273 · `interbank.report` 499 · `interbank.runtime` 508 · `interbank.integrations` 525 |
| `app/BankingDemo.tsx` | root 111 (state) · `banking.chat` 123 · `banking.new` 124 · `banking.suggestions` 126 · `banking.suggestion.<id>` 126 · `banking.answer-meta` 127 (last assistant) · `banking.error` 130 · `banking.composer` 131 · `banking.runtime` 134 |
| `app/CompanyBriefing.tsx` | root 308 (state) · `briefing.runtime` 309 · `briefing.intake` 316 · `briefing.query` 328 · `briefing.examples` 337 · `briefing.upload` 342 · `briefing.extract` 367 · `briefing.picker` 386 · `briefing.review` 414 · `briefing.accept` 433 · `briefing.themes` 441 · `briefing.metrics` 443 · `briefing.trail` 469 |

</details>

## Appendix B: Observed in the running studio

Screenshots were taken from the running dev server on 2026-10-12 with a throwaway Playwright script (since deleted). The script made no model calls: it only opened pages and replayed recordings. Output is in `/tmp/guided/`.

- **Geometry at 1440 × 900.**
  - Fixed top bar: 64px. Fixed sidebar: 252px.
  - Case tab row at y ≈ 362–386, depending on header length.
  - The page is 1,680–2,030px tall before any run.
  - The fraud page after a replay is several viewports tall, with the case file in two columns.
  - The research timeline after a replay is thousands of pixels tall, which motivated the tall-target rule.
- **1100 × 900.** The sidebar stays visible, the header actions wrap to two rows, and the content column is about 760px.
- **Present mode.** The top bar and sidebar are hidden (`studio-shell.css:75`). The presenter bar with its talk track is 306px tall, at y = 576–882 of 900, and covers the lower third of the content. That is why the step card docks inside it (§1.6).
- **Architecture tab.** The explorer opens on the business-journey rail with the Implemented/Proposed toggle top right. The platform-focus row (AI Defense / Agent Observability / AI Infrastructure) appears only after entering a stage (`Explorer.tsx:1004`).
- **Live status that day.**
  - All services were up. SAR showed the hosted-fallback banner "Sparky is not answering: the narrative uses OpenAI API (hosted), with AI Defense enforcing on every hop".
  - Fraud showed the degraded banner "The live GNN scorer on Sparky is offline" (still works: sample scores plus the triage agent), with **Replay recorded run** offered.
  - The interbank lab was running.
  - Wealth and briefing had AI Defense off, which is why their Cisco-fit lines are conditional.

## Decisions (Oct 12, 2026)

1. **Entry points:** the planned set (tab-row button, ⌘K, `G`, Present mode "Guide this moment", deep links) plus a "Guided tour" action on each library card.
2. **Default run source:** always a recorded run, clearly labelled. Live runs remain available outside guided mode.
3. **Cisco fit lines:** on by default, with a toggle to hide them.
4. **Present mode:** opt-in per moment ("Guide this moment"); the talk track stays the default.
5. **Sequencing:** build starts after the authenticity audit lands.
