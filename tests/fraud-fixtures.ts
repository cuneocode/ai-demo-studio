import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import type { Page } from "@playwright/test";

/* Card fraud triage, served from the committed golden recordings so every run is deterministic and needs no model. */

const DATA = join(process.cwd(), "services/fraud/data");
const SCENARIOS = JSON.parse(readFileSync(join(DATA, "scenarios.json"), "utf8"));
type Recording = { name: string; title: string; scenario: string; recorded_at: string; served_by: unknown; synthetic: boolean; run: Record<string, unknown>; events: { kind: string; data?: Record<string, unknown> }[] };
const RECORDINGS: Recording[] = readdirSync(join(DATA, "recorded")).filter((file) => file.endsWith(".json"))
  .map((file) => JSON.parse(readFileSync(join(DATA, "recorded", file), "utf8")));
const golden = (name: string) => RECORDINGS.find((item) => item.name === name)!;

const STATUS = {
  checkedAt: "2026-10-09T12:00:00.000Z",
  services: [],
  interbank: { up: true, aiDefense: null, agentControl: null, project: null, stream: null, runs: [] },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

const HEALTH = {
  ready: true, backend: "fixture", backend_label: "Sample scores", engine: null, model: "Sample scores (synthetic)",
  detail: "The live GNN sidecar is offline and no recorded scores exist. Showing sample scores.", threshold: 0.5, cases: 5,
  sidecar: { status: "down" }, recorded_at: null,
  agent: { status: "ready", label: "Deep Agent · OpenAI API", served_by: { provider: "openai", label: "OpenAI API", model: "gpt", external: true, fallback: true } },
  controls: { status: "enforcing", source: "agent_control", reason: null, policies: ["fraud.note_pii", "fraud.take_action"] },
  security: { status: "configured", mode: "enforce", fail_open: false },
  splunk: { status: "missing_configuration", galileo: "configured" },
  model_card: "not_measured",
};

type Mock = { decisions: { request_id: string; decision: string; by?: string; note?: string }[]; notes: { note: string }[] };

/** Plays a golden recording as a live run: events stop at each analyst request until the page posts the decision. */
export async function mockFraud(page: Page, { healthDown = false } = {}): Promise<Mock> {
  const mock: Mock = { decisions: [], notes: [] };
  const runs = new Map<string, Recording>();
  const decisionCounts = new Map<string, number>();
  await page.route(/\/api\/studio\/status(?:\?.*)?$/, (route) => route.fulfill({ json: STATUS }));
  await page.route("**/api/fraud/health", (route) => healthDown ? route.fulfill({ status: 502, body: "down" }) : route.fulfill({ json: HEALTH }));
  await page.route("**/api/fraud/scenarios", (route) => route.fulfill({ json: SCENARIOS }));
  await page.route("**/api/fraud/cases", (route) => route.fulfill({ json: { cases: [], threshold: 0.5 } }));
  await page.route("**/api/fraud/model-card", (route) => route.fulfill({ json: { status: "not_measured", source: null, tag: "Not measured yet — run on Sparky", headline: {}, missing: [] } }));
  await page.route("**/api/fraud/recordings", (route) => route.fulfill({ json: { recordings: RECORDINGS.map(({ name, title, scenario, recorded_at, served_by, synthetic, events }) => ({ name, title, scenario, recorded_at, served_by, synthetic, events: events.length })) } }));
  await page.route("**/api/fraud/recordings/*", (route) => {
    const name = decodeURIComponent(new URL(route.request().url()).pathname.split("/").pop()!);
    return route.fulfill({ json: golden(name) });
  });
  await page.route("**/api/fraud/notes", async (route) => {
    const body = route.request().postDataJSON() as { note: string };
    mock.notes.push(body);
    const pan = /\b(?:\d[ -]?){13,19}\b/.test(body.note);
    const ssn = /\b\d{3}-\d{2}-\d{4}\b/.test(body.note);
    const masked = body.note.replace(/\b(?:\d[ -]?){9,15}(\d{4})\b/g, "card ending $1").replace(/\b\d{3}-\d{2}-(\d{4})\b/g, "SSN ending $1");
    await route.fulfill({ json: {
      saved: !pan && !ssn, run_id: null,
      ai_defense: pan ? { status: "blocked", rules: ["PCI"] } : { status: "allowed", rules: [] },
      policy: { engine_label: "Agent Control", decision: pan || ssn ? "deny" : "allow", entities: [...(pan ? ["card number"] : []), ...(ssn ? ["SSN"] : [])] },
      masked: pan || ssn ? masked : null,
    } });
  });
  await page.route((url) => /\/api\/fraud\/runs\/[^/]+\/decision$/.test(url.pathname), async (route) => {
    mock.decisions.push(route.request().postDataJSON());
    const runId = new URL(route.request().url()).pathname.split("/").at(-2)!;
    decisionCounts.set(runId, (decisionCounts.get(runId) ?? 0) + 1);
    await route.fulfill({ json: { ok: true } });
  });
  await page.route((url) => url.pathname === "/api/fraud/runs", async (route) => {
    const body = route.request().postDataJSON() as { scenario: string };
    const recording = RECORDINGS.find((item) => item.scenario === body.scenario && item.name.endsWith("-scripted"))!;
    const runId = `fraud-mock-${body.scenario}`;
    runs.set(runId, recording);
    await route.fulfill({ json: { run_id: runId } });
  });
  await page.route((url) => /\/api\/fraud\/runs\/[^/]+$/.test(url.pathname), (route) => {
    const url = new URL(route.request().url());
    const runId = decodeURIComponent(url.pathname.split("/").pop()!);
    const recording = runs.get(runId);
    if (!recording) return route.fulfill({ status: 404, json: { detail: "Unknown run." } });
    const stops = recording.events.flatMap((event, index) => event.kind === "hitl.request" ? [index] : []);
    const decided = decisionCounts.get(runId) ?? 0;
    const done = decided >= stops.length;
    const visible = done ? recording.events : recording.events.slice(0, stops[decided] + 1);
    const after = Number(url.searchParams.get("after") ?? 0);
    return route.fulfill({ json: {
      run: { ...recording.run, id: runId, status: done ? "completed" : "running", finished_at: done ? recording.run.finished_at : null, result: undefined },
      events: visible.slice(after).map((event) => ({ ...event, run_id: runId })), total: visible.length,
    } });
  });
  return mock;
}
