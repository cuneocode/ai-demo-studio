// Integrated production-style local presentation runtime.
// The trusted operator supplies scoped configuration to independently managed containers.
import { spawn } from "node:child_process";
import http from "node:http";
import { fileURLToPath } from "node:url";
import { handleStudioApi, stopAll } from "./studio-api.ts";
import { runtimeForPath, rewriteRuntimePath } from "../config/use-cases.ts";

const root = fileURLToPath(new URL("../", import.meta.url));
const host = "127.0.0.1";
const studioPort = Number(process.env.STUDIO_PORT || 4200);
const frontendPort = Number(process.env.FRONTEND_PORT || studioPort + 1);

const children = [];
children.push(spawn(process.execPath, [`${root}node_modules/.bin/vinext`, "start", "--hostname", host], {
  cwd: root,
  stdio: "inherit",
  env: { ...process.env, PORT: String(frontendPort), WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
}));

const server = http.createServer((request, response) => {
  if (handleStudioApi(request, response)) return;
  const service = runtimeForPath(request.url ?? "");
  if (request.url?.startsWith("/api/briefing") && Number(request.headers["content-length"] || 0) > 45 * 1024 * 1024) {
    response.writeHead(413, { "content-type": "application/json" });
    response.end(JSON.stringify({ detail: "Upload a PDF, HTML, or TXT annual report (40 MB or less)." }));
    return;
  }
  const port = service?.port ?? frontendPort;
  const upstream = http.request({
    hostname: host,
    port,
    path: service ? rewriteRuntimePath(service, request.url) : request.url,
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
  upstream.setTimeout(service?.timeout ?? 300000, () => upstream.destroy(new Error("Upstream timed out.")));
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
  void stopAll();
  setTimeout(() => process.exit(code), 1500);
}
children.forEach((child) => {
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!stopping) stop(code ?? 1);
  });
});
process.on("SIGINT", () => stop());
process.on("SIGTERM", () => stop());
