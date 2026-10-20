/**
 * Studio settings: the credentials and service settings a studio user supplies.
 * Saved in the repository .env (git-ignored, 0600), which every service and
 * labctl already read. Secrets are write-only: the browser learns only whether
 * each one is set.
 */

export type SettingField = {
  name: string;
  label: string;
  secret?: boolean;
  options?: { value: string; label: string }[];
  placeholder?: string;
  help?: string;
  pattern?: RegExp;
  https?: boolean;
};

export type SettingGroup = { id: string; title: string; eyebrow: string; summary: string; fields: SettingField[]; test?: string };

const MODES = [
  { value: "", label: "Service default" },
  { value: "off", label: "Off" },
  { value: "monitor", label: "Monitor (log, never block)" },
  { value: "enforce", label: "Enforce (block unsafe)" },
];

export const SETTING_GROUPS: SettingGroup[] = [
  {
    id: "splunk-ao",
    eyebrow: "OBSERVE AND CONTROL",
    title: "Splunk Agent Observability",
    summary: "Agent traces, sessions, quality judges, and Agent Control. Brahe Bank and interbank require it.",
    test: "splunk-ao",
    fields: [
      { name: "GALILEO_API_KEY", label: "API key", secret: true },
      { name: "GALILEO_CONSOLE_URL", label: "Console URL", placeholder: "https://console.multitenant.galileocloud.io", https: true },
      { name: "GALILEO_PROJECT", label: "Shared project", placeholder: "fsi-brahe-bank" },
      { name: "GALILEO_LOG_STREAM", label: "Shared agent stream", placeholder: "brahe-bank" },
      { name: "AGENT_CONTROL_URL", label: "Agent Control URL", placeholder: "https://agent-control.multitenant.galileocloud.io", https: true,
        help: "Leave empty for the multitenant service." },
    ],
  },
  {
    id: "splunk-otel",
    eyebrow: "OPTIONAL",
    title: "Splunk Observability Cloud",
    summary: "OpenTelemetry trace and metric export from the Python services, in addition to Agent Observability.",
    test: "splunk-otel",
    fields: [
      { name: "SPLUNK_REALM", label: "Realm", placeholder: "us1", pattern: /^[a-z]+\d+$/ },
      { name: "SPLUNK_ACCESS_TOKEN", label: "Ingest access token", secret: true },
    ],
  },
  {
    id: "ai-defense",
    eyebrow: "PROTECT",
    title: "Cisco AI Defense",
    summary: "Runtime inspection of prompts, tool results, and answers. Interbank always enforces it at both banks' gateways; the other use cases follow the modes below.",
    test: "ai-defense",
    fields: [
      { name: "AIDEFENSE_API_KEY", label: "API key", secret: true },
      { name: "AIDEFENSE_REGION", label: "Region", options: [
        { value: "", label: "Default (us-west-2)" }, { value: "us-west-2", label: "US (us-west-2)" },
        { value: "eu-central-1", label: "EU (eu-central-1)" }, { value: "ap-northeast-1", label: "APJ (ap-northeast-1)" }] },
      { name: "AIDEFENSE_MODE", label: "Brahe Bank and fraud narrative", options: MODES, help: "Default: enforce when a key is set." },
      { name: "BRIEFING_AIDEFENSE_MODE", label: "Company briefing", options: MODES, help: "Default: off." },
      { name: "WEALTH_AIDEFENSE_MODE", label: "Research update and meeting prep", options: MODES, help: "Default: off." },
      { name: "SAR_AIDEFENSE_MODE", label: "SAR investigation", options: MODES, help: "Default: the Brahe Bank mode. The hosted fallback always runs with enforce." },
    ],
  },
  {
    id: "models",
    eyebrow: "MODEL KEYS",
    title: "Model provider keys",
    summary: "Keys the providers below name. A vLLM endpoint without authentication needs none.",
    fields: [
      { name: "OPENAI_API_KEY", label: "OPENAI_API_KEY", secret: true },
      { name: "VLLM_API_KEY", label: "VLLM_API_KEY", secret: true },
      { name: "NIM_API_KEY", label: "NIM_API_KEY", secret: true },
      { name: "NVIDIA_API_KEY", label: "NVIDIA_API_KEY", secret: true },
    ],
  },
  {
    id: "data",
    eyebrow: "DATA SOURCES",
    title: "Data sources",
    summary: "Optional providers. Each use case still runs without them, with less data.",
    fields: [
      { name: "SEC_USER_AGENT", label: "SEC EDGAR contact", placeholder: "Your Name you@example.com",
        help: "SEC requires a contact for EDGAR requests. Without one, company briefing uses your git name and email." },
      { name: "FRED_API_KEY", label: "FRED API key", secret: true, help: "Live macro series for market research; the cache is used without it." },
      { name: "PINECONE_API_KEY", label: "Pinecone API key", secret: true, help: "Vector retrieval for Brahe Bank; local document search is used without it." },
    ],
  },
];

export const SETTING_FIELDS: Record<string, SettingField> = Object.fromEntries(SETTING_GROUPS.flatMap((group) => group.fields.map((field) => [field.name, field])));

