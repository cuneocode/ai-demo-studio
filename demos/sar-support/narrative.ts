import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
    headline: "Evidence for suspicious activity investigations",
    sections: [
      { title: "Understand the activity before deciding what it means", paragraphs: [
        "An investigator needs to determine whether an account's activity warrants a suspicious activity report. Customers depend on the bank handling that work accurately and discreetly. The teams operating an AI investigation service must protect case information and preserve the distinction between evidence, indicators and the investigator's judgment.",
      ] },
      { title: "Keep every conclusion connected to the case", paragraphs: [
        "Case material spans transactions, customer records, counterparties and documents. Missing context can produce an incomplete narrative; an injected explanation letter can try to redirect the investigation. Unsupported allegations and uncontrolled disclosure create consequences for both the institution and the people involved.",
        "The investigation agent assembles a synthetic case, applies deterministic typology rules and drafts a cited narrative. Verification checks connect statements to evidence. The investigator decides whether to file, and a separate QA review precedes the simulated filing step.",
        "Cisco AI Defense screens untrusted case material and model interactions. Agent Control enforces narrative and approval policies, including controls against tipping off. Splunk Agent Observability traces live investigations so operators can inspect tool use, screening and execution. These records support the work of producing a clear account and retaining its supporting evidence.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Sensitive case workloads require deliberate choices about model placement, access and retention. Private serving can be assessed alongside measured case volume and investigation latency." } },
      { title: "Reviewing the case and its supporting evidence", paragraphs: [
        "The intended outcome is a more consistent investigation process with traceable statements and accountable human decisions. Investigators spend more attention on the substance of the case, while customers benefit from careful handling of their information and activity.",
      ] },
    ],
    references: [
      { id: "sar-narrative", evidence: "Cited narrative drafting, verification, investigator disposition and separate QA review support the preparation of a clear report. E-filing in this demo is simulated." },
      { id: "sar-evidence", evidence: "Case evidence and narrative citations demonstrate how supporting material can remain connected to a report. Production retention and authorized retrieval require an institutional records process." },
      { id: "prompt-injection", evidence: "Untrusted explanation letters and other case text are screened before agent use, and model interactions pass through AI Defense." },
    ],
  } satisfies DemoNarrative;
