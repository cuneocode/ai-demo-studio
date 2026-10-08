import { execFile } from "node:child_process";
import vinext from "vinext";
import { defineConfig, type ViteDevServer } from "vite";
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
        // The interbank lab runs in Docker (npm run interbank:up); its dashboard serves /api/* on 8088.
        "/api/interbank": { target: "http://127.0.0.1:8088", changeOrigin: false, timeout: 30000, proxyTimeout: 30000, rewrite: (path: string) => path.replace(/^\/api\/interbank/, "/api") },
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
      {
        // Source excerpts are read from the files on disk, so the code viewer works
        // whether or not the lab's containers are running.
        name: "interbank-sources",
        configureServer(viteServer: ViteDevServer) {
          viteServer.middlewares.use("/api/interbank/sources", (req, res) => {
            const id = (req.url || "/").split("?")[0].replace(/^\//, "") || "--catalog";
            if (id !== "--catalog" && !/^[a-z0-9-]+$/.test(id)) {
              res.statusCode = 404;
              res.end();
              return;
            }
            execFile("python3", ["services/interbank/demo/sources.py", id], { maxBuffer: 8 * 1024 * 1024 }, (error, stdout) => {
              res.setHeader("Content-Type", "application/json");
              res.statusCode = error ? 404 : 200;
              res.end(error ? JSON.stringify({ detail: "unknown source" }) : stdout);
            });
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
