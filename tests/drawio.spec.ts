import { expect, test } from "@playwright/test";
import { mkdir } from "node:fs/promises";
import { mockStudio } from "./guide-helpers";
import { component, diagram, openCanvas } from "./drawio-helpers";

test.use({ actionTimeout: 15000 });

test("Brahe expands real nested groups on one canvas and restores framing on collapse", async ({ page }) => {
  const explorer = await openCanvas(page);
  const native = diagram(page).locator("#canvas");
  await component(page, "journey::ask").evaluate(element => element.setAttribute("data-persistent", "yes"));
  const rootCamera = await native.getAttribute("data-camera");
  await component(page, "journey::assistant").press("Enter");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  const systemCamera = await native.getAttribute("data-camera");
  await component(page, "system::build").press("Enter");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "system,build");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(component(page, "system::check")).toBeVisible();
  await expect(component(page, "system::release")).toBeVisible();
  await expect(component(page, "build::supervisor")).toBeVisible();
  await expect(component(page, "build::score-tool")).toBeVisible();
  await expect(component(page, "journey::ask")).toHaveAttribute("data-persistent", "yes");
  await expect(native).toHaveAttribute("data-model-loads", "1");
  await mkdir("artifacts/drawio/continuous", { recursive: true });
  await page.screenshot({ path: "artifacts/drawio/continuous/brahe-build.png" });
  const beforeSource = await native.getAttribute("data-camera");
  await component(page, "build::score-tool").press("Enter");
  await expect(explorer.locator(".src-view")).toContainText("550");
  await expect(native).toHaveAttribute("data-camera", beforeSource!);
  await explorer.getByRole("button", { name: "Back", exact: true }).click();
  await expect(explorer.getByRole("complementary")).toHaveCount(0);
  await expect(native).toHaveAttribute("data-camera", beforeSource!);
  await component(page, "system::build").press("Escape");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(native).toHaveAttribute("data-camera", systemCamera!);
  await expect(component(page, "build::supervisor")).toHaveCount(0);
  await component(page, "journey::assistant").press("Enter");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(native).toHaveAttribute("data-camera", rootCamera!);
  await expect(native).toHaveAttribute("data-model-loads", "1");
});

test("layers, modes, source facets and themes preserve the shared camera and graph", async ({ page }) => {
  const external: string[] = [];
  page.on("request", request => { if (new URL(request.url()).hostname.endsWith("diagrams.net")) external.push(request.url()); });
  const explorer = await openCanvas(page);
  await component(page, "journey::assistant").press("Enter");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  const native = diagram(page).locator("#canvas");
  const camera = await native.getAttribute("data-camera");
  for (const layer of ["Security", "Observability", "AI Infrastructure"]) {
    await explorer.getByRole("button", { name: layer, exact: true }).click();
    await expect(explorer).toHaveAttribute("data-phase", "idle");
    await expect(native).toHaveAttribute("data-camera", camera!);
  }
  await expect(component(page, "system::defense")).toBeVisible();
  await expect(component(page, "system::trace")).toBeVisible();
  await expect(component(page, "system::model")).toBeVisible();
  await explorer.getByRole("button", { name: "Proposed", exact: true }).click();
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(component(page, "system::private")).toBeVisible();
  await expect(component(page, "system::model")).toHaveCount(0);
  await expect(native).toHaveAttribute("data-camera", camera!);
  await explorer.getByRole("button", { name: "Implemented", exact: true }).click();
  await component(page, "system::check").press("Enter");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(component(page, "check::stop")).toBeVisible();
  await component(page, "check::control").press("Enter");
  const sourceCamera = await native.getAttribute("data-camera");
  await expect(explorer.getByRole("complementary", { name: "Source inspector" })).toBeVisible();
  await explorer.getByRole("button", { name: "Decision", exact: true }).click();
  await expect(native).toHaveAttribute("data-camera", sourceCamera!);
  await explorer.getByRole("button", { name: "Close source", exact: true }).click();
  await explorer.getByRole("button", { name: "Exit full screen" }).click();
  await page.getByRole("button", { name: "Switch to light theme" }).click();
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(native).toHaveCSS("background-color", "rgb(248, 250, 252)");
  await expect(native).toHaveAttribute("data-model-loads", "1");
  expect(external).toEqual([]);
});

