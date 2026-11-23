import { journeyCase } from "../../../app/map/journey.ts";

export const transactions = journeyCase({
  id: "transaction-llm",
  title: "Payment enrichment",
  purpose: "A proposed enrichment path. Authorization stays on the existing pipeline.",
  modes: ["proposed"],
  environment: ["This use case is a proposed design. The payment path would not wait on a model."],
  steps: [
    { id: "ingest", label: "Ingest payments", text: "Existing pipeline", emphasis: "customer" },
    { id: "enrich", label: "Propose fields", text: "Suggest fields for exceptions only.", emphasis: "assisted" },
    { id: "review", label: "Accept the fields", text: "Operations activity", emphasis: "customer" },
  ],
});
