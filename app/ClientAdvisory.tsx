"use client";

import { useEffect, useMemo, useRef, useState, type RefObject } from "react";
import { ArrowRight, Ban, Briefcase, Check, CircleAlert, FileText, History, Landmark, Loader2, Lock, NotebookPen, Play, ShieldAlert, ShieldCheck, UserCheck, Users } from "lucide-react";
import type { StoredCompanyProfile } from "./company-profile";
import DemoStatusBanner from "./DemoStatusBanner";
import {
  ADVISOR, LINE_SECTIONS, RECORDED_HOUSEHOLDS, SUPERVISOR, briefingPayload, fetchHouseholds, formatMoney, normalizeApproval, normalizeMeetingPrep,
  saveAdvisoryBrief, type ApprovalState, type HouseholdCard, type MeetingPrep, type NextBestAction, type StoredAdvisoryBrief,
} from "./advisory-brief";
import { IMPACT_LABEL, loadWealthRecording, normalizeWealthHealth, parseApiError, rawResearchNote, type EvidenceItem, type StoredResearchNote, type WealthHealth } from "./research-note";
import RunStats, { startRun, useRunLedger } from "./RunStats";
import { newRunId } from "./run/events";
import ProvenanceBadge, { type Provenance } from "./run/ProvenanceBadge";
import RunTimeline from "./run/RunTimeline";
import { useRun } from "./run/useRun";
import { useHandoffs } from "./lifecycle-handoff";
import { useStudioNav } from "./studio-nav";
import { ClaimRow, EvidenceCard, PolicyList, type Focus } from "./wealth-evidence";
import { observeRecordedWealth, observeWealth, wealthService, wealthStats, type WealthService } from "./wealth-stats";
import "./research.css";
import "./advisory.css";

type Props = {
  embedded?: boolean;
  inStory?: boolean;
  companyProfile?: StoredCompanyProfile | null;
  researchNote?: StoredResearchNote | null;
  brief?: StoredAdvisoryBrief | null;
  onBriefChange?: (brief: StoredAdvisoryBrief | null) => void;
};

type Origin = { kind: "live" } | { kind: "recorded"; recordedAt: string };

/** One row of the context panel. New sources (a recent fraud case, a SAR hold) add a row here. */
type ContextItem = { id: string; label: string; detail: string; tone: "ok" | "info" | "missing"; action?: { label: string; open: () => void } };

const parsed = (text: string): unknown => { try { return text ? JSON.parse(text) : {}; } catch { return {}; } };

function provenanceOf(prep: MeetingPrep, origin: Origin): Provenance {
  if (origin.kind === "recorded") return { kind: "recorded", recordedAt: origin.recordedAt, servedBy: prep.servedBy };
  if (prep.brief.mode === "fixture") return { kind: "sample", detail: prep.brief.refused ? "Brief written by code · client data stayed in the bank" : "Brief written by code from the rules · no model" };
  return prep.servedBy ? { kind: "live", servedBy: prep.servedBy } : { kind: "none", detail: "No model answered" };
}

function ActionRow({ action, chosen, onToggle, locked }: { action: NextBestAction; chosen: boolean; onToggle: () => void; locked: boolean }) {
  return (
    <li className={`ax-action ${action.suitable ? "" : "is-unsuitable"} ${chosen ? "is-chosen" : ""}`}>
      <label>
        <input type="checkbox" checked={chosen} onChange={onToggle} disabled={locked} aria-label={`Include ${action.title}`} />
        <div>
          <strong>{action.title}</strong>
          <span>{action.summary}</span>
          {!action.suitable && <small className="rx-reason">{action.fit}{chosen ? " · the supervisor's policy check will deny it" : ""}</small>}
          {action.suitable && action.cautions.length > 0 && <small className="rx-muted">{action.cautions[0]}</small>}
        </div>
        <em>{action.dollarsDisplay ?? (action.dollars != null ? formatMoney(action.dollars) : "")}<small>{action.dollarsLabel}</small></em>
      </label>
    </li>
  );
}