test("a missing canvas retries and reduced motion remains responsive during interrupted expansion", async ({ page }) => {
  await page.emulateMedia({ reducedMotion: "reduce" });
  await page.route("**/diagrams/brahe.drawio", route => route.fulfill({ status: 503, body: "Unavailable" }));
  await page.goto("/", { waitUntil: "networkidle" });
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience", exact: true }).click();
  await page.getByRole("tab", { name: "Architecture", exact: true }).click();
  const explorer = page.getByTestId("architecture-explorer");
  await expect(explorer.getByRole("alert")).toContainText("could not be loaded");
  await page.unroute("**/diagrams/brahe.drawio");
  await explorer.getByRole("button", { name: "Retry diagram" }).click();
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await component(page, "journey::assistant").press("Enter");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await component(page, "system::check").press("Enter");
  await explorer.getByRole("button", { name: "Collapse all", exact: true }).click();
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "");
  await expect(diagram(page).locator("#canvas")).toHaveAttribute("data-model-loads", "1");
});

for (const [id, step] of [["brahe-bank", "banking.architecture"], ["fraud-modeling", "fraud.architecture"], ["company-briefing", "briefing.architecture"], ["kyc-processing", "kyc.architecture"]]) {
  test(`${id}: architecture guide waits for the local draw.io canvas`, async ({ page }) => {
    const paid = await mockStudio(page);
    await page.goto(`/?guide=${id}&step=${step}`, { waitUntil: "domcontentloaded" });
    await expect(page.getByRole("tab", { name: "Architecture", exact: true })).toHaveAttribute("aria-selected", "true");
    await expect(page.getByTestId("architecture-explorer")).toHaveAttribute("data-phase", "idle");
    await expect(page.getByRole("dialog")).toHaveAttribute("data-guide-ready", "true");
    expect(paid).toEqual([]);
  });
}

test("mouse panning, zoom, interrupted expansion and laptop framing keep one model", async ({ page }) => {
  const explorer = await openCanvas(page);
  const native = diagram(page).locator("#canvas");
  await component(page, "journey::assistant").press("Enter");
  await expect(explorer).toHaveAttribute("data-expanded-groups", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  const previous = await native.getAttribute("data-camera");
  const rect = await explorer.locator("iframe").boundingBox();
  await page.mouse.move(rect!.x + 8, rect!.y + rect!.height - 140);
  await page.mouse.down();
  await page.mouse.move(rect!.x + 88, rect!.y + rect!.height - 110, { steps: 8 });
  await page.mouse.up();
  await expect(native).not.toHaveAttribute("data-camera", previous!);
  const panned = await native.getAttribute("data-camera");
  await explorer.getByRole("button", { name: "Zoom in", exact: true }).click();
  await expect(native).not.toHaveAttribute("data-camera", panned!);
  await component(page, "system::check").press("Enter");
  await expect(explorer).toHaveAttribute("data-scope-id", "check");
  await explorer.getByRole("button", { name: "Back", exact: true }).click();
  await expect(explorer).toHaveAttribute("data-scope-id", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(component(page, "check::inspect")).toHaveCount(0);
  await component(page, "system::build").press("Enter");
  await expect(explorer).toHaveAttribute("data-scope-id", "build");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await page.setViewportSize({ width: 1280, height: 800 });
  const focused = await component(page, "system::build").evaluate(element => {
    const rect = element.getBoundingClientRect();
    return { x: rect.x, y: rect.y, right: rect.right, bottom: rect.bottom, width: window.innerWidth, height: window.innerHeight };
  });
  expect(focused.x).toBeGreaterThanOrEqual(0);
  expect(focused.y).toBeGreaterThanOrEqual(0);
  expect(focused.right).toBeLessThanOrEqual(focused.width);
  expect(focused.bottom).toBeLessThanOrEqual(focused.height);
  await page.screenshot({ path: "artifacts/drawio/continuous/brahe-laptop.png" });
  await component(page, "system::build").click({ position: { x: 24, y: 20 } });
  await expect(explorer).toHaveAttribute("data-scope-id", "system");
  await expect(explorer).toHaveAttribute("data-phase", "idle");
  await expect(native).toHaveAttribute("data-model-loads", "1");
});
