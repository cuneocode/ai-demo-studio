"use client";

import SarInvestigation from "./SarInvestigation";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory }: WorkspaceProps) {
  return <section id="sar-experience">
        <p className="demo-provenance">Synthetic cases · simulated e-filing · the investigator and QA decide</p>
        <SarInvestigation embedded inStory={inStory} />
      </section>;
}
