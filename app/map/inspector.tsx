"use client";

import { useEffect, useRef, useState } from "react";
import type { SelectedDisclosure } from "./scene-model.ts";

export type SourceExcerpt = {
  id: string;
  file: string;
  symbol: string;
  start: number;
  end: number;
  proves: string;
  revision: string | null;
  hash?: string;
  html?: string;
  captured?: boolean;
  note?: string;
  proofRole?: string;
  evidenceKind?: string;
  dependencies?: string[];
  error?: string;
};

export type SourceAttribution = {
  subject: string;
  ownership?: string;
  platforms: string[];
  mechanism: string;
  effect: string;
  disclosure?: SelectedDisclosure;
};

function ResizeHandle({ width, onWidth, max = 640 }: { width: number; onWidth: (width: number) => void; max?: number }) {
  return (
    <div
      className="map-resize"
      role="separator"
      tabIndex={0}
      aria-orientation="vertical"
      aria-label="Resize supplementary panel"
      aria-valuemin={360}
      aria-valuemax={max}
      aria-valuenow={width}
      onKeyDown={(event) => {
        if (event.key === "ArrowLeft" || event.key === "ArrowRight") {
          event.preventDefault();
          onWidth(Math.min(max, Math.max(360, width + (event.key === "ArrowLeft" ? 40 : -40))));
        }
      }}
      onPointerDown={(event) => {
        const startX = event.clientX;
        const startWidth = width;
        const move = (pointer: PointerEvent) => onWidth(Math.min(max, Math.max(360, startWidth + startX - pointer.clientX)));
        const up = () => {
          window.removeEventListener("pointermove", move);
          window.removeEventListener("pointerup", up);
        };
        window.addEventListener("pointermove", move);
        window.addEventListener("pointerup", up);
      }}
    />
  );
}

export function EnvironmentInspector({
  lines,
  width,
  drawer,
  onWidth,
  onClose,
}: {
  lines: string[];
  width: number;
  drawer: boolean;
  onWidth: (width: number) => void;
  onClose: () => void;
}) {
  return (
    <aside className={`map-source map-environment-panel ${drawer ? "is-drawer" : ""}`} style={drawer ? undefined : { width }} aria-label="Environment details">
      {drawer ? null : <ResizeHandle width={width} onWidth={onWidth} />}
      <div className="map-source-bar">
        <button type="button" onClick={onClose}>Close details</button>
      </div>
      <div className="map-source-body">
        <h3>Environment details</h3>
        <ul className="map-environment-list">
          {lines.map((line) => <li key={line}>{line}</li>)}
        </ul>
      </div>
    </aside>
  );
}

