/**
 * Model backends: the ordered chain of OpenAI-compatible endpoints each live use case
 * tries, first healthy one wins. Saved to .studio/models.json (git-ignored) and read
 * per request by services/llm/studio_models.py and services/interbank/lab/models.py.
 * Without a saved file, config/studio-models.default.json applies to both the studio
 * and the services. A provider stores the name of its key variable, never the key.
 */

export type ProviderKind = "openai" | "vllm";

export type ModelProvider = {
  label: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  apiKeyEnv: string;
  responsesApi: boolean;
  /** Data sent here stays on infrastructure the bank controls (Sparky, a UCS node). */
  private: boolean;
};

/** What a use case may send to a hosted (non-private) model. */
export type ExternalPolicy = "allow" | "require_ai_defense" | "deny";

export type UseCaseRoute = { chain?: string[]; externalPolicy?: ExternalPolicy };

export type ModelRegistry = {
  version: 2;
  chain: string[];
  useCases: Record<string, UseCaseRoute>;
  providers: Record<string, ModelProvider>;
};

/** The only environment variables a provider may name as its key. */
export const KEY_NAMES = ["OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY"] as const;

export const POLICY_LABEL: Record<ExternalPolicy, string> = {
  allow: "Hosted models allowed",
  require_ai_defense: "Hosted only with AI Defense enforce",
  deny: "Private models only",
};

/** `experience` matches the use case frame's liveExperience in page.tsx. `clientData` use cases never reach a hosted model uninspected. */
export const MODEL_USE_CASES: { id: string; experience: string; title: string; calls: string; applies: string; clientData?: boolean }[] = [
  { id: "brahe-bank", experience: "banking", title: "Brahe Bank assistant", calls: "Supervisor, both specialists, and the quality judge", applies: "Next message; open conversations restart" },
  { id: "company-briefing", experience: "briefing", title: "Company briefing", calls: "Deep Agent supervisor and theme subagents", applies: "Next briefing" },
  { id: "fraud-modeling", experience: "fraud", title: "Card fraud triage", calls: "Triage Deep Agent and analyst summary (the score never uses an LLM)", applies: "Next triage run" },
  { id: "market-research", experience: "research", title: "Market research", calls: "Evidence-packet assessment and verified-fact recommendation", applies: "Next run" },
  { id: "client-advisory", experience: "advisory", title: "Advisor meeting prep", calls: "Meeting-prep Deep Agent", applies: "Next run", clientData: true },
  { id: "sar-support", experience: "sar", title: "SAR investigation", calls: "Investigation Deep Agent and narrative draft", applies: "Next investigation", clientData: true },
  { id: "code-vulnerability", experience: "vulnerability", title: "Code vulnerability analysis", calls: "Visa discovery, verification, and patch proposal", applies: "Next operation" },
  { id: "interbank-a2a", experience: "interbank", title: "Interbank settlement investigation", calls: "Both banks' Deep Agents", applies: "Next investigation" },
];

export const PROVIDER_ID = /^[a-z0-9][a-z0-9-]{0,39}$/;

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

const isPolicy = (value: unknown): value is ExternalPolicy => value === "allow" || value === "require_ai_defense" || value === "deny";

/** A normalized v2 registry from a v1 or v2 document, or the first problem found. */
export function validateRegistry(input: unknown): { registry: ModelRegistry } | { error: string } {
  if (!input || typeof input !== "object") return { error: "Expected a JSON object." };
  const raw = input as Record<string, unknown>;
  const entries = Object.entries((raw.providers ?? {}) as Record<string, unknown>);
  if (entries.length === 0 || entries.length > 8) return { error: "Define between one and eight providers." };
  const providers: Record<string, ModelProvider> = {};
  for (const [id, value] of entries) {
    const provider = (value ?? {}) as Partial<ModelProvider>;
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
      private: typeof provider.private === "boolean" ? provider.private : provider.kind === "vllm",
    };
  }
  const chainProblem = (chain: unknown, where: string): string | null => {
    if (!Array.isArray(chain) || chain.length === 0) return `Choose at least one backend for ${where}.`;
    if (chain.length > 8 || new Set(chain).size !== chain.length) return `List each backend once for ${where}.`;
    const unknown = chain.find((id) => typeof id !== "string" || !providers[id]);
    return unknown === undefined ? null : `${where} names an unknown provider.`;
  };
  // v1: a single default and string overrides become one-entry chains.
  const chain = Array.isArray(raw.chain) ? raw.chain as string[] : typeof raw.default === "string" ? [raw.default] : [];
  const problem = chainProblem(chain, "the default chain");
  if (problem) return { error: problem };
  const useCases: Record<string, UseCaseRoute> = {};
  for (const [useCase, value] of Object.entries((raw.useCases ?? {}) as Record<string, unknown>)) {
    if (!MODEL_USE_CASES.some((item) => item.id === useCase)) return { error: `Unknown use case ${useCase}.` };
    const route: UseCaseRoute = typeof value === "string" ? { chain: [value] } : Array.isArray(value) ? { chain: value } : (value ?? {}) as UseCaseRoute;
    const entry: UseCaseRoute = {};
    if (route.chain !== undefined) {
      const routeProblem = chainProblem(route.chain, useCase);
      if (routeProblem) return { error: routeProblem };
      if (JSON.stringify(route.chain) !== JSON.stringify(chain)) entry.chain = [...route.chain];
    }
    if (route.externalPolicy !== undefined) {
      if (!isPolicy(route.externalPolicy)) return { error: `Choose a hosted-model policy for ${useCase}.` };
      const clientData = MODEL_USE_CASES.find((item) => item.id === useCase)?.clientData;
      if (clientData && route.externalPolicy === "allow") return { error: `${useCase} handles client data: hosted models need AI Defense enforce or are not allowed.` };
      if (route.externalPolicy !== defaultPolicy(useCase)) entry.externalPolicy = route.externalPolicy;
    }
    if (entry.chain || entry.externalPolicy) useCases[useCase] = entry;
  }
  return { registry: { version: 2, chain: [...chain], useCases, providers } };
}

export function defaultPolicy(useCase: string): ExternalPolicy {
  return MODEL_USE_CASES.find((item) => item.id === useCase)?.clientData ? "require_ai_defense" : "allow";
}

/** The ordered chain a use case tries, and whether it differs from the default chain. */
export function chainFor(registry: ModelRegistry, useCase: string) {
  const own = registry.useCases[useCase]?.chain;
  const ids = own?.length ? own : registry.chain;
  return { ids, providers: ids.map((id) => ({ id, provider: registry.providers[id] })), overridden: Boolean(own?.length) };
}

export function policyFor(registry: ModelRegistry, useCase: string): ExternalPolicy {
  return registry.useCases[useCase]?.externalPolicy ?? defaultPolicy(useCase);
}

/** "Sparky vLLM → OpenAI API", skipping providers .env leaves unconfigured. */
export function chainLabel(registry: ModelRegistry, useCase: string, unconfigured: Record<string, string> = {}) {
  return chainFor(registry, useCase).providers.filter(({ id }) => !unconfigured[id]).map(({ id, provider }) => provider?.label ?? id).join(" → ");
}
