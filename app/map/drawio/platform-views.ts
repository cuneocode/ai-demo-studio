import type { Catalog } from "../catalog.ts";
import type { ModelRelationship, SceneNode, SceneSpec } from "../scene-model.ts";
import { diagramNode, type ComponentType, type DiagramCell, type DiagramLayer, type DiagramPage } from "./model.ts";
import { runtimeForUseCase } from "../../../config/use-cases.ts";

export const requiredLayers: DiagramLayer[] = ["security", "observability", "deployment"];
type Detail = { id: string; label: string; type: ComponentType; detail: string; sources?: string[]; proposedLabel?: string; proposedDetail?: string; modes?: ("implemented" | "proposed")[]; boundary?: string };
type Connection = { from: string; to: string; label: string; kind?: "request" | "control" | "hosting"; proposed?: boolean; layer?: DiagramLayer; laneOffset?: number; labelOffset?: [number, number] };
const runtimes: Record<string, string> = {
  "code-vulnerability": "The local FastAPI adapter listens on port 8016 and launches isolated Visa SDK workers. Source, proposals, and reviewed run copies remain separate.",
  "fraud-modeling": "The local FastAPI service listens on port 8012. Its configured scorer endpoint supplies live GPU scores; training is a separate operation.",
  "company-briefing": "The local FastAPI briefing service listens on port 8013 and orchestrates filing extraction, model calls, and grounding checks.",
  "market-research": "The local FastAPI wealth service listens on port 8014 and prepares evidence packets, screened articles, and verified recommendations.",
  "client-advisory": "The Advisor Prep container exposes port 8017 and orchestrates client context, deterministic suitability checks, and meeting briefs. Its run volume is separate from Market Research.",
  "sar-support": "The local FastAPI SAR service listens on port 8015. It assembles synthetic evidence and a draft for investigator and QA review.",
};

