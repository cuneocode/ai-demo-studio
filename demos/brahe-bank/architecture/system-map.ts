import { box, chip, defenseInterior, observeInterior, type ZoomMap } from "../../../app/map/system-map.ts";

export const brahe: ZoomMap = {
    implemented: true,
    note: "Live path: AI Defense inspects the question and the answer. The application judge stays in the workload and only produces a boolean. Agent Control enforces brahe-banking-scope.",
    cores: [
      box("workload", "Bank workload", "FastAPI and LangGraph", "The chat API, supervisor, specialists, tools, and application judges live here."),
      box("model", "Hosted model", "OpenAI today", "ProtectedChatOpenAI calls the configured hosted model. No NVIDIA NIM is on this path.", "ai"),
      box("defense", "Cisco AI Defense", "Inspect question and answer", "Guardrail models live in this platform. Filing-style tools and the mock score are not sent here.", "cisco"),
      box("observe", "Splunk Agent Observability", "Traces and Agent Control", "Control models enforce scope and answer checks. Export is only when configured.", "cisco"),
    ],
    coreEdges: [
      { from: "workload", to: "model", label: "infer" },
      { from: "workload", to: "defense", label: "inspect", kind: "control" },
      { from: "model", to: "defense", label: "inspect hop", kind: "control" },
      { from: "workload", to: "observe", label: "trace", kind: "telemetry" },
    ],
    interiors: {
      workload: {
        title: "Bank workload",
        note: "The application judge stays in the workload. It does not live inside AI Defense.",
        entities: [
          box("api", "FastAPI /chat", "Session and timeout", "POST /api/banking/chat validates the question, locks the session, and times out at 100s.", "service", {
            chips: [chip("state", "InMemorySaver", "Checkpoints lost on restart")],
          }),
          box("judge", "Application judges", "Booleans only", "A hosted judge returns in_scope, then later checks evidence and no-approval claims. Enforcement is Agent Control, step brahe-banking-scope.", "ai", {
            chips: [
              chip("scope", "Scope judge", "in_scope boolean"),
              chip("quality", "Answer judge", "Grounding and no approval"),
            ],
          }),
          box("supervisor", "Bank supervisor", "Route and explain", "LangGraph routes to the card specialist and the score specialist. There is no approval engine.", "ai", {
            chips: [
              chip("cards", "Card specialist", "Product questions"),
              chip("score", "Score specialist", "Mock score questions"),
            ],
          }),
          box("tools", "Workload tools", "Evidence for the answer", "Product retrieval is local Markdown, or Pinecone when configured. The score tool returns fictional 550.", "store", {
            chips: [
              chip("docs", "Product retrieval", "Local Markdown or Pinecone"),
              chip("mock", "Mock score", "Returns 550"),
            ],
          }),
        ],
        edges: [
          { from: "api", to: "judge", label: "question" },
          { from: "judge", to: "supervisor", label: "in scope", kind: "control" },
          { from: "supervisor", to: "tools", label: "delegate" },
        ],
        stubs: [
          box("defense", "Cisco AI Defense", "Inspect", "Question, model hop, and answer.", "cisco", { from: "api" }),
          box("model", "Hosted model", "Infer", "OpenAI through ProtectedChatOpenAI.", "ai", { from: "supervisor" }),
          box("observe", "Agent Observability", "Enforce and trace", "brahe-banking-scope and answer checks.", "cisco", { from: "judge" }),
        ],
      },
      model: {
        title: "Hosted model",
        note: "This is the inference endpoint. Guardrail models are not inside it.",
        entities: [
          box("chat", "ProtectedChatOpenAI", "Every model hop", "Inspects the model-bound prompt and the completion before tools continue.", "ai"),
          box("openai", "OpenAI hosted model", "Configured MODEL_NAME", "No NVIDIA NIM and no UCS GPU are on the running Brahe path.", "ai"),
        ],
        edges: [{ from: "chat", to: "openai", label: "model call" }],
        stubs: [box("defense", "Cisco AI Defense", "Inspect hop", "The hop is inspected. The model does not contain the guardrails.")],
      },
      defense: defenseInterior("the question, the model hop, and the answer", "Product documents and the mock score never enter Inspection."),
      observe: observeInterior("Galileo SDK callbacks on the bank request, plus Agent Control verdicts.", true),
    },
  };