export function SourceInspector({
  sourceId,
  sourceIds,
  labels,
  attribution,
  width,
  maxWidth,
  drawer,
  onWidth,
  onSelect,
  onClose,
}: {
  sourceId: string;
  sourceIds: string[];
  labels?: Record<string, string>;
  attribution?: SourceAttribution | null;
  width: number;
  maxWidth?: number;
  drawer: boolean;
  onWidth: (width: number) => void;
  onSelect: (id: string) => void;
  onClose: () => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const [excerpt, setExcerpt] = useState<SourceExcerpt | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [loadedId, setLoadedId] = useState(sourceId);
  if (loadedId !== sourceId) {
    setLoadedId(sourceId);
    setExcerpt(null);
    setExpanded(false);
  }

  useEffect(() => {
    const previous = document.activeElement;
    closeRef.current?.focus({ preventScroll: true });
    return () => { if (previous instanceof HTMLElement && previous.isConnected) previous.focus({ preventScroll: true }); };
  }, []);

  useEffect(() => {
    let cancel = false;
    void fetch(`/api/architecture-source?id=${encodeURIComponent(sourceId)}`).then(async (response) => {
      const body = await response.json() as SourceExcerpt;
      if (cancel) return;
      if (!response.ok) {
        setExcerpt({ id: sourceId, file: "", symbol: sourceId, start: 0, end: 0, proves: "This source reference could not be resolved.", revision: null, error: body.error ?? "Unresolved evidence id." });
        return;
      }
      setExcerpt(body);
    }).catch(() => {
      if (!cancel) setExcerpt({ id: sourceId, file: "", symbol: sourceId, start: 0, end: 0, proves: "This source reference could not be resolved.", revision: null, error: "The source request failed." });
    });
    return () => { cancel = true; };
  }, [sourceId]);

  return (
    <aside className={`map-source ${drawer ? "is-drawer" : ""} ${expanded ? "is-expanded-source" : ""}`} style={expanded ? undefined : { width }} aria-label="Source inspector" onKeyDown={(event) => { if (event.key === "Escape") { event.preventDefault(); event.stopPropagation(); onClose(); } }}>
      {expanded ? null : <ResizeHandle width={width} onWidth={onWidth} max={maxWidth} />}
      <div className="map-source-bar">
        <div className="map-source-title">
          <strong>{attribution?.subject ?? "Source evidence"}</strong>
          {attribution?.platforms.length ? <span>{attribution.platforms.join(" / ")}</span> : null}
        </div>
        <div className="map-source-actions">
          <button ref={closeRef} type="button" aria-label="Close source" onClick={onClose}>Close source <kbd>Esc</kbd></button>
          <button type="button" onClick={() => setExpanded((value) => !value)}>{expanded ? "Collapse" : "Expand"}</button>
        </div>
      </div>
      <div className="map-source-body">
        {attribution ? (
          <div className="map-source-attrib">
            <span className="effect">{attribution.effect}</span>
            {attribution.ownership || attribution.mechanism || attribution.disclosure ? (
              <details className="map-source-details">
                <summary>Details</summary>
                <dl className="map-source-facts">
                  {attribution.ownership ? <div><dt>Ownership</dt><dd>{attribution.ownership}</dd></div> : null}
                  <div><dt>Mechanism</dt><dd>{attribution.mechanism}</dd></div>
                  {attribution.disclosure ? <div><dt>Workflow stage</dt><dd>{attribution.disclosure.workflowStage}</dd></div> : null}
                  {attribution.disclosure?.owner ? <div><dt>Accountable owner</dt><dd>{attribution.disclosure.owner}</dd></div> : null}
                  {attribution.disclosure?.data ? <div><dt>Data</dt><dd>{attribution.disclosure.data}</dd></div> : null}
                  {attribution.disclosure?.destination ? <div><dt>Destination</dt><dd>{attribution.disclosure.destination}</dd></div> : null}
                  {attribution.disclosure ? <div><dt>Evidence</dt><dd>{attribution.disclosure.evidenceStatus}</dd></div> : null}
                </dl>
              </details>
            ) : null}
          </div>
        ) : null}
        {sourceIds.length > 1 ? (
          <div className="map-source-switch" role="group" aria-label="Source excerpts">
            {sourceIds.map((id) => (
              <button key={id} type="button" className={id === sourceId ? "active" : ""} aria-pressed={id === sourceId} onClick={() => onSelect(id)}>{labels?.[id] ?? id}</button>
            ))}
          </div>
        ) : null}
        <h3>{excerpt?.proofRole ? `${excerpt.proofRole} excerpt` : excerpt?.symbol || "Source excerpt"}</h3>
        {excerpt?.error ? <pre>{excerpt.error}</pre> : excerpt?.html ? <div className="src-view" dangerouslySetInnerHTML={{ __html: excerpt.html }} /> : <pre>{excerpt ? "" : "Loading…"}</pre>}
        {excerpt ? (
          <details className="map-source-provenance">
            <summary>Evidence context and provenance</summary>
            <p className="map-source-claim">{excerpt.proves}</p>
            {excerpt.dependencies?.length ? <p className="map-source-dependency">Required context: {excerpt.dependencies.join(" ")}</p> : null}
            {excerpt.file ? (
              <p className="path">{excerpt.file}:{excerpt.start}–{excerpt.end}{excerpt.revision ? ` · captured at ${excerpt.revision}` : ""}{excerpt.note ? ` · ${excerpt.note}` : ""}</p>
            ) : null}
          </details>
        ) : null}
      </div>
    </aside>
  );
}