function ApprovalBar({ approval, busy, canAct, onDecide }: {
  approval: ApprovalState; busy: boolean; canAct: boolean; onDecide: (stage: "advisor" | "supervisor", decision: "approve" | "reject") => void;
}) {
  const stamp = (row?: { by: string; at: string }) => (row ? `${row.by}${row.at ? ` · ${new Date(row.at).toLocaleTimeString()}` : ""}` : "");
  if (approval.status === "awaiting_advisor") {
    return (
      <section className="rx-publish" aria-label="Approval">
        <UserCheck size={18} aria-hidden="true" />
        <div><strong>Step 1 · Advisor review</strong><span>{ADVISOR} checks the brief and the chosen actions, then submits it for supervision.</span></div>
        <button type="button" className="secondary" disabled={busy || !canAct} onClick={() => onDecide("advisor", "reject")}>Return</button>
        <button type="button" className="primary" disabled={busy || !canAct} onClick={() => onDecide("advisor", "approve")}>
          {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <ArrowRight size={15} aria-hidden="true" />} Submit for supervision
        </button>
      </section>
    );
  }
  if (approval.status === "awaiting_supervisor") {
    return (
      <section className="rx-publish" aria-label="Approval">
        <ShieldCheck size={18} aria-hidden="true" />
        <div><strong>Step 2 · Supervisor approval</strong><span>Submitted by {stamp(approval.advisor)}. {SUPERVISOR} approves; that runs the advisory.recommendation policies.</span></div>
        <button type="button" className="secondary" disabled={busy || !canAct} onClick={() => onDecide("supervisor", "reject")}>Reject</button>
        <button type="button" className="primary" disabled={busy || !canAct} onClick={() => onDecide("supervisor", "approve")}>
          {busy ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Check size={15} aria-hidden="true" />} Approve and record
        </button>
      </section>
    );
  }
  if (approval.status === "sent") {
    return (
      <section className="rx-publish is-done" aria-label="Approval">
        <ShieldCheck size={18} aria-hidden="true" />
        <div><strong>Approved · brief recorded to the CRM</strong><span>Nothing is executed: no trade, transfer, or message leaves the studio. {stamp(approval.supervisor)}{approval.originLabel ? ` · ${approval.originLabel}` : ""}</span></div>
      </section>
    );
  }
  const text = approval.status === "denied" ? "Not recorded · an advisory.recommendation policy denied it"
    : approval.status === "rejected" ? `Rejected by ${approval.supervisor?.by || "the supervisor"}`
      : approval.status === "returned" ? `Returned by ${approval.advisor?.by || "the advisor"}` : "Nothing to approve";
  return (
    <section className="rx-publish is-denied" aria-label="Approval">
      <Ban size={18} aria-hidden="true" />
      <div><strong>{text}</strong>{approval.findings.length > 0 && <span>{approval.findings.join(" · ")}</span>}</div>
    </section>
  );
}

const ADVISORY_DEFENSE = { inputs: "CRM notes inspected", whenOff: "CRM notes are still inspected, and a run on a hosted model is forced to enforce." };

