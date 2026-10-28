"use client";

import { SourceInputs } from "../../../app/SourceInputs";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  AlarmClock,
  BadgeCheck,
  CircleAlert,
  ClipboardCheck,
  FastForward,
  FileSearch,
  Inbox,
  Loader2,
  MessageSquareOff,
  PencilLine,
  Play,
  Scale,
  Server,
  ShieldAlert,
  ShieldCheck,
  Sparkles,
  UserRound,
  X,
} from "lucide-react";
import DemoWorkflow from "../../../app/DemoWorkflow";
import { OperatorWorkspace, OperatorEmpty, ExecutionSummary } from "../../../app/OperatorWorkspace";
import { useHandoffs } from "../../../app/lifecycle-handoff";
import RunStats, { startRun, useRunLedger, type ObservedRun } from "../../../app/RunStats";
import { newRunId, type RunEvent } from "../../../app/run/events";
import ProvenanceBadge, { type Provenance } from "../../../app/run/ProvenanceBadge";
import ReplayPicker, { loadRecording, useRecordings } from "../../../app/run/ReplayPicker";
import RunTimeline, { defaultLine, type TimelineLine } from "../../../app/run/RunTimeline";
import { useRun } from "../../../app/run/useRun";
import {
  auditTrail,
  controlEvents,
  handoffPayload,
  INVESTIGATOR,
  observeRecordedSar,
  observeSar,
  packageFrom,
  pendingRequest,
  QA_REVIEWER,
  SAR_API,
  sarStats,
  SECTION_ORDER,
  shortDate,
  type Evidence,
  type SarHealth,
  type SarPackage,
  type ScenarioCard,
  type Section,
} from "../../../app/sar-case";
import { useStudioNav } from "../../../app/studio-nav";
import { guideAnchor, guideSafeAnchor } from "../../../app/guide/anchors";
import { useGuideActions } from "../../../app/guide/GuidedTour";
import "./sar.css";

type Origin = { kind: "live" | "sample" } | { kind: "recorded"; recordedAt: string };
type Edit = { text: string; cites: string };

const LINKED_FRAUD_CASE = "cpp-orbit";
const MULE_SCENARIO = "mule-reyes";

const SECTION_LABEL: Record<string, string> = { who: "Who", what: "What", when: "When", where: "Where", why: "Why", how: "How" };
const KIND_LABEL: Record<string, string> = {
  alert: "Alert", referral: "Referrals", kyc: "KYC", account: "Accounts", transaction: "Transactions", aggregate: "Aggregates",
  counterparty: "Counterparties", prior_alert: "Prior alerts", teller_note: "Branch notes", adverse_media: "Adverse media",
  document: "Customer documents", indicator: "Indicators", typology: "Typologies",
};
const DECISION_LABEL: Record<string, string> = { file: "File SAR", no_file: "No SAR", approve: "Approved", approved: "Approved", return: "Returned to investigator" };
const OUTCOME_LABEL: Record<string, string> = {
  filed_simulated: "SAR filed (simulated)", closed_no_sar: "Closed · no SAR", open: "Left open · no decision", refused: "Case data stayed in the bank",
  blocked: "AI Defense stopped the model call", failed: "The agent did not finish", held: "Draft held by policy",
};

function sarLine(event: RunEvent): TimelineLine | null {
  const line = defaultLine(event);
  if (!line) return null;
  const data = event.data ?? {};
  if (event.kind === "guardrail") {
    const tag = event.title.startsWith("AI Defense") ? "AI DEFENSE" : event.title.startsWith("Data minimization") ? "MINIMIZE"
      : event.title.startsWith("Case data") ? "EGRESS" : "LOCAL CHECK";
    return { ...line, tag };
  }
  if (event.kind === "control") return { ...line, tag: event.title.startsWith("Agent Control") ? "AGENT CONTROL" : "POLICY" };
  if (event.kind === "hitl.decision") {
    const said = String(data.rationale || data.note || "");
    return { ...line, title: `${String(data.by || "Reviewer")} · ${DECISION_LABEL[String(data.decision)] ?? String(data.decision)}${data.narrative ? " · with edits" : ""}`, body: said || undefined };
  }
  if (event.kind === "claim.verdict") return { ...line, tag: "VERIFY" };
  return line;
}

function modelLabel(health: SarHealth | null, reachable: boolean) {
  if (!reachable) return "Service offline";
  if (!health) return "Checking…";
  const model = health.model;
  if (!model?.label || model.status === "down") return "None reachable";
  return `${model.label}${model.private ? " · private" : " · hosted"}${model.fallback ? " · fallback" : ""}`;
}

function egressLabel(health: SarHealth | null) {
  const model = health?.model;
  if (!model?.label || model.status === "down") return "No model reachable";
  if (model.private) return "Stays on the private model";
  return health?.hosted_fallback?.startsWith("refused") ? "Refused: AI Defense not configured" : "Hosted, after AI Defense (enforce)";
}

function willRefuse(health: SarHealth | null) {
  const model = health?.model;
  return Boolean(model?.label && model.status !== "down" && !model.private && health?.hosted_fallback?.startsWith("refused"));
}

function defenseLabel(health: SarHealth | null) {
  const security = health?.security;
  if (!security?.status) return "Not reported";
  if (security.status === "missing_configuration") return "Not configured · local checks only";
  if (security.status === "disabled") return "Off · forced to enforce for hosted models";
  return `${security.mode === "monitor" ? "Monitor" : "Enforce"} · documents, memos, model hops`;
}

function policyLabel(health: SarHealth | null) {
  if (!health?.controls) return "Not reported";
  return health.controls.status === "enforcing" ? "Agent Control · 3 SAR controls" : "Local checks · 3 SAR policies";
}

