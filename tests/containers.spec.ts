import { expect, test } from "@playwright/test";
import { useCasePackages } from "../config/use-cases";
import type { RuntimeRow } from "../app/runtime-contract";

test("operator starts and stops independent demo stacks and keeps illustrative modules explicit", async ({ page }) => {
  const rows: RuntimeRow[] = useCasePackages.flatMap(item => item.runtime ? [{
    id: item.runtime.id, label: item.title, port: item.runtime.port, up: item.runtime.id === "research",
    managed: item.runtime.id === "research", ready: true, installed: true, install: "", pending: [],
    state: item.runtime.id === "research" ? "ready" : "stopped", job: { state: "idle", log: [] },
  }] : []);
  const actions: { action: string; ids?: string[] }[] = [];
  const snapshot = () => ({ docker: { ready: true, detail: "Docker available" }, services: rows,
    packages: useCasePackages.map(item => ({ ...item, runtime: item.runtime?.id ?? null })) });
  await page.route(/\/api\/studio\/status(?:\?.*)?$/, route => route.fulfill({ json: { checkedAt: "2026-10-23", services: [], interbank: { up: false, runs: [] }, models: [], links: {}, readiness: [] } }));
  await page.route(/\/api\/studio\/settings(?:\?.*)?$/, route => route.fulfill({ json: { file: ".env", settings: {}, readiness: [] } }));
  await page.route(/\/api\/studio\/models(?:\?.*)?$/, route => route.fulfill({ json: { registry: { version: 2, chain: ["test"], providers: { test: { label: "Test model", kind: "vllm", baseUrl: "http://model:8000/v1", model: "test", private: true, apiKeyEnv: "", responsesApi: false } }, useCases: {} }, keys: {}, health: {}, saved: true } }));
  await page.route(/\/api\/studio\/services(?:\?.*)?$/, async route => {
    if (route.request().method() === "POST") {
      const body = route.request().postDataJSON(); actions.push(body);
      const row = rows.find(item => item.id === body.ids?.[0]);
      if (body.action === "logs") return route.fulfill({ json: { log: "Application ready" } });
      if (row) {
        row.managed = true; row.up = body.action !== "stop";
        row.state = row.up ? "ready" : "stopped";
        row.job = { state: "succeeded", operation: body.action, log: ["Operation completed"] };
      }
    }
    return route.fulfill({ json: snapshot() });
  });
  await page.goto("/apps/fsi", { waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Studio settings" }).click();
  const advisory = page.getByRole("row", { name: "Advisor meeting prep stack", exact: true });
  const research = page.getByRole("row", { name: "Market research stack", exact: true });
  await expect(research).toContainText("ready");
  await advisory.getByRole("button", { name: "Start", exact: true }).click();
  await expect(advisory).toContainText("ready");
  await advisory.getByRole("button", { name: "Stop", exact: true }).click();
  await expect(advisory).toContainText("stopped");
  await expect(research).toContainText("ready");
  await expect(page.getByText("KYC processing: illustrative module", { exact: false })).toBeVisible();
  await expect(page.getByText("Transaction intelligence: illustrative module", { exact: false })).toBeVisible();
  expect(actions).toEqual([{ action: "start", ids: ["advisory"] }, { action: "stop", ids: ["advisory"] }]);
  await page.reload({ waitUntil: "networkidle" });
  await page.locator(".side-nav").getByRole("button", { name: "Studio settings" }).click();
  await expect(page.getByRole("row", { name: "Market research stack", exact: true })).toContainText("ready");
  await expect(page.getByRole("row", { name: "Advisor meeting prep stack", exact: true })).toContainText("stopped");
});
