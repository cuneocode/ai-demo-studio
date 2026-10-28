import type { DemoNarrative } from "../../app/demo-narratives.ts";

export const narrative = {
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
  } satisfies DemoNarrative;
