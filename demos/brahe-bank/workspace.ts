import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    liveExperience: "banking",
    transformation: {
      friction: "Customers navigate product documents and separate score checks to understand card eligibility.",
      aiShift: "A supervisor routes the question to product and score specialists, then combines evidence into an answer.",
      humanControl: "Customers review the explanation; actual applications and credit decisions remain outside this demo.",
    },
    architecture: {
      process: [
        { title: "Ask a banking question", detail: "Product, score, or eligibility request" },
        { title: "Gather product and score facts", detail: "Card terms + mock customer score" },
        { title: "Explain eligibility", detail: "Compare score with documented criteria" },
        { title: "Review next steps", detail: "Customer review; no application submitted" },
      ],
      ai: [
        { point: "01 → 02", label: "Supervisor routing", detail: "The LLM delegates product questions and score checks to specialist agents." },
        { point: "02 → 03", label: "Retrieval + context assembly", detail: "Product documents, score-tool results, and conversation history ground the explanation. Local search today; Pinecone vector retrieval when configured." },
        { point: "03 → 04", label: "Evidence-based response", detail: "The supervisor synthesizes facts and eligibility criteria. OpenAI hosts inference today; private GPU inference is a deployment option." },
      ],
    },
    metrics: [], rows: [], evidence: [], workbenchLabel: "Banking assistant",
    workbenchTitle: "Brahe Bank", workbenchSummary: "Product and eligibility guidance",
    primaryAction: "Open assistant",
  } satisfies UseCaseFrame;
