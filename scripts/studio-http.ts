// Shared plumbing for the studio's host-side API.
import http, { type IncomingMessage, type ServerResponse } from "node:http";
import https from "node:https";
import tls from "node:tls";

export function send(response: ServerResponse, status: number, body: unknown) {
  response.writeHead(status, { "content-type": "application/json", "cache-control": "no-store" });
  response.end(JSON.stringify(body));
}

export function readJson(request: IncomingMessage, limit = 64_000): Promise<unknown> {
  return new Promise((resolve) => {
    const chunks: Buffer[] = [];
    let size = 0;
    request.on("data", (chunk: Buffer) => {
      size += chunk.length;
      if (size <= limit) chunks.push(chunk);
    });
    request.on("end", () => {
      if (size > limit) return resolve(null);
      try { resolve(JSON.parse(Buffer.concat(chunks).toString("utf8"))); } catch { resolve(null); }
    });
    request.on("error", () => resolve(null));
  });
}

/** Writes come only from the studio page itself, as JSON. */
export function writeRefusal(request: IncomingMessage): { status: number; error: string } | null {
  if (!String(request.headers["content-type"] ?? "").includes("application/json")) return { status: 415, error: "Send JSON." };
  const origin = request.headers.origin;
  if (!origin) return null;
  try {
    return new URL(origin).host === request.headers.host ? null : { status: 403, error: "Cross-origin writes are not allowed." };
  } catch {
    return { status: 403, error: "Cross-origin writes are not allowed." };
  }
}

/** System roots too, so checks work behind a TLS-inspecting proxy. */
const trustedRoots = () => {
  const bundled = tls.getCACertificates?.("default") ?? [...tls.rootCertificates];
  try { return [...bundled, ...tls.getCACertificates("system")]; } catch { return bundled; }
};

export type Fetched = { status: number; text: string };

/** One outbound request with a timeout and a size cap. Redirects are not followed. */
export function fetchText(target: string, options: { method?: string; headers?: Record<string, string>; body?: string | Buffer; timeout?: number } = {}): Promise<Fetched> {
  const url = new URL(target);
  const client = url.protocol === "https:" ? https : http;
  return new Promise((resolve, reject) => {
    const request = client.request(url, {
      method: options.method ?? "GET",
      headers: { accept: "application/json", ...options.headers },
      timeout: options.timeout ?? 6000,
      ...(url.protocol === "https:" ? { ca: trustedRoots(), minVersion: "TLSv1.2" as const } : {}),
    }, (response) => {
      const chunks: Buffer[] = [];
      let size = 0;
      response.on("data", (chunk: Buffer) => {
        size += chunk.length;
        if (size > 2_000_000) request.destroy(new Error("too large"));
        else chunks.push(chunk);
      });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, text: Buffer.concat(chunks).toString("utf8") }));
    });
    request.on("timeout", () => request.destroy(Object.assign(new Error("timeout"), { code: "TIMEOUT" })));
    request.on("error", reject);
    request.end(options.body);
  });
}

export function networkProblem(error: unknown): string {
  const code = (error as { code?: string }).code;
  return code === "TIMEOUT" ? "No answer within 6 seconds."
    : code === "ECONNREFUSED" ? "Nothing is listening at that address."
    : code === "ENOTFOUND" ? "That host name does not resolve."
    : "The endpoint is unreachable from this machine.";
}