export default function ClientAdvisory({ embedded = false, inStory = false, companyProfile, researchNote, onBriefChange }: Props) {
  const [health, setHealth] = useState<WealthHealth | null>(null);
  const [service, setService] = useState<WealthService | null>(null);
  const [households, setHouseholds] = useState<HouseholdCard[]>([]);
  const [householdId, setHouseholdId] = useState("dana-whitfield");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [prep, setPrep] = useState<MeetingPrep | null>(null);
  const [raw, setRaw] = useState<Record<string, unknown> | null>(null);
  const [origin, setOrigin] = useState<Origin>({ kind: "live" });
  const [chosen, setChosen] = useState<string[]>([]);
  const [approval, setApproval] = useState<ApprovalState | null>(null);
  const [deciding, setDeciding] = useState(false);
  const [focus, setFocus] = useState<Focus>(null);
  const ledger = useRunLedger();
  const timeline = useRun({ pageUrl: (id, after) => `/api/wealth/runs/${encodeURIComponent(id)}?after=${after}` });
  const { links, openUseCase } = useStudioNav();
  const stats = useMemo(() => wealthStats(service, "/api/wealth/advisory/brief", links?.agentObservability, ADVISORY_DEFENSE), [service, links?.agentObservability]);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const focusResult = useRef(false);

  useEffect(() => {
    if (!focusResult.current || !prep) return;
    focusResult.current = false;
    headingRef.current?.focus({ preventScroll: true });
  }, [prep]);

  useEffect(() => {
    fetch("/api/wealth/health", { signal: AbortSignal.timeout(10000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("unavailable"))))
      .then((body) => { setHealth(normalizeWealthHealth(body)); setService(wealthService(body)); })
      .catch(() => { setHealth({ ready: false, advisoryModel: { status: "down" } }); setService({ reachable: false }); });
    fetchHouseholds().then(setHouseholds).catch(() => setHouseholds([
      { id: "dana-whitfield", name: "Dana Whitfield", scenario: "Annual review" },
      { id: "okafor", name: "Ruth & Samuel Okafor", scenario: "Conservative mismatch" },
      { id: "priya-raman", name: "Priya Raman", scenario: "Attack: PII and an injected instruction" },
    ]));
  }, []);

  const published = researchNote?.analyze.publish.status === "published" ? researchNote : null;
  // Only what the client already knows (card blocked and reissued); fraud escalations and SAR work never reach this panel.
  const serviceEvent = useHandoffs("service-event").find((item) => item.customerId === householdId);
  const recordEvent = households.find((item) => item.id === householdId)?.serviceEvent;
  const serviceRow: ContextItem[] = serviceEvent
    ? [{ id: "service", label: `Recent service event · ${serviceEvent.title}`, tone: "ok",
      detail: `${serviceEvent.summary} From Card fraud triage · ${serviceEvent.provenance === "live" ? "this session" : "recorded run"}.` }]
    : recordEvent
      ? [{ id: "service", label: "Recent service event · from the customer record", tone: "info", detail: `${recordEvent} Sample record; run Card fraud triage to share this session's event.`,
        action: openUseCase ? { label: "Open fraud triage", open: () => openUseCase("fraud-modeling") } : undefined }]
      : [];
  const context: ContextItem[] = [
    ...serviceRow,
    published
      ? { id: "research", label: `House-view update · ${published.ticker} · ${published.analyze.context?.houseView?.rating ?? ""}`.trim(), tone: "ok",
        detail: `Published by ${published.publishedBy ?? "the CIO office"} · ${IMPACT_LABEL[published.analyze.update.impact ?? ""] ?? ""} · ${published.analyze.update.counts.verified} verified claims` }
      : { id: "research", label: "House-view update · none published this session", tone: "info",
        detail: "Meeting prep uses the recorded Halcyon update when the client holds HCYN.", action: openUseCase ? { label: "Open research", open: () => openUseCase("market-research") } : undefined },
    companyProfile?.company.name
      ? { id: "briefing", label: `Company briefing · ${companyProfile.company.name}`, tone: "ok", detail: `From the Company briefing demo${companyProfile.period ? ` · ${companyProfile.period}` : ""}` }
      : { id: "briefing", label: "Company briefing · not loaded", tone: "missing", detail: "Extract the Halcyon annual report in Company briefing to add it.",
        action: openUseCase ? { label: "Open briefing", open: () => openUseCase("company-briefing") } : undefined },
  ];

  const evidence = useMemo(() => new Map((prep?.evidence ?? []).map((item) => [item.id, item])), [prep]);
  const serviceDown = service?.reachable === false;
  const fallbackRefused = health?.advisoryHostedFallback?.startsWith("refused");
  const shownApproval = approval ?? prep?.approval ?? null;
  const locked = Boolean(shownApproval && !["awaiting_advisor"].includes(shownApproval.status));
  const recordedAvailable = RECORDED_HOUSEHOLDS.has(householdId);

  function begin() {
    setLoading(true);
    setError("");
    setFocus(null);
    setApproval(null);
  }

  function landed(next: MeetingPrep, body: Record<string, unknown>, from: Origin) {
    setPrep(next);
    setRaw(body);
    setOrigin(from);
    setChosen(next.brief.actionIds);
    focusResult.current = true;
  }

  async function runLive() {
    begin();
    const runId = newRunId("wealth-advisory");
    timeline.open(runId);
    const name = households.find((item) => item.id === householdId)?.name ?? householdId;
    const run = startRun("advisory", `Meeting prep · ${name}`);
    ledger.record(run);
    let settled = false;
    try {
      const response = await fetch("/api/wealth/advisory/brief", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ household_id: householdId, research: published ? rawResearchNote() : null, briefing: briefingPayload(companyProfile),
          service_events: serviceEvent ? [serviceEvent] : null, run_id: runId }),
        signal: AbortSignal.timeout(260000),
      });
      const text = await response.text();
      ledger.record(observeWealth(run, response.status, parsed(text)));
      settled = true;
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const body = parsed(text) as Record<string, unknown>;
      const next = normalizeMeetingPrep(body);
      if (!next) throw new Error("The meeting-prep service returned nothing.");
      landed(next, body, { kind: "live" });
    } catch (cause) {
      if (!settled) ledger.record({ ...run, status: "failed" });
      setError(cause instanceof DOMException && cause.name === "TimeoutError" ? "The run timed out. Replay the recorded run instead."
        : cause instanceof TypeError ? "The wealth service did not answer. Replay the recorded run instead."
          : cause instanceof Error ? cause.message : "The run failed.");
    } finally {
      setLoading(false);
    }
  }

  async function replay() {
    begin();
    try {
      const recording = await loadWealthRecording(`advisory-${householdId}`);
      const next = normalizeMeetingPrep(recording.result);
      if (!next) throw new Error("The recorded run has no meeting brief.");
      timeline.play({ run: recording.run, events: recording.events });
      ledger.record(observeRecordedWealth(startRun("advisory", `${next.household?.name ?? householdId} · recorded`), recording.result, recording.recordedAt));
      landed(next, recording.result as Record<string, unknown>, { kind: "recorded", recordedAt: recording.recordedAt });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The recorded run is unavailable.");
    } finally {
      setLoading(false);
    }
  }

  async function decide(stage: "advisor" | "supervisor", decision: "approve" | "reject") {
    if (!prep || !raw) return;
    setDeciding(true);
    setError("");
    try {
      const posted = { ...raw, approval: { ...(raw.approval as object), ...(shownApproval ? { status: shownApproval.status } : {}) } };
      const response = await fetch("/api/wealth/advisory/approve", {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ run_id: origin.kind === "live" ? prep.runId : undefined, stage, decision, action_ids: chosen, result: posted,
          by: stage === "advisor" ? ADVISOR : SUPERVISOR }),
        signal: AbortSignal.timeout(30000),
      });
      const text = await response.text();
      if (!response.ok) throw new Error(parseApiError(text, response.status));
      const body = parsed(text) as Record<string, unknown>;
      const next = normalizeApproval(body);
      setApproval(next);
      setRaw({ ...raw, approval: body });
      if (origin.kind === "live" && prep.runId) timeline.resume(prep.runId);
      if (next.status === "sent") {
        const stored = { acceptedAt: next.supervisor?.at || new Date().toISOString(), householdId: prep.household?.id, householdName: prep.household?.name,
          recordedAt: origin.kind === "recorded" ? origin.recordedAt : undefined };
        const rawBrief = { ...raw, approval: body };
        saveAdvisoryBrief(stored, rawBrief);
        onBriefChange?.({ ...stored, brief: normalizeMeetingPrep(rawBrief)! });
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "The approval failed.");
    } finally {
      setDeciding(false);
    }
  }

  const replayAction = (
    <button type="button" className="secondary" disabled={loading || !recordedAvailable} onClick={replay}>
      <History size={15} aria-hidden="true" /> Replay recorded run
    </button>
  );

  return (
    <div className={`advisory-demo ${embedded ? "advisory-embedded" : ""}`}>
      {!inStory && (
        <p className="rx-intro">
          <strong>Jordan, advisor.</strong> Prepare a client meeting: the household&apos;s profile against its portfolio, ranked next-best actions
          sized in dollars, and a one-page brief where every statement is checked. A supervisor approves before anything is recorded.
        </p>
      )}

      {serviceDown ? (
        <DemoStatusBanner title="The wealth service is not answering" stillWorks="Recorded runs for each household" fix="Start it from Studio settings · Services" actions={replayAction} />
      ) : health?.advisoryModel?.fallback && !fallbackRefused ? (
        <DemoStatusBanner tone="degraded" settingsSection="st-ai-defense" settingsLabel="AI Defense settings"
          title={`Private inference is down · client data may reach ${health.advisoryModel.label} only with AI Defense in enforce`}
          stillWorks="Every prompt and answer is inspected and blocked on a violation for this run" />
      ) : health?.advisoryModel?.fallback && fallbackRefused ? (
        <DemoStatusBanner tone="degraded" settingsSection="st-ai-defense" title="Private inference is down · client data will not leave the bank"
          stillWorks="Rules, actions, and a code-written brief; recorded runs replay" fix="Turn AI Defense on to allow a hosted fallback for client data" />
      ) : null}

      <div className="ax-top">
        <fieldset className="ax-households">
          <legend>Household</legend>
          {households.map((item) => (
            <label key={item.id} className={householdId === item.id ? "selected" : ""}>
              <input type="radio" name="advisory-household" value={item.id} checked={householdId === item.id} onChange={() => setHouseholdId(item.id)} />
              <span className={`rx-kind ${item.scenario?.startsWith("Attack") ? "is-attack" : ""}`}>{item.scenario}</span>
              <strong>{item.name}</strong>
              <small>{[item.riskProfile, item.totalValue != null ? formatMoney(item.totalValue) : null, item.age ? `age ${item.age}` : null].filter(Boolean).join(" · ")}</small>
              {item.headline && <span>{item.headline}</span>}
            </label>
          ))}
        </fieldset>
        <section className="ax-context" aria-label="Meeting context">
          <h3><Briefcase size={15} aria-hidden="true" /> Context loaded for the meeting</h3>
          <ul>
            {context.map((item) => (
              <li key={item.id} className={`is-${item.tone}`}>
                {item.tone === "ok" ? <Check size={14} aria-hidden="true" /> : <CircleAlert size={14} aria-hidden="true" />}
                <div><strong>{item.label}</strong><small>{item.detail}</small></div>
                {item.action && <button type="button" className="rx-clear" onClick={item.action.open}>{item.action.label}</button>}
              </li>
            ))}
          </ul>
        </section>
      </div>
      <div className="rx-actions">
        <button type="button" id="advisory-run" className="primary" disabled={loading || serviceDown} onClick={runLive}>
          {loading ? <Loader2 size={15} className="spin" aria-hidden="true" /> : <Play size={15} aria-hidden="true" />} Prepare meeting
        </button>
        {replayAction}
      </div>
      {error && <p className="rx-error" role="alert"><CircleAlert size={15} aria-hidden="true" /> {error}</p>}

      {prep ? (
        <PrepView prep={prep} origin={origin} focus={focus} onCite={setFocus} evidence={evidence} headingRef={headingRef}
          chosen={chosen} locked={locked} onToggle={(id) => setChosen((list) => (list.includes(id) ? list.filter((item) => item !== id) : [...list, id]))}
          approval={shownApproval} deciding={deciding} onDecide={decide} />
      ) : (
        <p className="rx-empty">Pick a household and prepare the meeting, or replay the recorded run.</p>
      )}

      <RunTimeline label="Agent timeline" events={timeline.visible} start={timeline.run?.started_at} showLane
        onSource={(ids) => ids[0] && setFocus({ id: ids[0] })}
        empty={loading ? "Waiting for the first event…" : "Screening, rules, the meeting-prep agent and its reviewer, policy checks, and both approvals stream here."} />

      <RunStats ledger={ledger} observability={stats.observability} defense={stats.defense} />
      <p className="rx-disclaimer">Synthetic clients · test values only (000- SSNs, 4111 card). Demonstration only · not investment, tax, or legal advice.</p>
    </div>
  );
}

