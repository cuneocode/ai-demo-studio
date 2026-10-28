import { readStored, writeStored, removeStored } from "../studio/storage.ts";
export const POSITION_KEY = "fsi-studio.guide";
export const PREFS_KEY = "fsi-studio.guide.prefs";

export type GuidePosition = { tourId: string; stepId: string; at: number };
export type GuidePrefs = { showCiscoFit: boolean };

const DEFAULT_PREFS: GuidePrefs = { showCiscoFit: true };
/** A saved position older than this is not offered for resume. */
const POSITION_TTL = 6 * 60 * 60 * 1000;

function read<T>(storage: Storage | undefined, key: string): T | null {
  try {
    const raw = readStored(storage, key);
    return raw ? (JSON.parse(raw) as T) : null;
  } catch {
    return null;
  }
}

function write(storage: Storage | undefined, key: string, value: unknown) {
  try {
    if (value === null) removeStored(storage, key);
    else writeStored(storage, key, JSON.stringify(value));
  } catch {
    // Storage can be full or disabled; the tour still works without it.
  }
}

const session = () => (typeof window === "undefined" ? undefined : window.sessionStorage);
const local = () => (typeof window === "undefined" ? undefined : window.localStorage);

export function loadPosition(): GuidePosition | null {
  const value = read<GuidePosition>(session(), POSITION_KEY);
  if (!value?.tourId || !value.stepId || Date.now() - (value.at ?? 0) > POSITION_TTL) return null;
  return value;
}

export function savePosition(position: GuidePosition | null) {
  write(session(), POSITION_KEY, position);
}

export function loadPrefs(): GuidePrefs {
  return { ...DEFAULT_PREFS, ...(read<Partial<GuidePrefs>>(local(), PREFS_KEY) ?? {}) };
}

export function savePrefs(prefs: GuidePrefs) {
  write(local(), PREFS_KEY, prefs);
}

export function readDeepLink(search: string): { tourId: string; stepId?: string } | null {
  const params = new URLSearchParams(search);
  const tourId = params.get("guide");
  if (!tourId) return null;
  return { tourId, stepId: params.get("step") ?? undefined };
}

/** Keeps `?guide=&step=` in the address bar current without adding history entries. */
export function writeDeepLink(tourId: string | null, stepId?: string) {
  if (typeof window === "undefined") return;
  const url = new URL(window.location.href);
  if (tourId) {
    url.searchParams.set("guide", tourId);
    if (stepId) url.searchParams.set("step", stepId);
  } else {
    url.searchParams.delete("guide");
    url.searchParams.delete("step");
    url.searchParams.delete("source");
  }
  if (url.href !== window.location.href) window.history.replaceState(window.history.state, "", url);
}
