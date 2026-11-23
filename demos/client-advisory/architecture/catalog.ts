import { journeyCase } from "../../../app/map/journey.ts";

export const advisory = journeyCase({
  id: "client-advisory",
  title: "Advisor meeting prep",
  purpose: "An advisor prepares a client meeting from a synthetic household, and a supervisor approves the brief before it is recorded.",
  modes: ["implemented", "proposed"],
  environment: ["Households are synthetic with test PII only. The brief is not advice and the demo executes no trade or transfer."],
  steps: [
    { id: "holdings", label: "Pick a household", text: "CRM notes screened by AI Defense", emphasis: "customer" },
    { id: "brief", label: "Draft a checked meeting brief", text: "Rules and sized actions, then a verified brief.", emphasis: "assisted" },
    { id: "accept", label: "Advisor and supervisor approve", text: "advisory.recommendation policies", emphasis: "customer" },
  ],
});
