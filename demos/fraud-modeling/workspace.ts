import type { UseCaseFrame } from "../../app/studio/frames.ts";

export const workspace = {
    liveExperience: "fraud",
    transformation: {
      friction: "Each payment is scored in isolation, so a clean customer at a compromised merchant looks safe.",
      aiShift: "GraphSAGE + XGBoost scores each payment from the account–merchant neighborhood and exact XGBoost TreeSHAP explains it; a triage agent gathers the evidence and drafts the disposition. The score path never enters an LLM or Cisco AI Defense.",
      humanControl: "The score is not a fraud flag. The agent can only propose card actions; the analyst decides, and fraud.take_action denies irreversible actions without that approval.",
    },
    architecture: {
      process: [
        { title: "Score the queue", detail: "Rules engine and graph model side by side" },
        { title: "Investigate the alert", detail: "Neighborhood, TreeSHAP reasons, playbook" },
        { title: "Draft and check", detail: "Cited summary · AI Defense on untrusted text" },
        { title: "Decide disposition", detail: "Contact · block and reissue · false positive · escalate" },
      ],
      ai: [
        { point: "01 → 02", label: "GraphSAGE + XGBoost + TreeSHAP", detail: "The live HTTP sidecar embeds the point-in-time TabFormer neighborhood, classifies with XGBoost, and returns exact TreeSHAP contributions in log-odds. This hop never calls an LLM or AI Defense." },
        { point: "02 → 03", label: "Fraud triage agent", detail: "A Deep Agent on the Studio model chain calls score, rules, neighborhood, explain, similar cases, and playbook tools, then drafts a summary where every point cites tool evidence. Scripted (no model) when no model is reachable." },
        { point: "03 → 04", label: "Policy-gated decision", detail: "AI Defense inspects the dispute note, the agent's prompt and summary, and case notes. Agent Control fraud.take_action and fraud.note_pii gate card actions and notes; the analyst approves." },
      ],
    },
    metrics: [], rows: [], evidence: [],
    workbenchLabel: "Card fraud triage",
    workbenchTitle: "Alert queue triage",
    workbenchSummary: "Score the alert queue with rules and a graph model, investigate with a triage agent, and decide under policy.",
    primaryAction: "Triage queue",
  } satisfies UseCaseFrame;