/** Complete the shared platform views while retaining each demo's authored views. */
export function withPlatformViews(input: { catalog: Catalog; pages: DiagramPage[] }): { catalog: Catalog; pages: DiagramPage[] } {
  const catalog = { ...input.catalog, scenes: { ...input.catalog.scenes }, relationships: [...input.catalog.relationships] };
  const pages = input.pages.map(page => ({ ...page, layers: [...page.layers], cells: [...page.cells], edges: [...page.edges] }));
  const system = pages.find(page => page.id === "system")!;
  const root = catalog.scenes[catalog.rootSceneId];
  const proposedOnly = root.modes.every(mode => mode === "proposed");
  const anchor = system.cells.find(cell => cell.id === "workload" || cell.id === "pipeline" || cell.id === "score") ?? system.cells.find(cell => !cell.layer)!;

  function addView(id: string, layer: DiagramLayer, title: string, purpose: string, details: Detail[], connections: Connection[], groups: DiagramPage["groups"], flow: string[][]) {
    const sceneId = `${catalog.id}.drawio.${id}`;
    const entity = (localId: string) => `${catalog.id}.platform.${id}.${localId}`;
    const hubId = `platform.${layer}`;
    const hub: DiagramCell = { id: hubId, label: title, componentType: layer === "deployment" ? "infrastructure" : "control", sceneId, instanceId: `${id}.overview`, targetPageId: id, layer, x: 900, y: 800, width: 240, height: 130 };
    const nodes: SceneNode[] = [{ instanceId: hub.instanceId, entityId: entity("overview"), role: "service", displayLabel: title, supportingText: purpose, x: 0, y: 0, width: 240, height: 130 }];
    for (const item of details) nodes.push({
      instanceId: `${id}.${item.id}`, entityId: entity(item.id), role: item.type === "model" ? "agent" : item.type === "control" ? "checkpoint" : "service",
      displayLabel: item.label, supportingText: proposedOnly ? item.proposedDetail ?? item.detail : item.detail,
      supportingByMode: { implemented: item.detail, proposed: item.proposedDetail ?? item.detail }, detail: item.detail,
      sourceRefIds: item.sources, x: 0, y: 0, width: 240, height: 120,
    });
    const scene: SceneSpec = { id: sceneId, title, kind: layer === "deployment" ? "hosting" : "controlInteraction", businessStepId: root.businessStepId, purpose, modes: root.modes, entryInstanceIds: [nodes[1].instanceId], exitInstanceIds: [nodes.at(-1)!.instanceId], nodes, relationships: [] };
    catalog.scenes[sceneId] = scene;
    system.cells.push(hub);
    system.layers.push(layer);
    const relation: ModelRelationship = { id: `${catalog.id}.platform.${layer}.participation`, fromEntityId: diagramNode(catalog, anchor).entityId!, toEntityId: entity("overview"), kind: layer === "deployment" ? "hosting" : "control", fact: layer === "deployment" ? "Runtime and model placement" : "Scope, review, and model-egress controls" };
    catalog.relationships.push(relation);
    system.edges.push({ id: `platform.${layer}.participation`, from: anchor.id, to: hub.id, label: relation.fact, relationshipIds: [relation.id], kind: relation.kind === "hosting" ? "hosting" : "control", layer });
    const edges = connections.map((connection, index) => {
      const relation = { id: `${catalog.id}.platform.${id}.${index}`, fromEntityId: entity(connection.from), toEntityId: entity(connection.to), kind: connection.kind ?? "request", fact: connection.label } satisfies ModelRelationship;
      catalog.relationships.push(relation);
      scene.relationships.push({ id: relation.id, sourceInstanceId: `${id}.${connection.from}`, targetInstanceId: `${id}.${connection.to}`, modelRelationshipIds: [relation.id], kind: relation.kind, label: relation.fact, sourcePort: "out-r", targetPort: "in-l" });
      return { id: `${id}.${index}`, from: connection.from, to: connection.to, label: connection.label, kind: connection.kind, relationshipIds: [relation.id], modes: connection.proposed ? ["proposed" as const] : undefined, layer: connection.layer, laneOffset: connection.laneOffset, labelOffset: connection.labelOffset };
    });
    pages.push({ id, title, level: 2, parentId: "system", purpose, layers: [], groups, flow, edges, cells: details.map(item => ({
      id: item.id, label: item.label, labelByMode: item.proposedLabel ? { proposed: item.proposedLabel } : undefined,
      componentType: item.type, sceneId, instanceId: `${id}.${item.id}`, boundaryId: item.boundary, modes: item.modes, x: 0, y: 0, width: 240, height: 120,
    })) });
  }

  if (!system.layers.includes("security") && catalog.id === "code-vulnerability") addView("security", "security", "Security controls",
    "Scope, evidence, and reviewed-change gates run locally or through configured Agent Control. Studio egress policy controls model access. AI Defense inspection is disabled in this adapter.", [
      { id: "gates", label: "Scope and review gates", type: "control", boundary: "application", detail: "Deterministic verdicts gate synthetic scan scope, verified-finding patches, reviewed application, and evidence publication. Configured Agent Control enforces them remotely; unconfigured credentials use labelled local checks.", sources: ["platform.vulnerability-controls", "vulnerability.publish"] },
      { id: "egress", label: "Model egress policy", type: "control", boundary: "application", detail: "Studio selects a model and checks its egress policy. A private-only policy blocks hosted inference. Requiring AI Defense blocks this adapter's hosted calls because inspection is disabled.", sources: ["platform.vulnerability-egress", "platform.egress"] },
      { id: "inspection", label: "AI Defense disabled", type: "service", detail: "The adapter reports AI Defense as unconfigured when checking egress. No inspection call is made. Adding inspection would require an adapter integration.", sources: ["platform.vulnerability-egress"] },
      { id: "blocked", label: "Denied operation", type: "outcome", detail: "A failing local verdict, a hosted denial, unavailable configured controls, or denied egress blocks the operation.", sources: ["platform.vulnerability-controls", "platform.vulnerability-egress"] },
    ], [
      { from: "gates", to: "blocked", label: "Deny / unavailable", kind: "control" },
      { from: "egress", to: "blocked", label: "Policy denied", kind: "control", laneOffset: 24 },
      { from: "egress", to: "inspection", label: "Inspection unavailable", kind: "control", layer: "security" },
    ], [{ id: "application", label: "Vulnerability adapter · application controls" }], [["gates", "egress"], ["blocked", "inspection"]]);

  if (!system.layers.includes("deployment")) addView("infrastructure", "deployment", "AI Infrastructure",
    proposedOnly ? "Proposed application and inference placement. This use case has no live backend. Cisco AI Infrastructure is a deployment option."
      : "The Studio operator manages this use case's Docker Compose stack. Containers receive scoped credentials and shared model routes; persistent data survives Stop and Restart. Proposed mode adds placement on Cisco AI Infrastructure.", [
      { id: "runtime", label: proposedOnly ? "Proposed application runtime" : "Use-case container stack", type: "infrastructure", boundary: "application", detail: runtimeForUseCase(catalog.id) ? `${runtimeForUseCase(catalog.id)!.label} runs in an independent Docker Compose project. The Studio proxy exposes port ${runtimeForUseCase(catalog.id)!.port}. Start, Stop, Restart, Build, and Logs operate on this package. ${runtimes[catalog.id] ?? ""}` : "Proposed application service. This use case currently has an illustrative UI.", proposedLabel: "Proposed application runtime", proposedDetail: "A proposed application service would own the workflow, controls, and integration calls.", sources: proposedOnly ? undefined : ["platform.runtime"] },
      { id: "routing", label: "Studio model routing", type: "service", boundary: "application", detail: "Shared routing resolves this use case's configured provider chain and selects the first healthy backend. Unconfigured providers are skipped; the run records the answering provider.", proposedLabel: "Model routing", proposedDetail: "The proposed service would route model calls through the shared Studio configuration. The excerpt provides the shared routing reference.", sources: ["platform.model-routing"] },
      { id: "endpoint", label: "Configured model endpoint", type: "model", boundary: "inference", detail: "The selected provider can be hosted or private according to Studio settings and egress policy. The diagram describes placement; the run identifies the provider that actually answered.", proposedLabel: "Proposed inference endpoint", proposedDetail: "A proposed inference endpoint would serve the workload's model calls. Private placement on Cisco AI Infrastructure is a design option.", sources: ["platform.model-routing", "platform.egress"] },
      { id: "private", label: "Proposed Cisco infrastructure", type: "infrastructure", boundary: "private", modes: ["proposed"], detail: "Proposed compute, networking, and operations on Cisco AI Infrastructure would host private inference. Placement needs a deployment design.", proposedDetail: "Proposed compute, networking, and operations on Cisco AI Infrastructure would host private inference. Placement needs a deployment design." },
    ], [
      { from: "runtime", to: "routing", label: "Use case chain" },
      { from: "routing", to: "endpoint", label: "Model calls" },
      { from: "endpoint", to: "private", label: "Proposed placement", kind: "hosting", proposed: true, labelOffset: [0, -36] },
    ], [{ id: "application", label: "Application runtime and routing" }, { id: "inference", label: "Inference endpoint" }, { id: "private", label: "Cisco AI Infrastructure · proposed" }], [["runtime", "routing", "endpoint"], ["", "", "private"]]);

  for (const layer of requiredLayers) if (!system.layers.includes(layer)) throw new Error(`${catalog.id} must define its ${layer} architecture view`);
  system.layers = [...requiredLayers];
  return { catalog, pages };
}
