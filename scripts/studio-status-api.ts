// /api/studio/status: one read-only snapshot for the studio shell (service
// bell, Cisco platform rows, Controls, Telemetry, help, story readiness).
// It passes on status fields only; no setting value beyond URLs and names.
import type { IncomingMessage, ServerResponse } from "node:http";
import type { StudioStatus, UseCaseHealth } from "../app/studio-status.ts";
import { envValue } from "./studio-env.ts";
import { fetchText, send } from "./studio-http.ts";
import { loadRegistry, providerHealth } from "./studio-models-api.ts";
import { settingsSnapshot } from "./studio-settings-api.ts";
import { INTERBANK, SERVICES } from "./studio-services.ts";
import { requestScope, type StudioScope } from "./studio-scope.ts";

type Json = Record<string, unknown>;
const object = (value: unknown): Json => (value && typeof value === "object" && !Array.isArray(value) ? value as Json : {});
const text = (value: unknown) => (typeof value === "string" ? value.slice(0, 200) : "");
const names = (value: unknown) => (Array.isArray(value) ? value.filter((item): item is string => typeof item === "string").slice(0, 8) : []);

async function getJson(url: string, timeout = 2000): Promise<unknown> {
  try {
    const { status, text: body } = await fetchText(url, { timeout });
    return status === 200 ? JSON.parse(body) : null;
  } catch {
    return null;
  }
}

function serviceHealth(id: string, label: string, raw: unknown): UseCaseHealth {
  if (!raw) return { id, label, up: false, ready: false, detail: "Not running", aiDefense: null, agentControl: null, tracing: null, otel: null };
  const health = object(raw);
  const security = object(health.security);
  const observability = object(health.observability);
  const controls = object(health.controls ?? observability.controls);
  const model = object(health.nim ?? health.model);
  const answering = object(object(health.backend).answering);
  const fallbackModel = model.fallback ? model : answering.fallback ? answering : null;
  const ready = health.ready !== false && controls.status !== "unavailable";
  const detail = ready ? "" : text(health.detail) || text(controls.detail) || (controls.status === "unavailable" ? "Hosted controls are unavailable" : text(model.status) === "down" ? "Model endpoint is not answering" : text(health.error) || "Not ready");
  return {
    id, label, up: true, ready, detail,
    fallback: id === "fraud" && health.backend && health.backend !== "live" ? text(health.backend_label) || "Sample scores" : fallbackModel ? text(fallbackModel.label) || "Secondary model" : null,
    aiDefense: security.status ? { status: text(security.status), mode: text(security.mode) } : null,
    agentControl: controls.status ? { status: text(controls.status), names: names(controls.names) } : null,
    tracing: text(object(observability.tracing).status) || text(health.galileo) || null,
    otel: text(object(health.splunk).status) || null,
  };
}

/** Private (self-hosted) endpoints in use, for the AI Infrastructure row. */
async function probeModels() {
  const { registry, unconfigured } = loadRegistry();
  const health = await providerHealth(registry, unconfigured);
  return Object.entries(registry.providers)
    .filter(([id, provider]) => provider.private && !unconfigured[id])
    .map(([id, provider]) => ({ id, label: provider.label, host: new URL(provider.baseUrl).host, up: Boolean(health[id]?.up) }));
}

async function build(scope: StudioScope): Promise<StudioStatus> {
  const servicesInScope = SERVICES.filter(spec => scope.runtimeIds.includes(spec.id));
  const includesInterbank = scope.runtimeIds.includes("interbank");
  if (process.env.STUDIO_PREVIEW === "1") return {
    scope, mode: "preview", checkedAt: new Date().toISOString(),
    services: servicesInScope.map(spec => serviceHealth(spec.id, spec.label, null)),
    interbank: { up: false, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
    models: [], links: { agentObservability: "https://console.multitenant.galileocloud.io", splunkObservability: null }, readiness: [],
  };
  const [services, lab, runtime, runs, models] = await Promise.all([
    Promise.all(servicesInScope.map(async (spec) => serviceHealth(spec.id, spec.label, await getJson(`http://127.0.0.1:${spec.port}${spec.health}`)))),
    includesInterbank ? getJson(`http://127.0.0.1:${INTERBANK.port}${INTERBANK.health}`) : null,
    includesInterbank ? getJson(`http://127.0.0.1:${INTERBANK.port}/api/runtime`) : null,
    includesInterbank ? getJson(`http://127.0.0.1:${INTERBANK.port}/api/runs`) : null,
    probeModels(),
  ]);
  const defense = object(object(runtime).ai_defense);
  const observability = object(object(runtime).observability);
  const realm = envValue("SPLUNK_REALM");
  return {
    scope,
    checkedAt: new Date().toISOString(),
    services,
    interbank: {
      up: Boolean(lab),
      aiDefense: defense.mode ? { mode: text(defense.mode), region: text(defense.region), hops: Object.values(object(defense.hops)).flatMap(names).length } : null,
      agentControl: text(object(object(runtime).agent_control).step) || null,
      project: text(observability.project) || null,
      stream: text(observability.agent_stream) || null,
      runs: (Array.isArray(runs) ? runs : []).slice(0, 5).map((run) => {
        const item = object(run);
        return { id: text(item.id), status: text(item.status), startedAt: text(item.started_at), traceId: text(item.trace_id) || null, prompt: text(item.prompt).slice(0, 120) };
      }),
    },
    models,
    links: {
      agentObservability: envValue("GALILEO_CONSOLE_URL") || "https://console.multitenant.galileocloud.io",
      splunkObservability: /^[a-z]+\d+$/.test(realm) ? `https://app.${realm}.signalfx.com/#/apm` : null,
    },
    readiness: settingsSnapshot().readiness.filter(row => scope.useCaseIds.includes(row.id)),
  };
}

// The shell polls from several places; one probe round serves them all.
const cached = new Map<string, { at: number; value: Promise<StudioStatus> }>();

export async function handleStatus(request: IncomingMessage, response: ServerResponse) {
  if (request.method !== "GET") return send(response, 405, { error: "Method not allowed." });
  const scope = requestScope(request);
  let entry = cached.get(scope.key);
  if (!entry || Date.now() - entry.at > 3000) {
    entry = { at: Date.now(), value: build(scope) };
    cached.set(scope.key, entry);
  }
  send(response, 200, await entry.value);
}
