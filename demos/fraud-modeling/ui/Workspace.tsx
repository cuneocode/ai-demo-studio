"use client";

import FraudDemo from "./FraudDemo";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory, onBack, onAdd }: WorkspaceProps) {
  return <section id="fraud-experience">
        <p className="demo-provenance">Graph model + triage agent · the analyst decides</p>
        <FraudDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section>;
}
