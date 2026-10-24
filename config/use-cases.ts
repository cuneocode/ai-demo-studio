/** Portable use-case packages. Runtime fields are consumed by the operator and both proxies. */
export type RuntimeSpec = {
  id: string; label: string; directory: string; port: number; prefix: string;
  upstreamPrefix: string; health: string; timeout: number; compose: string;
  service: string; modelUseCase: string; environment: string[];
  controls?: string[]; components?: { id: string; label: string; profile: string; services: string[]; requirements: string }[];
};
export type UseCasePackage = { id: string; title: string; mode: "live" | "illustrative"; runtime?: RuntimeSpec };

const models = ["OPENAI_API_KEY", "VLLM_API_KEY", "NIM_API_KEY", "NVIDIA_API_KEY", "MODEL_NAME", "OPENAI_BASE_URL", "SPARKY_VLLM_BASE_URL", "SPARKY_VLLM_MODEL", "NIM_BASE_URL", "NIM_MODEL"];
const integrations = ["GALILEO_", "SPLUNK_", "OTEL_", "AIDEFENSE_", "AGENT_CONTROL_"];
const runtime = (id: string, label: string, directory: string, port: number, prefix: string, modelUseCase: string, environment: string[] = [], upstreamPrefix = prefix): RuntimeSpec => ({
  id, label, directory, port, prefix, upstreamPrefix, health: `${upstreamPrefix}/health`,
  timeout: id === "vulnerability" ? 1_260_000 : 300_000,
  compose: `use-cases/${id}/compose.yaml`, service: "api", modelUseCase,
  environment: [...models, ...integrations, ...environment],
  ...(["banking", "fraud", "sar", "vulnerability"].includes(directory) ? { controls: ["python", "setup_controls.py"] } : directory === "wealth" ? { controls: ["python", "scripts/setup_controls.py"] } : {}),
});

export const useCasePackages: UseCasePackage[] = [
  { id: "code-vulnerability", title: "Code vulnerability analysis", mode: "live", runtime: runtime("vulnerability", "Code vulnerability analysis", "vulnerability", 8016, "/api/vulnerability", "code-vulnerability", ["VULNERABILITY_", "SPLUNK_AO_", "FOUNDRY_"]) },
  { id: "brahe-bank", title: "Brahe Bank assistant", mode: "live", runtime: runtime("banking", "Brahe Bank assistant", "banking", 8011, "/api/banking", "brahe-bank", ["BRAHE_", "BANKING_", "PINECONE_"]) },
  { id: "fraud-modeling", title: "Card fraud triage", mode: "live", runtime: { ...runtime("fraud", "Card fraud triage", "fraud", 8012, "/api/fraud", "fraud-modeling", ["FRAUD_"]), components: [{ id: "scorer", label: "GPU graph scorer", profile: "gnn", services: ["fraud-gnn"], requirements: "NVIDIA GPU, Container Toolkit, and trained fraud artifacts" }] } },
  { id: "company-briefing", title: "Company briefing", mode: "live", runtime: runtime("briefing", "Company briefing", "briefing", 8013, "/api/briefing", "company-briefing", ["BRIEFING_", "SEC_USER_AGENT"]) },
  { id: "market-research", title: "Market research", mode: "live", runtime: runtime("research", "Market research", "wealth", 8014, "/api/research", "market-research", ["WEALTH_", "FRED_API_KEY"], "/api/wealth") },
  { id: "client-advisory", title: "Advisor meeting prep", mode: "live", runtime: runtime("advisory", "Advisor meeting prep", "wealth", 8017, "/api/advisory", "client-advisory", ["WEALTH_", "FRED_API_KEY"], "/api/wealth") },
  { id: "kyc-processing", title: "KYC processing", mode: "illustrative" },
  { id: "sar-support", title: "SAR investigation", mode: "live", runtime: runtime("sar", "SAR investigation", "sar", 8015, "/api/sar", "sar-support", ["SAR_"]) },
  { id: "transaction-llm", title: "Transaction intelligence", mode: "illustrative" },
  { id: "interbank-a2a", title: "Interbank settlement investigation", mode: "live", runtime: { ...runtime("interbank", "Interbank settlement investigation", "interbank", 8088, "/api/interbank", "interbank-a2a", ["MODEL_REASONING_EFFORT"], "/api"), compose: "services/interbank/compose.yaml", service: "demo", controls: ["python", "-m", "tools.setup_controls"] } },
];

export const runtimes = useCasePackages.flatMap(item => item.runtime ? [item.runtime] : []);
export const runtimeById = (id: string) => runtimes.find(item => item.id === id);
export const runtimeForUseCase = (id: string) => useCasePackages.find(item => item.id === id)?.runtime;
export const rewriteRuntimePath = (spec: RuntimeSpec, path: string) => `${spec.upstreamPrefix}${path.slice(spec.prefix.length)}`;
// Preserve the original Wealth API for source development and existing integrations.
export const proxyRuntimes = [...runtimes, { ...runtimeById("research")!, prefix: "/api/wealth" }];
export const runtimeForPath = (path: string) => proxyRuntimes.find(spec => path === spec.prefix || path.startsWith(`${spec.prefix}/`) || path.startsWith(`${spec.prefix}?`));
