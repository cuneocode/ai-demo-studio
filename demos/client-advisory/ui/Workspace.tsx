"use client";

import ClientAdvisory from "./ClientAdvisory";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory, companyProfile, researchNote, advisoryBrief, onAdvisoryBriefChange }: WorkspaceProps) {
  return <section id="advisory-experience">
        <p className="demo-provenance">Synthetic households · test PII only</p>
        <ClientAdvisory embedded inStory={inStory} companyProfile={companyProfile} researchNote={researchNote} brief={advisoryBrief} onBriefChange={onAdvisoryBriefChange} />
      </section>;
}
