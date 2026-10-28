import type { PresenterNote } from "../../app/presenter-notes.ts";

export const presenter_notes = {
    problem: "Settlement fails are chased by email and phone between banks, each re-keying the other's records.",
    ai: "Each bank's Deep Agent investigates its own records and asks the other bank's agent over A2A.",
    cisco: "Each bank's AI gateway inspects the A2A traffic with AI Defense, and an outbound control stops data that must not leave; Splunk Agent Observability traces both sides. Agents are read-only; named teams approve fixes.",
  } satisfies PresenterNote;
