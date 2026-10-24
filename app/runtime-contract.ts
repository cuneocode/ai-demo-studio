export type RuntimeJob = { state: "idle" | "running" | "succeeded" | "failed"; operation?: string; log: string[] };
export type RuntimeRow = {
  id: string; label: string; port: number; up: boolean; ready?: boolean; detail?: string;
  managed: boolean; installed: boolean; install: string; pending: string[] | null;
  state?: string; project?: string; job?: RuntimeJob;
  controls?: boolean; components?: { id: string; label: string; requirements: string }[];
};
export type ServicesSnapshot = {
  docker?: { ready: boolean; detail: string };
  services: RuntimeRow[];
  interbank?: RuntimeRow;
  packages?: { id: string; title: string; mode: "live" | "illustrative"; runtime: string | null }[];
};
