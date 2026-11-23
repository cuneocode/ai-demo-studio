import { journeyCase } from "../../../app/map/journey.ts";

export const kyc = journeyCase({
  id: "kyc-processing",
  title: "Onboarding review",
  purpose: "A proposed onboarding review. No KYC system is running in this studio.",
  modes: ["proposed"],
  environment: ["This use case is a proposed design. A model would not approve the customer."],
  steps: [
    { id: "intake", label: "Intake documents", text: "Customer activity", emphasis: "customer" },
    { id: "extract", label: "Extract fields", text: "Propose fields for a person to review.", emphasis: "assisted" },
    { id: "review", label: "Analyst decides", text: "Analyst activity", emphasis: "customer" },
  ],
});
