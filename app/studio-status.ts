"use client";

import { useEffect, useState } from "react";
import type { Readiness } from "./studio-settings";
import { useCasePackages } from "../config/use-cases";

export type UseCaseHealth = {
  id: string;
  label: string;
  up: boolean;
  ready: boolean;
  detail: string;
  fallback?: string | null;
  aiDefense: { status: string; mode: string } | null;
  agentControl: { status: string; names: string[] } | null;
  tracing: string | null;
  otel: string | null;
};

export type InterbankRun = { id: string; status: string; startedAt: string; traceId: string | null; prompt: string };

export type StudioStatus = {
  mode?: "preview" | "live";
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
export const USE_CASE_SERVICE: Record<string, string> = Object.fromEntries(useCasePackages.flatMap(item => item.runtime ? [[item.id, item.runtime.id]] : []));

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
    detail: !service.up ? "Not running" : service.ready ? service.fallback ? `Live with fallback · ${service.fallback}` : "Live ready" : service.detail,
  }));
  rows.push({ id: "interbank", label: "Interbank lab (Docker)", ok: status.interbank.up, detail: status.interbank.up ? "Ready" : "Not running · npm run interbank:up" });
  for (const model of status.models) rows.push({ id: `model-${model.id}`, label: model.label, ok: model.up, detail: model.up ? `Serving at ${model.host}` : `Nothing answering at ${model.host}` });
  return rows;
}

const defenseOn = (mode?: string) => Boolean(mode && mode !== "off");
/** Tracing states that mean a service has Agent Observability configured, not that a trace was delivered. */
const TRACED = new Set(["configured", "traces_present", "recorded"]);

/** One line per Cisco capability for the sidebar and launcher. */
export function platformSummary(status: StudioStatus | null) {
  if (status?.mode === "preview") {
    const preview = { tone: "blue" as Tone, detail: "Recorded preview" };
    return { defense: preview, observability: preview, infrastructure: preview };
  }
  if (!status) {
    const unknown = { tone: "blue" as Tone, detail: "Status unavailable" };
    return { defense: unknown, observability: unknown, infrastructure: unknown };
  }
  const running = status.services.filter((service) => service.up);
  const protectedCount = running.filter((service) => service.aiDefense?.status === "configured" && defenseOn(service.aiDefense.mode)).length + (status.interbank.up && status.interbank.aiDefense ? 1 : 0);
  const traced = running.filter((service) => service.tracing && TRACED.has(service.tracing)).length + (status.interbank.up && status.interbank.project ? 1 : 0);
  const modelsUp = status.models.filter((model) => model.up).length;
  return {
    defense: { tone: (protectedCount ? "mint" : "amber") as Tone, detail: protectedCount ? `${protectedCount} protected` : "No service protected" },
    observability: { tone: (traced ? "violet" : "amber") as Tone, detail: traced ? `${traced} configured to trace` : "No traces configured" },
    infrastructure: {
      tone: (status.models.length && !modelsUp ? "amber" : "blue") as Tone,
      detail: status.models.length ? `${modelsUp} of ${status.models.length} endpoints up` : "Hosted models only",
    },
  };
}

/** Present mode's "Right now" line: what this moment can honestly claim as live at this moment. */
export function presenterStatus(status: StudioStatus | null, useCaseId: string, live: boolean): string {
  if (!live) return "Illustrative prototype, no live service: nothing on screen is measured.";
  if (!status) return "Studio status unavailable: check the service before claiming anything live.";
  const serviceId = USE_CASE_SERVICE[useCaseId];
  if (serviceId === "interbank") {
    const lab = status.interbank;
    if (!lab.up) return "The interbank lab is offline. The recorded investigation is available.";
    return [lab.aiDefense ? `AI Defense ${lab.aiDefense.mode} at the gateways` : "AI Defense not reported by the lab", lab.project ? `traces to ${lab.project}` : "no trace project reported"].join(" · ");
  }
  const service = status.services.find((item) => item.id === serviceId);
  if (useCaseId === "code-vulnerability") {
    if (!service?.up) return "Start the code vulnerability service in Studio settings.";
    if (!service.ready) return service.detail;
    return service.tracing === "configured" ? "DeepAgents / LangGraph · agent trace export configured" : "DeepAgents / LangGraph · run history stored locally";
  }
  if (!service?.up) return `${service?.label ?? "The service"} is not running: present a recorded run, labelled, or start it.`;
  const parts: string[] = [];
  if (!service.ready) parts.push(`Not ready: ${service.detail}`);
  const mode = service.aiDefense?.mode;
  parts.push(!mode || mode === "off" || service.aiDefense?.status !== "configured" ? "AI Defense is off here, so don't claim inspections" : `AI Defense ${mode}`);
  const control = service.agentControl?.status;
  if (control === "enforcing") parts.push("Agent Control hosted");
  else if (control === "local" || control === "local_checks") parts.push("Agent Control as local checks (not hosted)");
  else if (control === "not_started") parts.push("Agent Control binds on the first run; local checks until then");
  else if (control) parts.push(`Agent Control ${humanize(control)}`);
  parts.push(service.tracing && TRACED.has(service.tracing) ? "Agent Observability configured" : "no Agent Observability trace, so don't claim one");
  return parts.join(" · ");
}

/** Whether a story moment can be shown live right now; prototypes always can. */
export function momentReady(status: StudioStatus | null, useCaseId: string, live: boolean) {
  if (!live) return { ready: true, reason: "Illustrative prototype · no live service" };
  if (!status) return { ready: false, reason: "Studio status unavailable" };
  const settings = status.readiness.find((row) => row.id === useCaseId);
  if (settings && !settings.ready) return { ready: false, reason: `Needs ${settings.missing.join(", ")}` };
  const serviceId = USE_CASE_SERVICE[useCaseId];
  if (serviceId === "interbank") return status.interbank.up ? { ready: true, reason: "Live ready" } : { ready: false, reason: "Interbank lab is not running" };
  const service = status.services.find((item) => item.id === serviceId);
  if (!service?.up) return { ready: false, reason: `${service?.label ?? "Service"} is not running` };
  return service.ready ? { ready: true, reason: service.fallback ? `Live with fallback · ${service.fallback}` : "Live ready" } : { ready: false, reason: service.detail };
}
