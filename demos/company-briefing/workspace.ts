import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
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
  } satisfies UseCaseFrame;
