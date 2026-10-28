import { narrative as brahe_bank } from "../demos/brahe-bank/narrative.ts";
import { narrative as fraud_modeling } from "../demos/fraud-modeling/narrative.ts";
import { narrative as company_briefing } from "../demos/company-briefing/narrative.ts";
import { narrative as market_research } from "../demos/market-research/narrative.ts";
import { narrative as client_advisory } from "../demos/client-advisory/narrative.ts";
import { narrative as sar_support } from "../demos/sar-support/narrative.ts";
import { narrative as interbank_a2a } from "../demos/interbank-a2a/narrative.ts";
import { narrative as kyc_processing } from "../demos/kyc-processing/narrative.ts";
import { narrative as transaction_llm } from "../demos/transaction-llm/narrative.ts";
import { runtimeForUseCase } from "../config/use-cases";

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

const authoredNarratives: Partial<Record<string, DemoNarrative>> = {
  "brahe-bank": brahe_bank,
  "fraud-modeling": fraud_modeling,
  "company-briefing": company_briefing,
  "market-research": market_research,
  "client-advisory": client_advisory,
  "sar-support": sar_support,
  "interbank-a2a": interbank_a2a,
  "kyc-processing": kyc_processing,
  "transaction-llm": transaction_llm,
};

/** Deployment notes share the executable package boundary with the operator. */
export const demoNarratives: Partial<Record<string, DemoNarrative>> = Object.fromEntries(
  Object.entries(authoredNarratives).map(([id, narrative]) => {
    const runtime = runtimeForUseCase(id);
    if (!runtime || !narrative) return [id, narrative];
    let described = false;
    return [id, { ...narrative, sections: narrative.sections.map(section => {
      if (!section.option || described) return section;
      described = true;
      return { ...section, option: { ...section.option, text: `Operators can start and stop this workflow's container stack independently in Studio. ${section.option.text}` } };
    }) }];
  }),
);
