import { defineConfig } from "@playwright/test";

const chrome = process.env.CHROME_PATH ?? "/home/cuneocode/.cache/ms-playwright/chromium-1246/chrome-linux-arm64/chrome";

export default defineConfig({
  testDir: "tests",
  testMatch: ["explorer.spec.ts", "settings.spec.ts"],
  timeout: 90_000,
  expect: { timeout: 15_000 },
  outputDir: "artifacts/explorer/test-output",
  use: {
    baseURL: process.env.STUDIO_URL ?? "http://127.0.0.1:4200",
    viewport: { width: 1440, height: 900 },
    reducedMotion: "no-preference",
    launchOptions: {
      executablePath: chrome,
      args: ["--no-sandbox", "--disable-dev-shm-usage"],
    },
  },
});
