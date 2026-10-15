"use client";

import { guideAnchor } from "./guide/anchors";
import { useEffect, useState, type ReactNode } from "react";

const dollars = (value: number) => new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: Number.isInteger(value) ? 0 : 2 }).format(value);
type RecordItem = { id: string; title: string; text: string; source?: string; kind?: string };
type Transaction = { id: string; at: string; direction: string; type: string; amount: number; counterparty: string; status: string; memo: string };
type Holding = { ticker: string; name: string; weight_pct: number; value: number; account?: string };
type Note = { date: string; author?: string; text?: string; summary?: string; source?: string };
type Evidence = RecordItem & { fields: Record<string, { display: string; label?: string }> };
type ResearchData = {
  ticker: string; restricted?: { reason: string; since: string }; source?: { label: string; asOf?: string; fetchedAt?: string };
  context?: { event?: { period: string; date: string; eps_actual: number; eps_estimate: number; revenue: number; revenue_estimate: number; guidance_change: string }; house_view?: { rating: string; as_of: string; thesis_points: string[]; key_risks: string[] } };
  evidence: Evidence[]; news: { id: string; headline: string; body: string; publisher: string; date: string }[]; filings: { slug: string; title: string; text: string }[];
};
type ClientData = { name: string; as_of: string; risk_profile: string; horizon_years: number; total_value: number; goals: string[]; ips?: { objective?: string; annual_spending_need?: number; single_issuer_limit_pct?: number }; holdings: Holding[]; crm_notes: Note[]; service_events?: Note[] };
type CaseData = { as_of?: string; transactions: Transaction[]; records: RecordItem[] };

function SourcePane({ title, children, count }: { title: string; children: ReactNode; count?: number }) {
  return <section className="source-pane"><h4>{title}{count !== undefined && <span>{count} records</span>}</h4><div className="source-scroll" tabIndex={0} role="region" aria-label={title}>{children}</div></section>;
}
function Records({ records }: { records: RecordItem[] }) {
  return <div className="source-records">{records.map(row => <article key={row.id}><strong>{row.title}</strong><small>{[row.id, row.source].filter(Boolean).join(" · ")}</small><p>{row.text}</p></article>)}</div>;
}
function CaseSources({ data }: { data: CaseData }) {
  const documents = data.records.filter(row => ["document", "teller_note", "prior_alert"].includes(row.kind || ""));
  const profile = data.records.filter(row => !["document", "teller_note", "prior_alert"].includes(row.kind || ""));
  return <><p className="source-provenance">Synthetic case records{data.as_of ? ` · snapshot ${data.as_of}` : ""} · Original documents and payment memos · before screening.</p>
    <SourcePane title="Transactions to investigate" count={data.transactions.length}><table><thead><tr><th>Date / reference</th><th>Payment</th><th>Amount</th><th>Counterparty / memo</th><th>Status</th></tr></thead><tbody>{data.transactions.map(row => <tr key={row.id}><td>{row.at.replace("T", " ").replace(/Z$/, "")}<small>{row.id}</small></td><td>{row.type}<small>{row.direction === "in" ? "Money in" : "Money out"}</small></td><td className="source-money">{dollars(row.amount)}</td><td>{row.counterparty}{row.memo && <small>{row.memo}</small>}</td><td>{row.status}</td></tr>)}</tbody></table></SourcePane>
    <div className="source-columns"><SourcePane title="Customer, accounts & related parties" count={profile.length}><Records records={profile} /></SourcePane><SourcePane title="Documents & prior notes" count={documents.length}><Records records={documents} />{!documents.length && <p>No documents or prior notes in this case.</p>}</SourcePane></div></>;
}
function ClientSources({ data }: { data: ClientData }) {
  return <><p className="source-provenance">Hypothetical client record · {data.as_of} · Original client notes · before screening.</p>
    <div className="source-facts"><div><span>Portfolio</span><strong>{dollars(data.total_value)}</strong></div><div><span>Risk profile</span><strong>{data.risk_profile}</strong></div><div><span>Planning horizon</span><strong>{data.horizon_years} years</strong></div>{data.ips?.annual_spending_need != null && <div><span>Annual spending assumption</span><strong>{dollars(data.ips.annual_spending_need)}</strong></div>}</div>
    <div className="source-columns"><SourcePane title="Investments on file" count={data.holdings.length}><table><thead><tr><th>Holding</th><th>Value</th><th>Share</th></tr></thead><tbody>{data.holdings.map(row => <tr key={row.ticker}><td><strong>{row.ticker}</strong><small>{row.name}</small></td><td className="source-money">{dollars(row.value)}</td><td>{row.weight_pct}%</td></tr>)}</tbody></table></SourcePane>
    <SourcePane title="Goals & agreed limits"><ul>{data.goals.map(goal => <li key={goal}>{goal}</li>)}</ul>{data.ips?.objective && <p>{data.ips.objective}</p>}{data.ips?.single_issuer_limit_pct != null && <p>Single-company investment limit: <strong>{data.ips.single_issuer_limit_pct}%</strong></p>}</SourcePane></div>
    <SourcePane title="Client notes & service history" count={data.crm_notes.length + (data.service_events?.length || 0)}><Records records={[...data.crm_notes, ...(data.service_events || [])].map((row, index) => ({ id: `note-${index + 1}`, title: `${row.date} · ${row.author || "Service event"}`, source: row.source, text: row.text || row.summary || "" }))} /></SourcePane></>;
}
function ResearchSources({ data }: { data: ResearchData }) {
  if (data.restricted) return <div className="source-restricted"><strong>Research is restricted for {data.ticker}</strong><p>{data.restricted.reason} · since {data.restricted.since}</p><p>Market data access is restricted pending compliance clearance.</p></div>;
  const event = data.context?.event;
  const outlook = data.context?.house_view;
  return <><p className="source-provenance">{data.source?.label}{data.source?.asOf && !data.source.label.includes(data.source.asOf) ? ` · as of ${data.source.asOf}` : ""}</p>
    <div className="source-columns">
      {event && <SourcePane title={`Earnings release · ${event.period}`}><p className="source-provenance">Synthetic company release · {event.date}</p><table><thead><tr><th>Measure</th><th>Analyst forecast</th><th>Reported</th></tr></thead><tbody><tr><th>Profit per share</th><td>{dollars(event.eps_estimate)}</td><td>{dollars(event.eps_actual)}</td></tr><tr><th>Revenue</th><td>{dollars(event.revenue_estimate)}</td><td>{dollars(event.revenue)}</td></tr></tbody></table><p>{event.guidance_change}</p></SourcePane>}
      {outlook && <SourcePane title="Firm’s existing investment outlook"><p className="source-provenance">Before this event · {outlook.as_of} · {outlook.rating}</p><ul>{outlook.thesis_points.map(text => <li key={text}>{text}</li>)}</ul><strong>Known risks</strong><ul>{outlook.key_risks.map(text => <li key={text}>{text}</li>)}</ul></SourcePane>}
    </div>
    <SourcePane title="Market data" count={data.evidence.filter(row => row.kind !== "computed").length}><div className="source-columns">{data.evidence.filter(row => row.kind !== "computed").map(row => <article className="source-metrics" key={row.id}><strong>{row.title}</strong><small>{row.source}</small><dl>{Object.entries(row.fields).map(([key, field]) => <div key={key}><dt>{field.label || key.replaceAll("_", " ")}</dt><dd>{field.display}</dd></div>)}</dl>{row.text && <p>{row.text}</p>}</article>)}</div></SourcePane>
    <div className="source-columns"><SourcePane title="Original news articles" count={data.news.length}><Records records={data.news.map(row => ({ id: row.id, title: row.headline, text: row.body, source: `${row.publisher} · ${row.date}` }))} />{!data.news.length && <p>No news feed connected for this company.</p>}</SourcePane><SourcePane title="Company filing excerpts" count={data.filings.length}><Records records={data.filings.map(row => ({ id: row.slug, title: row.title, text: row.text, source: "Synthetic annual report" }))} />{!data.filings.length && <p>No company filing connected.</p>}</SourcePane></div></>;
}