function provenanceOf(pkg: SarPackage, origin: Origin): { provenance: Provenance; label?: string } {
  if (origin.kind === "recorded") return { provenance: { kind: "recorded", recordedAt: origin.recordedAt, servedBy: pkg.served_by } };
  if (pkg.mode === "sample") return { provenance: { kind: "sample" }, label: "Sample narrative · no model call" };
  if (pkg.served_by && pkg.usage?.llm_calls) return { provenance: { kind: "live", servedBy: pkg.served_by } };
  return { provenance: { kind: "none", detail: pkg.outcome === "refused" ? "Case data not sent · no model call" : "No model answered" } };
}

const parseCites = (value: string) => value.split(/[\s,;]+/).map((item) => item.trim().toUpperCase()).filter(Boolean).slice(0, 12);

export default function SarInvestigation({ embedded = false, inStory = false }: { embedded?: boolean; inStory?: boolean }) {
  const [health, setHealth] = useState<SarHealth | null>(null);
  const [reachable, setReachable] = useState(true);
  const [cards, setCards] = useState<ScenarioCard[]>([]);
  const [mediaSource, setMediaSource] = useState("");
  const [selected, setSelected] = useState(MULE_SCENARIO);
  const [handoffId, setHandoffId] = useState<string | null>(null);
  const handoffs = useHandoffs("fraud-case");
  const handoff = handoffs.find((item) => item.id === handoffId) ?? null;
  const timeline = useRun({ demoId: "sar-support", pageUrl: (id, after) => `${SAR_API}/runs/${encodeURIComponent(id)}?after=${after}`, interval: 700 });
  const recordings = useRecordings(SAR_API);
  const ledger = useRunLedger();
  const ledgerRun = useRef<ObservedRun | null>(null);
  const { links } = useStudioNav();
  const stats = useMemo(() => sarStats(health, reachable, links?.agentObservability), [health, reachable, links?.agentObservability]);
  const [origin, setOrigin] = useState<Origin>({ kind: "live" });
  const [recorded, setRecorded] = useState<SarPackage | null>(null);
  const [starting, setStarting] = useState(false);
  const [error, setError] = useState("");
  const [role, setRole] = useState<"investigator" | "qa">("investigator");
  const [investigator, setInvestigator] = useState(INVESTIGATOR);
  const [reviewer, setReviewer] = useState(QA_REVIEWER);
  const [choice, setChoice] = useState<"file" | "no_file" | null>(null);
  const [rationale, setRationale] = useState("");
  const [qaNote, setQaNote] = useState("");
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, Edit>>({});
  const [sending, setSending] = useState(false);
  const [contact, setContact] = useState<string | null>(null);
  const [focusEvidence, setFocusEvidence] = useState<string | null>(null);
  const [evidenceFilter, setEvidenceFilter] = useState("all");
  const [focusTick, setFocusTick] = useState(0);
  const resultRef = useRef<HTMLHeadingElement>(null);
  const evidenceRef = useRef<HTMLOListElement>(null);

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    const refreshHealth = () => {
    fetch(`${SAR_API}/health`, { signal: AbortSignal.timeout(10000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: SarHealth) => { setHealth(body); setReachable(true); })
      .catch(() => { setHealth(null); setReachable(false); })
      .finally(() => { if (active) timer = setTimeout(refreshHealth, 10000); });
    };
    refreshHealth();
    fetch("/api/studio/examples/sar/scenarios", { signal: AbortSignal.timeout(10000) })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error(String(response.status)))))
      .then((body: { scenarios?: ScenarioCard[]; media_source?: { name?: string } | string }) => {
        setCards(Array.isArray(body.scenarios) ? body.scenarios : []);
        setMediaSource(typeof body.media_source === "string" ? body.media_source : body.media_source?.name ?? "");
      })
      .catch(() => setCards([]));
    return () => { active = false; clearTimeout(timer); };
  }, []);

  const card = cards.find((item) => item.id === selected) ?? null;
  const replaying = origin.kind === "recorded";
  const pkg = replaying ? (timeline.replaying ? packageFrom(timeline.visible, null) : recorded ?? packageFrom(timeline.visible, null)) : packageFrom(timeline.events, timeline.run?.result);
  const runStatus = timeline.effectiveRun?.status;
  const pending = !replaying && runStatus === "running" ? pendingRequest(timeline.events) : null;
  const draft = pkg?.draft;
  const qaSections = useMemo(() => {
    for (let index = timeline.events.length - 1; index >= 0; index -= 1) {
      const sections = timeline.events[index].data?.sections;
      if (timeline.events[index].kind === "hitl.request" && Array.isArray(sections)) return sections as Section[];
    }
    return null;
  }, [timeline.events]);
  const sections: Section[] = pkg?.final_sections ?? qaSections ?? draft?.sections ?? [];
  const evidence = new Map((pkg?.evidence ?? []).map((item) => [item.id, item] as const));
  const audit = auditTrail(pkg, replaying ? timeline.visible : timeline.events);
  const policies = controlEvents(replaying ? timeline.visible : timeline.events);
  const pendingId = pending?.requestId;
  const caseHeader = pkg?.case;
  const deadline = caseHeader?.deadline ?? card?.deadline;
  const busy = starting || (!replaying && runStatus === "running" && !pending);
  const canAct = Boolean(pending) && !sending;

  const [seenRequest, setSeenRequest] = useState<string | undefined>(undefined);
  if (pendingId !== seenRequest) {
    setSeenRequest(pendingId);
    if (pending?.stage === "investigator") {
      setChoice((value) => value ?? draft?.recommendation ?? null);
      setRationale((value) => value || draft?.rationale?.text || "");
      setRole("investigator");
      // A new review round starts from the draft; earlier edits were returned or accepted.
      setEditing(false);
      setEdits({});
    }
  }

  useEffect(() => {
    if (!pkg || replaying) return;
    if (!ledgerRun.current && timeline.restored && timeline.run) ledgerRun.current = { id: timeline.run.id, label: timeline.run.label ?? "SAR investigation", startedAt: Date.parse(timeline.run.started_at), status: "running" };
    if (!ledgerRun.current) return;
    ledger.record(observeSar(ledgerRun.current, pkg, timeline.run?.status === "running" ? "completed" : timeline.run?.status));
  }, [pkg, timeline.run?.status]); // eslint-disable-line react-hooks/exhaustive-deps

  const draftArrived = Boolean(draft) && !replaying;
  useEffect(() => {
    if (!focusTick && !draftArrived) return;
    const heading = resultRef.current;
    heading?.scrollIntoView({ block: "start", behavior: "smooth" });
    heading?.focus({ preventScroll: true });
  }, [focusTick, draftArrived, timeline.runId]);

  useEffect(() => {
    if (!focusEvidence) return;
    const item = evidenceRef.current?.querySelector(`[data-evidence="${CSS.escape(focusEvidence)}"]`);
    item?.scrollIntoView({ block: "nearest", behavior: "smooth" });
  }, [focusEvidence, evidenceFilter]);
  function resetDecision() {
    setChoice(null); setRationale(""); setQaNote(""); setEditing(false); setEdits({}); setContact(null); setRole("investigator");
    setFocusEvidence(null); setEvidenceFilter("all");
  }

  function pickScenario(id: string, attach: string | null = null) {
    if (busy) return;
    setSelected(id);
    setHandoffId(attach);
  }

  async function investigate(mode: "live" | "sample") {
    if (!card) return;
    setStarting(true);
    setError("");
    resetDecision();
    setOrigin({ kind: mode });
    setRecorded(null);
    const runId = newRunId("sar");
    timeline.open(runId);
    const run = { ...startRun("sar", `${card.subject.name} · ${mode === "sample" ? "sample narrative" : "live"}`), id: runId };
    ledgerRun.current = run;
    ledger.record(run);
    try {
      const response = await fetch(`${SAR_API}/runs`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          scenario: card.id, run_id: runId, label: `SAR investigation · ${card.subject.name}`,
          input: { mode, handoff: handoff && card.id === MULE_SCENARIO ? handoffPayload(handoff) : undefined },
        }),
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) throw new Error(`The SAR service did not start the investigation (${response.status}).`);
    } catch (cause) {
      ledger.record({ ...run, status: "failed" });
      timeline.reset();
      setError(cause instanceof TypeError ? "The SAR service did not answer." : cause instanceof Error ? cause.message : "The investigation did not start.");
    } finally {
      setStarting(false);
    }
  }

  async function replay(name: string) {
    try {
      const recording = await loadRecording<SarPackage>(SAR_API, name);
      if (!recording.result) throw new Error("That recording has no case result.");
      resetDecision();
      setOrigin({ kind: "recorded", recordedAt: recording.recorded_at });
      setRecorded(recording.result);
      if (recording.scenario) { setSelected(recording.scenario); setHandoffId(null); }
      timeline.play({ run: recording.run, events: recording.events });
      ledger.record(observeRecordedSar(startRun("sar", `${recording.title} · recorded`), recording.result, recording.recorded_at));
      setFocusTick((tick) => tick + 1);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "That recording is unavailable.");
    }
  }

  async function post(path: string, body: unknown) {
    if (!timeline.runId) return null;
    setSending(true);
    setError("");
    try {
      const response = await fetch(`${SAR_API}/runs/${encodeURIComponent(timeline.runId)}/${path}`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), signal: AbortSignal.timeout(20000),
      });
      if (!response.ok) throw new Error(response.status === 409 ? "That step was already decided, or the case timed out." : `Not recorded (${response.status}).`);
      return await response.json();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Not recorded.");
      return null;
    } finally {
      setSending(false);
    }
  }

  function editedNarrative() {
    if (!editing || !Object.keys(edits).length) return undefined;
    return sections.map((section) => ({
      section: section.section,
      sentences: section.sentences.flatMap((sentence) => {
        const edit = edits[sentence.id];
        const text = (edit?.text ?? sentence.text).trim();
        return text ? [{ id: sentence.id, text, cites: edit ? parseCites(edit.cites) : sentence.cites }] : [];
      }),
    }));
  }

  async function submitReview() {
    if (!pending || pending.stage !== "investigator" || !choice) return;
    const ok = await post("review", { request_id: pending.requestId, decision: choice, by: investigator.trim() || INVESTIGATOR, rationale: rationale.trim(), narrative: editedNarrative() });
    if (ok) { setEditing(false); setEdits({}); }
  }

  async function submitQa(decision: "approve" | "return") {
    if (!pending || pending.stage !== "qa") return;
    const ok = await post("qa", { request_id: pending.requestId, decision, by: reviewer.trim() || QA_REVIEWER, note: qaNote.trim() });
    if (ok) setQaNote("");
  }

  async function contactCustomer() {
    const body = await post("contact", { message: "Can you explain the recent transfers into your account?", by: investigator.trim() || INVESTIGATOR }) as { allowed?: boolean; engine?: string; reason?: string } | null;
    if (body) setContact(`${body.engine === "hosted" ? "Agent Control" : "Policy (local check)"} · sar.no_tipping_off · deny. ${body.reason ?? ""}`);
  }

  function showEvidence(id: string) {
    const details = evidenceRef.current?.closest("details");
    if (details) details.open = true;
    setEvidenceFilter("all");
    setFocusEvidence(id);
  }

  const kinds = (() => {
    const counts = new Map<string, number>();
    for (const item of pkg?.evidence ?? []) counts.set(item.kind, (counts.get(item.kind) ?? 0) + 1);
    return [...counts.entries()];
  })();
  const isWithheld = (item: Evidence) => item.withheld || item.flagged_by.length > 0;
  const withheld = (pkg?.evidence ?? []).filter(isWithheld);
  const shownEvidence = (pkg?.evidence ?? []).filter((item) => evidenceFilter === "all" || (evidenceFilter === "withheld" ? isWithheld(item) : item.kind === evidenceFilter));
  const modelDown = Boolean(health && (!health.model?.label || health.model.status === "down"));
  const verification = draft?.verification;
  const done = pkg?.outcome && ["filed_simulated", "closed_no_sar", "open"].includes(pkg.outcome);
  const isAttack = (card?.kind ?? caseHeader?.kind) === "attack";
  const hosted = pkg?.served_by && !pkg.served_by.private && pkg.usage?.llm_calls ? pkg.served_by.label : null;

  useGuideActions("sar-support", {
    run: () => { void investigate("live"); },
    canRun: () => Boolean(card) && !busy && reachable && !modelDown && !willRefuse(health),
    replay: (name) => {
      const pick = recordings.find((item) => item.name === name) ?? recordings.find((item) => item.scenario === selected) ?? recordings[0];
      if (pick) void replay(pick.name);
    },
    skipReplay: timeline.skip,
    selectScenario: (id) => pickScenario(id),
  });
  const guideRun = starting ? "starting" : timeline.replaying ? "running" : replaying ? "done"
    : runStatus === "running" ? (pending ? "awaiting-human" : "running") : runStatus === "failed" ? "failed" : timeline.run || pkg?.outcome ? "done" : "idle";
  const guideStage = [
    handoffs.length && "inbox", timeline.visible.length && "events", pkg && "package", draft && "drafted", withheld.length && "withheld",
    pending?.stage === "investigator" && "investigator", pending?.stage === "qa" && "qa",
    pkg?.outcome === "filed_simulated" && "filed", pkg?.outcome === "closed_no_sar" && "closed",
  ].filter(Boolean).join(" ");

  return (
    <div
      className={`sar-demo ${embedded ? "sar-embedded" : ""}`}
      data-guide-run={guideRun}
      data-guide-source={origin.kind === "recorded" ? "recorded" : origin.kind === "sample" ? "sample" : timeline.runId ? "live" : "none"}
      data-guide-recorded-at={origin.kind === "recorded" ? origin.recordedAt : undefined}
      data-guide-stage={guideStage}
    >
      <div className="operator-task-context" {...guideAnchor("sar.band")}><span className="operator-eyebrow">SUSPICIOUS ACTIVITY REVIEW</span><h2>Does this case need a report?</h2><p>AI assembles the evidence and a draft suspicious activity report (SAR). An investigator decides; a second reviewer must approve. Filing is simulated.</p></div>
      <DemoWorkflow steps={["Choose & investigate", "Review evidence & draft", "Decide & get QA approval"]} active={done || pending?.stage === "qa" ? 2 : pkg ? 1 : 0} status={done ? (OUTCOME_LABEL[pkg?.outcome ?? ""] ?? "Review complete") : pending?.stage === "qa" ? "Investigator decision recorded. A different reviewer must approve or return it." : pkg ? "Review the findings and cited draft before submitting your decision." : busy ? "Investigation running. Follow the activity below." : "Choose a case from the inbox, then select Investigate."} />
      <OperatorWorkspace inbox={<>
                <section className="sar-card" aria-labelledby="sar-cases-heading">
          <div className="sar-kicker"><span>CASE INBOX</span><span className="sar-tag">Synthetic</span></div>
          <h2 id="sar-cases-heading">Choose a flagged case</h2>
          <div className="sar-scenarios" role="group" aria-label="SAR scenarios" {...guideAnchor("sar.scenarios")}>
            {cards.map((item) => (
              <button key={item.id} type="button" className={`sar-scenario kind-${item.kind} ${selected === item.id ? "is-selected" : ""}`} aria-pressed={selected === item.id} disabled={busy} onClick={() => pickScenario(item.id)} {...guideSafeAnchor(`sar.scenario.${item.id}`)}>
                <span className="sar-scenario-kind">{item.kind === "attack" ? <><ShieldAlert size={13} /> Attack</> : item.kind === "control" ? "Control case" : item.alert.priority === "high" ? "High priority" : "Case"}</span>
                <strong>{item.kind === "attack" ? item.title.replace(/^Attack · /, "") : item.label}</strong>
                <span className="sar-scenario-meta">{item.subject.name} · {item.alert.id}</span>
                <span className="sar-scenario-due"><AlarmClock size={12} /> Due {shortDate(item.deadline.due)} · {item.deadline.days_left} days left</span>
              </button>
            ))}
            {!cards.length && reachable && <p className="sar-empty">Loading cases…</p>}
          </div>
        </section>

      </>} execution={<>
        <ExecutionSummary ledger={ledger} observability={stats.observability} defense={stats.defense} status={pending ? pending.stage === "qa" ? "Awaiting QA approval" : "Awaiting investigator" : done ? OUTCOME_LABEL[pkg?.outcome ?? ""] : undefined} controls={policies.length ? policies.slice(-2).map((item) => item.title).join(" · ") : policyLabel(health)} />

        <section className="demo-details" aria-label="How this case was assembled" {...guideAnchor("sar.timeline")}><h3>Agent activity</h3>
          <RunTimeline label="SAR investigation steps" events={timeline.visible} start={timeline.run?.started_at} toLine={sarLine} className="boxed" showLane empty="Investigation steps and policy checks appear here when you start." />
        </section>
<RunStats ledger={ledger} {...stats} empty="Investigate a case to see measured calls, latency, and security checks." />
      <section className="sar-runtime" aria-label="SAR runtime" {...guideAnchor("sar.runtime")}>
        <h3 className="runtime-section-title">Runtime details</h3>
        <div><span><Server size={15} /> Model</span><strong className={!reachable || modelDown ? "is-down" : health ? "is-ready" : undefined}>{modelLabel(health, reachable)}</strong></div>
        <div><span><ShieldCheck size={15} /> Case data</span><strong className={willRefuse(health) ? "is-down" : undefined}>{reachable ? egressLabel(health) : "—"}</strong></div>
        <div><span><ShieldAlert size={15} /> AI Defense</span><strong className={health?.security?.status === "configured" ? "is-ready" : undefined}>{defenseLabel(health)}</strong></div>
        <div><span><Scale size={15} /> Policies</span><strong title={health?.controls?.detail}>{policyLabel(health)}</strong></div>
        <div><span><ClipboardCheck size={15} /> Filing</span><strong>Simulated e-filing only</strong></div>
        <div><span><FileSearch size={15} /> Adverse media</span><strong>{mediaSource ? `${mediaSource} allowlist` : "Allowlisted fixture source"}</strong></div>
      </section>

      </>}>

        {handoffs.length > 0 && (
          <section className="sar-card sar-inbox" aria-labelledby="sar-inbox-heading" {...guideAnchor("sar.inbox")}>
            <div className="sar-kicker"><span><Inbox size={14} /> INBOX · FROM FRAUD OPERATIONS</span><span className="sar-tag">{handoffs.length} referral{handoffs.length === 1 ? "" : "s"}</span></div>
            <h2 id="sar-inbox-heading">Escalated from card fraud triage</h2>
            <ul>
              {handoffs.slice(0, 4).map((item) => (
                <li key={item.id} className={handoffId === item.id ? "is-selected" : undefined}>
                  <div>
                    <strong>{item.title}</strong>
                    <p>{item.summary}</p>
                    <small>Fraud case {item.caseId} · {item.disposition} · {new Date(item.createdAt).toLocaleString()}</small>
                  </div>
                  <button type="button" className="sar-secondary" disabled={busy} aria-pressed={handoffId === item.id} onClick={() => pickScenario(MULE_SCENARIO, handoffId === item.id ? null : item.id)} {...(item.caseId === LINKED_FRAUD_CASE ? guideSafeAnchor("sar.inbox.open") : {})}>
                    {handoffId === item.id ? "Attached to the money-mule case" : item.caseId === LINKED_FRAUD_CASE ? "Open the linked money-mule case" : "Attach to the money-mule case"}
                  </button>
                </li>
              ))}
            </ul>
            <p className="sar-note">{handoff?.caseId === LINKED_FRAUD_CASE || !handoff ? "Other compromised cards funded Kendall Reyes’s account; the attempt from Chuck’s card was declined. Chuck is the hypothetical victim, not the subject. Live investigation uses the referral; replay uses a saved investigation." : "The synthetic data links only the Orbit Digital Goods compromise to a SAR case; this referral is attached as evidence."}</p>
          </section>
        )}

        {card && (
          <section className={`sar-card sar-case ${isAttack ? "is-attack" : ""}`} aria-labelledby="sar-case-heading" {...guideAnchor("sar.case")}>
            <div className="sar-case-head">
              <div>
                <div className="sar-kicker"><span>CASE · {card.alert.id}</span>{handoff && card.id === MULE_SCENARIO && <span className="sar-tag referral">Fraud referral attached</span>}</div>
                <h2 id="sar-case-heading">{card.subject.name} <span>· {card.label}</span></h2>
                <p className="sar-lead"><strong>Why this was flagged: </strong>{card.summary}</p>
                {caseHeader && <p className="sar-subject">{caseHeader.subject.detail} · {caseHeader.subject.location} · SSN {caseHeader.subject.ssn_masked} · accounts {caseHeader.accounts.join(", ")}</p>}
              </div>
              {deadline && (
                <div className="sar-clock" {...guideAnchor("sar.clock")} aria-label={`Filing deadline ${shortDate(deadline.due)}, day ${deadline.day} of ${deadline.of}`}>
                  <span><AlarmClock size={14} /> Filing deadline</span>
                  <strong>Due {shortDate(deadline.due)}</strong>
                  <div className="sar-clock-bar"><i style={{ width: `${Math.min(100, (deadline.day / deadline.of) * 100)}%` }} /></div>
                  <small>Detected {shortDate(deadline.detected)} · day {deadline.day} of {deadline.of} · {deadline.days_left} days left</small>
                </div>
              )}
            </div>
            <SourceInputs kind="sar" identity={selected}  action={<div className="sar-actions">
              <button id="sar-investigate" className="sar-primary" type="button" {...guideAnchor("sar.investigate")} disabled={busy || !reachable || modelDown || willRefuse(health)} onClick={() => investigate("live")}>
                {busy ? <><Loader2 size={15} className="spin" /> Investigating…</> : <><Sparkles size={15} /> Investigate</>}
              </button>
              <details className="demo-fallback"><summary>Fallback: sample narrative</summary><button className="sar-secondary" type="button" disabled={busy || !reachable} onClick={() => investigate("sample")}><Play size={15} /> Run with sample narrative</button></details>
              <ReplayPicker recommendedName={recordings.find((item) => item.scenario === selected)?.name} recordings={recordings} onPick={replay} disabled={busy} anchor="sar.replay" />
              {timeline.replaying && <button className="sar-secondary" type="button" onClick={timeline.skip}><FastForward size={15} /> Skip replay</button>}
            </div>} />
            <p className="sar-note">Investigate checks transactions, customer records, and risk patterns, then prepares a cited draft for your review. No report is filed automatically.</p>
            {error && (
              <div className="sar-error" role="alert"><CircleAlert size={14} /><div>{error}</div><button type="button" aria-label="Dismiss error" onClick={() => setError("")}><X size={14} /></button></div>
            )}
          </section>
        )}

        {!pkg && <OperatorEmpty busy={busy} title={busy ? "Investigating the flagged activity" : "From a flagged payment to a reviewable case"} description={busy ? "The agent is assembling case evidence and checking risk patterns. Live steps and safeguards appear below this workspace." : "Start the investigation to see the risk signals, supporting evidence, missing information, and a draft report. You decide whether to report or close the case."} items={["Review risk signals", "Check the cited draft", "Record a human decision"]} />}

        {pkg && (
          <div className="sar-results">
            <div className="sar-col">
              <section className="sar-card sar-findings" aria-labelledby="sar-typology-heading" {...guideAnchor("sar.typologies")}>
                <div className="sar-kicker"><span>INVESTIGATION FINDINGS</span></div>
                <h2 id="sar-typology-heading" ref={resultRef} tabIndex={-1}>What the evidence shows</h2>
                <p className="sar-finding-summary">{pkg.typologies.filter((item) => item.matched).length} risk pattern{pkg.typologies.filter((item) => item.matched).length === 1 ? "" : "s"} matched. A matched rule is a reason to investigate; it does not establish wrongdoing.</p>
                <div className="operator-comparison-grid sar-review-summary">
                  <article {...guideAnchor("sar.recommendation")} className={`sar-recommendation ${draft?.recommendation ?? ""}`}><h3>Agent’s recommendation</h3><p>{draft ? draft.recommendation === "file" ? "Prepare a suspicious activity report for review." : "Close without a report, with a documented reason." : "No recommendation available. Review the evidence and run status."}</p>{draft && <p>{draft.rationale.text} {draft.rationale.cites.map((id) => <button key={id} type="button" className="sar-cite" onClick={() => showEvidence(id)}>{id}</button>)}</p>}</article>
                  <article><h3>Before you decide</h3><p>{!draft ? "A report draft is not available." : SECTION_ORDER.some((name) => !sections.find((section) => section.section === name)?.sentences.length) ? "Some report sections are missing. Review the draft and add supported information before submitting." : "All report sections have content. Check the citations and confirm the conclusion."}</p><p>{withheld.length} evidence items flagged or withheld · {draft?.dropped.length ?? 0} unsupported sentences removed.</p></article>
                </div>
                <div className="sar-risk-checks" tabIndex={0} role="region" aria-label="Risk pattern checks">{pkg.typologies.map((typology) => (
                  <section className={`sar-typology ${typology.matched ? "matched" : ""}`} key={typology.id}>
                    <header><strong>{typology.label}</strong><span className={`sar-pill ${typology.matched ? "deny" : "ok"}`}>{typology.matched ? "Needs review" : "Not triggered"} · {typology.fired} of {typology.total} triggered</span></header>
                    <table>
                      <thead><tr><th>Rule</th><th>Indicator</th><th>Observed</th><th>Threshold</th><th /></tr></thead>
                      <tbody>
                        {typology.indicators.map((indicator) => (
                          <tr key={indicator.id} className={indicator.status}>
                            <td><button type="button" className="sar-cite" onClick={() => showEvidence(`IND-${indicator.id}`)}>{indicator.id}</button></td>
                            <td>{indicator.label}</td>
                            <td>{indicator.observed_text}</td>
                            <td>{indicator.threshold_text}</td>
                            <td><span className={`sar-dot ${indicator.status}`}>{indicator.status === "fired" ? "fired" : indicator.status === "clear" ? "clear" : "n/a"}</span></td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    <small>Match rule: {typology.rule}{typology.reference ? ` · ${typology.reference}` : ""}</small>
                  </section>
                ))}</div>
              </section>

              <section className="demo-details sar-evidence-panel"><h3>Source evidence · {pkg.evidence.length} items</h3><section className="sar-card" aria-labelledby="sar-evidence-heading" {...guideAnchor("sar.evidence")}>
                <div className="sar-kicker"><span>EVIDENCE · {pkg.evidence.length} ITEMS</span><span className="sar-tag">Synthetic</span></div>
                <h2 id="sar-evidence-heading">Transactions & supporting evidence</h2><p className="sar-note">Filter to transactions to follow the payment sequence. Select a citation anywhere in this case to highlight its source here.</p>
                <label className="sar-filter">Show
                  <select value={evidenceFilter} onChange={(event) => setEvidenceFilter(event.target.value)}>
                    <option value="all">All</option>
                    {withheld.length > 0 && <option value="withheld">Withheld ({withheld.length})</option>}
                    {kinds.map(([kind, count]) => <option key={kind} value={kind}>{KIND_LABEL[kind] ?? kind} ({count})</option>)}
                  </select>
                </label>
                <ol tabIndex={0} className="sar-evidence" ref={evidenceRef} aria-label="Case evidence">
                  {shownEvidence.map((item: Evidence) => (
                    <li key={item.id} data-evidence={item.id} className={`${item.withheld ? "is-withheld" : item.flagged_by.length ? "is-flagged" : ""} ${focusEvidence === item.id ? "is-focus" : ""}`}>
                      <div className="sar-evidence-head"><code>{item.id}</code><strong>{item.title}</strong>{item.untrusted && <span className="sar-tag">Untrusted</span>}</div>
                      {item.withheld ? (
                        <p className="sar-withheld"><ShieldAlert size={13} /> Withheld from the agent · {item.flagged_by.join(", ") || "flagged"}</p>
                      ) : (
                        <>
                          <p>{item.text}</p>
                          {item.flagged_by.length > 0 && <p className="sar-withheld"><ShieldAlert size={13} /> Memo withheld from the agent · {item.flagged_by.join(", ")}</p>}
                        </>
                      )}
                      <small>{item.source}</small>
                    </li>
                  ))}
                </ol>
              </section></section>

            </div>
            <div className="sar-col">
              <section className="sar-card sar-narrative" aria-labelledby="sar-narrative-heading" {...guideAnchor("sar.narrative")}>
                <div className="sar-kicker">
                  <span>DRAFT REPORT · REVIEW BEFORE DECIDING</span>
                  {replaying && <span className="sar-tag">Recorded run</span>}
                </div>
                <h2 id="sar-narrative-heading">Review the draft report</h2>
                <div className="sar-badges">
                  {(() => { const shown = provenanceOf(pkg, origin); return <ProvenanceBadge provenance={shown.provenance} label={shown.label} />; })()}
                  {verification && <span className={`sar-pill ${verification.failing || draft?.dropped.length ? "warn" : "ok"}`}><BadgeCheck size={13} /> {verification.kept} of {verification.total} sentences verified{draft?.dropped.length ? ` · ${draft.dropped.length} dropped` : ""}</span>}
                  {withheld.length > 0 && <span className="sar-pill deny"><ShieldAlert size={13} /> {withheld.length} segment{withheld.length === 1 ? "" : "s"} withheld</span>}
                </div>
                {hosted && <p className="sar-inspected"><ShieldCheck size={14} aria-hidden="true" /> Case data inspected by Cisco AI Defense (enforce) on every hop to {hosted}</p>}
                {!draft ? (
                  <p className="sar-empty">{pkg.outcome ? `${OUTCOME_LABEL[pkg.outcome] ?? pkg.outcome}: ${pkg.reason ?? "no draft"}` : "Waiting for the draft."} Review the available risk signals and evidence above. Nothing has been filed.</p>
                ) : (
                  <>
                    <div className="sar-draft-document" tabIndex={0} role="region" aria-label="Draft report text">{SECTION_ORDER.map((name) => {
                      const section = sections.find((item) => item.section === name);
                      return (
                        <div className="sar-section" key={name}>
                          <h3>{SECTION_LABEL[name]}</h3>
                          {!section?.sentences.length ? <p className="sar-missing">Missing: the investigator should add this.</p> : section.sentences.map((sentence) => {
                            const edit = edits[sentence.id];
                            return editing && pending?.stage === "investigator" ? (
                              <div className="sar-edit" key={sentence.id}>
                                <textarea aria-label={`Edit sentence ${sentence.id}`} value={edit?.text ?? sentence.text} onChange={(event) => setEdits((all) => ({ ...all, [sentence.id]: { text: event.target.value, cites: all[sentence.id]?.cites ?? sentence.cites.join(", ") } }))} />
                                <input aria-label={`Citations for ${sentence.id}`} value={edit?.cites ?? sentence.cites.join(", ")} onChange={(event) => setEdits((all) => ({ ...all, [sentence.id]: { text: all[sentence.id]?.text ?? sentence.text, cites: event.target.value } }))} />
                              </div>
                            ) : (
                              <p className={`sar-sentence ${sentence.ok === false ? "is-bad" : ""}`} key={sentence.id}>
                                {sentence.text}{" "}
                                {sentence.cites.map((id) => (
                                  <button type="button" key={id} className={`sar-cite ${evidence.get(id) ? "" : "unknown"} ${focusEvidence === id ? "is-focus" : ""}`} onClick={() => showEvidence(id)} title={evidence.get(id)?.title ?? "Unknown evidence id"}>{id}</button>
                                ))}
                              </p>
                            );
                          })}
                        </div>
                      );
                    })}
                    </div>
                    {draft.dropped.length > 0 && (
                      <section className="sar-dropped">
                        <h3>{draft.dropped.length} sentence{draft.dropped.length === 1 ? "" : "s"} dropped by the citation check</h3>
                        <ul>{draft.dropped.map((item, index) => <li key={index}><span>{item.text}</span><small>{(item.problems ?? []).join("; ")}</small></li>)}</ul>
                      </section>
                    )}
                    {draft.next_steps.length > 0 && (
                      <div className="sar-steps-list">
                        <h3>Suggested next steps</h3>
                        <ul>{draft.next_steps.map((step) => <li key={step}>{step}</li>)}</ul>
                        {draft.removed_steps.length > 0 && <p className="sar-missing">{draft.removed_steps.length} step{draft.removed_steps.length === 1 ? "" : "s"} removed by the no-tipping-off policy.</p>}
                      </div>
                    )}
                  </>
                )}
              </section>

              {draft && (
                <section className="sar-card sar-decision" aria-labelledby="sar-decision-heading" {...guideAnchor("sar.decision")}>
                  <div className="sar-kicker"><span><UserRound size={14} /> HUMAN DECISION</span>
                    <div className="sar-roles" role="group" aria-label="Acting as">
                      <button type="button" aria-pressed={role === "investigator"} onClick={() => setRole("investigator")}>Investigator</button>
                      <button type="button" aria-pressed={role === "qa"} onClick={() => setRole("qa")}>Second-line QA</button>
                    </div>
                  </div>
                  <h2 id="sar-decision-heading">{done ? OUTCOME_LABEL[pkg.outcome!] : pending?.stage === "qa" ? "Waiting for second-line QA" : pending ? "Investigator review" : replaying ? "Recorded decision" : runStatus === "running" ? "Waiting…" : "No decision pending"}</h2>

                  {pkg.outcome === "filed_simulated" && (
                    <div className="sar-filed" role="status">
                      <ClipboardCheck size={18} />
                      <div><strong>{pkg.confirmation}</strong><p>Simulated BSA E-Filing: nothing is sent to FinCEN. Approved by {pkg.decision?.qa} after {pkg.decision?.investigator}&apos;s decision.</p></div>
                    </div>
                  )}
                  {pkg.outcome === "closed_no_sar" && (
                    <div className="sar-filed closed" role="status">
                      <ClipboardCheck size={18} />
                      <div><strong>Closed without a SAR</strong><p>Rationale on file, approved by {pkg.decision?.qa}: {pkg.decision?.rationale}</p></div>
                    </div>
                  )}

                  {pending?.stage === "investigator" && (role === "investigator" ? (
                    <div className="sar-form">
                      {pending.qaNote && <p className="sar-returned"><CircleAlert size={14} /> {pending.qaNote}</p>}
                      <label className="sar-field">Investigator<input value={investigator} onChange={(event) => setInvestigator(event.target.value)} /></label>
                      <div className="sar-choice" role="radiogroup" aria-label="Filing decision">
                        <button type="button" role="radio" aria-checked={choice === "file"} onClick={() => setChoice("file")}>Report suspicious activity</button>
                        <button type="button" role="radio" aria-checked={choice === "no_file"} onClick={() => setChoice("no_file")}>Close without a report</button>
                      </div>
                      <label className="sar-field">Rationale (required, kept in the case file)<textarea value={rationale} onChange={(event) => setRationale(event.target.value)} /></label>
                      <div className="sar-actions">
                        <button type="button" className="sar-primary" disabled={!canAct || !choice || rationale.trim().length < 12} onClick={submitReview}>
                          {sending ? <Loader2 size={15} className="spin" /> : <Scale size={15} />} {choice === "file" ? "Send report to QA" : "Send closure to QA"}
                        </button>
                        <button type="button" className="sar-secondary" aria-pressed={editing} onClick={() => { setEditing((value) => !value); setEdits({}); }}><PencilLine size={15} /> {editing ? "Discard edits" : "Edit narrative"}</button>
                        <button type="button" className="sar-danger" disabled={sending} onClick={contactCustomer}><MessageSquareOff size={15} /> Message the customer…</button>
                      </div>
                      {editing && <p className="sar-note">Edits are re-checked: every sentence needs a citation, and every amount, count, and date must appear in the cited evidence.</p>}
                    </div>
                  ) : <p className="sar-note">The investigator decides first. Switch to Investigator to act as {investigator}.</p>)}

                  {pending?.stage === "qa" && (role === "qa" ? (
                    <div className="sar-form">
                      <p className="sar-ask">{pending.investigator} decided <strong>{DECISION_LABEL[pending.decision ?? ""] ?? pending.decision}</strong>: “{pending.rationale}”</p>
                      {pending.reason && <p className="sar-returned"><CircleAlert size={14} /> {pending.reason}</p>}
                      <label className="sar-field">QA reviewer<input value={reviewer} onChange={(event) => setReviewer(event.target.value)} /></label>
                      <label className="sar-field">Note (optional; required to return)<textarea value={qaNote} onChange={(event) => setQaNote(event.target.value)} /></label>
                      <div className="sar-actions">
                        <button type="button" className="sar-primary" disabled={!canAct} onClick={() => submitQa("approve")}>{sending ? <Loader2 size={15} className="spin" /> : <BadgeCheck size={15} />} Approve {pending.decision === "file" ? "filing" : "closing"}</button>
                        <button type="button" className="sar-secondary" disabled={!canAct || !qaNote.trim()} onClick={() => submitQa("return")}>Return to investigator</button>
                      </div>
                    </div>
                  ) : (
                    <div className="sar-form">
                      <p className="sar-note">Filing needs approval from a different person in second-line QA.</p>
                      <button type="button" className="sar-primary" onClick={() => setRole("qa")}><UserRound size={15} /> Switch to QA ({reviewer})</button>
                    </div>
                  ))}

                  {contact && <p className="sar-denied" role="status"><MessageSquareOff size={14} /> {contact}</p>}

                  {policies.length > 0 && (
                    <ul className="sar-policies" aria-label="Policy verdicts" {...guideAnchor("sar.policies")}>
                      {policies.slice(-6).map((item) => <li key={item.id} className={item.allowed ? "allow" : "deny"}><span>{item.allowed ? "allow" : "deny"}</span>{item.title.replace(/ · (allow|deny).*$/, "")}{item.body ? <small>{item.body}</small> : null}</li>)}
                    </ul>
                  )}
                </section>
              )}
            </div>

          </div>
        )}

        {audit.length > 0 && (
          <section className="sar-card sar-audit" aria-labelledby="sar-audit-heading" {...guideAnchor("sar.audit")}>
            <div className="sar-kicker"><span>AUDIT TRAIL</span></div>
            <h2 id="sar-audit-heading">Who did what</h2>
            <table>
              <thead><tr><th>Time</th><th>Actor</th><th>Action</th><th>Detail</th></tr></thead>
              <tbody>
                {audit.map((entry, index) => (
                  <tr key={index}><td>{new Date(entry.at).toLocaleTimeString()}</td><td>{entry.actor}<small>{entry.role}</small></td><td>{entry.action}</td><td>{entry.detail}</td></tr>
                ))}
              </tbody>
            </table>
          </section>
        )}
      </OperatorWorkspace>
      {embedded && inStory && <div className="sar-story"><span>STORY MODE</span> The money-mule case is the same card-fraud ring the fraud demo blocked; Chuck Robbins is the victim cardholder, never a subject.</div>}
    </div>
  );
}
