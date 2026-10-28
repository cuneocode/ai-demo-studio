"use client";

import InterbankDemo from "./InterbankDemo";
import type { WorkspaceProps } from "../../../app/studio/workspace-contract";

export default function Workspace({ inStory, onBack, onAdd }: WorkspaceProps) {
  return <section id="interbank-experience">
        <p className="demo-provenance">Fictional banks · read-only agents · recorded or live execution</p>
        <InterbankDemo embedded inStory={inStory} onBack={onBack} onAdd={onAdd} />
      </section>;
}
