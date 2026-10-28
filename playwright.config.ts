import { defineConfig } from "@playwright/test";

const chrome = process.env.CHROME_PATH;

export default defineConfig({
  testDir: "tests",
  testMatch: ["vertical-apps.spec.ts", "vulnerability.spec.ts", "planner.spec.ts", "containers.spec.ts", "drawio.spec.ts", "explorer.spec.ts", "settings.spec.ts", "shell.spec.ts", "stats.spec.ts", "models.spec.ts", "fraud.spec.ts", "wealth.spec.ts", "header.spec.ts", "sar.spec.ts", "lifecycle.spec.ts", "banking.spec.ts", "briefing.spec.ts", "interbank.spec.ts", "guide.spec.ts", "guide-a11y.spec.ts", "guide-lifecycle.spec.ts"],
  timeout: 90_000,
  workers: 1,
  expect: { timeout: 15_000 },
  outputDir: "artifacts/explorer/test-output",
  use: {
    baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:4200",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    launchOptions: {
      ...(chrome ? { executablePath: chrome } : {}),
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
