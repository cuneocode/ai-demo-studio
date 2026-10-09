"use client";

import { useEffect, useState } from "react";
import type { Readiness } from "./studio-settings";

export type UseCaseHealth = {
  id: string;
  label: string;
  up: boolean;
  ready: boolean;
  detail: string;
  aiDefense: { status: string; mode: string } | null;
  agentControl: { status: string; names: string[] } | null;
  tracing: string | null;
  otel: string | null;
};

export type InterbankRun = { id: string; status: string; startedAt: string; traceId: string | null; prompt: string };

export type StudioStatus = {
  checkedAt: string;
  services: UseCaseHealth[];
  interbank: {
    up: boolean;
    aiDefense: { mode: string; region: string; hops: number } | null;
    agentControl: string | null;
    project: string | null;
    stream: string | null;
    runs: InterbankRun[];
  };
  models: { id: string; label: string; host: string; up: boolean }[];
  links: { agentObservability: string; splunkObservability: string | null };
  readiness: Readiness[];
};

export type Tone = "mint" | "amber" | "violet" | "blue";

/** The service behind each live use case. */
export const USE_CASE_SERVICE: Record<string, string> = {
  "brahe-bank": "banking",
  "fraud-modeling": "fraud",
  "company-briefing": "briefing",
  "market-research": "wealth",
  "client-advisory": "wealth",
  "sar-support": "sar",
  "interbank-a2a": "interbank",
};

/** Polls the studio status; null until the first answer, or when the studio API is unavailable. */
export function useStudioStatus(intervalMs = 10000) {
  const [status, setStatus] = useState<StudioStatus | null>(null);
  const [tick, setTick] = useState(0);
  useEffect(() => {
    let live = true;
    const load = () => fetch("/api/studio/status", { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((next) => { if (live) setStatus(next); })
      .catch(() => { if (live) setStatus(null); });
    load();
    const timer = setInterval(load, intervalMs);
    return () => { live = false; clearInterval(timer); };
  }, [intervalMs, tick]);
  return { status, refresh: () => setTick((value) => value + 1) };
}

export const humanize = (value: string) => value.replace(/_/g, " ");

/** Rows for the service bell, in the order a presenter checks them. */
export function serviceRows(status: StudioStatus) {
  const rows = status.services.map((service) => ({
    id: service.id, label: service.label,
    ok: service.up && service.ready,
    detail: !service.up ? "Not running" : service.ready ? "Ready" : service.detail,
  }));
  rows.push({ id: "interbank", label: "Interbank lab (Docker)", ok: status.interbank.up, detail: status.interbank.up ? "Ready" : "Not running · npm run interbank:up" });
  for (const model of status.models) rows.push({ id: `model-${model.id}`, label: model.label, ok: model.up, detail: model.up ? `Serving at ${model.host}` : `Nothing answering at ${model.host}` });
  return rows;
}

const defenseOn = (mode?: string) => Boolean(mode && mode !== "off");

/** One line per Cisco capability for the sidebar and launcher. */
export function platformSummary(status: StudioStatus | null) {
  if (!status) {
    const unknown = { tone: "blue" as Tone, detail: "Status unavailable" };
    return { defense: unknown, observability: unknown, infrastructure: unknown };
  }
  const running = status.services.filter((service) => service.up);
  const protectedCount = running.filter((service) => defenseOn(service.aiDefense?.mode)).length + (status.interbank.aiDefense ? 1 : 0);
  const traced = running.filter((service) => service.tracing && service.tracing !== "missing_configuration" && service.tracing !== "disabled").length + (status.interbank.up && status.interbank.project ? 1 : 0);
  const modelsUp = status.models.filter((model) => model.up).length;
  return {
    defense: { tone: (protectedCount ? "mint" : "amber") as Tone, detail: protectedCount ? `${protectedCount} protected` : "No service protected" },
    observability: { tone: (traced ? "violet" : "amber") as Tone, detail: traced ? `${traced} tracing` : "No traces configured" },
    infrastructure: {
      tone: (status.models.length && !modelsUp ? "amber" : "blue") as Tone,
      detail: status.models.length ? `${modelsUp} of ${status.models.length} endpoints up` : "Hosted models only",
    },
  };
}

/** Whether a story moment can be shown live right now; prototypes always can. */
export function momentReady(status: StudioStatus | null, useCaseId: string, live: boolean) {
  if (!live) return { ready: true, reason: "Illustrative" };
  if (!status) return { ready: false, reason: "Studio status unavailable" };
  const settings = status.readiness.find((row) => row.id === useCaseId);
  if (settings && !settings.ready) return { ready: false, reason: `Needs ${settings.missing.join(", ")}` };
  const serviceId = USE_CASE_SERVICE[useCaseId];
  if (serviceId === "interbank") return status.interbank.up ? { ready: true, reason: "Ready" } : { ready: false, reason: "Interbank lab is not running" };
  const service = status.services.find((item) => item.id === serviceId);
  if (!service?.up) return { ready: false, reason: `${service?.label ?? "Service"} is not running` };
  return service.ready ? { ready: true, reason: "Ready" } : { ready: false, reason: service.detail };
}
