import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    liveExperience: "research",
    transformation: {
      friction: "Researchers assemble earnings, market data, news and peer comparisons before forming a view.",
      aiShift: "A model weighs screened sources and drafts a concise outlook with cited supporting facts.",
      humanControl: "The user reviews an analytical Buy, Hold or Sell opinion. No trade or distribution is performed.",
    },
    architecture: {
      process: [
        { title: "Load company", detail: "Cached NVDA packet or live Yahoo data for another ticker" },
        { title: "Screen articles", detail: "AI Defense inspects each article; excluded text never reaches analysis" },
        { title: "Assess the evidence", detail: "Structured outlook, recommendation, key facts and risks" },
        { title: "Verify & review", detail: "Check cited fields and quotes before releasing the recommendation" },
      ],
      ai: [
        { point: "01 → 02", label: "Fixed input packet", detail: "The displayed articles and figures are the exact inputs for the run. A synthetic poisoned article accompanies every ticker." },
        { point: "02 → 03", label: "AI Defense", detail: "Inspects untrusted article text. Blocked articles and articles without an inspection verdict are excluded." },
        { point: "03 → 04", label: "Cited assessment", detail: "Model usage, tool calls and inspection verdicts are instrumented. Supporting facts are verified against the packet." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Market research",
    workbenchTitle: "Company evidence to an investment outlook",
    workbenchSummary: "Load a ticker, inspect the inputs, and review the recommendation and its supporting facts.",
    primaryAction: "Analyze",
  } satisfies UseCaseFrame;
