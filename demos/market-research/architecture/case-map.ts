import { entity, process } from "../../../app/map/case-helpers.ts";

export const research = process(
  "market-research",
  "Business process",
  "A presenter picks a ticker, reviews live or cached indicators, and chooses whether to keep a research note. The note is not financial advice.",
  ["implemented", "proposed"],
  [
    entity("ticker", "Select a ticker", "Person chooses the symbol", "Any US ticker. An accepted briefing can prefill it. The presenter can change it.", "human"),
    entity("note", "Draft a research note", "Local model writes from tool rows. The note is not advice.", "Yahoo and FRED data are fetched or reused from the same-day cache. Conflicts are computed before the model writes.", "ai"),
    entity("accept", "Accept the research note", "Presenter-owned", "The note is stored only after this click. Indicators remain if the note is omitted.", "decision"),
    entity("stop", "Note or indicators only", "Not a recommendation to trade", "The demo labels the text as not financial advice. It does not place an order.", "outcome"),
  ],
);
