import type { AppDefinition } from "../../config/app-contract.ts";

export const app = {
  id: "cyber-ai-foundry",
  name: "Cyber AI Foundry",
  shortName: "Cyber AI Foundry",
  description: "AI-driven security workflows for vulnerability analysis, remediation, and security operations.",
  iconKey: "ShieldCheck",
  categories: [{ id: "application-security", label: "Application security", iconKey: "ShieldCheck" }],
  catalog: [{ demoId: "code-vulnerability", categoryId: "application-security", featured: true }],
  defaultStory: [],
  context: null,
  storyId: null,
} satisfies AppDefinition;
