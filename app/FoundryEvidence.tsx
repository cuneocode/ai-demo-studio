"use client";

import { useState } from "react";
import { Check, Copy, Download, FileJson2, Fingerprint, ShieldCheck } from "lucide-react";
import { guideAnchor } from "./guide/anchors";
import type { VulnerabilityControl } from "./vulnerability-stats";

type Citation = { path: string; start: number; end: number; quote: string };
type Leg = { statement: string; citations: Citation[]; probe?: string };
export type EvidenceFinding = {
  finding_id: string; fingerprint: string; title: string; severity: string; cwe: string; symbol: string;
  verdict: string; reason: string; citations_valid: boolean; exploited: boolean; exploited_reason: string;
  legs: Record<string, Leg>; goal?: string;
};
export type FoundryBundle = {
  profile: string; revision: string; artifact: { uri: string; sha256: string }; findings: EvidenceFinding[];
  security_map: { id: string; route: string; input: string; handler: string; boundary: string; resolved: boolean }[];
  coverage: { status: string; scope: string; goals: { id: string; title: string; status: string; outcome: string }[] };
  validation: { method: string; legitimate_access: boolean; error?: string; probes: Record<string, { outcome: string; status: number; request: { path: string; query: Record<string, string> }; body: unknown }> };
};
export type EvidenceEvent = {
  event_id: string; event_type: string; fingerprint?: string; signature?: string; trace_id?: string;
  run_id: string; revision: string; channel: string; verdict?: string; detail: Record<string, unknown>; time?: number;
};
export type HecEnvelope = { time: number; host: string; source: string; sourcetype: string; index: string; event: EvidenceEvent };
const labels: Record<string, string> = {
  "finding.triaged": "Finding triaged", "coverage.evaluated": "Coverage evaluated", "publication.blocked": "Publication denied",
  "finding.confirmed": "Confirmed evidence prepared", "patch.applied": "Reviewed patch applied", "finding.rescan_clear": "Rescan and HTTP check clear",
};
const legLabels: Record<string, string> = { reachability: "Reachability", trust_boundary: "Trust boundary", impact: "Observed impact" };

type FoundryEvidenceProps = {
  run: { id: string; report: unknown; foundry?: FoundryBundle; post_patch_validation?: FoundryBundle["validation"]; hec_events?: HecEnvelope[]; finding_history?: EvidenceEvent[]; controls?: VulnerabilityControl[]; proposal: { applied: boolean } | null } | null;
  selected?: string; busy: boolean; act: (path: string, body?: unknown) => Promise<void>;
};

export default function FoundryEvidence(props: FoundryEvidenceProps) {
  return <EvidenceReview key={`${props.run?.id}:${props.run?.hec_events?.length ?? 0}`} {...props} />;
}

