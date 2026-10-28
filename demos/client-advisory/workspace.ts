import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    liveExperience: "advisory",
    transformation: {
      friction: "Advisors rebuild each client's picture by hand: profile, holdings, CRM notes, the latest investment outlook, and what is suitable.",
      aiShift: "Code rules compare profile and portfolio and size the actions; a meeting-prep Deep Agent drafts a brief whose every statement is checked.",
      humanControl: "The advisor submits and a supervisor approves under advisory.recommendation policies. Nothing is executed.",
    },
    architecture: {
      process: [
        { title: "Pick a household", detail: "Synthetic clients · CRM notes screened by AI Defense" },
        { title: "Profile vs portfolio", detail: "Suitability rules · Reg BI care framing" },
        { title: "Rank next-best actions", detail: "Sized in dollars · unsuitable ones excluded" },
        { title: "Advisor, then supervisor", detail: "advisory.recommendation policies on approval" },
      ],
      ai: [
        { point: "01 → 02", label: "Screened client context", detail: "AI Defense inspects CRM notes as tool results: PII is masked, an injected instruction is withheld." },
        { point: "02 → 03", label: "Rules and sized actions", detail: "Code compares the risk profile with the portfolio and sizes each action in dollars. Not an LLM." },
        { point: "03 → 04", label: "Meeting-prep Deep Agent", detail: "Private inference on Sparky (an NVIDIA DGX Spark dev box) when it is up; a hosted fallback only with AI Defense in enforce. Every statement is verified against the record." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Meeting prep",
    workbenchTitle: "Prepare for a client meeting",
    workbenchSummary: "Choose a client, review the AI brief, and select actions for supervisor approval.",
    primaryAction: "Prepare meeting",
  } satisfies UseCaseFrame;
