/** Public package metadata. Runtime secrets and executable UI stay outside this contract. */
export type WorkspaceKey = "banking" | "fraud" | "briefing" | "research" | "advisory" | "sar" | "vulnerability" | "interbank";
export type DemoDefinition = {
  id: string; title: string; description: string; outcome: string; iconKey: string;
  accent: "blue" | "violet" | "mint" | "amber"; solutions: string[]; signal: string;
  stage: "Interactive" | "In development" | "Planned";
  mode: "live" | "illustrative"; architectureId: string;
  runtimeId?: string; workspaceKey?: WorkspaceKey;
  model?: { calls: string; applies: string; clientData?: boolean };
  assets: { ui: string | null; narrative: string; presenter: string };
};
