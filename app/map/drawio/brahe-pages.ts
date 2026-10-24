import type { DiagramCell, DiagramPage } from "./model.ts";

const cell = (id: string, label: string, sceneId: string, instanceId: string, x: number, y: number, width = 190, height = 94, extra: Partial<DiagramCell> = {}): DiagramCell =>
  ({ id, label, sceneId, instanceId, x, y, width, height, ...extra });

function controlPage(answer: boolean): DiagramPage {
  const inspection = answer ? "brahe.inspect-response" : "brahe.inspect-request";
  const control = answer ? "brahe.answer-control" : "brahe.scope-control";
  const id = answer ? "return" : "check";
  return {
    aliases: answer ? { input: { scopeId: "system", cellId: "build" }, allow: { scopeId: "journey", cellId: "review" }, defense: { scopeId: "system", cellId: "defense" } }
      : { input: { scopeId: "journey", cellId: "ask" }, allow: { scopeId: "system", cellId: "build" }, defense: { scopeId: "system", cellId: "defense" } },
    id, title: answer ? "Check and return" : "Check the question", level: 2, parentId: "system", layers: ["security"],
    purpose: answer ? "Inspect the answer, evaluate its quality, and apply the control decision before release." : "Inspect the question, evaluate its scope, and apply the control decision before agents run.",
    flow: [["input", "inspect", "judge", "control", "decision", "allow"], ["", "", "", "", "stop"]],
    groups: [
      { id: "evaluation", label: "Banking service · evaluation" },
      { id: "hosted", label: "Hosted policy service" },
      { id: "enforcement", label: "Banking service · enforcement" },
    ],
    cells: [
      cell("input", answer ? "Finished answer" : "Customer question", inspection, "incoming", 25, 130, 160, 94),
      cell("inspect", answer ? "Inspect answer" : "Inspect question", inspection, "evaluation", 265, 130, 190, 94, { caption: "Application calls AI Defense" }),
      cell("judge", answer ? "Evaluate quality" : "Evaluate scope", control, "evaluation", 520, 130, 190, 94, { caption: "Application LLM judge" }),
      cell("control", "Agent Control", control, "service", 810, 130, 190, 94, { caption: "Apply configured policy" }),
      cell("decision", "Apply decision", control, "decision", 520, 340, 190, 94, { caption: "Application enforces verdict" }),
      cell("allow", answer ? "Return guidance" : "Run supervisor", control, "permit", 265, 340, 190, 94, { caption: "Allowed", targetPageId: answer ? "journey" : "build" }),
      cell("stop", answer ? "Withhold answer" : "Stop turn", control, "block", 810, 340, 190, 94, { caption: "Denied or unavailable" }),
      cell("defense", "Cisco AI Defense", inspection, "service", 25, 340, 160, 94, { caption: "Inspection API", layer: "security" }),
    ].map(item => ({ ...item, boundaryId: ["inspect", "judge"].includes(item.id) ? "evaluation" : item.id === "control" ? "hosted" : ["decision", "stop"].includes(item.id) ? "enforcement" : undefined })),
    edges: [
      { id: `${id}.input`, from: "input", to: "inspect", label: answer ? "Answer" : "Question", relationshipIds: [answer ? "req-inspect-out" : "req-inspect-in"] },
      { id: `${id}.inspected`, from: "inspect", to: "judge", label: "Allowed", relationshipIds: [answer ? "ret-inspect-out" : "ret-inspect-in"], kind: "return" },
      { id: `${id}.evaluate`, from: "judge", to: "control", label: "Verdict", relationshipIds: [answer ? "ctrl-answer" : "ctrl-scope"], kind: "control" },
      { id: `${id}.enforce`, from: "control", to: "decision", label: "Allow / deny", relationshipIds: [answer ? "ctrl-answer" : "ctrl-scope"], kind: "control", exit: [.5, 1], entry: [.5, 0], via: [[905, 290], [615, 290]] },
      { id: `${id}.allow`, from: "decision", to: "allow", label: "Allow", relationshipIds: ["ctrl-permit"], kind: "return", exit: [0, .5], entry: [1, .5] },
      { id: `${id}.deny`, from: "decision", to: "stop", label: "Deny", relationshipIds: ["ctrl-block"], kind: "control" },
      { id: `${id}.inspect-stop`, from: "inspect", to: "stop", label: "Inspection denied / unavailable", relationshipIds: ["ctrl-block"], kind: "control", exit: [.8, 1], entry: [.5, 1], via: [[417, 270], [480, 270], [480, 510], [905, 510]] },
      { id: `${id}.inspection`, from: "inspect", to: "defense", label: "Inspect / verdict", relationshipIds: [answer ? "req-inspect-out" : "req-inspect-in", answer ? "ret-inspect-out" : "ret-inspect-in"], layer: "security", kind: "control", exit: [.2, 1], entry: [.5, 0], via: [[303, 275], [105, 275]], bidirectional: true },
    ],
    note: "Inspection follows AI Defense mode and fail-open settings. Agent Control errors stop the turn.",
  };
}

