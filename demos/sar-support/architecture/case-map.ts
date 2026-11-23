import { entity, process } from "../../../app/map/case-helpers.ts";

export const sar = process(
  "sar-support",
  "Business process",
  "A BSA/AML investigator works a synthetic alert or fraud referral: the investigation agent assembles the case and drafts a cited narrative, the investigator decides file or no SAR, and a separate QA reviewer approves. E-filing is simulated.",
  ["implemented", "proposed"],
  [
    entity("case", "Open the case", "Alert or fraud referral", "Scenario cards or the fraud inbox. A fraud handoff seeds the case and its evidence. Synthetic data, obviously fake PII.", "human"),
    entity("draft", "Assemble, draft, and verify", "Investigation Deep Agent", "Case tools return evidence items with stable ids. Typology rules are deterministic. Every narrative sentence must cite evidence that contains its figures, or it is dropped.", "ai"),
    entity("decide", "Investigator decides", "File or no SAR, with a rationale", "The investigator can edit the narrative; edits are re-verified. Contacting the subject is denied (no tipping off).", "decision"),
    entity("stop", "QA approves · simulated e-file", "Separate reviewer required", "Agent Control denies filing until a different second-line reviewer approves. Nothing is sent to FinCEN.", "outcome"),
  ],
);
