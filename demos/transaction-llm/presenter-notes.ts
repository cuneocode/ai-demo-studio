import type { PresenterNote } from "../../app/presenter-notes.ts";

export const presenter_notes = {
    problem: "Payment text arrives unstructured, so operations teams re-key purpose codes and counterparties by hand.",
    ai: "Proposed concept: batched extraction into structured fields, with only low-confidence exceptions reaching an agent.",
    cisco: "Proposed: Splunk spans on the extraction path and AI Defense on the exception hop only. Not connected in this demo.",
  } satisfies PresenterNote;
