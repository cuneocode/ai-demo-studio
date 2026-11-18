import { readFile, realpath } from 'node:fs/promises';
import path from 'node:path';
import { createHash, randomBytes } from 'node:crypto';
import type { IncomingMessage, ServerResponse } from 'node:http';
import { apps, appForDemo } from '../config/apps.ts';
import { demoDefinitions } from '../config/demos.ts';
import { ContentError, bindingSignature, mergeContent, normalizeContent, object, resolveEntries, slugPattern, type ApprovedModule, type ContentSnapshot } from '../config/content/contract.ts';
import { readJson, send, writeRefusal } from './studio-http.ts';
import { resolveScope } from './studio-scope.ts';

const MAX_BYTES = 256 * 1024;
const sessions = new Map<string, { touched: number; selected?: string; documents: Map<string, unknown> }>();
const TTL = 8 * 60 * 60 * 1000;
const root = () => path.resolve(process.env.STUDIO_CONTENT_ROOT || 'config/content');
async function confined(directory: string, file: string) {
  const base = await realpath(directory);
  const target = await realpath(path.resolve(base, file));
  if (!target.startsWith(base + path.sep)) throw new ContentError('Content paths must stay inside their package directory.');
  return target;
}
async function readDocument(file: string) {
  const data = await readFile(file);
  if (data.length > MAX_BYTES) throw new ContentError('Content exceeds 256 KB.', 413);
  try { return JSON.parse(data.toString('utf8')) as unknown; } catch { throw new ContentError('Invalid JSON content.'); }
}
export async function approvedModules(): Promise<ApprovedModule[]> {
  const value = await readDocument(await confined(root(), 'approved.json'));
  if (!Array.isArray(value)) throw new ContentError('approved.json must be a list.');
  const ids = new Set<string>();
  return value.map(item => {
    if (!object(item) || typeof item.id !== 'string' || !slugPattern.test(item.id) || typeof item.name !== 'string' || typeof item.dir !== 'string') throw new ContentError('Invalid approved module.');
    if (ids.has(item.id)) throw new ContentError(`Duplicate module ${item.id}.`); ids.add(item.id);
    if (item.content !== undefined && typeof item.content !== 'string') throw new ContentError('Module content must be a relative file path.');
    return item as ApprovedModule;
  });
}
async function defaultDocument(id: string) {
  const contentModule = (await approvedModules()).find(item => item.id === id);
  if (!contentModule?.content) throw new ContentError('This module has no content file.', 404);
  const directory = await confined(root(), path.join('modules', contentModule.dir));
  return { contentModule, raw: await readDocument(await confined(directory, contentModule.content)) };
}
export async function contentSnapshot(id: string, patch?: unknown, replacement = false): Promise<ContentSnapshot> {
  const { contentModule, raw } = await defaultDocument(id);
  const baseline = normalizeContent(raw);
  const document = normalizeContent(patch === undefined ? raw : replacement ? patch : mergeContent(raw, patch));
  if (bindingSignature(document) !== bindingSignature(baseline)) throw new ContentError('Session overrides cannot change x-studio bindings or authored extensions.');
  const entries = resolveEntries(document, contentModule, demoDefinitions.map(demo => ({ id: demo.id, appId: appForDemo(demo.id)!.id })), apps.map(app => app.id));
  const scope = resolveScope(null);
  const allowed = entries.filter(entry => scope.appIds.includes(entry.appId));
  return { moduleId: id, revision: createHash('sha256').update(JSON.stringify(document)).digest('hex').slice(0, 20), document, entries: allowed, warnings: [] };
}
function session(request: IncomingMessage, response: ServerResponse) {
  const now = Date.now();
  for (const [key, value] of sessions) if (now - value.touched > TTL) sessions.delete(key);
  const cookie = /(?:^|;\s*)studio_content=([a-f0-9]{48})(?:;|$)/.exec(request.headers.cookie || '')?.[1];
  let id = cookie && sessions.has(cookie) ? cookie : undefined;
  if (!id) {
    if (sessions.size >= 1000) sessions.delete(sessions.keys().next().value!);
    id = randomBytes(24).toString('hex');
    sessions.set(id, { touched: now, documents: new Map() });
    response.setHeader('Set-Cookie', `studio_content=${id}; Path=/; HttpOnly; SameSite=Strict${request.socket && 'encrypted' in request.socket && request.socket.encrypted ? '; Secure' : ''}`);
  }
  const value = sessions.get(id)!; value.touched = now; return value;
}
export async function handleContent(request: IncomingMessage, response: ServerResponse) {
  try {
    const url = new URL(request.url || '/', 'http://studio.local');
    const contentPath = url.pathname.replace(/\/$/, '');
    const isModules = contentPath === '/api/studio/content/modules';
    const legacy = contentPath === '/api/motion/content';
    if (!['GET', 'POST'].includes(request.method || '') || (isModules && request.method !== 'GET')) return send(response, 405, { error: 'Method not allowed.' });
    if (isModules) return send(response, 200, { modules: (await approvedModules()).map(({ id, name, description, demo_id }) => ({ id, name, description, demo_id })) });
    const state = session(request, response);
    const id = url.searchParams.get('module') || state.selected;
    if (!id || !slugPattern.test(id)) throw new ContentError('Select an approved content module.', 404);
    if (request.method === 'POST') {
      const refusal = writeRefusal(request); if (refusal) return send(response, refusal.status, refusal);
      if (Number(request.headers['content-length'] || 0) > MAX_BYTES) throw new ContentError('Content exceeds 256 KB.', 413);
      const input = await readJson(request, MAX_BYTES);
      if (!object(input)) throw new ContentError('Content must be a JSON object.');
      if (Object.keys(input).length === 1 && input.load === 'default') { await contentSnapshot(id); state.documents.delete(id); }
      else {
        const patch = Object.hasOwn(input, 'content') && !Object.hasOwn(input, 'title') && !Object.hasOwn(input, 'usecases') ? input.content : input;
        if (!object(patch)) throw new ContentError('Content must be a JSON object.');
        // Validate the patch tree, including reserved keys, before merging.
        normalizeContent({ override: patch });
        const { raw } = await defaultDocument(id);
        const next = mergeContent(state.documents.get(id) ?? raw, patch);
        await contentSnapshot(id, next, true); state.documents.set(id, next);
      }
    }
    const snapshot = await contentSnapshot(id, state.documents.get(id), true);
    state.selected = id;
    return send(response, 200, legacy ? snapshot.document : snapshot);
  } catch (error) {
    const status = error instanceof ContentError ? error.status : 422;
    const legacy = request.url?.split('?')[0].replace(/\/$/, '') === '/api/motion/content';
    send(response, legacy && status === 422 ? 400 : status, { error: error instanceof ContentError ? error.message : 'The content package could not be read. Check its manifest and file paths.' });
  }
}
