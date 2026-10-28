import { demoDefinitions } from "./demos.ts";
/** Portable use-case packages. Runtime fields are consumed by the operator and both proxies. */
export type RuntimeSpec = {
  source: string; dockerfile: string;
  buildIdentity: string; sharedBindings: readonly string[]; storage: string[];
  id: string; label: string; directory: string; port: number; prefix: string;
  upstreamPrefix: string; health: string; timeout: number; compose: string;
  service: string; modelUseCase: string; environment: string[];
  controls?: string[]; components?: { id: string; label: string; profile: string; services: string[]; requirements: string }[];
};
export type UseCasePackage = { id: string; title: string; mode: "live" | "illustrative"; runtime?: RuntimeSpec };

const models = ["OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY", "MODEL_NAME", "OPENAI_BASE_URL", "SPARKY_VLLM_BASE_URL", "SPARKY_VLLM_MODEL", "NIM_BASE_URL", "NIM_MODEL"];
const integrations = ["GALILEO_", "SPLUNK_", "OTEL_", "AIDEFENSE_", "AGENT_CONTROL_"];
const runtime = (id: string, label: string, directory: string, port: number, prefix: string, modelUseCase: string, environment: string[] = [], upstreamPrefix = prefix): RuntimeSpec => ({
  id, label, directory, port, prefix, upstreamPrefix, buildIdentity: `fsi-studio/${directory}:local`, sharedBindings: ["models", "agent-observability", ...(directory === "vulnerability" ? ["agent-control"] : ["ai-defense", "otel", ...(directory === "briefing" ? [] : ["agent-control"])])], storage: ["data"], health: `${upstreamPrefix}/health`,
  timeout: id === "vulnerability" ? 1_260_000 : 300_000,
  source: directory === "wealth" ? "services/wealth" : `demos/${demoDefinitions.find(demo => demo.runtimeId === id)?.id}/backend`,
  dockerfile: `demos/${demoDefinitions.find(demo => demo.runtimeId === id)?.id}/deploy/Dockerfile`,
  compose: `demos/${demoDefinitions.find(demo => demo.runtimeId === id)?.id}/deploy/compose.yaml`, service: "api", modelUseCase,
  environment: [...models, ...integrations, ...environment],
  ...(["banking", "fraud", "sar", "vulnerability"].includes(directory) ? { controls: ["python", "setup_controls.py"] } : directory === "wealth" ? { controls: ["python", "scripts/setup_controls.py"] } : {}),
});

const runtimeDefinitions = [
  runtime("vulnerability", "Code vulnerability analysis", "vulnerability", 8016, "/api/vulnerability", "code-vulnerability", ["VULNERABILITY_", "SPLUNK_AO_", "FOUNDRY_"]),
  runtime("banking", "Brahe Bank assistant", "banking", 8011, "/api/banking", "brahe-bank", ["BRAHE_", "BANKING_", "PINECONE_"]),
  { ...runtime("fraud", "Card fraud triage", "fraud", 8012, "/api/fraud", "fraud-modeling", ["FRAUD_"]), components: [{ id: "scorer", label: "GPU graph scorer", profile: "gnn", services: ["fraud-gnn"], requirements: "NVIDIA GPU, Container Toolkit, and trained fraud artifacts" }] },
  runtime("briefing", "Company briefing", "briefing", 8013, "/api/briefing", "company-briefing", ["BRIEFING_", "SEC_USER_AGENT"]),
  runtime("research", "Market research", "wealth", 8014, "/api/research", "market-research", ["WEALTH_", "FRED_API_KEY"], "/api/wealth"),
  runtime("advisory", "Advisor meeting prep", "wealth", 8017, "/api/advisory", "client-advisory", ["WEALTH_", "FRED_API_KEY"], "/api/wealth"),
  runtime("sar", "SAR investigation", "sar", 8015, "/api/sar", "sar-support", ["SAR_"]),
  { ...runtime("interbank", "Interbank settlement investigation", "interbank", 8088, "/api/interbank", "interbank-a2a", ["MODEL_REASONING_EFFORT"], "/api"), buildIdentity: "interbank-a2a-demo:0.2.0", compose: "demos/interbank-a2a/deploy/compose.yaml", source: "services/interbank", dockerfile: "services/interbank/Dockerfile", storage: ["pki", "evidence", ".runtime"], service: "demo", controls: ["python", "-m", "tools.setup_controls"] }
];

export const useCasePackages: UseCasePackage[] = demoDefinitions.map(demo => ({
  id: demo.id, title: demo.title, mode: demo.mode,
  ...(demo.runtimeId ? { runtime: runtimeDefinitions.find(runtime => runtime.id === demo.runtimeId)! } : {}),
}));

export const runtimes = useCasePackages.flatMap(item => item.runtime ? [item.runtime] : []);
export const runtimeById = (id: string) => runtimes.find(item => item.id === id);
export const runtimeForUseCase = (id: string) => useCasePackages.find(item => item.id === id)?.runtime;
export const rewriteRuntimePath = (spec: RuntimeSpec, path: string) => `${spec.upstreamPrefix}${path.slice(spec.prefix.length)}`;
// Preserve the original Wealth API for source development and existing integrations.
export const proxyRuntimes = [...runtimes, { ...runtimeById("research")!, prefix: "/api/wealth" }];
export const runtimeForPath = (path: string) => proxyRuntimes.find(spec => path === spec.prefix || path.startsWith(`${spec.prefix}/`) || path.startsWith(`${spec.prefix}?`));