type InputKind = "sar" | "research" | "advisory";

export function SourceInputs({ kind, identity, scenario, action }: { action?: ReactNode; kind: InputKind; identity: string; scenario?: string }) {
  const url = kind === "sar" ? `/api/sar/scenarios/${encodeURIComponent(identity)}/inputs` : kind === "advisory" ? `/api/wealth/households/${encodeURIComponent(identity)}` : `/api/wealth/research/inputs/${encodeURIComponent(identity)}?scenario=${encodeURIComponent(scenario || "ticker")}`;
  return <InputPacket key={url} kind={kind} url={url} action={action} />;
}
function InputPacket({ kind, url, action }: { action?: ReactNode; kind: InputKind; url: string }) {
  const [data, setData] = useState<CaseData | ClientData | ResearchData | null>(null);
  const [error, setError] = useState("");
  const [attempt, setAttempt] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    fetch(url, { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(45000)]) })
      .then(async response => { if (!response.ok) throw new Error("Source records could not be loaded. Check the demo service in Studio settings, then retry."); return response.json(); })
      .then(body => { if (!controller.signal.aborted) setData(body); })
      .catch(cause => { if (!controller.signal.aborted) setError(cause instanceof Error ? cause.message : "Source records unavailable."); });
    return () => controller.abort();
  }, [url, attempt]);
  return <section className="source-inputs" aria-label="Source data before AI" {...guideAnchor(kind === "sar" ? "sar.inputs" : kind === "advisory" ? "advisory.inputs" : "research.inputs")}>
    <header><div><h3>{kind === "sar" ? "Case file" : kind === "advisory" ? "Client record" : "Research materials"}</h3></div>{action}</header>
    {!data && !error && <p role="status">Loading source records…</p>}
    {error && <p role="alert">{error} <button type="button" onClick={() => { setError(""); setAttempt(value => value + 1); }}>Retry source data</button></p>}
    {data && (kind === "sar" ? <CaseSources data={data as CaseData} /> : kind === "advisory" ? <ClientSources data={data as ClientData} /> : <ResearchSources data={data as ResearchData} />)}
  </section>;
}
