import { box, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const research: ZoomMap = {
  summary: "Screen company evidence, draft a structured recommendation, and verify cited facts before review.",
    implemented: true,
    note: "Load a fixed packet, inspect its articles, then draft and verify a structured assessment. Release a recommendation with at least three verified drivers, or show the failure and a retry action.",
    cores: [
      box("market", "Research packet", "Earnings, financials, peers, news", "Cached NVDA or fresh Yahoo data. A packet id binds the displayed inputs to the analysis.", "store"),
      box("workload", "Assessment workflow", "FastAPI · structured calls", "Restricted-list check, screened evidence, cited assessment and fact verification. No Deep Agent."),
      box("model", "Studio model chain", "Configured healthy backend", "Produces a Buy/Hold/Sell opinion, outlook, supporting facts and risks.", "ai"),
      box("defense", "Cisco AI Defense", "Inspect every article", "Flagged or uninspected articles are excluded. A local instruction screen also runs.", "cisco"),
      box("observe", "Splunk Agent Observability", "Model and tool traces", "Run stats report usage and actual trace delivery. Inspection verdicts share the run id.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "market", to: "workload", label: "exact packet" },
      { from: "workload", to: "defense", label: "articles ↔ verdicts", kind: "control" },
      { from: "workload", to: "model", label: "screened evidence ↔ assessment" },
      { from: "workload", to: "observe", label: "model / tool traces", kind: "telemetry" },
    ],
    interiors: {
      market: { title: "Research inputs", note: "GET /api/wealth/market/inputs/{ticker} stores these sources in a content-hashed packet. Analyze validates its id and ticker. Article dialogs show supplied text and label provider summaries.", entities: [
        box("snapshot", "Financial snapshot", "NVDA cache or Yahoo Finance", "Earnings, key financial metrics and peer valuations. Refresh latest also refreshes NVDA.", "store"),
        box("news", "Recent articles", "Past 30 days", "Yahoo articles or provider summaries. The NVDA cache also includes its latest earnings release.", "store"),
        box("attack", "Synthetic article", "Same attack for every ticker", "Prompt injection asks the model to invent a Buy recommendation and hide risks. It must be screened.", "store"),
      ], edges: [], stubs: [] },
      workload: { title: "Assessment and verification", note: "POST /api/wealth/market/analyze checks the restricted list (research_precheck), validates the packet and screens its articles before inference. At most two assessment calls plus one final-opinion call.", entities: [
        box("assessment", "Structured assessment", "Buy / Hold / Sell", "The model proposes a 12-month outlook, 3–4 cited drivers and 1–3 risks from accepted evidence.", "ai"),
        box("verifier", "Verify & repair", "At least three verified facts", "Code checks values, units and quotes. If fewer than three pass, repair once. If some facts are rejected, regenerate the opinion using verified facts only."),
        box("review", "Final recommendation", "Human review or retry", "Show the rating, outlook, drivers and risks. Insufficient facts or a failed final opinion shows a reason and retry action.", "human"),
      ], edges: [
        { from: "assessment", to: "verifier", label: "cited draft" },
        { from: "verifier", to: "review", label: "verified opinion / failure" },
      ], stubs: [] },
      model: { title: "Studio model chain", note: "Structured LangChain calls use the first healthy configured backend. The actual provider, model and fallback are reported with the result.", entities: [
        box("model", "Inference", "Configured Studio chain", "Private vLLM or a configured hosted provider; availability determines the answering backend.", "ai"),
        box("schema", "Structured JSON", "Assessment / Outlook schemas", "Buy, Hold or Sell is required. Model failure produces an error, never a canned rating."),
      ], edges: [{ from: "model", to: "schema", label: "schema validation" }], stubs: [] },
      defense: { title: "Article screening", note: "Every article is screened before inclusion. Model input/output inspection is a separate Studio setting.", entities: [
        box("inspect", "Inspect article text", "AI Defense + local screen", "Each body is inspected as an untrusted tool result. Verdicts and returned event ids are recorded.", "cisco"),
        box("accepted", "Accepted evidence", "Allowed and locally clean", "Only accepted article text joins the financial evidence used by the model.", "store"),
        box("excluded", "Excluded article", "Flagged / unavailable / injection", "The article stays inspectable in the UI but its text never enters the assessment prompt.", "failure"),
      ], edges: [{ from: "inspect", to: "accepted", label: "allow" }, { from: "inspect", to: "excluded", label: "exclude", kind: "control" }], stubs: [] },
      observe: observeInterior("Structured model calls, packet/news tool events and usage; the run timeline records verification and article verdicts. Live run stats reports actual trace delivery.", ["research_precheck"]),
    },
  };
