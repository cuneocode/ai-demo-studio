"use client";

import { useEffect, useState } from "react";
import { History } from "lucide-react";
import type { Recording, RecordingMeta } from "./events";
import "./run.css";

/** Recordings a service serves at GET {base}/recordings (services/common/runs.py router). */
export function useRecordings(base: string) {
  const [recordings, setRecordings] = useState<RecordingMeta[]>([]);
  useEffect(() => {
    let live = true;
    fetch(`${base}/recordings`, { signal: AbortSignal.timeout(6000) })
      .then((response) => (response.ok ? response.json() : { recordings: [] }))
      .then((body: { recordings?: RecordingMeta[] }) => { if (live && Array.isArray(body.recordings)) setRecordings(body.recordings); })
      .catch(() => undefined);
    return () => { live = false; };
  }, [base]);
  return recordings;
}

export async function loadRecording<R = unknown>(base: string, name: string): Promise<Recording<R>> {
  const response = await fetch(`${base}/recordings/${encodeURIComponent(name)}`, { signal: AbortSignal.timeout(8000) });
  if (!response.ok) throw new Error(`Recording ${name} is unavailable (${response.status}).`);
  return response.json() as Promise<Recording<R>>;
}

/** "Replay a recorded run": the never-dead path when the live service or model is down. */
export default function ReplayPicker({ recordings, onPick, label = "Replay a recorded run", disabled = false }: {
  recordings: RecordingMeta[]; onPick: (name: string) => void; label?: string; disabled?: boolean;
}) {
  if (!recordings.length) return null;
  return (
    <label className="rt-replay">
      <History size={15} aria-hidden="true" /><span>{label}</span>
      <select value="" disabled={disabled} onChange={(event) => { if (event.target.value) onPick(event.target.value); }}>
        <option value="">Choose…</option>
        {recordings.map((item) => (
          <option key={item.name} value={item.name}>{item.title} · {new Date(item.recorded_at).toLocaleDateString()}</option>
        ))}
      </select>
    </label>
  );
}
