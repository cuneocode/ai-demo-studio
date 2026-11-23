import { box, chip, defenseInterior, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const fraud: ZoomMap = {
  sourcesFor(occurrence) {
  if (occurrence === "score" || occurrence.endsWith(".api") || occurrence.endsWith(".route")) {
      return { sourceRefIds: ["fraud.score"], sources: [{ id: "fraud.score", label: "Score implementation", facet: "Call" }] };
  }
  if (occurrence === "defense" || occurrence.startsWith("defense.")) {
      return { sourceRefIds: ["fraud.narrative"], sources: [{ id: "fraud.narrative", label: "Narrative protection", facet: "Call" }] };
  }
  return {};
  },
  summary: "GraphSAGE and XGBoost score first. The triage agent uses the score and evidence to support the analyst's disposition.",
  layout: { order: ["graph", "score", "model"] },
    implemented: true,
    note: "The score path is GraphSAGE, XGBoost, and exact TreeSHAP. It does not enter AI Defense and it does not call an LLM. Defense inspects the dispute note, the triage agent's prompt and summary, and case notes; Agent Control gates card actions.",
    cores: [
      box("score", "Triage service", "FastAPI /runs", "Scores the alert queue, runs the triage agent with tools, and waits for the analyst disposition."),
      box("graph", "Graph model", "Live → recorded → sample", "The HTTP sidecar runs on Sparky, an NVIDIA DGX Spark dev box, when it is up; otherwise recorded Sparky scores, otherwise sample scores, each labelled. Cisco UCS / AI POD is the proposed production host.", "ai"),
      box("model", "Studio model chain", "Sparky vLLM → OpenAI API", "The triage agent's model: the first healthy backend. Scripted, with no model, when none answers. The score never uses it.", "ai"),
      box("defense", "Cisco AI Defense", "Untrusted text and summary", "Inspects the cardholder dispute note, the agent prompt and summary, and case notes. The score path does not arrow here.", "cisco"),
      box("observe", "Splunk Agent Observability", "Agent trace", "One trace per triage run with tool spans. OTLP export only when configured.", "cisco", { optional: true }),
    ],
    coreEdges: [
      { from: "score", to: "graph", label: "score the queue" },
      { from: "score", to: "model", label: "agent turns" },
      { from: "score", to: "defense", label: "inspect agent text", kind: "control" },
      { from: "score", to: "observe", label: "agent trace", kind: "telemetry" },
    ],
    interiors: {
      score: {
        title: "Triage service",
        note: "A triage run never starts training. Every score carries its source: live, recorded, or sample.",
        entities: [
          box("api", "FastAPI /runs", "Scenario in, case file out", "The workbench starts a run for a scenario. Events stream to the timeline.", "service"),
          box("route", "Scorer chain", "live → recorded → sample", "Live sidecar, else recorded Sparky scores, else sample scores, labelled.", "service"),
          box("band", "Rules vs graph", "Evidence, not a verdict", "The rules engine and the graph risk band side by side. A person owns the outcome.", "human", {
            chips: [
              chip("narrative", "Fraud triage agent", "Deep Agent · tools", "Investigates with score, rules, neighborhood, explain, and playbook tools; drafts a cited summary. Scripted when no model is reachable.", "ai"),
              chip("policy", "Agent Control", "fraud.take_action", "Irreversible card actions are denied until the analyst approves. fraud.note_pii blocks a full card number or SSN in notes.", "cisco"),
            ],
          }),
        ],
        edges: [
          { from: "api", to: "route", label: "queue" },
          { from: "route", to: "band", label: "probability + reasons" },
        ],
        stubs: [
          box("graph", "Graph model", "Score", "No LLM on this hop.", "ai", { from: "route" }),
          box("defense", "Cisco AI Defense", "Agent text only", "Not on the score path.", "cisco", { from: "band" }),
        ],
      },
      graph: {
        title: "Graph model",
        note: "Training is offline on Sparky. A triage run never starts training.",
        entities: [
          box("train", "Offline training", "Sparky · NVIDIA image", "GraphSAGE embeddings and the XGBoost classifier are trained on TabFormer ahead of time. Not part of a triage run.", "ai"),
          box("client", "Score client", "POST :8000/score", "Sends src, dst, and the edge feature vector to the sidecar on Sparky.", "service"),
          box("gnn", "GraphSAGE + XGBoost", "No LLM", "Point-in-time neighborhood embedding, then the classifier. This hop does not call an LLM.", "ai"),
          box("shap", "XGBoost TreeSHAP", "Exact · log-odds", "Contributions grouped into plain-English reasons. The score releases with no LLM.", "ai"),
        ],
        edges: [
          { from: "train", to: "gnn", label: "model files" },
          { from: "client", to: "gnn", label: "features" },
          { from: "gnn", to: "shap", label: "no LLM" },
        ],
        stubs: [],
      },
      model: {
        title: "Studio model chain",
        note: "The triage agent's model only. The score path never calls it.",
        entities: [box("chain", "First healthy backend", "Triage Deep Agent", "Sparky vLLM (NVIDIA DGX Spark dev box) when it is up, otherwise the OpenAI API. The summary names the model that answered; with no model, the investigation is scripted and labelled.", "ai")],
        edges: [],
        stubs: [box("defense", "Cisco AI Defense", "Inspect prompt", "The agent prompt is inspected before it leaves for a hosted model, and the summary before the analyst sees it.")],
      },
      defense: defenseInterior("the dispute note, the agent prompt and summary, and case notes", "The GNN and XGBoost score never enter Inspection."),
      observe: observeInterior("The triage agent trace with tool spans. OTLP export only when configured.", ["fraud.take_action", "fraud.note_pii"]),
    },
  };
