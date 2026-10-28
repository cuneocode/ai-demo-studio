import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    liveExperience: "sar",
    transformation: {
      friction: "Investigators spend half a day per SAR pulling KYC, transactions, counterparties, and prior alerts, then write a narrative that QA often returns.",
      aiShift: "An investigation agent assembles the case and drafts a FinCEN-style narrative where every sentence cites evidence. The typology indicators are deterministic rules, not the model.",
      humanControl: "The investigator edits and decides file or no SAR with a rationale; a different QA reviewer approves. E-filing is simulated, and the customer is never contacted.",
    },
    architecture: {
      process: [
        { title: "Assemble the case", detail: "Alert, KYC, activity, counterparties, media" },
        { title: "Match typologies", detail: "Deterministic money-mule, structuring, funnel rules" },
        { title: "Draft and verify", detail: "Cited who / what / when / where / why / how" },
        { title: "Decide and approve", detail: "Investigator → QA → simulated e-filing" },
      ],
      ai: [
        { point: "01 → 02", label: "Investigation Deep Agent", detail: "deepagents on the Studio model chain: Sparky vLLM, else the OpenAI API with AI Defense enforcing every hop. Customer documents and memos are inspected segment by segment before the agent sees them." },
        { point: "02 → 03", label: "Typology rules", detail: "Money-mule, structuring, and funnel-account indicators computed on CPU from the transactions. Not an LLM; the agent's recommendation is checked against them." },
        { point: "03 → 04", label: "Citation check + policies", detail: "Every sentence must cite evidence that states its figures and dates; unsupported sentences are dropped. sar.narrative_cited, sar.no_tipping_off, and sar.file_requires_approval gate release, contact, and filing." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "SAR investigation",
    workbenchTitle: "Alert queue · FIU",
    workbenchSummary: "Investigate a synthetic alert, review a cited narrative, and decide under policy with second-line QA.",
    primaryAction: "Investigate a case",
  } satisfies UseCaseFrame;
