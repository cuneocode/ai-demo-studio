"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowUpRight, FileText, Loader2, Play, Search, ShieldCheck, X } from "lucide-react";
import type { StoredCompanyProfile } from "../../../app/company-profile";
import type { EvidenceItem, StoredResearchNote } from "../../../app/research-note";
import { parseApiError } from "../../../app/research-note";
import RunStats, { startRun, useRunLedger } from "../../../app/RunStats";
import { newRunId, type ServedBy } from "../../../app/run/events";
import RunTimeline from "../../../app/run/RunTimeline";
import ProvenanceBadge from "../../../app/run/ProvenanceBadge";
import { useRun } from "../../../app/run/useRun";
import { useStudioNav } from "../../../app/studio-nav";
import { guideAnchor } from "../../../app/guide/anchors";
import { observeWealth, wealthService, wealthStats, type WealthService } from "../../../app/wealth-stats";
import "./market-research.css";

type Props = { embedded?: boolean; inStory?: boolean; companyProfile?: StoredCompanyProfile | null; note?: StoredResearchNote | null; onNoteChange?: (note: StoredResearchNote | null) => void };
type Article = { id: string; headline: string; publisher: string; date: string; body: string; url?: string; synthetic?: boolean; poisoned?: boolean; content_kind?: string; status?: string; by?: string; reason?: string; ai_defense?: string; event_id?: string };
type Peer = { ticker: string; name: string; marketCap?: number; trailingPE?: number };
type Packet = { ticker: string; company: string; packet_id: string; as_of: string; source: { label: string; fetchedAt?: string }; news: Article[]; news_error?: string; evidence: EvidenceItem[]; peers: Peer[] };
type Driver = { text: string; evidence_id: string; field_path?: string; display?: string; reason?: string };
type Result = Packet & { report: { status: string; recommendation?: "Buy" | "Hold" | "Sell"; outlook?: string; risks: string[]; drivers: Driver[]; reason?: string }; served_by?: ServedBy };
type Document = { title: string; source: string; body: string; url?: string; notice?: string; fields?: EvidenceItem["fields"] };
const day = (value?: string) => value ? new Date(value).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric", timeZone: "UTC" }) : "Date unavailable";
const compact = (value?: number) => value == null ? "—" : new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 }).format(value);
const safeUrl = (url?: string) => url && /^https?:\/\//i.test(url) ? url : undefined;

function SourceDialog({ document, onClose }: { document: Document; onClose: () => void }) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    const previous = dialog?.ownerDocument.activeElement as HTMLElement | null;
    dialog?.showModal();
    return () => { dialog?.close(); previous?.focus({ preventScroll: true }); };
  }, []);
  return <dialog className="mr-dialog" ref={ref} aria-labelledby="mr-document-title" onCancel={event => { event.preventDefault(); onClose(); }} onClick={event => { if (event.target === event.currentTarget) onClose(); }}>
    <div className="mr-dialog-content"><header><div><span className="mr-label">SOURCE MATERIAL</span><h2 id="mr-document-title">{document.title}</h2><p>{document.source}</p></div><button type="button" aria-label="Close source" onClick={onClose}><X size={20} /></button></header>
      {document.notice && <p className="mr-notice">{document.notice}</p>}
      {document.fields && <dl className="mr-facts">{Object.entries(document.fields).map(([key, field]) => <div key={key}><dt>{field.label || key}</dt><dd>{field.display}</dd></div>)}</dl>}
      <div className="mr-document-body">{document.body}</div>
      {safeUrl(document.url) && <a href={safeUrl(document.url)} target="_blank" rel="noreferrer">Open publisher <ArrowUpRight size={14} /></a>}
    </div>
  </dialog>;
}

