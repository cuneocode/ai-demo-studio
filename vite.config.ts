import vinext from "vinext";
import { defineConfig } from "vite";
import hostingConfig from "./.openai/hosting.json";
import { sites } from "./build/sites-vite-plugin";

const SITE_CREATOR_PLACEHOLDER_DATABASE_ID =
  "00000000-0000-4000-8000-000000000000";

// LOCAL DEVELOPMENT ONLY: keep deployment bindings empty until the user explicitly
// authorizes hosting. Production services may change, but must retain the UI theme.
const { d1, r2 } = hostingConfig;

// macOS Seatbelt blocks FSEvents, so Codex previews need polling for HMR.
const isCodexSeatbeltSandbox = process.env.CODEX_SANDBOX === "seatbelt";

const localBindingConfig = {
  main: "./worker/index.ts",
  compatibility_flags: ["nodejs_compat"],
  d1_databases: d1
    ? [
        {
          binding: d1,
          database_name: "site-creator-d1",
          database_id: SITE_CREATOR_PLACEHOLDER_DATABASE_ID,
        },
      ]
    : [],
  r2_buckets: r2
    ? [
        {
          binding: r2,
          bucket_name: "site-creator-r2",
        },
      ]
    : [],
};

export default defineConfig(async () => {
  // Keep Wrangler and Miniflare state project-local. These are non-secret tool
  // settings; application environment belongs in ignored `.env*` files.
  process.env.WRANGLER_WRITE_LOGS ??= "false";
  process.env.WRANGLER_LOG_PATH ??= ".wrangler/logs";
  process.env.MINIFLARE_REGISTRY_PATH ??= ".wrangler/registry";

  // Wrangler snapshots its log path while the Cloudflare plugin is imported.
  const { cloudflare } = await import("@cloudflare/vite-plugin");

  return {
    server: {
      host: "127.0.0.1",
      port: Number(process.env.STUDIO_PORT || 4200),
      proxy: {
        "/api/banking": { target: "http://127.0.0.1:8011", changeOrigin: false, timeout: 120000, proxyTimeout: 120000 },
        "/api/fraud": { target: "http://127.0.0.1:8012", changeOrigin: false, timeout: 180000, proxyTimeout: 180000 },
        "/api/briefing": { target: "http://127.0.0.1:8013", changeOrigin: false, timeout: 240000, proxyTimeout: 240000 },
      },
      ...(isCodexSeatbeltSandbox ? { watch: { useFsEvents: false, usePolling: true } } : {}),
    },
    plugins: [
      {
        name: "briefing-upload-limit",
        configureServer(viteServer) {
          viteServer.middlewares.use((req, res, next) => {
            if (!req.url?.startsWith("/api/briefing")) {
              next();
              return;
            }
            const length = Number(req.headers["content-length"] || 0);
            if (length > 45 * 1024 * 1024) {
              res.statusCode = 413;
              res.setHeader("Content-Type", "application/json");
              res.end(JSON.stringify({ detail: "Upload a PDF, HTML, or TXT annual report (40 MB or less)." }));
              return;
            }
            next();
          });
        },
      },
      vinext(),
      sites(),
      cloudflare({
        viteEnvironment: { name: "rsc", childEnvironments: ["ssr"] },
        config: localBindingConfig,
      }),
    ],
  };
});
