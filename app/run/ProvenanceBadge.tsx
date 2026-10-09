"use client";

import { CircleOff, Cloud, Cpu, Database, History, Shuffle } from "lucide-react";
import type { ServedBy } from "./events";
import "./run.css";

export type Provenance =
  | { kind: "live"; servedBy: ServedBy | null | undefined }
  | { kind: "recorded"; recordedAt: string; servedBy?: ServedBy | null }
  | { kind: "sample"; detail?: string }
  | { kind: "none"; detail?: string };

const day = (iso: string) => {
  const date = new Date(iso);
  return Number.isNaN(date.getTime()) ? iso : date.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
};

/** The text a badge shows, for tests and for the live stats row. */
export function provenanceText(provenance: Provenance): string {
  switch (provenance.kind) {
    case "live": {
      const served = provenance.servedBy;
      if (!served?.provider) return "Model · none reachable";
      const where = served.private ? "private" : "hosted";
      return `Answered by ${served.label}${served.model ? ` · ${served.model}` : ""} (${where}${served.fallback ? ", fallback" : ""})`;
    }
    case "recorded": return `Recorded run · ${day(provenance.recordedAt)}${provenance.servedBy?.label ? ` · ${provenance.servedBy.label}` : ""}`;
    case "sample": return provenance.detail ? `Sample data · ${provenance.detail}` : "Sample data";
    case "none": return provenance.detail ?? "No model answered";
  }
}

/**
 * Where a result came from: the model that answered (private or hosted, and whether the
 * chain fell back), a recorded run with its date, or sample data. Every result shows one.
 */
export default function ProvenanceBadge({ provenance, label: override, className = "" }: { provenance: Provenance; label?: string; className?: string }) {
  const label = override ?? provenanceText(provenance);
  const served = provenance.kind === "live" || provenance.kind === "recorded" ? provenance.servedBy : null;
  const tone = provenance.kind === "live"
    ? (!served?.provider ? "none" : served.fallback ? "fallback" : served.private ? "private" : "hosted")
    : provenance.kind;
  const Icon = tone === "private" ? Cpu : tone === "hosted" ? Cloud : tone === "fallback" ? Shuffle : tone === "recorded" ? History : tone === "sample" ? Database : CircleOff;
  const title = provenance.kind === "live" && served?.fallback && served.reason ? `Fell back: ${served.reason}` : served?.ai_defense ? `AI Defense ${served.ai_defense}` : undefined;
  return (
    <span className={`rt-badge ${tone} ${className}`} data-provenance={provenance.kind} title={title} aria-label={label}>
      <Icon size={13} aria-hidden="true" /><span>{label}</span>
    </span>
  );
}
