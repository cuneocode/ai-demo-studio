// Integrated production-style local presentation runtime.
// Credentials remain in the existing ignored environment and are inherited by services.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { handleStudioModels } from "./studio-models-api.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const host = "127.0.0.1";
const studioPort = Number(process.env.STUDIO_PORT || 4200);
const frontendPort = Number(process.env.FRONTEND_PORT || studioPort + 1);
const reuseServices = process.env.STUDIO_REUSE_SERVICES === "true";
const serviceSpecs = [
  { prefix: "/api/banking", port: 8011, directory: "banking" },
  { prefix: "/api/fraud", port: 8012, directory: "fraud" },
  { prefix: "/api/briefing", port: 8013, directory: "briefing" },
  { prefix: "/api/wealth", port: 8014, directory: "wealth" },
];

const children = [];
if (!reuseServices) {
  for (const service of serviceSpecs) {
    const python = `${root}services/${service.directory}/.venv/bin/python`;
    if (!existsSync(python)) {
      console.error(`Run npm run ${service.directory}:install before starting the studio.`);
      process.exit(1);
    }
    children.push(spawn(python, ["-m", "uvicorn", "server:app", "--host", host, "--port", String(service.port)], {
      cwd: `${root}services/${service.directory}`,
      stdio: "inherit",
      env: process.env,
    }));
  }
}
children.push(spawn(process.execPath, [`${root}node_modules/.bin/vinext`, "start"], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: String(frontendPort), WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
}));

const server = http.createServer((request, response) => {
  if (handleStudioModels(request, response)) return;
  const service = serviceSpecs.find((candidate) => request.url?.startsWith(candidate.prefix));
  if (request.url?.startsWith("/api/briefing") && Number(request.headers["content-length"] || 0) > 45 * 1024 * 1024) {
    response.writeHead(413, { "content-type": "application/json" });
    response.end(JSON.stringify({ detail: "Upload a PDF, HTML, or TXT annual report (40 MB or less)." }));
    return;
  }
  const port = service?.port ?? frontendPort;
  const upstream = http.request({
    hostname: host,
    port,
    path: request.url,
    method: request.method,
    headers: { ...request.headers, host: `${host}:${port}` },
  }, (upstreamResponse) => {
    response.writeHead(upstreamResponse.statusCode ?? 502, upstreamResponse.headers);
    upstreamResponse.pipe(response);
  });
  upstream.on("error", () => {
    if (response.headersSent) {
      response.destroy();
      return;
    }
    response.writeHead(502, { "content-type": "application/json" });
    response.end(JSON.stringify({ detail: "The integrated studio service is unavailable." }));
  });
  request.pipe(upstream);
});

server.listen(studioPort, host, () => {
  console.log(`Integrated production studio: http://${host}:${studioPort}/`);
});

let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  server.close();
  children.forEach((child) => child.kill("SIGTERM"));
  setTimeout(() => process.exit(code), 800);
}
children.forEach((child) => {
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
