import { journeyCase } from "../../../app/map/journey.ts";

export const research = journeyCase({
  id: "market-research",
  title: "Company evidence → research recommendation",
  purpose: "Load a company, screen its articles, and review a Buy, Hold or Sell opinion supported by verified facts and a peer comparison.",
  modes: ["implemented"],
  environment: [
    "React calls the independent Market Research container on port 8014 through /api/research. Its internal Wealth API loads a packet and analyzes that exact packet id.",
    "NVDA defaults to a dated public-data cache, including its earnings release. Other tickers and Refresh latest fetch Yahoo financials, earnings, peers and news from the past 30 days. Missing data remains visible.",
    "Every ticker includes the same synthetic prompt-injection article. AI Defense and the local instruction screen run before article text enters the model; flagged or uninspected articles are excluded.",
    "The workflow uses structured model calls, not a Deep Agent. At least three supporting facts must verify. One repair attempt is allowed; if some facts are rejected, the opinion is regenerated from verified facts only.",
    "The report shows a 12-month Buy, Hold or Sell opinion, drivers, sources and risks. A failed recommendation shows its reason and a retry action. No publish step or trade execution exists.",
    "The Studio model chain supplies inference. Article inspection is required; model input/output inspection follows Studio settings. Live run stats report model usage, trace delivery and inspection verdicts; runtime details identify the answering model.",
  ],
  steps: [
    { id: "ticker", label: "Load company evidence", text: "Cached NVDA or fresh ticker data; one fixed input packet", emphasis: "customer" },
    { id: "note", label: "Screen, assess & verify", text: "Inspect articles, draft the outlook, and verify cited facts", emphasis: "assisted" },
    { id: "accept", label: "Review recommendation", text: "Buy / Hold / Sell, key drivers, peer comparison and risks", emphasis: "customer" },
  ],
});
