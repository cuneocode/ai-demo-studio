import type { PlatformViewContext } from "./platform-connections.ts";
import type { ModelViewContext } from "./implementation-views.ts";
import type { ArchitecturePages, PlatformView } from "./platform-views.ts";

export type Endpoint = { scopeId: string; cellId: string };
export type Connection = { from: Endpoint; to: Endpoint; label: string; kind: "control" | "telemetry"; sources: string[]; bidirectional?: boolean };
export type Contract = { status: "implemented" | "proposed"; inspection: "application" | "gateway" | "disabled"; connections: Connection[] };
export const at = (scopeId: string, cellId: string): Endpoint => ({ scopeId, cellId });
export const inspect = (from: Endpoint, to: Endpoint, sources: string[], label = "Inspect / verdict"): Connection => ({ from, to, sources, label, kind: "control", bidirectional: true });
export const spans = (from: Endpoint, to: Endpoint, sources: string[], label = "Spans"): Connection => ({ from, to, sources, label, kind: "telemetry" });
export const consumers = (callers: Endpoint[], target: Endpoint, sources: string[], kind: "control" | "telemetry") => callers.map(from => kind === "control" ? inspect(from, target, sources, "Model I/O / verdict") : spans(from, target, sources));

type PolicyCaller = { scopeId: string; label: string; detail: string; source: string };

export type PlatformDefinition = {
  modelConsumers: Endpoint[];
  mergeModelScope?: boolean;
  endpointLabel?: string;
  routingSummary?: string;
  modelCallLabel?: string;
  inspectModelIO?: boolean;
  beforeRouting?: (context: ModelViewContext) => void;
  infrastructureRoutes?: (context: ModelViewContext) => void;
  existingModelRoutes?: (context: ModelViewContext) => void;
  callSources?: string[];
  runtimeDetail?: string;
  securityView?: PlatformView;
  customizeInfrastructure?: (input: ArchitecturePages) => void;
  connections: Contract;
  applicationClients?: (PolicyCaller & { id: string })[];
  traceSource?: string;
  runExporter?: string;
  genAIExporter?: string;
  otlpStatusSource?: string;
  securityOwnsExportEdge?: boolean;
  customizePlatform?: (context: PlatformViewContext) => void;
  policyCaller?: PolicyCaller;
};
