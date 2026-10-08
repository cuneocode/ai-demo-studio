import type { DemoEvent } from "./api";

export type Org = "console" | "bank-a" | "bank-b" | "shared";
export type Kind = "console" | "agent" | "gateway" | "guardrail" | "data" | "model" | "cloud";

export type Fact = { label: string; value: string };
export type Route = { listener: string; from: string; to: string; checks: string[] };

export type Component = {
  id: string;
  label: string;
  subtitle: string;
  org: Org;
  kind: Kind;
  x: number;
  y: number;
  summary: string;
  facts: Fact[];
  routes?: Route[];
  enforcement?: string[];
  sources: string[];
};

export type Link = {
  id: string;
  from: string;
  to: string;
  label: string;
  telemetry?: boolean;
  /** component pairs (either direction) whose events travel this link */
  pairs: [string, string][];
  hops?: string[];
};

const bankGateway = (bank: "a" | "b"): Component => {
  const self = `bank-${bank}`;
  const other = bank === "a" ? "bank-b" : "bank-a";
  const Self = bank === "a" ? "Bank A" : "Bank B";
  const Other = bank === "a" ? "Bank B" : "Bank A";
  const routes: Route[] = [
    {
      listener: ":8443 egress",
      from: `${Self} agent`,
      to: `${Other} gateway :9443`,
      checks: [
        `mTLS (TLS 1.3) from the agent, JWT sub = ${self}-agent`,
        `Cisco AI Defense: request + response (hop egress-to-${other})`,
        `Signs a partner JWT (sub ${self}, aud ${other}-gateway) and presents ${Self}'s client certificate`,
      ],
    },
    {
      listener: ":9443 ingress",
      from: `${Other} gateway`,
      to: `${Self} agent :9443`,
      checks: [
        `mTLS: client certificate issued by ${Other}'s CA`,
        `Verifies ${Other}'s partner JWT (iss lab://${other}-gateway), requires sub = ${other}`,
        `Cisco AI Defense: request + response (hop ingress-from-${other})`,
        "a2a policy rewrites the Agent Card URL to this gateway",
      ],
    },
  ];
  if (bank === "a")
    routes.push({
      listener: ":7443 console",
      from: "Operations console",
      to: "Bank A agent :9443",
      checks: [
        "mTLS + JWT sub = operations-console",
        "Cisco AI Defense: kickoff request + final report (hop ingress-from-console)",
      ],
    });
  return {
    id: `${self}-gateway`,
    label: `${Self} AI gateway`,
    subtitle: "agentgateway v1.6.0 · A2A",
    org: self as Org,
    kind: "gateway",
    x: bank === "a" ? 470 : 1110,
    y: 200,
    summary:
      `Every A2A message entering or leaving ${Self} passes through this gateway. It is the only ` +
      `${Self} component on the interbank network, and the enforcement point for Cisco AI Defense: ` +
      "each listener calls the bank's AI Defense ExtProc service with the full buffered A2A request " +
      "and response, and fails closed if inspection is unavailable.",
    facts: [
      { label: "Container", value: `${self}-gateway` },
      { label: "Networks", value: `${self}-internal, interbank${bank === "a" ? ", bank-a-console" : ""}, ${self}-policy` },
      { label: "Tracing", value: `OTLP → otel-collector-${bank} → Splunk Agent Observability (continues W3C traceparent)` },
    ],
    routes,
    enforcement: ["Cisco AI Defense (ExtProc, buffered, failClosed)", "mTLS TLS 1.3", "JWT authentication + authorization"],
    sources: [`${self}-gateway`, "collector"],
  };
};

const bankAgent = (bank: "a" | "b"): Component => {
  const self = `bank-${bank}`;
  const Self = bank === "a" ? "Bank A" : "Bank B";
  const Other = bank === "a" ? "Bank B" : "Bank A";
  return {
    id: `${self}-agent`,
    label: bank === "a" ? "Bank A settlement agent" : "Bank B settlement agent",
    subtitle: `LangChain Deep Agent · ${bank === "a" ? "Harbor Point Bank (buyer)" : "Meridian Trust (seller)"}`,
    org: self as Org,
    kind: "agent",
    x: bank === "a" ? 470 : 1110,
    y: 430,
    summary:
      bank === "a"
        ? "Receives the kickoff over A2A, plans with write_todos, checks its own settlement records, " +
          "then holds a multi-turn A2A conversation with Bank B to reconcile the failed trade. When Bank B " +
          "asks it a question, a separate responder agent (no outbound tool) answers from Bank A's records."
        : "Receives Bank A's A2A messages, checks its own records, may ask Bank A a clarifying question " +
          "over A2A, and replies with its findings. Follow-up messages in the same A2A context share memory.",
    facts: [
      { label: "Framework", value: "deepagents 0.7 create_deep_agent (LangGraph runtime)" },
      { label: "Model", value: "OpenAI API (MODEL_NAME from the FSI .env)" },
      { label: "Tools", value: `query_settlement_records, send_message_to_${bank === "a" ? "bank_b" : "bank_a"}, write_todos` },
      { label: "A2A client", value: `a2a-sdk 1.2.2 create_client → ${Self} gateway :8443 → ${Other}` },
      { label: "A2A server", value: "a2a-sdk 1.2.2 AgentExecutor + DefaultRequestHandler, JSON-RPC, :9443 mTLS" },
      { label: "Accepts", value: `only requests signed by ${Self}'s gateway (ES256 JWT)` },
    ],
    enforcement: ["Splunk Agent Control on every outbound A2A message", "Read-only database access"],
    sources: [`${self}-agent`, "a2a-send", "a2a-receive", "partner-tool", "deep-agent-builder"],
  };
};

