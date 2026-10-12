import { existsSync, readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { expect, type Page } from "@playwright/test";

/** Services up with AI Defense and Agent Control on, as on the demo machine; briefing runs without AI Defense. */
export const STATUS_LIVE = {
  checkedAt: "2026-10-12T12:00:00.000Z",
  services: [
    { id: "banking", label: "Brahe Bank", up: true, ready: true, detail: "", aiDefense: { status: "configured", mode: "enforce" }, agentControl: { status: "enforcing", names: ["Banking scope"] }, tracing: "configured", otel: "missing_configuration" },
    { id: "fraud", label: "Fraud scoring", up: true, ready: true, detail: "", aiDefense: { status: "configured", mode: "enforce" }, agentControl: { status: "enforcing", names: ["fraud.take_action"] }, tracing: "configured", otel: "missing_configuration" },
    { id: "briefing", label: "Company briefing", up: true, ready: true, detail: "", aiDefense: { status: "disabled", mode: "off" }, agentControl: null, tracing: null, otel: null },
    { id: "wealth", label: "Wealth research and advisory", up: true, ready: true, detail: "", aiDefense: { status: "disabled", mode: "off" }, agentControl: { status: "not_started", names: [] }, tracing: "configured", otel: "missing_configuration" },
    { id: "sar", label: "SAR investigation", up: true, ready: true, detail: "", aiDefense: { status: "configured", mode: "enforce" }, agentControl: { status: "enforcing", names: ["sar.file_requires_approval"] }, tracing: "configured", otel: "missing_configuration" },
  ],
  interbank: {
    up: true, aiDefense: { mode: "enforce, fail closed", region: "us-west-2", hops: 5 }, agentControl: "<bank>.send_a2a_message",
    project: "Interbank A2A Settlement Demo", stream: "Interbank settlement investigations", runs: [],
  },
  models: [],
  links: { agentObservability: null, splunkObservability: null },
  readiness: [],
};

export function statusWith(serviceId: string, patch: Record<string, unknown>) {
  return { ...STATUS_LIVE, services: STATUS_LIVE.services.map((service) => (service.id === serviceId ? { ...service, ...patch } : service)) };
}

const RECORDED_DIRS: Record<string, string> = {
  banking: "services/banking/data/recorded", briefing: "services/briefing/data/recorded", fraud: "services/fraud/data/recorded",
  sar: "services/sar/data/recorded", wealth: "services/wealth/data/recorded", interbank: "services/interbank/recorded",
};

function listing(dir: string) {
  return readdirSync(resolve(dir)).filter((name) => name.endsWith(".json")).map((file) => {
    const doc = JSON.parse(readFileSync(resolve(dir, file), "utf8"));
    return { name: file.replace(/\.json$/, ""), title: doc.title ?? file, scenario: doc.scenario ?? null, recorded_at: doc.recorded_at ?? null, served_by: doc.served_by ?? null, events: (doc.events ?? []).length, duration_ms: null, synthetic: Boolean(doc.synthetic) };
  });
}

/** Endpoints that call a model or start an agent; a guided tour on recorded runs must never reach them. */
const PAID = [
  /\/api\/banking\/chat$/, /\/api\/briefing\/(analyze|search)/, /\/api\/fraud\/runs$/, /\/api\/sar\/runs$/,
  /\/api\/wealth\/research\/analyze$/, /\/api\/wealth\/advisory\/brief$/, /\/api\/interbank\/(runs|kickoff)$/,
];

/** Mocks studio status and serves committed recordings from disk; returns the paid calls the page attempted. */
export async function mockStudio(page: Page, status: object = STATUS_LIVE) {
  const paid: string[] = [];
  await page.route("**/api/**", (route) => {
    const request = route.request();
    const path = new URL(request.url()).pathname;
    if (request.method() === "POST" && PAID.some((pattern) => pattern.test(path))) {
      paid.push(path);
      return route.fulfill({ status: 503, json: { detail: "Blocked in tests: no model calls." } });
    }
    return route.fallback();
  });
  await page.route(/\/api\/(banking|briefing|fraud|sar|wealth|studio)\/recordings(\/[^/?]+)?(\/[^/?]+)?(\?.*)?$/, (route) => {
    const parts = new URL(route.request().url()).pathname.split("/").filter(Boolean);
    const service = parts[1] === "studio" ? parts[3] : parts[1];
    const name = parts[1] === "studio" ? parts[4] : parts[3];
    const dir = RECORDED_DIRS[service];
    if (!dir) return route.fulfill({ status: 404, json: { detail: "No recordings." } });
    if (!name) return route.fulfill({ json: { recordings: listing(dir) } });
    const file = resolve(dir, `${decodeURIComponent(name)}.json`);
    return existsSync(file) ? route.fulfill({ body: readFileSync(file, "utf8"), contentType: "application/json" }) : route.fulfill({ status: 404, json: { detail: "Not found." } });
  });
  await page.route("**/api/studio/status", (route) => route.fulfill({ json: status }));
  return paid;
}

export async function setTheme(page: Page, theme: "dark" | "light") {
  await page.addInitScript((value) => localStorage.setItem("fsi-studio.theme", value), theme);
}

export type StepSeen = { step: string; title: string; source: string; fits: string[]; overlap: boolean; holes: number; active: number };

const card = (page: Page) => page.locator(".guide-card");

/** What the guide shows now: the card must sit clear of every highlighted target. */
export async function snapshot(page: Page): Promise<StepSeen> {
  return page.evaluate(() => {
    const element = document.querySelector<HTMLElement>(".guide-card")!;
    const box = element.getBoundingClientRect();
    const rings = [...document.querySelectorAll(".guide-ring")].map((ring) => ring.getBoundingClientRect());
    const inSlot = Boolean(element.closest("#presenter-guide-slot"));
    const overlap = !inSlot && rings.some((ring) => !(box.right <= ring.left + 1 || box.left >= ring.right - 1 || box.bottom <= ring.top + 1 || box.top >= ring.bottom - 1));
    return {
      step: element.dataset.guideStep ?? "",
      title: element.querySelector("h2")?.textContent ?? "",
      source: element.querySelector(".guide-source, .guide-label")?.textContent ?? "",
      fits: [...element.querySelectorAll<HTMLElement>(".guide-fit")].map((fit) => `${fit.querySelector("span")?.textContent?.replace("Cisco fit · ", "")}=${fit.dataset.ciscoStatus}`),
      overlap,
      holes: rings.length,
      active: document.querySelectorAll("[data-guide-active='true']").length,
    };
  });
}

async function settle(page: Page) {
  await expect(card(page)).toHaveAttribute("data-guide-ready", "true", { timeout: 60_000 });
  await page.waitForTimeout(450);
}

/**
 * Walks the open tour to its end: replays when the card offers it, waits out wait steps,
 * and skips act steps that need a person's decision. Returns every step seen.
 */
export async function walk(page: Page, { act = false, maxSteps = 40 }: { act?: boolean; maxSteps?: number } = {}) {
  const seen: StepSeen[] = [];
  for (let index = 0; index < maxSteps; index += 1) {
    await settle(page);
    const view = await snapshot(page);
    if (seen.at(-1)?.step !== view.step) seen.push(view);
    // The card may still be sliding into place; it must come to rest clear of the targets.
    if (view.overlap) await expect.poll(async () => (await snapshot(page)).overlap, { timeout: 3000, message: `${view.step}: the card covers a highlighted target` }).toBe(false);
    await expect(page.locator(".guide-dim")).toBeAttached();
    if (view.holes) await expect.poll(() => page.locator("[data-guide-active='true']").count(), { message: `${view.step}: targets are marked` }).toBeGreaterThan(0);

    const replay = card(page).locator(".guide-actions .primary");
    if (await replay.isVisible()) {
      await replay.click();
      await page.waitForTimeout(600);
      continue;
    }
    const next = card(page).locator(".guide-nav .primary");
    const label = (await next.textContent())?.trim() ?? "";
    if (label.startsWith("Finish")) { await next.click(); break; }
    if (act && label.startsWith("Skip") && !label.includes("anyway") && !label.includes("ahead")) {
      const target = page.locator("[data-guide-active='true']").first();
      const own = await target.evaluate((element) => element.matches("button"));
      const primary = target.locator("button.primary:not(:disabled), button.primary-button:not(:disabled)").first();
      const button = own ? target : (await primary.count()) ? primary : target.locator("button:not(:disabled)").first();
      if (await button.count()) { await button.click(); await page.waitForTimeout(800); continue; }
    }
    await expect(next).toBeEnabled({ timeout: 90_000 });
    await next.click();
    if ((await next.textContent())?.includes("Skip anyway")) await next.click();
    await expect.poll(async () => (await card(page).count()) === 0 || (await card(page).getAttribute("data-guide-step")) !== view.step, { timeout: 60_000 }).toBe(true);
  }
  return seen;
}

export async function openLibrary(page: Page, path = "/") {
  await page.goto(path, { waitUntil: "networkidle" });
  await expect(page.locator(".card-guide").first()).toBeVisible({ timeout: 30_000 });
}
