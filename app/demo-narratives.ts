/** Audience-facing stories. References describe control alignment, never certification.
 * Keep claims tied to the demo implementation; deployment options are explicit.
 */
export type ObligationReference = {
  title: string;
  kind: "Regulatory rules" | "Legislation" | "Security guidance" | "Supervisory guidance" | "Voluntary framework" | "Industry standard";
  jurisdiction: string;
  url: string;
  appliesTo: string;
  responsibility: string;
  production: string;
  reviewed: string;
};

export const obligationReferences = {
  "foundry-security": {
    title: "Cisco · Foundry Security Spec", kind: "Security guidance", jurisdiction: "Global",
    url: "https://github.com/CiscoDevNet/foundry-security-spec",
    appliesTo: "A seed framework for authorized AI-assisted security evaluation. The demo uses a scoped payments profile.",
    responsibility: "Require reviewable evidence, mechanically resolve citations, track coverage, and retain stable finding identities.",
    production: "Resolve the seed's deployment decisions for the target environment, including runtime sandboxing, durable scheduling, and operational acceptance criteria.",
    reviewed: "2026-10-20",
  },
  "consumer-duty": {
    title: "FCA Consumer Duty",
    kind: "Regulatory rules",
    jurisdiction: "UK",
    url: "https://www.fca.org.uk/firms/consumer-duty/about",
    appliesTo: "Firms and retail business within the scope of the UK Consumer Duty.",
    responsibility: "Support consumer understanding and provide effective customer support.",
    production: "Test customer understanding, accessibility and support outcomes, including the needs of vulnerable customers. Retain evidence of oversight and remediation.",
    reviewed: "2026-10-16",
  },
  "ai-transparency": {
    title: "EU AI Act · Article 50",
    kind: "Legislation",
    jurisdiction: "EU",
    url: "https://digital-strategy.ec.europa.eu/en/faqs/transparency-obligations-under-article-50-ai-act",
    appliesTo: "Providers of systems intended to interact directly with people, subject to the Act's scope and exceptions.",
    responsibility: "Ensure people are informed that they are interacting with AI, unless this is obvious in the circumstances.",
    production: "Validate the customer-facing disclosure at first interaction. Assess any real creditworthiness use separately against the Act's applicable requirements.",
    reviewed: "2026-10-16",
  },
  "prompt-injection": {
    title: "OWASP · Prompt injection",
    kind: "Security guidance",
    jurisdiction: "Global",
    url: "https://genai.owasp.org/llmrisk/llm01-prompt-injection/",
    appliesTo: "Applications using large language models. This is voluntary security guidance.",
    responsibility: "Reduce the risk that untrusted instructions redirect an assistant or expose sensitive information.",
    production: "Test direct and indirect attacks, restrict tool permissions, protect customer data and traces, and monitor bypasses as models and prompts change.",
    reviewed: "2026-10-16",
  },
  "finra-supervision": {
    title: "FINRA · Supervision of AI use", kind: "Regulatory rules", jurisdiction: "US",
    url: "https://www.finra.org/rules-guidance/notices/24-09",
    appliesTo: "FINRA member firms using AI in their securities business. Rule 3110 supervision depends on the firm's activities.",
    responsibility: "Maintain a supervisory system appropriate to the business, including the governance of AI used in that system.",
    production: "Define supervisory procedures, review responsibilities, record retention and escalation. Assess communications requirements for the intended audience.",
    reviewed: "2026-10-16",
  },
  "equity-research": {
    title: "FINRA 2241 · Equity research", kind: "Regulatory rules", jurisdiction: "US",
    url: "https://www.finra.org/rules-guidance/rulebooks/finra-rules/2241",
    appliesTo: "FINRA members producing or distributing equity research within the rule's definition and scope.",
    responsibility: "Manage research conflicts and apply relevant supervision and disclosure requirements.",
    production: "Determine whether the report qualifies as research. Establish analyst oversight, conflict controls, disclosures and distribution review before release.",
    reviewed: "2026-10-16",
  },
  "reg-bi": {
    title: "SEC · Regulation Best Interest", kind: "Regulatory rules", jurisdiction: "US",
    url: "https://www.sec.gov/resources-small-businesses/small-business-compliance-guides/regulation-best-interest",
    appliesTo: "Broker-dealers making covered recommendations to retail customers. Investment advisers have a separate fiduciary standard.",
    responsibility: "Act in the customer's best interest when making a recommendation, addressing care, disclosure, conflicts and compliance obligations.",
    production: "Validate the customer profile, evaluate risks and costs, consider alternatives, manage conflicts and document the responsible professional's assessment.",
    reviewed: "2026-10-16",
  },
  "reg-sp": {
    title: "SEC · Regulation S-P", kind: "Regulatory rules", jurisdiction: "US",
    url: "https://www.sec.gov/newsroom/press-releases/2024-58",
    appliesTo: "Covered broker-dealers, registered investment advisers, investment companies and transfer agents.",
    responsibility: "Safeguard customer information and maintain applicable incident-response and notification procedures.",
    production: "Apply access restrictions and retention rules across prompts, tools and traces. Establish incident response, service-provider oversight and required notifications.",
    reviewed: "2026-10-16",
  },
  "model-risk": {
    title: "Model risk · SR 26-2", kind: "Supervisory guidance", jurisdiction: "US",
    url: "https://www.federalreserve.gov/supervisionreg/srletters/SR2602a1.pdf",
    appliesTo: "Relevant banking organizations using covered statistical models. The guidance is most relevant above $30 billion in assets; generative and agentic AI are outside its scope.",
    responsibility: "Manage model risk in proportion to a model's use and impact, with appropriate validation, monitoring and governance.",
    production: "Independently validate the fraud model, monitor performance and drift, document limitations and govern changes. Assess the generative triage agent separately.",
    reviewed: "2026-10-16",
  },
  "pci-dss": {
    title: "PCI DSS · Payment data", kind: "Industry standard", jurisdiction: "Global",
    url: "https://www.pcisecuritystandards.org/standards/pci-dss/",
    appliesTo: "Entities storing, processing or transmitting payment account data, and systems that can affect its security, subject to payment-program scope.",
    responsibility: "Protect payment account data through appropriate technical and operational controls.",
    production: "Determine the cardholder-data environment, restrict access, protect stored and transmitted data, and assess compliance through the applicable validation process.",
    reviewed: "2026-10-16",
  },
  "nist-ai": {
    title: "NIST · AI Risk Management Framework", kind: "Voluntary framework", jurisdiction: "Global",
    url: "https://www.nist.gov/itl/ai-risk-management-framework",
    appliesTo: "Organizations developing or operating AI systems. Adoption is voluntary.",
    responsibility: "Govern AI use, understand its context, measure risks and manage them throughout the lifecycle.",
    production: "Assign accountable owners, evaluate quality and failure modes, monitor changes and retain evidence of risk decisions and remediation.",
    reviewed: "2026-10-16",
  },
  "sar-narrative": {
    title: "FinCEN · SAR narratives", kind: "Supervisory guidance", jurisdiction: "US",
    url: "https://www.fincen.gov/resources/statutes-regulations/guidance/sar-narrative-guidance-package",
    appliesTo: "Institutions preparing suspicious activity reports under the applicable BSA reporting rules.",
    responsibility: "Explain suspicious activity clearly, including the people, transactions, timing and reasons for suspicion.",
    production: "Apply the institution's filing criteria and deadlines, check narrative completeness and accuracy, and use an authorized filing process.",
    reviewed: "2026-10-16",
  },
  "sar-evidence": {
    title: "FinCEN · Supporting documentation", kind: "Regulatory rules", jurisdiction: "US",
    url: "https://www.fincen.gov/resources/statutes-regulations/guidance/suspicious-activity-report-supporting-documentation",
    appliesTo: "Financial institutions with SAR supporting-documentation obligations under the applicable BSA rules.",
    responsibility: "Retain supporting documentation and make it available to the appropriate authorities upon request.",
    production: "Implement the applicable retention period, secure access, evidence integrity and authorized retrieval procedures for reports and supporting material.",
    reviewed: "2026-10-16",
  },
  "customer-diligence": {
    title: "FinCEN · Customer due diligence", kind: "Regulatory rules", jurisdiction: "US",
    url: "https://www.fincen.gov/resources/statutes-and-regulations/cdd-final-rule",
    appliesTo: "Covered financial institutions, subject to the CDD rule, applicable exemptions and current exceptive relief.",
    responsibility: "Identify customers and relevant beneficial owners, understand relationship risk, and perform appropriate ongoing monitoring.",
    production: "Establish verified data sources, risk procedures, ongoing review and recordkeeping. Assess beneficial-ownership requirements and applicable exceptions for the relationship.",
    reviewed: "2026-10-16",
  },
  "dora": {
    title: "DORA · Operational resilience", kind: "Legislation", jurisdiction: "EU",
    url: "https://www.esma.europa.eu/esmas-activities/digital-finance-and-innovation/digital-operational-resilience-act-dora",
    appliesTo: "Financial entities and relevant ICT arrangements within DORA's scope.",
    responsibility: "Manage ICT risk, incidents, resilience testing and dependencies on ICT third parties.",
    production: "Maintain ICT inventories and third-party oversight, test recovery, classify incidents and meet applicable reporting requirements. Tracing contributes evidence within this wider program.",
    reviewed: "2026-10-16",
  },
  "agent-permissions": {
    title: "OWASP · Excessive agency", kind: "Security guidance", jurisdiction: "Global",
    url: "https://genai.owasp.org/llmrisk/llm062025-excessive-agency/",
    appliesTo: "LLM applications that can call tools or act through connected services. This is voluntary security guidance.",
    responsibility: "Limit an agent's functionality, permissions and autonomy to what the task needs.",
    production: "Enforce permissions in downstream systems, validate tool inputs and outputs, require approval for consequential actions, and test compromised-agent scenarios.",
    reviewed: "2026-10-16",
  },
  "mas-ai": {
    title: "MAS · AI risk management", kind: "Supervisory guidance", jurisdiction: "Singapore",
    url: "https://www.mas.gov.sg/regulation/guidelines/guidelines-on-artificial-intelligence-risk-management-for-financial-institutions",
    appliesTo: "Financial institutions under MAS supervision. Published 7 October 2026; effective 7 October 2027.",
    responsibility: "Manage AI risks proportionately to the institution's risk profile and the scale and nature of its AI use.",
    production: "Map the deployment to the guidelines, assign accountable owners and establish a proportionate assessment and monitoring program before the effective date.",
    reviewed: "2026-10-16",
  },
} satisfies Record<string, ObligationReference>;

