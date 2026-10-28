"use client";

import { readStored, writeStored, storageKey } from "./studio/storage.ts";

import { useMemo, useSyncExternalStore } from "react";

export type HandoffEvidence = { label: string; value: string; source: string };

export type FraudCaseHandoff = {
  id: string;
  kind: "fraud-case";
  createdAt: string;
  customerId: string;
  caseId: string;
  title: string;
  summary: string;
  disposition: string;
  score?: number;
  band?: string;
  evidence: HandoffEvidence[];
  transactions: { id: string; at: string; amount: number; currency: string; merchant: string; channel: string }[];
  runId?: string;
  servedBy?: unknown;
};

/**
 * What the customer already knows about a resolved fraud case. Other teams (the advisor) may see this;
 * it never carries the disposition, an escalation, or anything about a SAR (no tipping off).
 */
export type ServiceEventHandoff = {
  id: string;
  kind: "service-event";
  createdAt: string;
  customerId: string;
  occurredAt: string;
  title: string;
  summary: string;
  actions: string[];
  cardLast4?: string;
  merchant?: string;
  amount?: number;
  currency?: string;
  provenance: "live" | "recorded";
};

export type LifecycleHandoff = FraudCaseHandoff | ServiceEventHandoff;
export type HandoffKind = LifecycleHandoff["kind"];
type HandoffOf<K extends HandoffKind> = Extract<LifecycleHandoff, { kind: K }>;

export const HANDOFF_STORAGE_KEY = "fsi-studio.handoffs";
export const HANDOFF_EVENT = "fsi-studio:handoffs";

function storage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function isHandoff(value: unknown): value is LifecycleHandoff {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<FraudCaseHandoff> & Partial<ServiceEventHandoff>;
  if (typeof item.id !== "string" || typeof item.createdAt !== "string" || typeof item.customerId !== "string") return false;
  if (item.kind === "fraud-case") return typeof item.caseId === "string" && Array.isArray(item.evidence) && Array.isArray(item.transactions);
  if (item.kind === "service-event") return typeof item.summary === "string" && typeof item.occurredAt === "string" && Array.isArray(item.actions);
  return false;
}

function parse(raw: string | null): LifecycleHandoff[] {
  try {
    const parsed = JSON.parse(raw || "[]");
    return Array.isArray(parsed) ? parsed.filter(isHandoff).sort((a, b) => b.createdAt.localeCompare(a.createdAt)) : [];
  } catch {
    return [];
  }
}

function readAll(): LifecycleHandoff[] {
  return parse(readStored(storage(), HANDOFF_STORAGE_KEY));
}

function writeAll(items: LifecycleHandoff[]) {
  const store = storage();
  if (!store) return;
  writeStored(store, HANDOFF_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT));
}

/** Saves (or replaces by id) a handoff; newest first. */
export function saveHandoff<T extends LifecycleHandoff>(handoff: T): T {
  const items = readAll().filter((item) => item.id !== handoff.id);
  writeAll([handoff, ...items]);
  return handoff;
}

export function listHandoffs<K extends HandoffKind>(kind?: K): HandoffOf<K>[] {
  const items = readAll();
  return (kind ? items.filter((item) => item.kind === kind) : items) as HandoffOf<K>[];
}

export function clearHandoff(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

function subscribe(onChange: () => void) {
  const onStorage = (event: StorageEvent) => {
    if (event.key === null || (event.key === HANDOFF_STORAGE_KEY || event.key === storageKey(HANDOFF_STORAGE_KEY))) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(HANDOFF_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(HANDOFF_EVENT, onChange);
  };
}

const rawSnapshot = () => storage()?.getItem(HANDOFF_STORAGE_KEY) ?? "";
const serverSnapshot = () => "";

export function useHandoffs<K extends HandoffKind>(kind?: K): HandoffOf<K>[] {
  const raw = useSyncExternalStore(subscribe, rawSnapshot, serverSnapshot);
  return useMemo(() => {
    const items = parse(raw);
    return (kind ? items.filter((item) => item.kind === kind) : items) as HandoffOf<K>[];
  }, [raw, kind]);
}
