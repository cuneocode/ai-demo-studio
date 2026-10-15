"use client";

import { useEffect, useState } from "react";
import { Cloud, Cpu, Circle } from "lucide-react";
import { inferenceStatus, type InferenceSnapshot } from "./inference-status";

export default function InferenceIndicator({ useCaseId, preview, onOpen }: { useCaseId?: string; preview?: boolean; onOpen: () => void }) {
  const [snapshot, setSnapshot] = useState<InferenceSnapshot | null>(null);
  useEffect(() => {
    if (preview) return;
    const controller = new AbortController();
    let timer: ReturnType<typeof setTimeout>;
    const refresh = async () => {
      try {
        const response = await fetch("/api/studio/models", { cache: "no-store", signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
        const next = response.ok ? await response.json() : null;
        if (!controller.signal.aborted) setSnapshot(next);
      } catch { if (!controller.signal.aborted) setSnapshot(null); }
      finally { if (!controller.signal.aborted) timer = setTimeout(refresh, 10000); }
    };
    void refresh();
    return () => { controller.abort(); clearTimeout(timer); };
  }, [preview]);
  const status = preview ? { kind: "unknown", label: "Recorded preview", detail: "Live inference is disabled." }
    : useCaseId === "prototype" ? { kind: "unknown", label: "No inference", detail: "Illustrative example." }
    : inferenceStatus(snapshot, useCaseId);
  const Icon = status.kind === "cloud" ? Cloud : status.kind === "local" ? Cpu : Circle;
  return <button type="button" className={`inference-indicator is-${status.kind}`} aria-label={`${status.label} · model settings`} title={status.detail} onClick={onOpen}><Icon size={15} aria-hidden="true" /><span>{status.label}</span></button>;
}
