import { proposed } from "../../../app/map/case-helpers.ts";

export const kyc = proposed("kyc-processing", "Proposed process", "A proposed onboarding review. No KYC system is running in this studio, and a model would not approve the customer.", [
  ["intake", "Intake documents", "Person submits identity records", "human"],
  ["extract", "Extract fields", "A model would propose fields, not a decision.", "ai"],
  ["review", "Analyst decides", "A person would approve or reject onboarding.", "decision"],
  ["stop", "Decision outside the model", "The model would not clear the customer.", "outcome"],
]);