function PrepView({ prep, origin, focus, onCite, evidence, headingRef, chosen, locked, onToggle, approval, deciding, onDecide }: {
  prep: MeetingPrep; origin: Origin; focus: Focus; onCite: (focus: Focus) => void; evidence: Map<string, EvidenceItem>;
  headingRef: RefObject<HTMLHeadingElement | null>; chosen: string[]; locked: boolean; onToggle: (id: string) => void;
  approval: ApprovalState | null; deciding: boolean; onDecide: (stage: "advisor" | "supervisor", decision: "approve" | "reject") => void;
}) {
  const household = prep.household;
  const struck = prep.brief.lines.filter((line) => line.status === "unverified" || line.status === "policy");
  const kept = prep.brief.lines.filter((line) => !struck.includes(line));
  const ranked = [...prep.actions].sort((a, b) => {
    const rank = (action: NextBestAction) => (prep.brief.actionIds.includes(action.id) ? prep.brief.actionIds.indexOf(action.id) : action.suitable ? 50 : 99);
    return rank(a) - rank(b);
  });
  const sideEvidence = [...evidence.values()].filter((item) => !["note", "action"].includes(item.kind));

  return (
    <section className="rx-result" aria-label="Meeting prep">
      <header className="rx-result-head">
        <div>
          <span className="rx-eyebrow">MEETING PREP</span>
          <h2 ref={headingRef} tabIndex={-1}>{household?.name ?? "Entered holdings"}</h2>
          <div className="rx-badges">
            <span className="rx-tag">Synthetic client</span>
            {household?.riskProfile && <span className="rx-tag">{household.riskProfile} profile</span>}
            {household?.totalValue != null && <span className="rx-tag">{formatMoney(household.totalValue)}</span>}
            {household?.horizonYears != null && <span className="rx-tag">{household.horizonYears}-year horizon</span>}
            <span className="rx-tag is-mode">{prep.brief.modeLabel}</span>
            {prep.security?.forced && <span className="rx-tag is-cisco"><Lock size={12} aria-hidden="true" /> AI Defense forced to enforce · client data on a hosted model</span>}
          </div>
        </div>
        <ProvenanceBadge provenance={provenanceOf(prep, origin)} />
      </header>
      {prep.brief.refused && (
        <p className="ax-refused"><Lock size={15} aria-hidden="true" /> Client data stayed in the bank: the hosted fallback was refused without AI Defense enforce. {prep.brief.reason}</p>
      )}

      <div className="rx-grid">
        <div className="rx-main">
          {prep.suitability.length > 0 && (
            <div className="rx-section">
              <h3><ShieldAlert size={15} aria-hidden="true" /> Profile against portfolio · Reg BI care obligation</h3>
              <ul className="ax-findings">
                {prep.suitability.map((row) => (
                  <li key={row.id} className={`is-${row.severity}`}>
                    <button type="button" className="ax-finding" onClick={() => onCite(row.rule ? { id: `suitability:${row.rule}` } : null)}>
                      <span className="ax-severity">{row.severity}</span>
                      <strong>{row.title}</strong>
                      <small>{row.rule} · {row.category}</small>
                    </button>
                    <p>{row.detail}</p>
                    {row.regBi && <small className="rx-muted">{row.regBi}</small>}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {prep.actions.length > 0 && (
            <div className="rx-section">
              <h3><Landmark size={15} aria-hidden="true" /> Next-best actions{prep.addressableDisplay ? ` · ${prep.addressableDisplay} investable in play` : ""}</h3>
              <ul className="ax-actions">
                {ranked.map((action) => (
                  <ActionRow key={action.id} action={action} chosen={chosen.includes(action.id)} locked={locked} onToggle={() => onToggle(action.id)} />
                ))}
              </ul>
              {prep.brief.droppedActions.length > 0 && (
                <p className="rx-muted">Dropped from the agent&apos;s ranking: {prep.brief.droppedActions.map((row) => `${row.actionId} (${row.reason})`).join("; ")}</p>
              )}
            </div>
          )}

          <div className="rx-section ax-brief">
            <h3><FileText size={15} aria-hidden="true" /> One-page meeting brief</h3>
            {prep.brief.status !== "ready" && <p className="rx-muted">{prep.brief.reason || "No brief was drafted."}</p>}
            {LINE_SECTIONS.map((section) => {
              const rows = kept.filter((line) => line.section === section.id);
              if (!rows.length) return null;
              return (
                <div key={section.id} className="ax-brief-section">
                  <h4>{section.label}</h4>
                  <ul>{rows.map((line, index) => (
                    <ClaimRow key={index} claim={line} item={line.evidenceId ? evidence.get(line.evidenceId) : undefined} onCite={onCite} focus={focus} />
                  ))}</ul>
                </div>
              );
            })}
            <p className="rx-count">
              <Check size={14} aria-hidden="true" /> {prep.brief.counts.verified} of {prep.brief.counts.claims} statements verified
              {struck.length > 0 && <> · {struck.length} struck before the advisor saw them</>}
              {prep.evaluation && <> · {prep.evaluation.label}</>}
            </p>
          </div>
          {struck.length > 0 && (
            <div className="rx-section rx-struck">
              <h3>Struck by the claim verifier or policy</h3>
              <ul>{struck.map((line, index) => (
                <ClaimRow key={index} claim={line} item={line.evidenceId ? evidence.get(line.evidenceId) : undefined} onCite={onCite} focus={focus} />
              ))}</ul>
            </div>
          )}

          <div className="rx-policies">
            <PolicyList title="Approval · advisory.recommendation" result={approval?.controls} />
          </div>
          {approval && prep.brief.status === "ready" && <ApprovalBar approval={approval} busy={deciding} canAct={Boolean(prep.brief.lines.length)} onDecide={onDecide} />}
        </div>

        <aside className="rx-side" aria-label="Client record and evidence">
          <h3><NotebookPen size={15} aria-hidden="true" /> CRM notes · screened before any model call</h3>
          <ul className="ax-notes">
            {prep.notes.map((note) => (
              <li key={note.index} className={`is-${note.status} ${focus?.id === `crm:${note.index}` ? "is-cited" : ""}`}>
                <small>{note.date} · {note.author}</small>
                {note.status === "withheld" ? (
                  <p><ShieldAlert size={14} aria-hidden="true" /> Withheld from the model · {note.reason}</p>
                ) : <p>{note.text}</p>}
                {note.masked.length > 0 && (
                  <small className="ax-masked">Masked: {note.masked.map((row) => `${row.entity} (${row.by})`).join(", ")}</small>
                )}
              </li>
            ))}
          </ul>
          <h3><Users size={15} aria-hidden="true" /> Holdings</h3>
          <table className="ax-holdings">
            <thead><tr><th>Holding</th><th>Weight</th><th>Value</th></tr></thead>
            <tbody>
              {prep.holdings.map((row) => (
                <tr key={`${row.ticker}-${row.account}`}><td>{row.ticker}{row.name ? <small>{row.name}</small> : null}</td><td>{(row.weight * 100).toFixed(1)}%</td><td>{formatMoney(row.value)}</td></tr>
              ))}
            </tbody>
          </table>
          <h3><FileText size={15} aria-hidden="true" /> Evidence {focus ? <button type="button" className="rx-clear" onClick={() => onCite(null)}>Clear highlight</button> : <small>Click a citation to highlight it</small>}</h3>
          {sideEvidence.map((item) => <EvidenceCard key={item.id} item={item} focus={focus} />)}
          {[...evidence.values()].filter((item) => item.kind === "action" && focus?.id === item.id).map((item) => <EvidenceCard key={item.id} item={item} focus={focus} />)}
          {prep.withheld.map((item) => (
            <article key={item.id} className="rx-evidence is-withheld">
              <header><strong>{item.title}</strong><span className="rx-tag is-deny">Withheld</span></header>
              <small>{item.reason}</small>
            </article>
          ))}
        </aside>
      </div>
    </section>
  );
}
