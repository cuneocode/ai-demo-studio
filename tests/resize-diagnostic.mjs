import { chromium } from "@playwright/test";
import { readFileSync, writeFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";

const baseURL = process.argv[2] ?? "http://127.0.0.1:4200/";
const runMode = process.argv[3] ?? "development";
const output = process.argv[4];
const chrome = process.env.CHROME_PATH ?? "/home/cuneocode/.cache/ms-playwright/chromium-1246/chrome-linux-arm64/chrome";
const projectRoot = path.resolve(import.meta.dirname, "..");

function packageVersion(name) {
  const manifest = path.join(projectRoot, "node_modules", ...name.split("/"), "package.json");
  return JSON.parse(readFileSync(manifest, "utf8")).version;
}

const branches = [
  {
    id: "request",
    path: ["brahe.assistant", "brahe.stage.check", "brahe.check.inspect"],
    collapse: ["brahe.check.inspect", "brahe.stage.check", "brahe.assistant"],
    source: "brahe.inspect.request.call",
  },
  {
    id: "hosting",
    path: ["brahe.assistant", "brahe.stage.build", "brahe.build.host"],
    collapse: ["brahe.build.host", "brahe.stage.build", "brahe.assistant"],
    source: "brahe.host.runtime",
  },
  {
    id: "answer",
    path: ["brahe.assistant", "brahe.stage.return", "brahe.return.inspect"],
    collapse: ["brahe.return.inspect", "brahe.stage.return", "brahe.assistant"],
    source: "brahe.answer.control",
  },
];

const browser = await chromium.launch({ executablePath: chrome, args: ["--no-sandbox", "--disable-dev-shm-usage"] });
const report = {
  baseURL,
  runMode,
  startedAt: new Date().toISOString(),
  cleanReload: true,
  hmr: false,
  cyclesPerBranch: 20,
  dependencies: Object.fromEntries(["react", "react-dom", "@xyflow/react", "@xyflow/system", "vinext", "vite", "motion", "elkjs"].map((name) => [name, packageVersion(name)])),
  browser: { version: await browser.version(), executable: chrome },
  os: { platform: os.platform(), release: os.release(), arch: os.arch() },
  branches: [],
};

for (const branch of branches) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const consoleErrors = [];
  const pageErrors = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push({ at: Date.now(), text: message.text() });
  });
  page.on("pageerror", (error) => pageErrors.push({ at: Date.now(), message: error.message, stack: error.stack }));
  await page.addInitScript(() => {
    globalThis.__resizeDiagnostic = { windowErrors: [], unhandledRejections: [] };
    window.addEventListener("error", (event) => {
      globalThis.__resizeDiagnostic.windowErrors.push({
        at: performance.now(),
        message: event.message,
        operationId: globalThis.__mapOperationId ?? null,
        representationGeneration: globalThis.__mapRepresentationGeneration ?? null,
        explorer: document.querySelector("[data-testid='architecture-explorer']")?.getAttribute("data-expanded-groups") ?? null,
      });
    }, true);
    window.addEventListener("unhandledrejection", (event) => {
      globalThis.__resizeDiagnostic.unhandledRejections.push({
        at: performance.now(),
        reason: String(event.reason),
        operationId: globalThis.__mapOperationId ?? null,
        representationGeneration: globalThis.__mapRepresentationGeneration ?? null,
      });
    });
  });
  await page.goto(baseURL, { waitUntil: "networkidle" });
  const runtime = await page.evaluate(() => ({
    userAgent: navigator.userAgent,
    devicePixelRatio,
    browserZoom: outerWidth ? innerWidth / outerWidth : null,
    viewport: { width: innerWidth, height: innerHeight },
  }));
  await page.getByRole("button", { name: "Open Brahe Bank assistant experience" }).click();
  const explorer = page.getByTestId("architecture-explorer");
  await explorer.scrollIntoViewIfNeeded();
  const groupByOccurrence = {
    "brahe.assistant": "group.assistant",
    "brahe.stage.check": "group.check",
    "brahe.check.inspect": "group.request-inspection",
    "brahe.stage.build": "group.build",
    "brahe.build.host": "group.hosting",
    "brahe.stage.return": "group.return",
    "brahe.return.inspect": "group.answer-inspection",
  };
  const activate = async (id, action, included) => {
    const group = groupByOccurrence[id];
    const button = page.locator(`[data-id="${id}"] [data-action="${action}"]`);
    await button.waitFor({ state: "attached" });
    await button.evaluate((element) => element.click());
    await page.waitForFunction(({ groupId, expected }) => {
      const expanded = (document.querySelector("[data-testid='architecture-explorer']")?.getAttribute("data-expanded-groups") ?? "").split(",");
      return expanded.includes(groupId) === expected;
    }, { groupId: group, expected: included });
  };
  const samples = [];
  for (let cycle = 0; cycle < 20; cycle += 1) {
    if (cycle === 10) await page.setViewportSize({ width: 1280, height: 800 });
    for (const id of branch.path) {
      await activate(id, "expand", true);
      await page.waitForTimeout(120);
    }
    if ([0, 9, 10, 19].includes(cycle)) {
      for (const delay of [100, 300, 800]) {
        await page.waitForTimeout(delay);
        samples.push(await explorer.evaluate((root, meta) => {
          const zoom = Number(root.getAttribute("data-zoom")) || 1;
          return {
            ...meta,
            operationId: globalThis.__mapOperationId ?? null,
            representationGeneration: root.getAttribute("data-representation-generation"),
            expanded: root.getAttribute("data-expanded-groups"),
            zoom,
            focus: root.getAttribute("data-platform-focus"),
            canvas: (() => {
              const rect = root.querySelector(".map-canvas")?.getBoundingClientRect();
              return rect ? { width: Math.round(rect.width * 10) / 10, height: Math.round(rect.height * 10) / 10 } : null;
            })(),
            framingInputs: globalThis.__mapFramingInputs ?? null,
            renderedViewport: root.querySelector(".react-flow__viewport")?.getAttribute("style") ?? null,
            nodes: [...root.querySelectorAll(".react-flow__node")].map((node) => {
              const rect = node.getBoundingClientRect();
              return { id: node.getAttribute("data-id"), width: Math.round(rect.width / zoom * 10) / 10, height: Math.round(rect.height / zoom * 10) / 10 };
            }),
          };
        }, { cycle, delay }));
      }
    }
    if (cycle === 0 || cycle === 10) {
      const beforeSource = await explorer.locator(".react-flow__viewport").getAttribute("style");
      await explorer.locator(`[data-id="${branch.source}"] .map-source-btn`).click();
      await explorer.locator(".src-view").waitFor({ state: "visible" });
      await explorer.getByRole("button", { name: "Close source" }).click();
      const afterSource = await explorer.locator(".react-flow__viewport").getAttribute("style");
      samples.push({ cycle, sourceRestored: beforeSource === afterSource });
    }
    for (const id of branch.collapse) {
      await activate(id, "collapse", false);
      await page.waitForTimeout(120);
    }
  }
  const raw = await page.evaluate(() => globalThis.__resizeDiagnostic);
  report.branches.push({
    id: branch.id,
    runtime,
    consoleErrors,
    pageErrors,
    windowErrors: raw.windowErrors,
    unhandledRejections: raw.unhandledRejections,
    samples,
  });
  await page.close();
}

report.finishedAt = new Date().toISOString();
report.totals = {
  windowErrors: report.branches.reduce((count, branch) => count + branch.windowErrors.length, 0),
  pageErrors: report.branches.reduce((count, branch) => count + branch.pageErrors.length, 0),
  consoleErrors: report.branches.reduce((count, branch) => count + branch.consoleErrors.length, 0),
  unhandledRejections: report.branches.reduce((count, branch) => count + branch.unhandledRejections.length, 0),
};
await browser.close();

const serialized = `${JSON.stringify(report, null, 2)}\n`;
if (output) writeFileSync(output, serialized);
process.stdout.write(serialized);
if (report.totals.windowErrors || report.totals.pageErrors || report.totals.unhandledRejections) process.exitCode = 1;