export default function MarketResearch({ embedded = false }: Props) {
  const [ticker, setTicker] = useState("NVDA");
  const [packet, setPacket] = useState<Packet | null>(null);
  const [result, setResult] = useState<Result | null>(null);
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState("");
  const [document, setDocument] = useState<Document | null>(null);
  const [service, setService] = useState<WealthService | null>(null);
  const [request, setRequest] = useState({ ticker: "NVDA", refresh: false, version: 0 });
  const [runtimeModel, setRuntimeModel] = useState("");
  const resultHeading = useRef<HTMLHeadingElement>(null);
  const ledger = useRunLedger();
  const recordRestored = ledger.record;
  const timeline = useRun({ demoId: "market-research", pageUrl: (id, after) => `/api/research/runs/${encodeURIComponent(id)}?after=${after}` });
  const { links } = useStudioNav();
  useEffect(() => {
    if (!timeline.restored || !timeline.run) return;
    const journal = timeline.run;
    const frame = requestAnimationFrame(() => {
      setRunning(journal.status === "running");
      if (journal.result && typeof journal.result === "object" && "report" in journal.result) {
        const restored = journal.result as Result;
        setResult(restored);
        recordRestored(observeWealth({ id: journal.id, label: journal.label ?? "Market research", startedAt: Date.parse(journal.started_at), status: "running" }, 200, restored));
      }
    });
    return () => cancelAnimationFrame(frame);
  }, [timeline.restored, timeline.run, recordRestored]);
  const stats = useMemo(() => wealthStats(service, "/api/research/market/analyze", links?.agentObservability, { inputs: "articles inspected", whenOff: "articles require a verdict before analysis." }), [service, links?.agentObservability]);

  useEffect(() => {
    const controller = new AbortController();
    fetch(`/api/research/market/inputs/${encodeURIComponent(request.ticker)}?refresh=${request.refresh}`, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(120000)]) })
      .then(async response => { const text = await response.text(); if (!response.ok) throw new Error(parseApiError(text, response.status)); return JSON.parse(text) as Packet; })
      .then(body => { if (!controller.signal.aborted) setPacket(body); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Could not load research inputs."); })
      .finally(() => { if (!controller.signal.aborted) setLoading(false); });
    return () => controller.abort();
  }, [request]);

  useEffect(() => {
    let active = true;
    fetch("/api/research/health", { signal: AbortSignal.timeout(10000) }).then(response => response.json()).then(body => {
      if (active) { setService(wealthService(body)); setRuntimeModel(body.nim?.model || body.model || ""); }
    }).catch(() => { if (active) setService({ reachable: false }); });
    return () => { active = false; };
  }, []);
  useEffect(() => {
    if (result) {
      resultHeading.current?.focus({ preventScroll: true });
      resultHeading.current?.closest(".mr-report")?.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  }, [result]);

  function load(symbol: string, refresh = false) {
    const normalized = symbol.trim().toUpperCase();
    if (!/^[A-Z]{1,5}(?:[.-][A-Z])?$/.test(normalized)) { setError("Enter a US ticker, such as NVDA or MSFT."); return; }
    setTicker(normalized); setPacket(null); setResult(null); setDocument(null); setError(""); setLoading(true); timeline.reset();
    setRequest(previous => ({ ticker: normalized, refresh, version: previous.version + 1 }));
  }
  function submit(event: FormEvent) { event.preventDefault(); load(ticker, ticker.trim().toUpperCase() !== "NVDA"); }
  async function analyze() {
    if (!packet) return;
    setRunning(true); setResult(null); setError("");
    const id = newRunId("wealth-research");
    timeline.open(id);
    const run = { ...startRun("research", `${packet.ticker} · market research`), id };
    ledger.record(run);
    let recorded = false;
    try {
      const response = await fetch("/api/research/market/analyze", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ticker: packet.ticker, packet_id: packet.packet_id, run_id: id }), signal: AbortSignal.timeout(260000) });
      const text = await response.text();
      const body = text ? JSON.parse(text) : {};
      ledger.record(observeWealth(run, response.status, body)); recorded = true;
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      if (!body.report) throw new Error(body.detail || "The model did not return a report.");
      setResult(body);
    } catch (cause) {
      if (!recorded) ledger.record({ ...run, status: "failed" });
      setError(cause instanceof Error ? cause.message : "Analysis failed. Try again.");
    } finally { setRunning(false); }
  }
  const shown = result || packet;
  const openEvidence = (id: string) => {
    const item = shown?.evidence.find(row => row.id === id);
    if (id.startsWith("news:")) { const article = shown?.news.find(row => `news:${row.id}` === id); if (article) { openArticle(article); return; } }
    if (item) setDocument({ title: item.title, source: item.source, body: item.text, fields: item.fields });
  };
  function openArticle(article: Article) {
    setDocument({ title: article.headline, source: `${article.publisher} · ${day(article.date)} · ${article.content_kind || "Source text"}`, body: article.body, url: article.url,
      notice: article.poisoned ? `Synthetic prompt-injection test. ${article.status === "withheld" ? `Excluded: ${article.by}. ${article.reason || ""}` : "Will be inspected before analysis."}` : article.content_kind === "Provider summary" ? "The provider supplied a summary. This is the complete text provided to the analysis; the publisher link opens the original article." : undefined });
  }
  const metrics = shown?.evidence.find(row => row.id === "metrics");
  const earnings = shown?.evidence.find(row => row.id === "latest-earnings");
  const withheld = result?.news.filter(row => row.status === "withheld") || [];

  return <div className={`research-demo mr-demo ${embedded ? "research-embedded" : ""}`} data-guide-run={running ? "running" : result ? "done" : error ? "failed" : "idle"} data-guide-source={result ? "live" : "none"} data-guide-stage={result ? "result" : ""}>
    <section className="mr-start" {...guideAnchor("research.intro")}>
      <form onSubmit={submit} className="mr-ticker" aria-label="Research a company"><label htmlFor="market-ticker">Company ticker</label><div><Search size={18} /><input id="market-ticker" value={ticker} onChange={event => setTicker(event.target.value.toUpperCase())} maxLength={8} disabled={running} /><button type="submit" disabled={loading || running}>Load company</button></div></form>
      <div className="mr-start-actions"><button type="button" className="secondary" disabled={loading || running} onClick={() => load("NVDA")}>NVDA cached example</button><button id="research-run" type="button" className="primary" disabled={!packet || loading || running} onClick={analyze} {...guideAnchor("research.run")}>{running ? <Loader2 size={16} className="spin" /> : <Play size={16} />}{running ? "Analyzing…" : "Analyze"}</button></div>
    </section>
    {error && <p className="mr-error" role="alert">{error} {!packet && <button onClick={() => load(ticker)}>Retry</button>}</p>}
    {loading && <p role="status"><Loader2 size={16} className="spin" /> Loading earnings, financials and recent news…</p>}
    {shown && <>
      <section className="mr-inputs" aria-label="Research inputs" {...guideAnchor("research.inputs")}>
        <header className="mr-section-head"><div><span className="mr-label">RESEARCH INPUTS</span><h2>{shown.company} <span>{shown.ticker}</span></h2><p>{shown.source.label} · Packet {day(shown.as_of)}</p></div><button type="button" disabled={running || loading} onClick={() => load(shown.ticker, true)}>Refresh latest</button></header>
        <dl className="mr-metrics">{Object.entries(metrics?.fields || {}).slice(0, 6).map(([key, item]) => <div key={key}><dt>{item.label || key}</dt><dd>{item.display}</dd></div>)}</dl>
        <div className="mr-input-columns"><section><h3>{earnings?.title || "Latest earnings"}</h3><dl className="mr-facts">{Object.entries(earnings?.fields || {}).map(([key, item]) => <div key={key}><dt>{item.label || key}</dt><dd>{item.display}</dd></div>)}</dl>{!Object.keys(earnings?.fields || {}).length && <p>Earnings data unavailable.</p>}</section>
          <section><h3>Peer comparison</h3>{shown.peers.length ? <table><thead><tr><th>Company</th><th>Market cap</th><th>Trailing P/E</th></tr></thead><tbody><tr><td>{shown.ticker}</td><td>{metrics?.fields.marketCap?.display || "—"}</td><td>{shown.evidence.find(row => row.id === "valuation")?.fields.trailing_pe?.display || "—"}</td></tr>{shown.peers.slice(0, 4).map(peer => <tr key={peer.ticker}><td title={peer.name}>{peer.ticker}</td><td>${compact(peer.marketCap)}</td><td>{peer.trailingPE == null ? "—" : `${peer.trailingPE.toFixed(1)}x`}</td></tr>)}</tbody></table> : <p>Peer data unavailable.</p>}</section></div>
        <section className="mr-news" {...guideAnchor("research.news")}><h3>Articles <span>Past 30 days + latest earnings release</span></h3>{shown.news_error && <p className="mr-source-note">{shown.news_error}</p>}
          <div className="mr-articles">{shown.news.map(article => <button type="button" key={article.id} className={`mr-article ${article.poisoned ? "is-attack" : ""}`} onClick={() => openArticle(article)}><FileText size={18} /><span><strong>{article.headline}</strong><small>{article.publisher} · {day(article.date)}</small></span><span className="mr-article-state">{article.status === "withheld" ? `Excluded · ${article.by}` : article.status === "kept" ? "Included" : article.poisoned ? "Synthetic attack" : "Read"}</span></button>)}</div>
        </section>
      </section>
      <section className="mr-report" aria-label="Research report" {...guideAnchor("research.result")}>
        <header className="mr-section-head"><div><span className="mr-label">RESEARCH REPORT</span><h2 ref={resultHeading} tabIndex={-1}>{result ? `${result.ticker} outlook & recommendation` : "Outlook & recommendation"}</h2></div>{result && <div className="mr-decision"><span className="mr-label">FINAL RECOMMENDATION</span>{result.report.recommendation ? <strong className={`mr-rating rating-${result.report.recommendation.toLowerCase()}`}>{result.report.recommendation}</strong> : <strong>Not available</strong>}</div>}</header>
        {result ? <>{result.report.outlook ? <p className="mr-outlook">{result.report.outlook}</p> : <p role="status">{result.report.reason}</p>}
          {!result.report.recommendation && <button type="button" className="primary" disabled={running} onClick={analyze}>Retry analysis</button>}
          <div className="mr-drivers">{result.report.drivers.map((driver, index) => <article key={index}><span className="mr-label">KEY DRIVER {index + 1}</span><p>{driver.text}</p><button onClick={() => openEvidence(driver.evidence_id)}>View source <ArrowUpRight size={14} /></button></article>)}</div>
          {result.report.risks.length > 0 && <div className="mr-risks"><strong>Risks to the outlook</strong><ul>{result.report.risks.map(risk => <li key={risk}>{risk}</li>)}</ul></div>}
          {withheld.length > 0 && <p className="mr-excluded"><ShieldCheck size={16} />{withheld.length} article{withheld.length === 1 ? "" : "s"} excluded before analysis. <button onClick={() => openArticle(withheld[0])}>Inspect verdict</button></p>}
          <ProvenanceBadge provenance={{ kind: "live", servedBy: result.served_by }} />
        </> : <p role="status">{running ? "Screening articles and weighing the evidence…" : "Analyze to get a Buy, Hold or Sell view, the key drivers, and the risks."}</p>}
      </section>
    </>}
    <details className="mr-activity"><summary>Agent activity</summary><RunTimeline label="Agent timeline" anchor="research.timeline" events={timeline.visible} start={timeline.run?.started_at} showLane onSource={ids => ids[0] && openEvidence(ids[0])} empty="Activity appears when you run an analysis." /></details>
    <RunStats ledger={ledger} {...stats} />
    <details className="mr-runtime"><summary>Runtime details</summary><dl className="mr-facts"><div><dt>Model</dt><dd>{result?.served_by?.model || runtimeModel || "Not reported"}</dd></div><div><dt>Data</dt><dd>Yahoo Finance · dated source cache</dd></div><div><dt>Analysis</dt><dd>Structured model assessment · cited facts verified</dd></div><div><dt>Article screening</dt><dd>Cisco AI Defense · uninspected articles excluded</dd></div></dl></details>
    <p className="mr-disclaimer">AI research opinion · 12-month horizon · not personalized investment advice.</p>
    {document && <SourceDialog document={document} onClose={() => setDocument(null)} />}
  </div>;
}
