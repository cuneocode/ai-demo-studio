"use client";

import { Fragment, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { CircleAlert, CodeXml, Loader2, X } from "lucide-react";
import "./source-viewer.css";

/** Excerpts come from services/interbank/demo/sources.py, read from disk on every request. */
export type SourceCatalog = { integrations: Record<string, string>; sources: Record<string, { path: string; title: string }> };
type Focus = { label: string; integration: string; start: number; end: number };
type Excerpt = { id: string; path: string; title: string; language: "python" | "yaml" | "sql"; code: string; integrations: Record<string, string>; focus: Focus[] };

let catalogRequest: Promise<SourceCatalog | null> | null = null;

export function useSourceCatalog(enabled = true) {
  const [catalog, setCatalog] = useState<SourceCatalog | null>(null);
  useEffect(() => {
    if (!enabled) return;
    let live = true;
    catalogRequest ??= fetch("/api/interbank/sources", { signal: AbortSignal.timeout(10000) })
      .then((response) => (response.ok ? response.json() : null))
      .catch(() => null);
    catalogRequest.then((value) => {
      if (!value) catalogRequest = null;
      if (live) setCatalog(value);
    });
    return () => { live = false; };
  }, [enabled]);
  return catalog;
}

const KEYWORDS: Record<Excerpt["language"], Set<string>> = {
  python: new Set("def class async await return from import as with if elif else for in while try except finally raise not and or is None True False lambda yield pass break continue assert".split(" ")),
  yaml: new Set(["true", "false", "null"]),
  sql: new Set("CREATE TABLE INSERT INTO VALUES PRIMARY KEY NOT NULL TEXT INTEGER REAL REFERENCES SELECT FROM WHERE AND OR UNIQUE DEFAULT CHECK INDEX ON".split(" ")),
};

type Token = { kind: "" | "kw" | "str" | "com" | "key" | "num"; text: string };

/** A deliberately small highlighter: comments, strings, keywords, YAML keys, numbers. */
function tokenize(line: string, language: Excerpt["language"], state: { triple: string | null }): Token[] {
  const out: Token[] = [];
  const push = (kind: Token["kind"], text: string) => { if (text) out.push({ kind, text }); };
  let i = 0;
  if (state.triple) {
    const close = line.indexOf(state.triple);
    if (close < 0) return [{ kind: "str", text: line }];
    push("str", line.slice(0, close + 3));
    i = close + 3;
    state.triple = null;
  }
  if (language === "yaml") {
    const key = /^(\s*-?\s*)([A-Za-z_][\w./-]*)(:)(?=\s|$)/.exec(line.slice(i));
    if (key) { push("", key[1]); push("key", key[2]); push("", key[3]); i += key[0].length; }
  }
  let plain = "";
  const flush = () => { push("", plain); plain = ""; };
  while (i < line.length) {
    const ch = line[i];
    if ((ch === "#" && language !== "sql") || (language === "sql" && line.startsWith("--", i))) { flush(); push("com", line.slice(i)); break; }
    if (ch === '"' || ch === "'") {
      flush();
      const triple = language === "python" && line.startsWith(ch.repeat(3), i) ? ch.repeat(3) : null;
      if (triple) {
        const close = line.indexOf(triple, i + 3);
        if (close < 0) { push("str", line.slice(i)); state.triple = triple; break; }
        push("str", line.slice(i, close + 3)); i = close + 3; continue;
      }
      let j = i + 1;
      while (j < line.length && line[j] !== ch) j += line[j] === "\\" ? 2 : 1;
      push("str", line.slice(i, j + 1)); i = j + 1; continue;
    }
    const word = /^[A-Za-z_][\w]*/.exec(line.slice(i));
    if (word) {
      if (KEYWORDS[language].has(word[0])) { flush(); push("kw", word[0]); } else plain += word[0];
      i += word[0].length; continue;
    }
    const number = /^\d[\d_.]*/.exec(line.slice(i));
    if (number) { flush(); push("num", number[0]); i += number[0].length; continue; }
    plain += ch; i += 1;
  }
  flush();
  return out;
}

export function integrationClass(integration: string) {
  return `integration-${integration}`;
}

export default function SourceViewer({ ids, initial = 0, onClose }: { ids: string[]; initial?: number; onClose: () => void }) {
  const [index, setIndex] = useState(initial);
  const catalog = useSourceCatalog();
  const closeButton = useRef<HTMLButtonElement>(null);
  const id = ids[index];
  const entry = catalog?.sources[id];

  const close = useRef(onClose);
  useEffect(() => { close.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    closeButton.current?.focus();
    // Capture on window so Escape closes the viewer, not the full-screen map underneath.
    const key = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); close.current(); } };
    window.addEventListener("keydown", key, true);
    return () => { window.removeEventListener("keydown", key, true); if (previous?.isConnected) previous.focus(); };
  }, []);

  return (
    <div className="source-viewer-backdrop" onClick={(event) => { if (event.target === event.currentTarget) onClose(); }}>
      <section className="source-viewer" role="dialog" aria-modal="true" aria-label={entry?.title ?? "Source and configuration"}>
        <header className="source-viewer-head">
          <div>
            <span className="eyebrow"><CodeXml size={14} /> SOURCE & CONFIGURATION</span>
            <h2>{entry?.title ?? id}</h2>
            <code>{entry ? `services/interbank/${entry.path}` : ""}</code>
          </div>
          <button ref={closeButton} className="map-icon-button" aria-label="Close source viewer" onClick={onClose}><X size={18} /></button>
        </header>
        {ids.length > 1 && <div className="source-tabs" role="tablist" aria-label="Files for this component">
          {ids.map((sourceId, i) => <button key={sourceId} role="tab" aria-selected={i === index} className={i === index ? "active" : ""} onClick={() => setIndex(i)}>{catalog?.sources[sourceId]?.title ?? sourceId}</button>)}
        </div>}
        <SourceFile key={id} id={id} />
      </section>
    </div>
  );
}

