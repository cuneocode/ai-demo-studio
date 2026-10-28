import type { PresenterNote } from "../../app/presenter-notes.ts";

export const presenter_notes = {
    problem: "Rules approve fraud that hides in a compromised merchant's network and flood analysts with false positives elsewhere. Chuck's clean card makes one purchase at Orbit Digital Goods; rules approve it.",
    ai: "GraphSAGE + XGBoost scores the account–merchant neighborhood, exact TreeSHAP explains it, and a triage agent gathers evidence and drafts a cited summary. The analyst decides; the score is evidence, not a verdict.",
    cisco: "AI Defense inspects the dispute note and the agent's prompt (try the injection scenario); Agent Control denies card actions without analyst approval; Splunk Agent Observability traces each run. The GNN runs on Sparky, an NVIDIA DGX Spark dev box; Cisco UCS / AI POD is the proposed production placement.",
    lifecycle: "Choose Escalate to investigations. The card is still blocked and reissued; Escalate to SAR hands the case to the SAR team. Only \"card compromised and reissued\" is shared with the advisor.",
  } satisfies PresenterNote;
