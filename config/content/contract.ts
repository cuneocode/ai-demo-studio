/** Neil-compatible presentation documents. Executable capabilities stay registered in code. */
export type JsonObject = { [key: string]: unknown };
export type ContentUseCase = JsonObject & { id: string; title?: string; tagline?: string; url?: string; repo?: string; specialist?: JsonObject; workspaces?: { name: string; url: string; repo?: string }[] };
export type ContentDocument = JsonObject & { title?: string; subtitle?: string; headline?: string; usecases: ContentUseCase[]; build?: JsonObject };
export type ApprovedModule = { id: string; name: string; description?: string; demo_id?: string; dir: string; content?: string; base?: string; entry?: string; 'x-studio'?: { appId?: string; bindings?: Record<string, { appId: string; nativeDemoId: string }> } };
export type ContentEntry = { id: string; sourceId: string; moduleId: string; appId: string; title: string; description: string; objective: string; category: string; nativeDemoId?: string; url?: string; repo?: string; workspaces: { name: string; url: string; repo?: string }[]; narrative?: unknown; presenter?: unknown; frame?: unknown; architectureId?: string; customer: JsonObject; specialist: JsonObject };
export type ContentSnapshot = { moduleId: string; revision: string; document: ContentDocument; entries: ContentEntry[]; warnings: string[] };
export class ContentError extends Error { status: number; constructor(message: string, status = 422) { super(message); this.status = status; } }
export const object = (value: unknown): value is JsonObject => value !== null && typeof value === 'object' && !Array.isArray(value);
export const text = (value: unknown, fallback = '') => typeof value === 'string' ? value : fallback;
export const slugPattern = /^[a-z0-9][a-z0-9-]{0,79}$/;
export function safeUrl(value: unknown): string | undefined {
  if (typeof value !== 'string') return;
  const url = value.trim();
  if (/[\u0000-\u0020\u007f\\]/.test(url)) return;
  if (url.startsWith('/') && !url.startsWith('//')) return url;
  try { const parsed = new URL(url); if (['http:', 'https:'].includes(parsed.protocol) && !parsed.username && !parsed.password) return parsed.href; } catch { /* Invalid URLs have no workspace action. */ }
}
/** JSON Merge Patch semantics: objects recurse, lists replace, null removes a field. */
export function mergeContent(base: unknown, patch: unknown): unknown {
  if (!object(base) || !object(patch)) return structuredClone(patch);
  const merged: JsonObject = structuredClone(base);
  for (const [key, value] of Object.entries(patch)) {
    if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ContentError('Reserved JSON key.');
    if (value === null) delete merged[key]; else merged[key] = mergeContent(merged[key], value);
  }
  return merged;
}
export function normalizeContent(value: unknown): ContentDocument {
  if (!object(value)) throw new ContentError('Content must be a JSON object.');
  // Validate the complete tree before any merge or projection.
  const check = (v: unknown, depth = 0) => {
    if (depth > 40) throw new ContentError('Content nesting exceeds 40 levels.');
    if (Array.isArray(v)) v.forEach(x => check(x, depth + 1));
    else if (object(v)) for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new ContentError('Reserved JSON key.');
      check(child, depth + 1);
    }
  }; check(value);
  const doc = structuredClone(value);
  for (const field of ['title', 'subtitle', 'headline']) if (doc[field] !== undefined && typeof doc[field] !== 'string') throw new ContentError(`${field} must be a string.`);
  if (doc.usecases !== undefined && !Array.isArray(doc.usecases)) throw new ContentError('usecases must be a list.');
  const ext = doc['x-studio'];
  if (ext !== undefined && (!object(ext) || ext.schemaVersion !== 1)) throw new ContentError('Unsupported x-studio schemaVersion.');
  const ids = new Set<string>();
  const uses: ContentUseCase[] = [];
  for (const item of (doc.usecases ?? []) as unknown[]) {
    // Neil drops malformed entries; retain that behavior and reject ambiguous identities.
    if (!object(item) || typeof item.id !== 'string' || !slugPattern.test(item.id)) continue;
    if (ids.has(item.id)) throw new ContentError(`Duplicate use case ${item.id}.`);
    ids.add(item.id);
    const use = item as ContentUseCase;
    for (const target of [use, ...(object(use.specialist) ? [use.specialist] : [])]) {
      const url = safeUrl(target.url); if (url) target.url = url; else delete target.url;
    }
    use.workspaces = Array.isArray(use.workspaces) ? use.workspaces.filter(object).flatMap(space => {
      const url = safeUrl(space.url); return url ? [{ name: text(space.name, url), url, ...(typeof space.repo === 'string' ? { repo: space.repo } : {}) }] : [];
    }) : [];
    const spec = object(use.specialist) ? use.specialist : {};
    use.specialist = { ...Object.fromEntries(['title', 'tagline', 'story', 'who', 'data', 'agent', 'gpu', 'url', 'note'].filter(key => use[key] !== undefined).map(key => [key, use[key]])), ...Object.fromEntries(Object.entries(spec).filter(([, v]) => v !== null && v !== '' && !(Array.isArray(v) && !v.length))) };
    delete use.specialist.specialist;
    uses.push(use);
  }
  doc.usecases = uses;
  const build = object(doc.build) ? doc.build : {};
  const views = object(build.views) ? build.views : object(doc.views) ? doc.views : {};
  if (object(views.customer)) {
    const customer = { ...views.customer, label: text(views.customer.label, 'Customer') };
    views.customer = customer;
    views.specialist = { ...customer, label: 'Specialist', ...(object(views.specialist) ? Object.fromEntries(Object.entries(views.specialist).filter(([, v]) => v !== null && v !== '')) : {}) };
  }
  build.views = views;
  const guide = build.guide ?? doc.guide;
  build.guide = Array.isArray(guide) ? guide.filter(object).flatMap(step => typeof step.route === 'string' && (typeof step.text === 'string' || typeof step.specialist === 'string') ? [{ ...step, text: text(step.text, text(step.specialist)), specialist: text(step.specialist, text(step.text)) }] : []) : [];
  doc.build = build;
  return doc as ContentDocument;
}
export function resolveEntries(document: ContentDocument, module: ApprovedModule, installed: { id: string; appId: string }[], appIds: string[]): ContentEntry[] {
  const ids = new Set<string>();
  return document.usecases.map(use => {
    const ext = object(use['x-studio']) ? use['x-studio'] : {};
    const binding = module['x-studio']?.bindings?.[use.id];
    const nativeId = binding?.nativeDemoId ?? text(ext.nativeDemoId);
    const native = nativeId ? installed.find(item => item.id === nativeId) : undefined;
    if (nativeId && !native) throw new ContentError(`Unknown installed demo ${nativeId}.`);
    const appId = native?.appId ?? binding?.appId ?? text(ext.appId, module['x-studio']?.appId ?? (module.id === 'industry-apps' && appIds.includes(use.id) ? use.id : 'horizontal'));
    if (!appIds.includes(appId)) throw new ContentError(`Unknown library ${appId}.`);
    if (native && binding?.appId && binding.appId !== native.appId) throw new ContentError(`Binding for ${native.id} is outside its library.`);
    const id = native?.id ?? `json-${module.id.length}-${module.id}-${use.id}`;
    if (ids.has(id)) throw new ContentError(`Duplicate resolved demo ${id}.`); ids.add(id);
    return { id, sourceId: use.id, moduleId: module.id, appId, title: text(use.title, use.id), description: text(use.tagline), objective: text(ext.outcome, `Open ${text(use.title, use.id)} in the owning application.`), category: text(ext.category, 'Imported demos'), ...(native ? { nativeDemoId: native.id } : {}), url: safeUrl(use.url), repo: text(use.repo) || undefined, workspaces: use.workspaces ?? [], narrative: ext.narrative, presenter: ext.presenter, frame: ext.frame, architectureId: text(ext.architectureId) || undefined, customer: use, specialist: use.specialist ?? use };
  });
}
/** Preserve original workspace capabilities across session presentation overrides. */
export function bindingSignature(doc: ContentDocument): string {
  return JSON.stringify([doc['x-studio'] ?? null, doc.usecases.flatMap(use => object(use['x-studio']) ? [[use.id, use['x-studio']]] : []).sort((a, b) => String(a[0]).localeCompare(String(b[0])))]);
}
export function guideDestination(route: string, entries: ContentEntry[]): string | null {
  if (route === 'overview') return '/';
  if (route === 'library') { const owners = [...new Set(entries.map(entry => entry.appId))]; return owners.length === 1 ? `/apps/${owners[0]}/library` : '/'; }
  const match = /^uc\/([^/]+)\/(demo|arch|size)$/.exec(route);
  const entry = match && entries.find(item => item.sourceId === match[1] || item.id === match[1]);
  return entry ? `/apps/${entry.appId}/demos/${entry.id}${match![2] === 'demo' ? '' : `?tab=${match![2] === 'arch' ? 'architecture' : 'capacity'}`}` : null;
}