export const braheDiagramPages: DiagramPage[] = [
  {
    id: "journey", title: "Business journey", level: 0, layers: [],
    flow: [["ask", "assistant", "review"]],
    purpose: "A customer asks about cards or a demo score, then reviews guidance grounded in retrieved facts.",
    cells: [
      cell("ask", "Ask about card options", "brahe.journey", "ask", 30, 100, 240, 120, { caption: "Customer question" }),
      cell("assistant", "Bank assistant", "brahe.journey", "prepare", 400, 100, 260, 120, { caption: "Retrieve facts and explain options", targetPageId: "system" }),
      cell("review", "Review next steps", "brahe.journey", "review", 790, 100, 240, 120, { caption: "Customer owns the decision" }),
    ],
    edges: [
      { id: "journey.question", from: "ask", to: "assistant", label: "Question", relationshipIds: ["biz-ask-prepare"] },
      { id: "journey.guidance", from: "assistant", to: "review", label: "Guidance", relationshipIds: ["biz-prepare-review"], kind: "return" },
    ],
    note: "Product documents and a fictional score of 550 support the guidance. The demo submits no application.",
  },
  {
    aliases: { question: { scopeId: "journey", cellId: "ask" }, guidance: { scopeId: "journey", cellId: "review" } },
    id: "system", title: "System architecture", level: 1, parentId: "journey", layers: ["security", "observability", "deployment"],
    flow: [["question", "check", "build", "release", "guidance"]],
    purpose: "The banking service owns inspection, agent execution, and release. Open a stage to see its components.",
    groups: [{ id: "banking", label: "Banking container · FastAPI + LangGraph" }],
    cells: [
      cell("question", "Question", "brahe.prepare", "question", 5, 235, 130, 85),
      cell("check", "Check question", "brahe.prepare", "check", 205, 235, 190, 85, { targetPageId: "check" }),
      cell("build", "Build explanation", "brahe.prepare", "build", 440, 235, 190, 85, { targetPageId: "build" }),
      cell("release", "Check and return", "brahe.prepare", "return-stage", 675, 235, 190, 85, { targetPageId: "return" }),
      cell("guidance", "Guidance", "brahe.prepare", "guidance", 930, 235, 130, 85),
      cell("defense", "Cisco AI Defense", "brahe.defense", "service", 335, 10, 380, 75, { caption: "Question, model I/O, and answer inspection", layer: "security" }),
      cell("trace", "Splunk Agent Observability", "brahe.observe", "tracing", 205, 420, 310, 85, { caption: "Galileo SDK · configured stream", layer: "observability" }),
      cell("model", "Configured model endpoint", "brahe.hosting", "endpoint", 565, 420, 310, 85, { caption: "Studio model routing", layer: "deployment", modes: ["implemented"] }),
      cell("private", "Proposed private inference", "brahe.hosting-proposed", "endpoint", 565, 420, 310, 85, { caption: "Cisco deployment option", layer: "deployment", modes: ["proposed"] }),
    ].map(item => ({ ...item, boundaryId: ["check", "build", "release"].includes(item.id) ? "banking" : undefined })),
    edges: [
      { id: "system.input", from: "question", to: "check", label: "Request", relationshipIds: ["biz-ask-prepare"] },
      { id: "system.checked", from: "check", to: "build", label: "Allow", relationshipIds: ["ctrl-scope"], kind: "control" },
      { id: "system.draft", from: "build", to: "release", label: "Draft", relationshipIds: ["run-draft"] },
      { id: "system.answer", from: "release", to: "guidance", label: "Allow", relationshipIds: ["ctrl-answer"], kind: "return" },
      { id: "system.inspect-input", from: "defense", to: "check", label: "Inspect / verdict", relationshipIds: ["req-inspect-in", "ret-inspect-in"], layer: "security", kind: "control", exit: [.2, 1], entry: [.5, 0], via: [[411, 115], [145, 115], [145, 205], [300, 205]], bidirectional: true },
      { id: "system.inspect-output", from: "defense", to: "release", label: "Inspect / verdict", relationshipIds: ["req-inspect-out", "ret-inspect-out"], layer: "security", kind: "control", exit: [.8, 1], entry: [.5, 0], via: [[639, 115], [770, 115]], bidirectional: true },
      { id: "system.spans", from: "build", to: "trace", label: "Spans", relationshipIds: ["tel-trace", "tel-export"], layer: "observability", kind: "telemetry", exit: [.3, 1], entry: [.5, 0], via: [[497, 390], [360, 390]] },
      ...(["implemented", "proposed"] as const).map((mode) => ({ id: `system.model.${mode}`, from: "build", to: mode === "implemented" ? "model" : "private", label: mode === "implemented" ? "Model I/O" : "Proposed model I/O", relationshipIds: [mode === "implemented" ? "host-openai" : "host-private"], layer: "deployment" as const, modes: [mode], kind: "hosting" as const, exit: [.7, 1] as [number, number], entry: [.5, 0] as [number, number], via: [[573, 390], [720, 390]] as [number, number][] })),
    ],
    note: "Open Check question or Check and return for denial and stopped outcomes. Diagram evidence describes code and configuration.",
  },
  controlPage(false),
  {
    aliases: { question: { scopeId: "system", cellId: "check" }, draft: { scopeId: "system", cellId: "release" } },
    id: "build", title: "Build the explanation", level: 2, parentId: "system", layers: [],
    flow: [["supervisor"], ["cards", "score"], ["products", "score-tool"]],
    purpose: "The supervisor delegates to specialists. Their tools retrieve product facts and the fictional score.",
    groups: [{ id: "banking", label: "Banking service · agents and tools" }],
    cells: [
      cell("question", "Checked question", "brahe.build", "question", 5, 100, 150, 90),
      cell("supervisor", "Bank supervisor", "brahe.build", "supervisor", 255, 100, 250, 90, { caption: "Delegate and combine evidence" }),
      cell("draft", "Draft explanation", "brahe.build", "draft", 750, 100, 250, 90, { caption: "Continue to answer checks", targetPageId: "return" }),
      cell("cards", "Card specialist", "brahe.build", "cards", 255, 265, 250, 85),
      cell("score", "Score specialist", "brahe.build", "score", 750, 265, 250, 85),
      cell("products", "Product lookup", "brahe.build", "card-tool", 255, 400, 250, 60, { caption: "Local documents / Pinecone" }),
      cell("score-tool", "Score lookup", "brahe.build", "score-tool", 750, 400, 250, 60, { caption: "Synthetic result: 550" }),
    ].map(item => ({ ...item, boundaryId: "banking" })),
    edges: [
      { id: "build.input", from: "question", to: "supervisor", label: "Question", relationshipIds: ["ctrl-scope"] },
      { id: "build.draft", from: "supervisor", to: "draft", label: "Compose", relationshipIds: ["run-draft"], kind: "return" },
      { id: "build.cards", from: "supervisor", to: "cards", label: "Delegate / results", relationshipIds: ["req-cards", "ret-specialists"], exit: [.25, 1], entry: [.25, 0], bidirectional: true },
      { id: "build.score", from: "supervisor", to: "score", label: "Delegate / results", relationshipIds: ["req-score", "ret-specialists"], exit: [.75, 1], entry: [.5, 0], via: [[443, 225], [875, 225]], bidirectional: true },
      { id: "build.products", from: "cards", to: "products", label: "Retrieve", relationshipIds: ["req-cards"], exit: [.5, 1], entry: [.5, 0], bidirectional: true },
      { id: "build.score-tool", from: "score", to: "score-tool", label: "Read", relationshipIds: ["req-score"], exit: [.5, 1], entry: [.5, 0], bidirectional: true },
    ],
    note: "Agents and application judges share the protected model client and Studio routing. Select a component to inspect its source.",
  },
  controlPage(true),
];
