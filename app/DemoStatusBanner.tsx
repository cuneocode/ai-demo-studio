"use client";

import type { ReactNode } from "react";
import { CircleAlert, Info, Settings2, TriangleAlert } from "lucide-react";
import { useStudioNav } from "./studio-nav";
import { guideAnchor } from "./guide/anchors";
import "./run/run.css";

export type DemoStatusBannerProps = {
  /** down: the live path is unavailable · degraded: live works with a fallback · info: a notice. */
  tone?: "down" | "degraded" | "info";
  /** What is offline, in one sentence ("Sparky's vLLM is not answering"). */
  title: ReactNode;
  /** What still works ("Recorded runs and sample data", "Scores; the analyst summary is off"). */
  stillWorks?: ReactNode;
  /** How to fix it: a command, a setting, or who to ask. */
  fix?: ReactNode;
  /** The Studio settings section to open (st-models, st-services, st-ai-defense, st-splunk-ao). */
  settingsSection?: string | null;
  settingsLabel?: string;
  /** Extra actions, e.g. "Replay recorded run". */
  actions?: ReactNode;
  className?: string;
};

/**
 * The honest offline banner every demo shows instead of a dead button: what is offline,
 * what still works, how to fix it, and a link to Studio settings.
 */
export default function DemoStatusBanner({
  tone = "down", title, stillWorks, fix, settingsSection = "st-services", settingsLabel = "Studio settings", actions, className = "",
}: DemoStatusBannerProps) {
  const { openSettings } = useStudioNav();
  const Icon = tone === "down" ? CircleAlert : tone === "degraded" ? TriangleAlert : Info;
  return (
    <div className={`demo-status ${tone === "degraded" ? "" : tone} ${className}`} role={tone === "info" ? "note" : "status"} {...guideAnchor("status-banner")}>
      <Icon size={18} aria-hidden="true" />
      <div>
        <strong>{title}</strong>
        {(stillWorks || fix) && (
          <dl>
            {stillWorks && <><dt>Still works</dt><dd>{stillWorks}</dd></>}
            {fix && <><dt>To fix</dt><dd>{fix}</dd></>}
          </dl>
        )}
      </div>
      <div className="demo-status-actions">
        {actions}
        {settingsSection !== null && openSettings && (
          <button type="button" onClick={() => openSettings(settingsSection)}><Settings2 size={14} aria-hidden="true" /> {settingsLabel}</button>
        )}
      </div>
    </div>
  );
}
