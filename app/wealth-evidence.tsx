"use client";

import { useEffect, useRef } from "react";
import { Check, CircleAlert, Minus, X } from "lucide-react";
import { CLAIM_LABEL, policySourceLabel, type Claim, type EvidenceItem, type PolicyResult } from "./research-note";

/** The evidence a clicked citation highlights: the item, and the field or quoted passage it cites. */
export type Focus = { id: string; field?: string; quote?: string } | null;

const NEUTRAL = new Set(["agenda", "question"]);

function chipText(claim: Claim, item?: EvidenceItem) {
  const title = item?.title.replace(/^10-K FY\d+ · /, "10-K · ").replace(/ \(book of record\)$/, "") ?? claim.evidenceId ?? "Source";
  const field = claim.fieldPath ? item?.fields[claim.fieldPath] : undefined;
  if (field) return `${title} · ${field.label || claim.fieldPath} ${field.display}`;
  return claim.quote ? `${title} · quoted` : title;
}

function Marked({ text, quote }: { text: string; quote?: string }) {
  const needle = quote?.replace(/\.$/, "");
  const at = needle ? text.toLowerCase().indexOf(needle.toLowerCase()) : -1;
  if (!needle || at < 0) return <>{text}</>;
  return <>{text.slice(0, at)}<mark>{text.slice(at, at + needle.length)}</mark>{text.slice(at + needle.length)}</>;
}

export function PolicyList({ title, result }: { title: string; result?: PolicyResult }) {
  if (!result) return null;
  return (
    <div className="rx-policy">
      <div className="rx-policy-head">
        <strong>{title}</strong>
        <span className={`rx-source ${result.source === "agent_control" ? "is-hosted" : ""}`}>{policySourceLabel(result.source)}</span>
      </div>
      <ul>
        {result.checks.map((check) => (
          <li key={`${check.key}-${check.label}`} className={`is-${check.status}`}>
            {check.status === "allowed" ? <Check size={14} aria-hidden="true" /> : check.status === "denied" ? <X size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
            <span>{check.label}</span>
            <em>{check.status.replaceAll("_", " ")}</em>
          </li>
        ))}
      </ul>
      {result.detail && <p className="rx-muted">{result.detail}</p>}
    </div>
  );
}

/** One checked sentence: ✓ verified, ✗ struck with the reason, or a neutral agenda line / question. */
export function ClaimRow({ claim, item, onCite, focus }: { claim: Claim; item?: EvidenceItem; onCite: (focus: Focus) => void; focus: Focus }) {
  const neutral = NEUTRAL.has(claim.status);
  const kept = claim.status === "verified" || neutral;
  const active = Boolean(claim.evidenceId && focus?.id === claim.evidenceId && focus?.field === claim.fieldPath);
  return (
    <li className={`rx-claim is-${claim.status}`}>
      <span className="rx-claim-mark" aria-label={neutral ? claim.reason : CLAIM_LABEL[claim.status] ?? claim.status} title={claim.reason}>
        {neutral ? <Minus size={14} /> : kept ? <Check size={14} /> : <X size={14} />}
      </span>
      <div>
        <p>{kept ? claim.text : <s>{claim.text}</s>}</p>
        {claim.evidenceId && (
          <button type="button" className={`rx-cite ${active ? "is-active" : ""}`} aria-pressed={active}
            onClick={() => onCite(active ? null : { id: claim.evidenceId!, field: claim.fieldPath, quote: claim.quote })}>
            {chipText(claim, item)}
          </button>
        )}
        {!kept && <small className="rx-reason">{CLAIM_LABEL[claim.status] ?? claim.status} · {claim.reason}</small>}
      </div>
    </li>
  );
}

export function EvidenceCard({ item, focus }: { item: EvidenceItem; focus: Focus }) {
  const ref = useRef<HTMLElement>(null);
  const cited = focus?.id === item.id;
  useEffect(() => { if (cited) ref.current?.scrollIntoView({ block: "nearest", behavior: "smooth" }); }, [cited]);
  const fields = Object.entries(item.fields).slice(0, cited ? 24 : 8);
  const text = cited || item.text.length < 260 ? item.text : `${item.text.slice(0, 240).trimEnd()}…`;
  return (
    <article ref={ref} className={`rx-evidence ${cited ? "is-cited" : ""}`} data-evidence={item.id} aria-current={cited ? "true" : undefined}>
      <header>
        <strong>{item.title}</strong>
        {item.synthetic && <span className="rx-tag">Synthetic</span>}
      </header>
      <small>{item.source}</small>
      {fields.length > 0 && (
        <dl>
          {fields.map(([path, field]) => (
            <div key={path} className={cited && focus?.field === path ? "is-cited" : ""}><dt>{field.label || path}</dt><dd>{field.display}</dd></div>
          ))}
        </dl>
      )}
      {text && <p><Marked text={text} quote={cited ? focus?.quote : undefined} /></p>}
    </article>
  );
}
