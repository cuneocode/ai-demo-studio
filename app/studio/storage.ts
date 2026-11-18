// Versioned browser state. Legacy FSI keys remain compatible during migration.
type ReadableStorage = Pick<Storage, "getItem" | "setItem">;
type MutableStorage = ReadableStorage & Pick<Storage, "removeItem">;
const ROOT = "ai-demo-studio.v1";
const previousVulnerability = `${ROOT}:apps:fsi:demos:code-vulnerability:`;
const vulnerability = `${ROOT}:apps:cyber-ai-foundry:demos:code-vulnerability:`;
const legacyKeys: Record<string, string> = {
  "fsi-studio.theme": `${ROOT}:global:theme`,
  "fsi-studio.sidebar-collapsed": `${ROOT}:global:sidebar-collapsed`,
  "fsi-demo-narrative-expanded": `${ROOT}:global:narrative-expanded`,
  "fsi-studio.guide.prefs": `${ROOT}:global:guide-prefs`,
  "fsi-studio.guide": `${ROOT}:apps:fsi:guide-position`,
  "fsi-demo-studio.company-profile": `${ROOT}:apps:fsi:company-profile`,
  "fsi-demo-studio.research-note": `${ROOT}:apps:fsi:research-note`,
  "fsi-demo-studio.advisory-brief": `${ROOT}:apps:fsi:advisory-brief`,
  "fsi-studio.handoffs": `${ROOT}:apps:fsi:handoffs`,
  "fsi-vulnerability-last-run": `${vulnerability}last-run`,
};
export const appStorageKey = (appId: string, name: string, demoId?: string) => `${ROOT}:apps:${appId}:${demoId ? `demos:${demoId}:` : ""}${name}`;
export function storageKey(key: string) {
  const planner = /^fsi-studio\.planner\.v1:([^:]+):assessment$/.exec(key);
  const target = legacyKeys[key] ?? (planner ? appStorageKey("fsi", "planner-assessment", planner[1]) : key);
  return target.startsWith(previousVulnerability) ? target.replace(previousVulnerability, vulnerability) : target;
}
function migrationSources(key: string, target: string): string[] {
  if (!target.startsWith(vulnerability)) return target === key ? [] : [key];
  const name = target.slice(vulnerability.length);
  const legacy = name === "last-run" ? "fsi-vulnerability-last-run"
    : name === "planner-assessment" ? "fsi-studio.planner.v1:code-vulnerability:assessment" : null;
  return [previousVulnerability + name, ...(legacy ? [legacy] : [])];
}
export function readStored(storage: ReadableStorage | null | undefined, key: string): string | null {
  try {
    if (!storage) return null;
    const target = storageKey(key);
    const value = storage.getItem(target);
    const sources = migrationSources(key, target);
    if (!sources.length || storage.getItem(`${target}:migrated`) === "1") return value;
    let migrated = value;
    if (migrated === null) for (const source of sources) {
      migrated = storage.getItem(source);
      if (migrated !== null || storage.getItem(`${source}:migrated`) === "1") break;
    }
    if (value === null && migrated !== null) storage.setItem(target, migrated);
    storage.setItem(`${target}:migrated`, "1");
    return migrated;
  } catch { return null; }
}
export function writeStored(storage: ReadableStorage | null | undefined, key: string, value: string) {
  try {
    if (!storage) return;
    const target = storageKey(key);
    storage.setItem(target, value);
    if (migrationSources(key, target).length) storage.setItem(`${target}:migrated`, "1");
    if (target !== key) { storage.setItem(`${target}:migrated`, "1"); storage.setItem(key, value); }
  } catch { /* Storage is optional. In-memory work remains available. */ }
}
export function removeStored(storage: MutableStorage | null | undefined, key: string) {
  try {
    if (!storage) return;
    const target = storageKey(key);
    storage.removeItem(target);
    if (migrationSources(key, target).length) storage.setItem(`${target}:migrated`, "1");
    if (target !== key) { storage.setItem(`${target}:migrated`, "1"); storage.removeItem(key); }
  } catch { /* Storage is optional. */ }
}
