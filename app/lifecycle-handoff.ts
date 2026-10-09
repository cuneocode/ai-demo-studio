"use client";

import { useCallback, useEffect, useState } from "react";

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

export type LifecycleHandoff = FraudCaseHandoff;
export type HandoffKind = LifecycleHandoff["kind"];

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
  const item = value as Partial<FraudCaseHandoff>;
  return (
    typeof item.id === "string" &&
    item.kind === "fraud-case" &&
    typeof item.createdAt === "string" &&
    typeof item.customerId === "string" &&
    typeof item.caseId === "string" &&
    Array.isArray(item.evidence) &&
    Array.isArray(item.transactions)
  );
}

function readAll(): LifecycleHandoff[] {
  const store = storage();
  if (!store) return [];
  try {
    const parsed = JSON.parse(store.getItem(HANDOFF_STORAGE_KEY) || "[]");
    return Array.isArray(parsed) ? parsed.filter(isHandoff) : [];
  } catch {
    return [];
  }
}

function writeAll(items: LifecycleHandoff[]) {
  const store = storage();
  if (!store) return;
  store.setItem(HANDOFF_STORAGE_KEY, JSON.stringify(items.slice(0, 50)));
  window.dispatchEvent(new CustomEvent(HANDOFF_EVENT));
}

/** Saves (or replaces by id) a handoff; newest first. */
export function saveHandoff(handoff: LifecycleHandoff): LifecycleHandoff {
  const items = readAll().filter((item) => item.id !== handoff.id);
  writeAll([handoff, ...items]);
  return handoff;
}

export function listHandoffs(kind?: HandoffKind): LifecycleHandoff[] {
  const items = readAll().sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  return kind ? items.filter((item) => item.kind === kind) : items;
}

export function clearHandoff(id: string) {
  writeAll(readAll().filter((item) => item.id !== id));
}

export function useHandoffs(kind?: HandoffKind): LifecycleHandoff[] {
  const [items, setItems] = useState<LifecycleHandoff[]>([]);
  const refresh = useCallback(() => setItems(listHandoffs(kind)), [kind]);
  useEffect(() => {
    refresh();
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === HANDOFF_STORAGE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(HANDOFF_EVENT, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(HANDOFF_EVENT, refresh);
    };
  }, [refresh]);
  return items;
}