/** The problem with a value, or null. Values are single-line and need no shell quoting. */
export function settingProblem(name: string, value: string): string | null {
  const field = SETTING_FIELDS[name];
  if (!field) return `${name} is not a studio setting.`;
  if (value.length > 4096) return `${field.label} is too long.`;
  if (/[\u0000-\u001f\u007f"'`\\]/.test(value) || value.includes("${")) return `${field.label} contains characters .env cannot hold safely.`;
  if (field.secret && /\s/.test(value)) return `${field.label} cannot contain spaces.`;
  if (field.options && !field.options.some((option) => option.value === value)) return `Choose a ${field.label} option.`;
  if (field.pattern && value && !field.pattern.test(value)) return `${field.label} is not in the expected format.`;
  if (field.https && value) {
    let url: URL;
    try { url = new URL(value); } catch { return `${field.label} must be a full URL.`; }
    if (url.protocol !== "https:") return `${field.label} must use https.`;
    if (url.username || url.password || url.search) return `${field.label} cannot contain credentials or a query string.`;
  }
  return null;
}

export type SettingState = { set: boolean; value?: string };

export type ModelState = { label: string; ok: boolean; detail: string };

export type Readiness = { id: string; title: string; ready: boolean; missing: string[]; notes: string[] };

/** What each live use case still needs, from the saved settings. */
export function readiness(settings: Record<string, SettingState>, model: (useCase: string) => ModelState): Readiness[] {
  const has = (name: string) => Boolean(settings[name]?.set);
  const value = (name: string) => settings[name]?.value ?? "";
  const label = (name: string) => `${SETTING_FIELDS[name]?.label ?? name}${groupOf(name)}`;
  const defenseMode = (name: string, fallback: string) => value(name) || fallback;
  const needs = (names: string[]) => names.filter((name) => !has(name)).map(label);
  const modelNeed = (useCase: string) => { const state = model(useCase); return state.ok ? [] : [state.detail]; };
  const defenseNeed = (mode: string) => (mode !== "off" && !has("AIDEFENSE_API_KEY") ? [label("AIDEFENSE_API_KEY")] : []);
  const rows: Omit<Readiness, "ready">[] = [
    {
      id: "brahe-bank", title: "Brahe Bank assistant",
      missing: [...modelNeed("brahe-bank"), ...needs(["GALILEO_API_KEY", "GALILEO_PROJECT", "GALILEO_LOG_STREAM"]),
        ...(value("AIDEFENSE_MODE") ? defenseNeed(value("AIDEFENSE_MODE")) : [])],
      notes: [
        has("AIDEFENSE_API_KEY") || value("AIDEFENSE_MODE") ? `AI Defense: ${defenseMode("AIDEFENSE_MODE", "enforce")}` : "AI Defense is off without a key",
        has("PINECONE_API_KEY") ? "Pinecone retrieval" : "Local document search",
      ],
    },
    {
      id: "company-briefing", title: "Company briefing",
      missing: [...modelNeed("company-briefing"), ...defenseNeed(defenseMode("BRIEFING_AIDEFENSE_MODE", "off"))],
      notes: [`AI Defense: ${defenseMode("BRIEFING_AIDEFENSE_MODE", "off")}`, has("SEC_USER_AGENT") ? "EDGAR contact: Studio settings" : "EDGAR contact: your git identity"],
    },
    {
      id: "fraud-modeling", title: "Card fraud triage",
      missing: [],
      notes: ["Scoring needs no credentials", "The triage agent uses the fraud-modeling model chain; scripted without one"],
    },
    {
      id: "market-research", title: "Market research",
      missing: [...modelNeed("market-research"), ...defenseNeed(defenseMode("WEALTH_AIDEFENSE_MODE", "off"))],
      notes: [`AI Defense: ${defenseMode("WEALTH_AIDEFENSE_MODE", "off")}`, has("FRED_API_KEY") ? "Live FRED series" : "Cached FRED series"],
    },
    {
      id: "client-advisory", title: "Advisor meeting prep",
      missing: [...modelNeed("client-advisory"), ...defenseNeed(defenseMode("WEALTH_AIDEFENSE_MODE", "off"))],
      notes: [`AI Defense: ${defenseMode("WEALTH_AIDEFENSE_MODE", "off")}`],
    },
    {
      id: "sar-support", title: "SAR investigation",
      missing: [...modelNeed("sar-support"), ...defenseNeed(defenseMode("SAR_AIDEFENSE_MODE", value("AIDEFENSE_MODE") || (has("AIDEFENSE_API_KEY") ? "enforce" : "off")))],
      notes: [
        `AI Defense: ${defenseMode("SAR_AIDEFENSE_MODE", value("AIDEFENSE_MODE") || (has("AIDEFENSE_API_KEY") ? "enforce" : "off"))}`,
        has("GALILEO_API_KEY") && has("AGENT_CONTROL_URL") ? "Agent Control: hosted when the SAR policies are registered" : "Policies: local checks",
        "Recorded and sample runs need no credentials",
      ],
    },
    {
      id: "code-vulnerability", title: "Code vulnerability analysis",
      missing: modelNeed("code-vulnerability"),
      notes: ["Visa VVAH on DeepAgents / LangGraph", has("GALILEO_API_KEY") ? "Agent Observability traces; register vulnerability policies for hosted Agent Control" : "Local policy checks; configure Agent Observability for export and hosted controls"],
    },
    {
      id: "interbank-a2a", title: "Interbank settlement investigation",
      missing: [...modelNeed("interbank-a2a"), ...needs(["GALILEO_API_KEY", "GALILEO_CONSOLE_URL", "AIDEFENSE_API_KEY"])],
      notes: ["AI Defense: enforce at both gateways", "Runs in Docker: rebuild the lab after changes"],
    },
  ];
  return rows.map((row) => ({
    ...row,
    notes: row.id === "fraud-modeling" ? row.notes : [`Model: ${model(row.id).label}`, ...row.notes],
    ready: row.missing.length === 0,
  }));
}

function groupOf(name: string) {
  const group = SETTING_GROUPS.find((item) => item.fields.some((field) => field.name === name));
  return group && group.id !== "models" ? ` (${group.title})` : "";
}