function EvidenceReview({ run, selected, busy, act }: FoundryEvidenceProps) {
  const [eventId, setEventId] = useState("");
  const [copied, setCopied] = useState(false);
  const [copyError, setCopyError] = useState("");
  const bundle = run?.foundry;
  const events = run?.hec_events ?? [];
  const item = events.find(row => row.event.event_id === eventId) ?? events.at(-1);
  const evidence = bundle?.findings.find(row => row.finding_id === selected) ?? bundle?.findings[0];
  const probe = evidence?.goal ? bundle?.validation.probes[evidence.goal] : undefined;
  const history = run?.finding_history?.filter(row => !evidence || row.fingerprint === evidence.fingerprint) ?? [];
  const publication = run?.controls?.filter(row => row.name === "vulnerability-evidence-publication-v1" && row.finding_id === evidence?.finding_id).at(-1);
  const prepared = events.some(row => row.event.event_type === "finding.confirmed" && row.event.fingerprint === evidence?.fingerprint);
  const json = item ? JSON.stringify(item, null, 2) : "";

  return <>
    <section className="cv-panel cv-foundry" {...guideAnchor("vulnerability.evidence")}>
      <header><div><ShieldCheck size={17} /><h3>Foundry evidence review</h3></div><span>{bundle ? "Cisco Foundry profile · Brahe Payments" : "Available after analysis"}</span></header>
      {bundle ? <>
        <div className="cv-foundry-meta"><span>Source revision <code title={bundle.revision}>{bundle.revision.slice(0, 12)}</code></span><span className={bundle.coverage.status === "complete" ? "cv-pass" : "cv-fail"}>{bundle.coverage.status === "complete" ? "2 evaluation goals covered" : "Coverage needs review"}</span><a href={bundle.artifact.uri} download="foundry-evidence.json">Evidence artifact <Download size={13} /></a></div>
        {run?.proposal?.applied && <p className="cv-notice">This evidence describes the scanned revision before the applied patch. Rescan the patched copy for a fresh assessment.</p>}
        <div className="cv-goals">{bundle.coverage.goals.map(goal => <div key={goal.id}><strong>{goal.title}</strong><span className={goal.status === "closed" ? "cv-pass" : "cv-fail"}>{goal.status === "closed" ? "Covered" : "Needs review"}</span><small>Independent HTTP probe: {goal.outcome.replaceAll("_", " ")}</small></div>)}</div>
        <details className="cv-details"><summary>Security map and evaluation scope</summary><p>The profile covers two settlement access goals in the synthetic API.</p>{bundle.security_map.map(entry => <div className="cv-security-entry" key={entry.id}><code>{entry.route}</code><span>Caller input: {entry.input} · {entry.handler}</span><small>{entry.boundary} · {entry.resolved ? "Source route resolved" : "Route needs review"}</small></div>)}</details>
        {evidence && <div className="cv-evidence-review">
          <div className="cv-foundry-verdict"><strong className={evidence.verdict === "confirmed" ? "cv-pass" : "cv-fail"}>{evidence.verdict === "confirmed" ? "Confirmed by evidence checks" : "Needs review"}</strong><span>{evidence.cwe} · {evidence.symbol}</span></div>
          <p className="cv-panel-copy">{evidence.reason}</p>
          <div className="cv-evidence-legs">{Object.entries(evidence.legs).map(([name, leg]) => <article key={name}><h4>{legLabels[name] || name}</h4><p>{leg.statement}</p>{leg.citations.map((cite, index) => <details key={index}><summary>{cite.path}:{cite.start}{cite.end !== cite.start && `–${cite.end}`}</summary><pre tabIndex={0}>{cite.quote}</pre></details>)}</article>)}</div>
          <div className="cv-validator"><strong>Independent HTTP validator · scanned revision</strong><span className={evidence.exploited || !bundle.validation.legitimate_access ? "cv-fail" : "cv-pass"}>{evidence.exploited ? "Headline impact reproduced" : "Impact not reproduced"}</span><p>{evidence.exploited_reason}</p>{probe && <details><summary>Request and observed response · HTTP {probe.status}</summary><pre tabIndex={0}>{JSON.stringify({ request: probe.request, response: probe.body }, null, 2)}</pre></details>}{bundle.validation.error && <p>{bundle.validation.error}</p>}</div>
          {run?.post_patch_validation && <div className="cv-validator"><strong>Independent HTTP validator · after patch</strong><p>Legitimate access: {run.post_patch_validation.legitimate_access ? "passed" : "needs review"}</p>{Object.entries(run.post_patch_validation.probes).map(([key, result]) => <p key={key} className={result.outcome === "blocked" ? "cv-pass" : "cv-fail"}>{key.replaceAll("-", " ")}: {result.outcome} · HTTP {result.status}</p>)}{run.post_patch_validation.error && <p>{run.post_patch_validation.error}</p>}</div>}
          <div className="cv-publication" {...guideAnchor("vulnerability.publication")}>
            <div className="cv-actions"><button className="primary-button" disabled={busy || evidence.verdict !== "confirmed" || run?.proposal?.applied || prepared} onClick={() => act(`/runs/${run!.id}/publish`, { finding_id: evidence.finding_id })}><Check size={15} />{prepared ? "Confirmed event prepared" : "Prepare confirmed event"}</button><button className="secondary-button" disabled={busy || !Object.keys(evidence.legs).length || run?.proposal?.applied} onClick={() => act(`/runs/${run!.id}/publish`, { finding_id: evidence.finding_id, test_invalid_citation: true })}>Test invalid citation</button></div>
            <p>Agent Control checks all three evidence legs and the source revision before preparing a confirmed event.</p>
            {publication && <div role="status" className={publication.allowed ? "cv-pass" : "cv-fail"}>{publication.allowed ? "Publication allowed" : "Publication denied"} · {publication.engine === "hosted" ? "Splunk Agent Control" : publication.engine === "local" ? "Local checks" : "Control unavailable"}{publication.failed.length > 0 && ` · ${publication.failed.join(", ").replaceAll("_", " ")}`}</div>}
          </div>
          <details className="cv-details"><summary><Fingerprint size={14} /> Finding identity and history</summary><p><code className="cv-fingerprint">{evidence.fingerprint}</code></p><p>Identity uses repository, normalized path, function, and weakness class.</p><ol className="cv-finding-history">{history.map(row => <li key={row.event_id}><strong>{labels[row.event_type] || row.event_type}</strong><span>{row.time ? new Date(row.time * 1000).toLocaleString() : ""} · revision {row.revision?.slice(0, 12)} · run {row.run_id.slice(0, 8)}</span></li>)}</ol></details>
        </div>}
        {!evidence && <p className="cv-panel-copy">No current findings. The coverage checklist and inherited finding history remain available in the event preview.</p>}
      </> : <div className="cv-empty"><p>{run?.report ? "Add revision checks and independent HTTP evidence to this saved scan." : "Analysis will produce revision-bound citations, an independent HTTP result, and a coverage checklist."}</p>{Boolean(run?.report) && <button className="secondary-button" disabled={busy || run?.proposal?.applied} onClick={() => act(`/runs/${run!.id}/evidence`)}>Build evidence for saved scan</button>}</div>}
    </section>

    <section className="cv-panel cv-hec" aria-label="Splunk HEC evidence preview" {...guideAnchor("vulnerability.hec")}>
      <header><div><FileJson2 size={17} /><h3>Splunk HEC evidence</h3></div><span className="cv-local-status">Prepared locally</span></header>
      <p className="cv-panel-copy">Inspect the events this evaluation would send to Splunk HTTP Event Collector. No HEC receiver is configured.</p>
      <div className="cv-hec-facts"><div><strong>{events.length}</strong><span>Prepared events</span></div><div><strong>{events.filter(row => row.event.channel === "security").length}</strong><span>Confirmed security events</span></div><div><strong>0</strong><span>Sent to HEC</span></div><div><strong>Unknown</strong><span>Indexed in Splunk</span></div></div>
      {item ? <>
        <div className="cv-hec-toolbar"><label>Event<select aria-label="Evidence event" value={item.event.event_id} onChange={event => { setEventId(event.target.value); setCopied(false); }}>{events.map(row => <option key={row.event.event_id} value={row.event.event_id}>{labels[row.event.event_type] || row.event.event_type}{row.event.signature ? ` · ${row.event.signature}` : ""}</option>)}</select></label><div className="cv-actions"><button className="secondary-button" onClick={async () => { try { await navigator.clipboard.writeText(json); setCopied(true); setCopyError(""); } catch { setCopyError("Copy is unavailable. Download the event batch below."); } }}><Copy size={14} />{copied ? "Copied" : "Copy event"}</button><a className="secondary-button" href={`/api/vulnerability/runs/${run!.id}/hec`} download><Download size={14} />Download HEC batch</a></div></div>
        <div className="cv-hec-event-meta"><span>{item.event.channel === "security" ? "Confirmed finding" : "Audit event"}</span><code>{item.event.event_type}</code><span>event_id {item.event.event_id.slice(0, 12)}</span></div>
        <pre className="cv-hec-json" aria-label="HEC formatted event JSON" tabIndex={0}>{json}</pre>
        <p className="cv-footnote" role="status">{copyError || "The download contains newline-delimited HEC event envelopes. Stable event IDs support downstream deduplication."}</p>
      </> : <div className="cv-empty"><FileJson2 size={25} /><p>Evidence events appear here after analysis or after building evidence for a saved scan.</p></div>}
    </section>
  </>;
}
