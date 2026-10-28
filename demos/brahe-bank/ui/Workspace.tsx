"use client";

import BankingDemo from "./BankingDemo";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory, onBack, onAdd }: WorkspaceProps) {
  return <section id="banking-experience">
        <p className="demo-provenance">Fictional products · mock score 550</p>
        <BankingDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section>;
}
