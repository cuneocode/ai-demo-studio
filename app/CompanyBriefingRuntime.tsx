"use client";

import { FileLock2, Landmark, Server, ShieldCheck, Table2 } from "lucide-react";
import type { BriefingHealth, SecuritySummary } from "./company-profile";

const readable = (value?: string) => value ? value.replaceAll("_", " ") : "Not reported";

function defenseLabel(health?: BriefingHealth | null, security?: SecuritySummary | null) {
  const current = security || health?.security;
  const mode = current?.mode || health?.security?.mode;
  if (mode === "off" || current?.status === "disabled" || health?.security?.status === "disabled") {
    return "Disabled";
  }
  if (current?.verdict) return current.verdict;
  if (current?.status === "configured" || health?.security?.status === "configured") {
    return current?.mode === "enforce" || health?.security?.mode === "enforce" ? "Enforcing" : readable(current?.mode) || "Monitoring";
  }
  return readable(current?.status || health?.security?.status);
}

export default function CompanyBriefingRuntime({
  health,
  security,
  xbrl,
}: {
  health: BriefingHealth | null;
  security?: SecuritySummary | null;
  xbrl?: string;
}) {
  const defense = defenseLabel(health, security);
  const confirmed = health?.security?.status === "configured" || security?.status === "allowed" || security?.verdict === "allowed";
  return (
    <section className="briefing-runtime" aria-label="Briefing runtime">
      <div>
        <span><Server size={15} /> Model</span>
        <strong>{health?.model || "Not reported"}</strong>
      </div>
      <div>
        <span><Landmark size={15} /> SEC</span>
        <strong>{readable(health?.sec?.status)}</strong>
      </div>
      <div>
        <span><ShieldCheck size={15} /> Defense</span>
        <strong className={confirmed ? "is-ready" : undefined}>{defense}</strong>
      </div>
      <div>
        <span><Table2 size={15} /> XBRL</span>
        <strong>{readable(xbrl || health?.xbrl?.status)}</strong>
      </div>
      <div>
        <span><FileLock2 size={15} /> Perimeter</span>
        <strong>{health?.perimeter || "EDGAR + upload only"}</strong>
      </div>
    </section>
  );
}
