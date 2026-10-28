import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
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
  } satisfies DemoNarrative;
