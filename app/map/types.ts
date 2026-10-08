export type EdgeKind = "sequence" | "data" | "control" | "telemetry" | "hosting";
export type Mode = "implemented" | "proposed";
export type Role = "human" | "ai" | "decision" | "outcome" | "service" | "model" | "security" | "telemetry" | "data";

export type Entity = {
  id: string;
  title: string;
  subtitle?: string;
  detail: string;
  role: Role;
  status: "implemented" | "proposed" | "mock";
  modes?: Mode[];
  childScopeId?: string;
  evidenceId?: string;
};

export type ScopeNode = {
  id: string;
  entityId: string;
  x: number;
  y: number;
};

export type ScopeEdge = {
  id: string;
  from: string;
  to: string;
  label: string;
  kind: EdgeKind;
};

export type Scope = {
  id: string;
  title: string;
  level: 0 | 1 | 2;
  blurb: string;
  modes: Mode[];
  nodes: ScopeNode[];
  edges: ScopeEdge[];
};

export type CaseMap = {
  id: string;
  entities: Record<string, Entity>;
  scopes: Record<string, Scope>;
  root: string;
};

export type EvidenceRef = {
  id: string;
  file: string;
  symbol: string;
  start: number;
  end: number;
  proves: string;
  label?: string;
  integrationId?: string;
  proofRole?: "Call" | "Decision" | "Setup" | "Trace correlation" | "Full context";
  evidenceKind?: "source" | "configuration" | "test" | "captured-run";
  dependencies?: string[];
};
