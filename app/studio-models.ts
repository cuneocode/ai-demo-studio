/**
 * Model backends: which OpenAI-compatible endpoint each live use case calls.
 * Saved to .studio/models.json (git-ignored) and read per request by
 * services/llm/studio_models.py and services/interbank/lab/models.py.
 * A provider stores the name of its key variable, never the key.
 */

export type ProviderKind = "openai" | "vllm";

export type ModelProvider = {
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  responsesApi: boolean;
};

export type ModelRegistry = {
  version: 1;
  default: string;
  useCases: Record<string, string>;
  providers: Record<string, ModelProvider>;
};

/** The only environment variables a provider may name as its key. */
export const KEY_NAMES = ["OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"] as const;

/** `experience` matches the use case frame's liveExperience in page.tsx. */
export const MODEL_USE_CASES: { id: string; experience: string; title: string; calls: string; applies: string }[] = [
  { id: "brahe-bank", experience: "banking", title: "Brahe Bank assistant", calls: "Supervisor, both specialists, and the quality judge", applies: "Next message; open conversations restart" },
  { id: "company-briefing", experience: "briefing", title: "Company briefing", calls: "Deep Agent supervisor and theme subagents", applies: "Next briefing" },
  { id: "fraud-modeling", experience: "fraud", title: "Transaction fraud scoring", calls: "Optional analyst narrative (the score never uses an LLM)", applies: "Next score" },
  { id: "market-research", experience: "research", title: "Wealth market research", calls: "Cited research note", applies: "Next note" },
  { id: "client-advisory", experience: "advisory", title: "Client advisory", calls: "Meeting brief draft", applies: "Next brief" },
  { id: "interbank-a2a", experience: "interbank", title: "Interbank settlement investigation", calls: "Both banks' Deep Agents", applies: "Next investigation (after one interbank:up)" },
];

export const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

export function defaultRegistry(openaiModel = "gpt-4o-mini", vllmModel = "nvidia/NVIDIA-Nemotron-3-Super-120B-A12B-NVFP4"): ModelRegistry {
  return {
    version: 1,
    default: "openai",
    useCases: {},
    providers: {
      openai: { label: "OpenAI API", kind: "openai", baseUrl: "https://api.openai.com/v1", model: openaiModel, apiKeyEnv: "OPENAI_API_KEY", responsesApi: true },
      "sparky-vllm": { label: "Sparky vLLM", kind: "vllm", baseUrl: "http://127.0.0.1:8003/v1", model: vllmModel, apiKeyEnv: "VLLM_API_KEY", responsesApi: false },
    },
  };
}

const text = (value: unknown, max: number) => typeof value === "string" && value.trim().length > 0 && value.length <= max && !/[\u0000-\u001f]/.test(value);

/** The URL problem for a base URL, or null. Credentials never belong in the URL. */
export function baseUrlProblem(value: string): string | null {
  let url: URL;
  try { url = new URL(value); } catch { return "Enter a full URL, for example http://127.0.0.1:8003/v1."; }
  if (url.protocol !== "http:" && url.protocol !== "https:") return "Use http or https.";
  if (url.username || url.password) return "Remove credentials from the URL; name a key variable instead.";
  if (url.search || url.hash) return "Remove the query string.";
  return null;
}

/** A normalized registry, or the first problem found. */
export function validateRegistry(input: unknown): { registry: ModelRegistry } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected a JSON object." };
  const raw = input as Partial<ModelRegistry>;
  const entries = Object.entries(raw.providers ?? {});
  if (entries.length === 0 || entries.length > 8) return { error: "Define between one and eight providers." };
  const providers: Record<string, ModelProvider> = {};
  for (const [id, value] of entries) {
    const provider = value as Partial<ModelProvider>;
    if (!PROVIDER_ID.test(id)) return { error: `Provider id "${id}" must be lowercase letters, digits, and dashes.` };
    if (!text(provider.label, 60)) return { error: `Name provider ${id} (60 characters or fewer).` };
    if (provider.kind !== "openai" && provider.kind !== "vllm") return { error: `Provider ${id} must be OpenAI API or vLLM.` };
    if (!text(provider.baseUrl, 300)) return { error: `Provider ${id} needs a base URL.` };
    const urlProblem = baseUrlProblem(provider.baseUrl!.trim());
    if (urlProblem) return { error: `${provider.label}: ${urlProblem}` };
    if (!text(provider.model, 200)) return { error: `${provider.label} needs a model name.` };
    const key = provider.apiKeyEnv ?? "";
    if (key && !(KEY_NAMES as readonly string[]).includes(key)) return { error: `${provider.label}: the key variable must be one of ${KEY_NAMES.join(", ")}.` };
    if (provider.kind === "openai" && !key) return { error: `${provider.label} needs a key variable.` };
    providers[id] = {
      label: provider.label!.trim(),
      kind: provider.kind,
      baseUrl: provider.baseUrl!.trim().replace(/\/+$/, ""),
      model: provider.model!.trim(),
      apiKeyEnv: key,
      responsesApi: provider.responsesApi === true,
    };
  }
  if (typeof raw.default !== "string" || !providers[raw.default]) return { error: "Choose a default provider." };
  const useCases: Record<string, string> = {};
  for (const [useCase, providerId] of Object.entries(raw.useCases ?? {})) {
    if (!MODEL_USE_CASES.some((item) => item.id === useCase)) return { error: `Unknown use case ${useCase}.` };
    if (typeof providerId !== "string" || !providers[providerId]) return { error: `Choose a provider for ${useCase}.` };
    if (providerId !== raw.default) useCases[useCase] = providerId;
  }
  return { registry: { version: 1, default: raw.default, useCases, providers } };
}

export function providerFor(registry: ModelRegistry, useCase: string) {
  const id = registry.useCases[useCase] ?? registry.default;
  return { id, provider: registry.providers[id], overridden: Boolean(registry.useCases[useCase]) };
}
