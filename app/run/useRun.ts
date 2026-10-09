"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { replayDelay, type RunEvent, type RunInfo, type RunPage } from "./events";

export type RunMode = "live" | "replay" | "recorded";

export type UseRunOptions = {
  /** GET URL for a page of events after `after`, e.g. (id, after) => `/api/fraud/runs/${id}?after=${after}`. */
  pageUrl: (runId: string, after: number) => string;
  /** Poll interval while a run is live. */
  interval?: number;
  /** Replay pacing: "recorded" (half the recorded gaps, clamped) or a fixed step in milliseconds. */
  pace?: "recorded" | number;
  /** Called once a live run settles (e.g. to refresh a history list). */
  onSettled?: (run: RunInfo) => void;
  /** Message when polling fails. */
  lostContact?: string;
};

/**
 * One run's events: poll a live run, attach to a run a POST is executing under a
 * client-chosen id, replay a stored run with its recorded pacing, or play a recording
 * the page already holds. `visible` is what the timeline shows right now.
 */
export function useRun<R extends RunInfo = RunInfo, E extends RunEvent = RunEvent>({
  pageUrl, interval = 1000, pace = "recorded", onSettled, lostContact = "Lost contact with the service.",
}: UseRunOptions) {
  const [runId, setRunId] = useState<string | null>(null);
  const [mode, setMode] = useState<RunMode>("live");
  const [run, setRun] = useState<R | null>(null);
  const [events, setEvents] = useState<E[]>([]);
  const [shown, setShown] = useState<number | null>(null);
  const [error, setError] = useState("");
  const [polling, setPolling] = useState(false);
  const urlRef = useRef(pageUrl);
  const settledRef = useRef(onSettled);
  useEffect(() => { urlRef.current = pageUrl; settledRef.current = onSettled; });

  useEffect(() => {
    if (!runId || !polling) return;
    let live = true, total = 0, finishedAt = 0, misses = 0;
    let timer: ReturnType<typeof setTimeout>;
    const poll = async () => {
      try {
        const response = await fetch(urlRef.current(runId, total), { signal: AbortSignal.timeout(10000) });
        // Attach mode: the POST may not have opened the run yet.
        if (response.status === 404 && total === 0 && misses < 10) { misses += 1; if (live) timer = setTimeout(poll, 300); return; }
        if (!response.ok) throw new Error(String(response.status));
        const body = await response.json() as RunPage<R, E>;
        if (!live) return;
        total = body.total;
        setRun(body.run);
        if (body.events.length) setEvents((previous) => {
          const seen = new Set(previous.map((event) => event.id));
          return [...previous, ...body.events.filter((event) => !seen.has(event.id))];
        });
        if (body.run.status !== "running") {
          finishedAt ||= Date.now();
          if (Date.now() - finishedAt > 3000) { settledRef.current?.(body.run); setPolling(false); return; }
        }
      } catch {
        if (live) setError(lostContact);
      }
      if (live) timer = setTimeout(poll, interval);
    };
    poll();
    return () => { live = false; clearTimeout(timer); };
  }, [runId, polling, interval, lostContact]);

  useEffect(() => {
    if (shown === null || shown >= events.length) return;
    const delay = typeof pace === "number" ? pace : replayDelay(events[shown - 1], events[shown]);
    const timer = setTimeout(() => setShown((value) => (value === null ? null : value + 1)), delay);
    return () => clearTimeout(timer);
  }, [shown, events, pace]);

  const clear = () => { setEvents([]); setRun(null); setError(""); };

  /** Follow a run by id: live (as it happens) or replayed from the start. */
  const open = useCallback((id: string, replay = false) => {
    clear();
    setMode(replay ? "replay" : "live");
    setShown(replay ? 0 : null);
    setRunId(id);
    setPolling(true);
  }, []);

  /** Play events the page already holds (a recording or fixture), with recorded pacing. */
  const play = useCallback((recorded: { run?: R | null; events: E[] }, animate = true) => {
    setPolling(false);
    setRunId(recorded.run?.id ?? null);
    setMode("recorded");
    setError("");
    setRun(recorded.run ?? null);
    setEvents(recorded.events);
    setShown(animate ? 0 : null);
  }, []);

  const skip = useCallback(() => setShown(null), []);
  const reset = useCallback(() => { setPolling(false); setRunId(null); setShown(null); clear(); }, []);

  const visible = useMemo(() => (shown === null ? events : events.slice(0, shown)), [events, shown]);
  const replaying = shown !== null && shown < events.length;
  const effectiveRun = useMemo(() => (run && replaying ? { ...run, status: "running" } as R : run), [run, replaying]);

  return { runId, mode, run, effectiveRun, events, visible, replaying, error, setError, open, play, skip, reset };
}

/** Keeps a scrolling list pinned to the newest item unless the reader scrolled up. */
export function useStickToBottom<T extends HTMLElement = HTMLOListElement>(dep: number) {
  const ref = useRef<T>(null);
  const stick = useRef(true);
  useEffect(() => { const el = ref.current; if (el && stick.current) el.scrollTop = el.scrollHeight; }, [dep]);
  const onScroll = () => { const el = ref.current; if (el) stick.current = el.scrollHeight - el.scrollTop - el.clientHeight < 80; };
  return { ref, onScroll };
}
