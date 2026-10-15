import type { Tour } from "../types";

export const researchTour: Tour = {
  id: "market-research", useCaseId: "market-research", title: "Market research",
  steps: [
    { id: "research.company", kind: "observe", targets: ["research.intro"], title: "Choose a company", body: "NVDA starts with a dated cached packet. Enter another ticker to load current public data, or refresh NVDA." },
    { id: "research.inputs", kind: "observe", targets: ["research.inputs"], title: "Review the inputs", body: "Compare financials and peers. Open an article to read its complete supplied text. One synthetic article contains a prompt injection." },
    { id: "research.analyze", kind: "act", targets: ["research.run"], title: "Analyze", body: "AI Defense screens the articles before the model weighs the evidence. Select Analyze.", waitFor: { state: { run: ["running", "done"] } } },
    { id: "research.report", kind: "wait", targets: ["research.result"], title: "Review the outlook", body: "Review Buy, Hold or Sell, the key drivers and risks. Source buttons open the evidence behind each fact.", waitFor: { state: { stage: ["result"] } } },
    { id: "research.news", kind: "observe", targets: ["research.news"], title: "Inspect the excluded article", body: "The article row names the actual inspection outcome. Excluded content does not reach the analysis." },
    { id: "research.stats", kind: "observe", targets: ["stats"], title: "Live run stats", body: "Model calls, tokens and article-inspection verdicts are measured for this run." },
  ],
};
