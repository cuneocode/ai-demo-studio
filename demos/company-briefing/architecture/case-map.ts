import { entity, process } from "../../../app/map/case-helpers.ts";

export const briefing = process(
  "company-briefing",
  "Business process",
  "A presenter picks an issuer or uploads a filing, reviews a cited briefing, and chooses whether to keep that company in the studio. The model does not approve the filing.",
  ["implemented", "proposed"],
  [
    entity("issuer", "Select an issuer or upload", "Person chooses the source", "Ticker lookup or an uploaded PDF, HTML, or TXT file. An empty text layer stops the run.", "human"),
    entity("brief", "Draft a cited briefing", "Subagents read filing nodes. Ungrounded themes abstain.", "Theme notes must quote the filing. This is not a web search and not a vector index.", "ai"),
    entity("accept", "Accept the company", "Presenter-owned", "Studio context is stored only after this click. Skipping leaves the prior context unchanged.", "decision"),
    entity("stop", "Briefing or abstention", "No automatic filing decision", "The outcome is a cited note or an abstention. It does not submit anything to the SEC.", "outcome"),
  ],
);