const records = (bank: "a" | "b"): Component => ({
  id: `bank-${bank}-records`,
  label: `${bank === "a" ? "Bank A" : "Bank B"} settlement records`,
  subtitle: "SQLite · read-only",
  org: `bank-${bank}` as Org,
  kind: "data",
  x: bank === "a" ? 130 : 1450,
  y: 440,
  summary:
    "Synthetic trades, settlement instructions, SSIs, custodian status and static-data queues. " +
    "The agent writes its own SELECT queries; the connection is opened read-only with query_only.",
  facts: [
    { label: "Tool", value: "query_settlement_records(sql) · SELECT/WITH only · max 50 rows" },
    { label: "Seed", value: `bank_${bank}/records.sql` },
  ],
  sources: [`bank-${bank}-records`, "records"],
});

const aiDefense = (bank: "a" | "b"): Component => ({
  id: `bank-${bank}-ai-defense`,
  label: `${bank === "a" ? "Bank A" : "Bank B"} AI Defense enforcement`,
  subtitle: "Envoy ExtProc (gRPC) → Cisco AI Defense",
  org: `bank-${bank}` as Org,
  kind: "guardrail",
  x: bank === "a" ? 130 : 1450,
  y: 220,
  summary:
    "The gateway streams each A2A request and response here. The service extracts the message text " +
    "(parts, artifacts, Agent Card), calls the Cisco AI Defense Inspection API, and tells the gateway to " +
    "continue or to reply 403 with the Cisco classifications. One port per gateway hop.",
  facts: [
    { label: "Container", value: `policy-${bank}` },
    { label: "Ports", value: bank === "a" ? "9001 egress-to-bank-b · 9002 ingress-from-bank-b · 9003 ingress-from-console" : "9001 egress-to-bank-a · 9002 ingress-from-bank-a" },
    { label: "Unavailable", value: "503, fail closed" },
  ],
  enforcement: ["Prompt injection, harmful content, PII/PCI per the Cisco AI Defense policy"],
  sources: ["ai-defense-extproc", "ai-defense-api"],
});

export const COMPONENTS: Component[] = [
  {
    id: "operations-console",
    label: "Operations console",
    subtitle: "A2A client · this dashboard",
    org: "console",
    kind: "console",
    x: 130,
    y: 20,
    summary:
      "Starts an investigation by sending an A2A message to Bank A's agent through Bank A's gateway. " +
      "It opens the root span, so one investigation is one Splunk trace and one session.",
    facts: [{ label: "Target", value: "https://bank-a-gateway:7443 (mTLS + JWT)" }],
    sources: ["console", "telemetry"],
  },
  bankGateway("a"),
  bankAgent("a"),
  records("a"),
  aiDefense("a"),
  bankGateway("b"),
  bankAgent("b"),
  records("b"),
  aiDefense("b"),
  {
    id: "cisco-ai-defense",
    label: "Cisco AI Defense",
    subtitle: "Inspection API · cloud",
    org: "shared",
    kind: "cloud",
    x: 790,
    y: 20,
    summary: "Each bank's enforcement service calls POST /api/v1/inspect/chat and acts on is_safe.",
    facts: [{ label: "Verdict fields", value: "is_safe, classifications, rules, event_id" }],
    sources: ["ai-defense-api"],
  },
  {
    id: "openai",
    label: "OpenAI",
    subtitle: "Chat Completions API · cloud",
    org: "shared",
    kind: "model",
    x: 790,
    y: 430,
    summary:
      "Each bank's agent calls the OpenAI API directly over its own egress network. Only the two agent " +
      "containers hold the API key.",
    facts: [
      { label: "Model", value: "MODEL_NAME from the FSI .env (gpt-5.6-luna)" },
      { label: "Settings", value: "reasoning_effort none · temperature 0 · max 1500 tokens" },
    ],
    sources: ["deep-agent-builder"],
  },
  {
    id: "agent-control",
    label: "Splunk Agent Control",
    subtitle: "runtime controls · cloud",
    org: "shared",
    kind: "cloud",
    x: 790,
    y: 590,
    summary:
      "Before an agent sends an A2A message, it evaluates the outbound text against controls bound to the " +
      "Agent Stream: a confidentiality regex keeps cash balances and other clients' data inside the bank.",
    facts: [{ label: "Step", value: "bank-a.send_a2a_message · bank-b.send_a2a_message (tool, pre)" }],
    sources: ["agent-control", "partner-tool"],
  },
  {
    id: "splunk-ao",
    label: "Splunk Agent Observability",
    subtitle: "one trace per investigation",
    org: "shared",
    kind: "cloud",
    x: 790,
    y: 735,
    summary:
      "Agents and AI Defense services export with SplunkAOSpanProcessor (OpenInference LangChain " +
      "instrumentation for LLM and tool spans). Gateways export through a per-bank collector. " +
      "W3C traceparent and gen_ai.conversation.id baggage stitch everything into one trace.",
    facts: [],
    sources: ["telemetry", "collector"],
  },
];

