"use client";

import MarketResearch from "./MarketResearch";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory, companyProfile, researchNote, onResearchNoteChange }: WorkspaceProps) {
  return <section id="research-experience">
        <p className="demo-provenance">Public company data · one synthetic attack article</p>
        <MarketResearch embedded inStory={inStory} companyProfile={companyProfile} note={researchNote} onNoteChange={onResearchNoteChange} />
      </section>;
}
