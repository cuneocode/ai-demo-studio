import { journeyCase } from "../../../app/map/journey.ts";

export const sar = journeyCase({
  id: "sar-support",
  title: "SAR investigation",
  purpose: "A BSA/AML investigator opens an alert or a fraud referral, reviews a cited narrative the investigation agent drafts, decides file or no SAR with a rationale, and a separate QA reviewer approves. E-filing is simulated.",
  modes: ["implemented", "proposed"],
  environment: [
    "Cases are synthetic with obviously fake PII. Nothing is sent to FinCEN; the e-filing confirmation is simulated.",
    "Typology indicators and the citation check are deterministic code. The model drafts; it does not decide or file.",
  ],
  steps: [
    { id: "case", label: "Open the case", text: "Alert, or a fraud referral from the inbox", emphasis: "customer" },
    { id: "draft", label: "Assemble, draft, and verify", text: "Agent gathers evidence; every sentence must cite it.", emphasis: "assisted" },
    { id: "decide", label: "Investigator and QA decide", text: "File or no SAR; separate QA approval", emphasis: "customer" },
  ],
});