const tel = (id: string): Link => ({ id: `tel-${id}`, from: id, to: "splunk-ao", label: "", telemetry: true, pairs: [] });

export const LINKS: Link[] = [
  { id: "console-gwa", from: "operations-console", to: "bank-a-gateway", label: "A2A :7443", pairs: [["operations-console", "bank-a-gateway"]], hops: ["bank-a:ingress-from-console"] },
  { id: "gwa-agenta", from: "bank-a-gateway", to: "bank-a-agent", label: "A2A mTLS", pairs: [["bank-a-gateway", "bank-a-agent"]] },
  { id: "gwa-gwb", from: "bank-a-gateway", to: "bank-b-gateway", label: "interbank A2A · mTLS + JWT", pairs: [], hops: ["bank-a:egress-to-bank-b", "bank-b:ingress-from-bank-a", "bank-b:egress-to-bank-a", "bank-a:ingress-from-bank-b"] },
  { id: "gwb-agentb", from: "bank-b-gateway", to: "bank-b-agent", label: "A2A mTLS", pairs: [["bank-b-gateway", "bank-b-agent"]] },
  { id: "gwa-aida", from: "bank-a-gateway", to: "bank-a-ai-defense", label: "ExtProc", pairs: [["bank-a-gateway", "bank-a-ai-defense"]] },
  { id: "gwb-aidb", from: "bank-b-gateway", to: "bank-b-ai-defense", label: "ExtProc", pairs: [["bank-b-gateway", "bank-b-ai-defense"]] },
  { id: "aida-cisco", from: "bank-a-ai-defense", to: "cisco-ai-defense", label: "inspect", pairs: [["bank-a-gateway", "bank-a-ai-defense"]] },
  { id: "aidb-cisco", from: "bank-b-ai-defense", to: "cisco-ai-defense", label: "inspect", pairs: [["bank-b-gateway", "bank-b-ai-defense"]] },
  { id: "agenta-db", from: "bank-a-agent", to: "bank-a-records", label: "SQL", pairs: [["bank-a-agent", "bank-a-records"]] },
  { id: "agentb-db", from: "bank-b-agent", to: "bank-b-records", label: "SQL", pairs: [["bank-b-agent", "bank-b-records"]] },
  { id: "agenta-llm", from: "bank-a-agent", to: "openai", label: "LLM", pairs: [["bank-a-agent", "openai"]] },
  { id: "agentb-llm", from: "bank-b-agent", to: "openai", label: "LLM", pairs: [["bank-b-agent", "openai"]] },
  { id: "agenta-ctl", from: "bank-a-agent", to: "agent-control", label: "evaluate", pairs: [["bank-a-agent", "bank-a-agent-control"]] },
  { id: "agentb-ctl", from: "bank-b-agent", to: "agent-control", label: "evaluate", pairs: [["bank-b-agent", "bank-b-agent-control"]] },
  ...["operations-console", "bank-a-agent", "bank-b-agent", "bank-a-ai-defense", "bank-b-ai-defense"].map(tel),
  { ...tel("bank-a-gateway"), label: "OTLP via collector" },
  { ...tel("bank-b-gateway"), label: "OTLP via collector" },
];

/** Links an event travelled, and the components it involved. */
export function eventFootprint(event: DemoEvent): { links: string[]; nodes: string[] } {
  const a = event.source;
  const b = event.target ?? event.component;
  const nodes = new Set([a, b].map(nodeFor));
  const links = new Set<string>();
  for (const link of LINKS) {
    if (link.pairs.some(([x, y]) => (x === a && y === b) || (x === b && y === a))) links.add(link.id);
  }
  const hop = event.data?.hop ? `${event.organization}:${event.data.hop}` : null;
  if (hop) {
    for (const link of LINKS) if (link.hops?.includes(hop)) links.add(link.id);
  }
  if (event.kind === "guardrail") nodes.add("cisco-ai-defense");
  if (event.kind === "control") nodes.add("agent-control");
  if (event.kind === "agent.tool_call" || event.kind === "agent.message") {
    links.add(event.component === "bank-a-agent" ? "agenta-llm" : "agentb-llm");
    nodes.add("openai");
  }
  return { links: [...links], nodes: [...nodes].filter(Boolean) as string[] };
}

function nodeFor(component: string): string {
  if (component.endsWith("-agent-control")) return "agent-control";
  return COMPONENTS.some((c) => c.id === component) ? component : "";
}

export const ORG_LABEL: Record<string, string> = {
  "bank-a": "Bank A",
  "bank-b": "Bank B",
  console: "Console",
  shared: "Shared",
};