function SourceFile({ id }: { id: string }) {
  const [excerpt, setExcerpt] = useState<Excerpt | null>(null);
  const [error, setError] = useState("");
  const [filter, setFilter] = useState<string | null>(null);
  const [activeFocus, setActiveFocus] = useState(0);
  const codePane = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let live = true;
    fetch(`/api/interbank/sources/${id}`, { signal: AbortSignal.timeout(10000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: Excerpt) => { if (live) setExcerpt(body); })
      .catch(() => { if (live) setError("This excerpt is unavailable. Start the studio with npm run dev:studio so it can read services/interbank."); });
    return () => { live = false; };
  }, [id]);

  const lines = useMemo(() => excerpt?.code.replace(/\n$/, "").split("\n") ?? [], [excerpt]);
  const tokens = useMemo(() => {
    const state = { triple: null as string | null };
    return lines.map((line) => tokenize(line, excerpt?.language ?? "python", state));
  }, [lines, excerpt?.language]);
  const visibleFocus = useMemo(() => (excerpt?.focus ?? []).filter((f) => !filter || f.integration === filter), [excerpt, filter]);
  const lineFocus = useMemo(() => {
    const map = new Map<number, Focus>();
    for (const focus of [...visibleFocus].sort((a, b) => (b.end - b.start) - (a.end - a.start))) {
      for (let line = focus.start; line <= focus.end; line += 1) map.set(line, focus);
    }
    return map;
  }, [visibleFocus]);
  const markers = useMemo(() => {
    const map = new Map<number, Focus[]>();
    visibleFocus.forEach((focus) => map.set(focus.start, [...(map.get(focus.start) ?? []), focus]));
    return map;
  }, [visibleFocus]);
  const present = useMemo(() => [...new Set((excerpt?.focus ?? []).map((f) => f.integration))], [excerpt]);

  function reveal(focus: Focus, position: number) {
    setActiveFocus(position);
    codePane.current?.querySelector(`[data-marker="${focus.start}"]`)?.scrollIntoView({ block: "start", behavior: "smooth" });
  }

  useEffect(() => {
    if (!excerpt?.focus.length) return;
    requestAnimationFrame(() => codePane.current?.querySelector(`[data-marker="${excerpt.focus[0].start}"]`)?.scrollIntoView({ block: "start" }));
  }, [excerpt]);

  const renderLine = (line: number): ReactNode => tokens[line - 1].map((token, i) => token.kind ? <span key={i} className={`tok-${token.kind}`}>{token.text}</span> : <Fragment key={i}>{token.text}</Fragment>);

  return (
    <div className="source-body">
      <aside className="source-focus" aria-label="Integration points in this file">
        <span className="source-focus-title">Integration points</span>
        {present.length > 1 && <div className="source-filters" role="group" aria-label="Highlight one integration">
          <button className={!filter ? "active" : ""} aria-pressed={!filter} onClick={() => setFilter(null)}>All</button>
          {present.map((integration) => <button key={integration} className={`${integrationClass(integration)} ${filter === integration ? "active" : ""}`} aria-pressed={filter === integration} onClick={() => { setFilter(filter === integration ? null : integration); setActiveFocus(-1); }}>{excerpt?.integrations[integration] ?? integration}</button>)}
        </div>}
        <ol>
          {visibleFocus.map((focus, i) => <li key={`${focus.start}-${focus.label}`}>
            <button className={`${integrationClass(focus.integration)} ${activeFocus === i ? "active" : ""}`} onClick={() => reveal(focus, i)}>
              <strong>{focus.label}</strong>
              <span><i>{excerpt?.integrations[focus.integration] ?? focus.integration}</i> · L{focus.start}{focus.end > focus.start ? `–${focus.end}` : ""}</span>
            </button>
          </li>)}
        </ol>
        <p>Read from the files in this repository each time you open them, so this is the code that runs.</p>
      </aside>
      <div className="source-code" ref={codePane} tabIndex={0} aria-label="Code">
        {error ? <div className="banking-error"><CircleAlert size={14} /><div>{error}</div></div>
          : !excerpt ? <div className="source-loading"><Loader2 size={16} className="spin" /> Loading excerpt…</div>
          : <pre><code>{lines.map((_, i) => {
            const line = i + 1, focus = lineFocus.get(line);
            return <Fragment key={line}>
              {markers.get(line)?.map((marker, m) => <div key={marker.label} data-marker={m === 0 ? line : undefined} className={`source-marker ${integrationClass(marker.integration)}`}><span>{excerpt.integrations[marker.integration]}</span>{marker.label}</div>)}
              <div data-line={line} className={`source-line ${focus ? `focus ${integrationClass(focus.integration)}` : ""}`}><span className="ln">{line}</span><span className="lc">{renderLine(line)}{"\n"}</span></div>
            </Fragment>;
          })}</code></pre>}
      </div>
    </div>
  );
}
