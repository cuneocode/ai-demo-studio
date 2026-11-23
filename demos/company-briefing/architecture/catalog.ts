import { journeyCase } from "../../../app/map/journey.ts";

export const briefing = journeyCase({
  id: "company-briefing",
  title: "Company briefing",
  purpose: "A presenter selects a filing, reviews a cited briefing, and chooses whether to keep that company in the studio.",
  modes: ["implemented", "proposed"],
  environment: ["Theme notes must quote the filing. The briefing does not approve the filing or submit anything to the SEC."],
  steps: [
    { id: "issuer", label: "Select an issuer or upload", text: "Presenter activity", emphasis: "customer" },
    { id: "brief", label: "Draft a cited briefing", text: "Read the filing and abstain when a theme is not grounded.", emphasis: "assisted" },
    { id: "accept", label: "Accept the company", text: "Presenter activity", emphasis: "customer" },
  ],
});
