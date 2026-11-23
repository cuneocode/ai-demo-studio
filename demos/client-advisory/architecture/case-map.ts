import { entity, process } from "../../../app/map/case-helpers.ts";

export const advisory = process(
  "client-advisory",
  "Business process",
  "An advisor enters holdings and optional accepted context, reviews a meeting brief, and chooses whether to keep it. The brief is not advice and there is no household CRM catalog.",
  ["implemented", "proposed"],
  [
    entity("holdings", "Enter holdings", "Advisor types tickers and weights", "There is no imported book of business. Prices are looked up for the symbols entered here.", "human"),
    entity("brief", "Draft a meeting brief", "Rules run first. The model does not give advice.", "Suitability checks are CPU rules. The local model may phrase a brief around those results and any accepted context.", "ai"),
    entity("accept", "Accept the meeting brief", "Advisor-owned", "The brief is stored only after this click. Holdings remain if the brief is omitted.", "decision"),
    entity("stop", "Brief or holdings only", "Not a client recommendation", "The demo states the text is not advice. It does not rebalance an account.", "outcome"),
  ],
);