export type DemoNarrative = {
  headline: string;
  planned?: boolean;
  sections: { title: string; paragraphs: string[]; option?: { label: string; text: string } }[];
  references: { id: keyof typeof obligationReferences; evidence: string }[];
};

export const demoNarratives: Partial<Record<string, DemoNarrative>> = {
  "brahe-bank": {
    headline: "Banking answers customers can trust",
    sections: [
      {
        title: "A clearer path to the right banking option",
        paragraphs: [
          "A customer wants to understand a bank's products and what their credit profile means for eligibility. A conversational assistant can make that information easier to navigate. For the teams operating it, every answer also carries a responsibility: keep guidance grounded, protect the interaction, and deliver a responsive service.",
        ],
      },
      {
        title: "Confidence in every interaction",
        paragraphs: [
          "Unsupported answers and malicious instructions can mislead customers or redirect an agent, while unnecessary model calls add delay and cost. Security and platform teams need to understand what happened, enforce boundaries, and find the cause when an interaction goes wrong.",
          "Brahe routes questions through a supervisor and specialist agents that retrieve product information or a mock credit score. Cisco AI Defense inspects model inputs and outputs. Agent Control checks banking scope, evidence grounding, and unsupported approval claims, helping operators maintain clear customer communication.",
          "Splunk Agent Observability provides execution tracing. Reported model calls, tool calls, handoffs, tokens, and latency give teams evidence to investigate behavior and identify waste. The run statistics show the evidence returned by each request; runtime details describe the configured integrations.",
        ],
        option: {
          label: "Deployment option · AI infrastructure",
          text: "Private model serving gives operators a choice over data placement and capacity. Token and latency measurements help compare serving options and assess cost against actual demand.",
        },
      },
      {
        title: "Oversight of customer guidance",
        paragraphs: [
          "The intended outcome is a service operators can investigate, tune, and govern, with clearer evidence for oversight and more control over compute use. Customers receive more dependable guidance and a clearer next step, helping the bank earn their trust over time.",
        ],
      },
    ],
    references: [
      { id: "consumer-duty", evidence: "Product-source retrieval and checks on evidence grounding and approval claims give operators ways to review the assistant's answers." },
      { id: "ai-transparency", evidence: "The workspace identifies the AI assistant and labels its fictional products and mock credit score." },
      { id: "prompt-injection", evidence: "AI Defense inspects model inputs and outputs. Application checks enforce banking scope and response grounding. Run evidence exposes reported blocks and errors." },
    ],
  },
  "fraud-modeling": {
    headline: "Analyst review of suspected card fraud",
    sections: [
      { title: "Help when a card is compromised", paragraphs: [
        "A cardholder needs the bank to recognize suspicious activity and help them recover with as little disruption as possible. Fraud analysts need enough context to decide what to do. The teams operating the service must balance detection quality, customer friction and the consequences of acting on a misleading alert.",
      ] },
      { title: "From a risk score to an accountable decision", paragraphs: [
        "A payment can look ordinary on its own while its merchant connections reveal a wider compromise. Excessive alerts consume analyst time; missed patterns leave customers exposed. An agent that acts too freely can compound the harm by recommending the wrong intervention.",
        "This workflow compares rules with a graph-based fraud model, then brings together network relationships, model explanations and a response playbook. A triage agent drafts a cited account of the evidence. The analyst owns the disposition, and Agent Control gates proposed card actions on approval.",
        "Cisco AI Defense screens untrusted dispute text and the agent prompt. Splunk Agent Observability traces the investigation, helping operators connect model and tool activity to the draft. This evidence supports review of how an alert was handled; model validation and ongoing performance monitoring remain part of the operating program.",
      ], option: { label: "Deployment option · AI infrastructure", text: "The graph workload and language model have different serving needs. Production sizing should measure their throughput, latency and cost separately; Cisco infrastructure is a proposed production placement." } },
      { title: "Managing card compromise with less disruption", paragraphs: [
        "The intended outcome is a fraud operation with clearer decisions, controlled interventions and evidence for investigating mistakes. Cardholders benefit from a response that addresses the suspected compromise while keeping their legitimate banking needs in view.",
      ] },
    ],
    references: [
      { id: "model-risk", evidence: "Rules-versus-model results, network context and model explanations support examination of the predictive fraud model. The triage language model requires a separate AI risk assessment." },
      { id: "pci-dss", evidence: "The synthetic card workflow illustrates where payment evidence reaches the model, tools and analyst. Production data-flow scoping and security validation are still required." },
      { id: "agent-permissions", evidence: "Proposed card actions pass through an approval gate, with the analyst retaining the disposition decision." },
    ],
  },
  "company-briefing": {
    headline: "Start the conversation with facts that hold up",
    sections: [
      { title: "Understand the company before the meeting", paragraphs: [
        "An account team wants to understand a customer's priorities before discussing how to help. Annual reports contain useful detail, spread across long sections and financial tables. For the teams operating an AI briefing service, the responsibility is to preserve the meaning and provenance of that information as it becomes a concise company profile.",
      ] },
      { title: "Keep the source connected to the summary", paragraphs: [
        "A misplaced metric or unsupported interpretation can send a conversation in the wrong direction. Uploaded material can also contain instructions intended to redirect the model. Operators need to know which document was read, which facts were used and how an answer was assembled.",
        "The briefing agent works from an EDGAR filing or an uploaded annual report. It navigates document sections and retrieves financial facts to assemble objectives, risks, obligations and AI initiatives. The user reviews the result before accepting it as the studio's company context.",
        "Cisco AI Defense inspects model interactions and uploaded content. Splunk Agent Observability traces the agent's tool activity, giving operators a way to examine the path from source to briefing. Source references and the acceptance step support accountable review. Extracted statements about a company's obligations still need assessment in their business and jurisdictional context.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Document size and repeated extraction affect capacity and cost. Private serving can be evaluated against data-handling needs and measured document-processing demand." } },
      { title: "Using the briefing in customer meetings", paragraphs: [
        "The intended outcome is a briefing process that operators can inspect and improve, with clear ownership of accepted company context. Account teams arrive better prepared, and the customer receives a conversation grounded in their stated priorities.",
      ] },
    ],
    references: [
      { id: "nist-ai", evidence: "Document provenance, tool activity and explicit acceptance of company context provide concrete points for quality assessment and accountable review." },
      { id: "prompt-injection", evidence: "Uploaded documents and model interactions are inspected by AI Defense. The source boundary is the selected filing or upload." },
      { id: "finra-supervision", evidence: "When a member firm uses a briefing in a covered securities workflow, source references and human acceptance can contribute to its review process. A general account-planning briefing has a different applicability assessment." },
    ],
  },
  "market-research": {
    headline: "A market view with evidence behind it",
    sections: [
      { title: "Understand what changed and why it matters", paragraphs: [
        "A research analyst needs to turn an earnings release and recent developments into a useful view of a company. Advisors and their clients depend on that judgment being well supported. For research and AI operations teams, speed comes with responsibilities for source integrity, reviewable conclusions and oversight of distributed research.",
      ] },
      { title: "Protect the evidence before forming the view", paragraphs: [
        "News can be incomplete, figures can refer to different periods, and a convincing article can contain malicious instructions. An unsupported Buy, Hold or Sell opinion can mislead downstream readers. Operators need to see which inputs were admitted and which facts support the conclusion.",
        "This workflow starts with a cached NVDA packet or retrieves current data for another ticker. It combines available earnings, recent news, financial metrics and peer comparisons. Every packet includes the same synthetic attack article. Cisco AI Defense screens article text before analysis; excluded content is withheld from the model's evidence.",
        "A structured assessment produces an outlook, recommendation, key drivers and risks. Code checks the drivers against source fields and quotations. The recommendation is withheld when too few facts pass verification. Agent Control checks issuer restrictions, while reported calls, tokens and inspection results help operators investigate the run.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Cached inputs and bounded assessment attempts make the workload easier to measure. Serving choices should be compared using actual refresh demand, latency and token use." } },
      { title: "Research for advisor discussions", paragraphs: [
        "The intended outcome is a research process with traceable inputs and explicit limits on unsupported conclusions. Analysts can assess the evidence behind the view, and advisors can give clients a clearer explanation of the developments and risks that matter.",
      ] },
    ],
    references: [
      { id: "finra-supervision", evidence: "Visible source inputs, screening results and verified supporting facts give a supervising research team material to review alongside the recommendation." },
      { id: "equity-research", evidence: "The report contains a company-specific Buy, Hold or Sell opinion and cited drivers. Its intended distribution determines the research-rule assessment; conflict disclosures and distribution approvals require production processes." },
      { id: "prompt-injection", evidence: "The synthetic poisoned article is screened with other inputs. Only admitted evidence reaches analysis, and the UI exposes the screening result." },
    ],
  },
  "client-advisory": {
    headline: "Preparation for client investment reviews",
    sections: [
      { title: "Bring the client's circumstances into the meeting", paragraphs: [
        "A client expects their advisor to understand their goals, investments and recent service experiences. Preparing that conversation requires joining portfolio information, CRM notes and research. The teams operating an AI preparation service must protect that context and preserve the advisor's responsibility for the advice that follows.",
      ] },
      { title: "Make the preparation useful and reviewable", paragraphs: [
        "Sensitive details can spread into prompts and traces. Incomplete notes can produce an unsuitable suggestion, and injected instructions can distort the brief. A polished summary can obscure these problems unless operators can trace its statements and control its approval.",
        "This demo uses synthetic households. Code compares the profile with holdings, identifies concerns and sizes candidate actions. A meeting-prep agent gathers the available evidence and drafts a brief. Statements are checked against that evidence, and unsuitable actions are excluded from the ranked recommendations.",
        "Cisco AI Defense screens CRM notes before model use. The advisor reviews the draft, followed by supervisor approval through the advisory recommendation policies. Execution evidence and reported usage help operators examine the preparation process. Client context and review rationale contribute to the care assessment that a responsible professional must complete.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Private serving is an option for sensitive advisory workloads. Its value depends on access controls, data handling and measured capacity needs across the full preparation process." } },
      { title: "Supporting the advisor's client review", paragraphs: [
        "The intended outcome is a preparation service with controlled inputs, inspectable drafts and explicit approval ownership. Advisors can spend more of the meeting discussing the client's priorities, with a clearer basis for the next steps they recommend.",
      ] },
    ],
    references: [
      { id: "reg-bi", evidence: "Synthetic client profiles, portfolio findings, candidate actions and advisor-plus-supervisor review illustrate evidence that can inform a recommendation's care assessment." },
      { id: "reg-sp", evidence: "CRM screening and withholding or masking sensitive note content demonstrate one boundary for protecting information before model use. Production protection must cover storage, access and traces too." },
      { id: "mas-ai", evidence: "Input screening, evidence checking and named review stages provide examples for a proportionate AI risk assessment in a Singapore deployment." },
    ],
  },
  "sar-support": {
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
  },
  "interbank-a2a": {
    headline: "Resolve the mismatch across bank boundaries",
    sections: [
      { title: "Give the client a clear path to settlement", paragraphs: [
        "A client expects a transaction to settle as agreed. When the banks' records disagree, operations teams must establish the cause and coordinate a correction. The teams running agent services need that collaboration to respect each bank's data boundary and preserve ownership of consequential changes.",
      ] },
      { title: "Coordinate the investigation with controlled access", paragraphs: [
        "Email exchanges and repeated record checks slow the investigation. Connecting agents introduces another risk: a peer's message can carry malicious instructions or request information beyond its authority. Operators need to see what crossed the boundary, what was blocked and which records informed the conclusion.",
        "Each fictional bank's Deep Agent investigates its own records and communicates with the other over A2A. AI gateways inspect the exchanged messages with Cisco AI Defense. Outbound controls constrain what an agent can send, and the agents' tools provide read-only access to their bank's records.",
        "The workflow produces a joint report with the proposed correction and the teams responsible for approval. Gateway verdicts, query activity and agent traces provide evidence for investigating failures across the two services. This visibility contributes to operational resilience oversight and helps operators understand the dependencies involved in a settlement investigation.",
      ], option: { label: "Deployment option · AI infrastructure", text: "Each bank can assess model placement and serving capacity within its own operating environment. Gateway and inference latency should be measured together when sizing the cross-bank workflow." } },
      { title: "Resolving the settlement mismatch", paragraphs: [
        "The intended outcome is an investigation both banks can follow, with controlled information exchange and human ownership of corrections. Operations teams gain a shared account of the mismatch, helping them give the client a clearer explanation and path toward settlement.",
      ] },
    ],
    references: [
      { id: "dora", evidence: "Separate bank services, gateway verdicts and agent activity expose dependencies and investigation evidence. Recovery testing, incident reporting and third-party governance remain production responsibilities." },
      { id: "agent-permissions", evidence: "Read-only investigation tools and outbound controls constrain agent authority. The report assigns corrective actions to human teams." },
      { id: "mas-ai", evidence: "Distinct bank boundaries, controlled communication and reviewable investigation outputs provide concrete inputs to an institution's AI risk assessment." },
    ],
  },
  "kyc-processing": {
    headline: "A clearer route through customer onboarding",
    planned: true,
    sections: [
      { title: "Open the relationship with less uncertainty", paragraphs: [
        "A customer wants to open an account or complete a periodic review without repeated requests for the same information. Onboarding teams need to establish who they are dealing with and resolve exceptions. The operators of an AI-assisted process would need to protect identity documents and make every review decision accountable.",
      ] },
      { title: "Build around evidence and exceptions", paragraphs: [
        "Documents can be incomplete, names can differ across sources and ownership structures can be difficult to reconcile. Incorrect matches can delay a legitimate customer or leave a material risk unresolved. Automated processing would need explicit handling for uncertainty, failed checks and requests for additional evidence.",
        "The current demo is an illustrative queue and review workspace. The planned workflow would extract document fields, compare identities and entities with authorized sources, and route discrepancies to an analyst. Source evidence, confidence and review history would remain available beside each proposed finding.",
        "The proposed Cisco architecture places AI Defense around untrusted document text and model interactions, with Splunk Agent Observability tracing extraction and exception handling. Access controls and approval boundaries would preserve analyst ownership. These capabilities would support the evidence collection and review needed for customer due diligence.",
      ], option: { label: "Planned capability · AI infrastructure", text: "Document processing would be sized for onboarding volume, peak demand and sensitive-data handling. Private model serving and retention policies would be evaluated as part of the deployment design." } },
      { title: "Reviewing onboarding evidence and exceptions", paragraphs: [
        "The intended outcome is an onboarding operation that can explain its checks, prioritize exceptions and reduce avoidable rework. Customers would receive clearer requests and a more predictable path through the review, with their identity information handled carefully.",
      ] },
    ],
    references: [
      { id: "customer-diligence", evidence: "The illustrative queue highlights missing documents, identity discrepancies and beneficial-ownership review. Verified identity checks and institutional CDD procedures are planned work." },
      { id: "nist-ai", evidence: "The proposed workflow identifies evidence, uncertainty and human review as design requirements. Evaluation, monitoring and operational controls remain to be implemented." },
    ],
  },
  "transaction-llm": {
    headline: "Turn payment text into useful context",
    planned: true,
    sections: [
      { title: "Understand a payment without chasing its meaning", paragraphs: [
        "A customer asking about a payment expects the bank to understand who was paid and what the transaction represents. Operations teams often start with inconsistent descriptions and incomplete counterparty information. An AI enrichment service would need to make that information useful while preserving the original record and the limits of each interpretation.",
      ] },
      { title: "Reviewing uncertain payment details", paragraphs: [
        "Manual re-keying slows investigations and introduces inconsistent labels. At scale, a mistaken entity match can spread into downstream reporting or monitoring. Operators would need to distinguish extracted facts from inferred classifications and identify which records require review.",
        "The current demo is an illustrative workspace. The proposed workflow would batch transaction descriptions into structured fields, retain their source records and route low-confidence exceptions for agent-assisted review. Human reviewers would own corrections before the enriched context is relied on downstream.",
        "The proposed architecture uses Splunk Agent Observability to trace extraction and exception handling, with AI Defense inspecting untrusted text at the exception agent boundary. Where the output feeds AML monitoring, its provenance and quality would form part of the institution's broader monitoring controls. The enrichment service would have a defined responsibility for data quality and reliable delivery.",
      ], option: { label: "Planned capability · AI infrastructure", text: "Batch serving and selective agent use would be evaluated for throughput and cost. Capacity planning would measure volume, exception rates and latency before selecting a production serving arrangement." } },
      { title: "Using structured payment records in customer support", paragraphs: [
        "The intended outcome is a payment operation with more consistent context and a review path for uncertain records. Teams could spend less time reconstructing basic facts and give customers clearer answers about their transactions.",
      ] },
    ],
    references: [
      { id: "customer-diligence", evidence: "If used for AML monitoring, planned transaction enrichment could support understanding activity and investigating exceptions. The current workspace is illustrative; monitoring coverage and effectiveness require separate implementation." },
      { id: "dora", evidence: "The planned extraction and exception stages identify service dependencies that would need monitoring, failure handling and recovery testing in a covered EU deployment." },
      { id: "nist-ai", evidence: "Source preservation, uncertain classifications and human correction are proposed design controls. Their quality and effectiveness remain to be evaluated." },
    ],
  },
};
