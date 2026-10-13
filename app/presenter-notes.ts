/**
 * Present-mode talk track per use case, in three acts: the business problem, what AI changes, and where Cisco
 * adds value. Presenter-only; never rendered to the audience outside Present mode. Claims match what is built:
 * "proposed" means not running in this demo.
 */
export type PresenterNote = { problem: string; ai: string; cisco: string; lifecycle?: string };

export const presenterNotes: Record<string, PresenterNote> = {
  "kyc-processing": {
    problem: "Onboarding and periodic KYC refreshes queue behind manual document, registry, and screening checks.",
    ai: "Illustrative prototype, no live service: document extraction, entity resolution, and exception routing are proposed. Say Illustrative out loud.",
    cisco: "Proposed: AI Defense on document text and model hops; Splunk Agent Observability traces; Cisco AI infrastructure for the document models.",
    lifecycle: "Meet Chuck Robbins, Cisco’s Chair and CEO, in a hypothetical banking scenario. All screening and financial details are invented. KYC is an illustrative introduction, not a live handoff.",
  },
  "fraud-modeling": {
    problem: "Rules approve fraud that hides in a compromised merchant's network and flood analysts with false positives elsewhere. Chuck's clean card makes one purchase at Orbit Digital Goods; rules approve it.",
    ai: "GraphSAGE + XGBoost scores the account–merchant neighborhood, exact TreeSHAP explains it, and a triage agent gathers evidence and drafts a cited summary. The analyst decides; the score is evidence, not a verdict.",
    cisco: "AI Defense inspects the dispute note and the agent's prompt (try the injection scenario); Agent Control denies card actions without analyst approval; Splunk Agent Observability traces each run. The GNN runs on Sparky, an NVIDIA DGX Spark dev box; Cisco UCS / AI POD is the proposed production placement.",
    lifecycle: "Choose Escalate to investigations. The card is still blocked and reissued; Escalate to SAR hands the case to the SAR team. Only \"card compromised and reissued\" is shared with the advisor.",
  },
  "sar-support": {
    problem: "A SAR narrative takes an investigator hours, and quality varies by author. The referral links the compromised merchant to Kendall Reyes’s separate account. Transfers from other compromised cards arrived; the attempted transfer from Chuck’s card was declined. Chuck is the victim, not the subject.",
    ai: "An investigation agent assembles the case, deterministic typology rules flag indicators, and the agent drafts a FinCEN-style narrative where every sentence cites evidence. The investigator decides file or no SAR; a separate QA reviewer approves.",
    cisco: "AI Defense inspects untrusted memos and documents (the injected explanation letter) and every model hop. Agent Control enforces cited narratives, no tipping off, and approval before filing. A hosted model runs only with AI Defense forced to enforce. Splunk Agent Observability traces each live investigation. E-filing is simulated.",
    lifecycle: "Open the fraud referral from the inbox. Explain the change of subject: Kendall Reyes is investigated; Chuck is the hypothetical victim. The recorded investigation is a saved example, not recomputed from this referral.",
  },
  "client-advisory": {
    problem: "Advisors spend hours preparing each review across CRM notes, holdings, and research, and Reg BI care has to be documented.",
    ai: "Code rules compare profile and portfolio and size next-best actions in dollars; a meeting-prep Deep Agent drafts a one-page brief whose every statement is checked against evidence.",
    cisco: "AI Defense screens CRM notes for PII and injected instructions before any model call; a supervisor approves under advisory.recommendation; a hosted model runs only with AI Defense forced to enforce.",
    lifecycle: "The advisor sees only the customer-visible card replacement. The saved sample brief is written by code and is not recalculated from the current handoff; it cannot be approved. A live model-generated brief requires advisor and supervisor review.",
  },
  "market-research": {
    problem: "When an issuer reports, strategists must update the house view quickly, with every number sourced and restricted issuers respected.",
    ai: "A research Deep Agent with fundamentals, valuation, macro, and compliance subagents drafts a cited update; code verifies every claim before the strategist publishes.",
    cisco: "Agent Control checks the restricted list before any data pull and gates research.publish; AI Defense inspects news as tool results; Splunk Agent Observability traces the subagents.",
    lifecycle: "HCYN is a fictional investment in the sample portfolio, unrelated to Chuck’s public role at Cisco. Published research can inform a live review; replay uses saved context.",
  },
  "company-briefing": {
    problem: "Account teams need a defensible company profile before a meeting; filings are long, and facts get misquoted.",
    ai: "A Deep Agent navigates the filing table of contents, reads titled sections, and pulls XBRL facts. No open-web browsing.",
    cisco: "AI Defense inspects model hops and uploaded documents; Splunk Agent Observability traces each tool call. Nothing is stored until the presenter clicks Use this company.",
  },
  "brahe-bank": {
    problem: "Customers piece together card eligibility from product documents and separate score checks.",
    ai: "A supervisor routes the question to product and score specialists, then combines their evidence into one explanation.",
    cisco: "AI Defense inspects questions, model calls, and answers; Splunk Agent Observability traces the supervisor and specialists. OpenAI hosts inference today; private GPU inference is a deployment option.",
  },
  "transaction-llm": {
    problem: "Payment text arrives unstructured, so operations teams re-key purpose codes and counterparties by hand.",
    ai: "Proposed concept: batched extraction into structured fields, with only low-confidence exceptions reaching an agent.",
    cisco: "Proposed: Splunk spans on the extraction path and AI Defense on the exception hop only. Not connected in this demo.",
  },
  "interbank-a2a": {
    problem: "Settlement fails are chased by email and phone between banks, each re-keying the other's records.",
    ai: "Each bank's Deep Agent investigates its own records and asks the other bank's agent over A2A.",
    cisco: "Each bank's AI gateway inspects the A2A traffic with AI Defense, and an outbound control stops data that must not leave; Splunk Agent Observability traces both sides. Agents are read-only; named teams approve fixes.",
  },
};
