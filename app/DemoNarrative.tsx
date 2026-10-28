"use client";

import { readStored, writeStored } from "./studio/storage.ts";


import { useEffect, useLayoutEffect, useRef, useState, useSyncExternalStore, type ReactNode } from "react";
import { ArrowUpRight, BookOpen, ChevronDown, PanelRightClose, X } from "lucide-react";
import { obligationReferences, type DemoNarrative } from "./demo-narratives";
import "./demo-narrative.css";

const PREFERENCE_KEY = "fsi-demo-narrative-expanded";
const WIDE_SCREEN = "(min-width: 1600px)";
function subscribeWidth(callback: () => void) {
  const query = window.matchMedia(WIDE_SCREEN);
  query.addEventListener("change", callback);
  return () => query.removeEventListener("change", callback);
}
const isWide = () => window.matchMedia(WIDE_SCREEN).matches;
const serverWidth = () => false;

function NarrativeStory({ narrative }: { narrative: DemoNarrative }) {
  return <div className="narrative-copy narrative-scroll" tabIndex={0} role="region" aria-label="Use case story">
    {narrative.sections.map((section) => <section className="narrative-section" key={section.title}>
      <h3>{section.title}</h3>
      {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
      {section.option && <div className="narrative-option"><span>{section.option.label}</span><p>{section.option.text}</p></div>}
    </section>)}
  </div>;
}

function NarrativeObligations({ narrative }: { narrative: DemoNarrative }) {
  return <details className="narrative-obligations">
      <summary>Obligations &amp; standards <ChevronDown size={16} aria-hidden="true" /></summary>
      <div className="narrative-reference-scroll">
      <p className="narrative-reference-intro">{narrative.planned ? "Relevant responsibilities for the proposed workflow." : "Relevant responsibilities and the evidence this demo contributes."} Applicability depends on the institution, market, and deployment.</p>
      {narrative.references.map(({ id, evidence }) => {
        const reference = obligationReferences[id];
        return <details className="narrative-reference" key={id}>
          <summary><span><strong>{reference.title}</strong><small>{reference.jurisdiction} · {reference.kind}</small></span><ChevronDown size={15} aria-hidden="true" /></summary>
          <p>{reference.responsibility}</p>
          <dl>
            <div><dt>Applies to</dt><dd>{reference.appliesTo}</dd></div>
            <div><dt>{narrative.planned ? "Planned alignment" : "Supported by this demo"}</dt><dd>{evidence}</dd></div>
            <div><dt>Production requirements</dt><dd>{reference.production}</dd></div>
          </dl>
          <a href={reference.url} target="_blank" rel="noopener noreferrer">Official source <ArrowUpRight size={14} aria-hidden="true" /><span className="sr-only"> for {reference.title} (opens in a new tab)</span></a>
          <small className="narrative-reviewed">Reviewed <time dateTime={reference.reviewed}>{reference.reviewed}</time></small>
        </details>;
      })}
      </div>
    </details>;
}

function NarrativeContents({ narrative, onClose, drawer = false }: { narrative: DemoNarrative; onClose: () => void; drawer?: boolean }) {
  return <>
    <header className="narrative-panel-header">
      <div className="narrative-heading-row"><span><BookOpen size={17} aria-hidden="true" /> The story</span><button type="button" aria-label={drawer ? "Close the story" : "Collapse the story"} autoFocus={drawer} onClick={onClose}>{drawer ? <X size={18} /> : <PanelRightClose size={18} />}</button></div>
      <h2>{narrative.headline}</h2>
      {narrative.planned && <p className="narrative-planned">Planned workflow · illustrative demo</p>}
    </header>
    <NarrativeStory narrative={narrative} />
    <NarrativeObligations narrative={narrative} />
  </>;
}

/** The same story stays available across the demo and architecture tabs. */
export default function DemoNarrativeLayout({ narrative, children }: { narrative?: DemoNarrative; children: ReactNode }) {
  const wide = useSyncExternalStore(subscribeWidth, isWide, serverWidth);
  const [expanded, setExpanded] = useState(true);
  const panelRef = useRef<HTMLElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const launchRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const frame = requestAnimationFrame(() => {
      try { setExpanded(readStored(localStorage, PREFERENCE_KEY) !== "0"); } catch { /* Storage is optional. */ }
    });
    return () => cancelAnimationFrame(frame);
  }, []);

  // A sticky rail starts below the page heading. Size it from its actual
  // viewport position so its footer is reachable before the page scrolls.
  useLayoutEffect(() => {
    const panel = panelRef.current;
    if (!wide || !expanded || !panel) return;
    let frame = 0;
    const measure = () => {
      const available = Math.max(0, window.innerHeight - Math.max(0, panel.getBoundingClientRect().top) - 20);
      panel.style.setProperty("--narrative-height", `${available}px`);
    };
    const schedule = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(measure);
    };
    measure();
    const observer = new ResizeObserver(schedule);
    observer.observe(panel);
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
    };
  }, [wide, expanded, narrative]);

  if (!narrative) return <>{children}</>;

  const changeExpanded = (next: boolean) => {
    setExpanded(next);
    try { writeStored(localStorage, PREFERENCE_KEY, next ? "1" : "0"); } catch { /* Storage is optional. */ }
    if (!next) requestAnimationFrame(() => launchRef.current?.focus());
  };
  return <div className={`narrative-workspace${wide && expanded ? " narrative-workspace-open" : ""}`}>
    <div className="narrative-demo-content">{children}</div>
    {wide && expanded ? <aside ref={panelRef} className="narrative-panel" id="demo-narrative" aria-label="The story">
      <NarrativeContents key={narrative.headline} narrative={narrative} onClose={() => changeExpanded(false)} />
    </aside> : <div className="narrative-launch">
      <button ref={launchRef} type="button" className="secondary-button" aria-controls="demo-narrative" aria-expanded={wide ? false : undefined} aria-haspopup={wide ? undefined : "dialog"} onClick={() => wide ? changeExpanded(true) : dialogRef.current?.showModal()}><BookOpen size={17} aria-hidden="true" /> The story</button>
    </div>}
    {!wide && <dialog ref={dialogRef} className="narrative-drawer" id="demo-narrative" aria-label="The story" onClick={(event) => { if (event.target === event.currentTarget) dialogRef.current?.close(); }}>
      <div className="narrative-drawer-surface">
        <NarrativeContents key={narrative.headline} narrative={narrative} drawer onClose={() => dialogRef.current?.close()} />
      </div>
    </dialog>}
  </div>;
}
