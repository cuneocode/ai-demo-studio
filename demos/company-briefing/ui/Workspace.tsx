"use client";

import CompanyBriefing from "./CompanyBriefing";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory, onBack, onAdd, companyProfile, onCompanyProfileChange }: WorkspaceProps) {
  return <section id="briefing-experience">
        <p className="demo-provenance">EDGAR + upload only · accept before store</p>
        <CompanyBriefing embedded inStory={inStory} onBack={onBack} onAdd={onAdd} profile={companyProfile} onProfileChange={onCompanyProfileChange} />
      </section>;
}
