import test from "node:test";
import assert from "node:assert/strict";
import { catalogs } from "../app/map/catalog.ts";
import { BRAHE_GROUPS, projectBraheSystem } from "../app/map/brahe-system.ts";
import { continuousSystems } from "../app/map/continuous.ts";
import { INTERBANK_GROUPS, collapseInterbankGroup, interbankStates, normalizeInterbankExpansion, projectInterbankSystem } from "../app/map/interbank-system.ts";
import { evidence } from "../app/map/evidence.ts";
import { collapseGenericGroup, coreGroupId, normalizeGenericExpansion, primaryGroupId, projectGenericSystem } from "../app/map/generic-system.ts";
import { prepareLayout } from "../app/map/layout.ts";
import { initialNav, reduceNav } from "../app/map/navigation.ts";
import { edgeRelevanceFor, focusRoleFor, relevanceForBindingIds, resolveNodeBindings, routeIssues, routeScene, sourceActionsForNode, sourceRefsForNode, validateCase } from "../app/map/scene-model.ts";
import sourceArtifacts from "../app/map/source-artifacts.json" with { type: "json" };
import { frameScene } from "../app/map/viewport.ts";

const evidenceIds = new Set(Object.keys(evidence));

test("scene catalogs reference real relationships, ports, drills, and sources", () => {
  assert.equal(Object.keys(catalogs).length, 9);
  for (const catalog of Object.values(catalogs)) {
    const errors = validateCase(catalog, evidenceIds);
    assert.deepEqual(errors, [], catalog.id);
  }
  const brahe = catalogs["brahe-bank"];
  assert.deepEqual(brahe.scenes["brahe.journey"].nodes.filter((node) => node.role === "activity").map((node) => node.displayLabel), [
    "Ask about card options",
    "Bank assistant",
    "Review next steps",
  ]);
  const request = brahe.scenes["brahe.inspect-request"];
  const permit = request.relationships.find((edge) => edge.id.endsWith("-permit"));
  const block = request.relationships.find((edge) => edge.id.endsWith("-block"));
  assert.equal(permit?.sourceInstanceId, "decision");
  assert.equal(block?.sourceInstanceId, "decision");
  assert.equal(request.relationships.some((edge) => edge.sourceInstanceId === "permit" && edge.targetInstanceId === "block"), false);
  assert.equal(request.nodes.find((node) => node.instanceId === "incoming")?.displayLabel, "Customer question");
  assert.equal(brahe.scenes["brahe.inspect-response"].nodes.find((node) => node.instanceId === "incoming")?.displayLabel, "Finished answer");
  assert.equal(brahe.scenes["brahe.inspect-request"].title, "Inspect the customer question before the assistant processes it");
  assert.notEqual(brahe.scenes["brahe.inspect-request"].id, brahe.scenes["brahe.inspect-response"].id);
  const fraudScore = catalogs["fraud-modeling"].scenes["fraud.score"];
  assert.equal(fraudScore.relationships.some((edge) => edge.sourceInstanceId === "model" && edge.targetInstanceId === "defense"), false);
});

test("specialist layout keeps ELK routes and does not drop relationships", async () => {
  const scene = catalogs["brahe-bank"].scenes["brahe.build"];
  const laid = await prepareLayout("brahe-bank", "implemented", scene);
  assert.equal(laid.engine, "authored");
  assert.equal(laid.edges.length, scene.relationships.length);
  const delegated = laid.edges.find((edge) => edge.id === "b-score");
  assert.ok(delegated && delegated.points.length >= 2);
  assert.deepEqual(routeIssues({ ...scene, nodes: laid.nodes }, laid.edges), []);
});

test("route audits catch non-attachment edge crossings and labels over meaningful cards", () => {
  const scene = {
    id: "collision-proof",
    kind: "agentWorkflow",
    businessStepId: "proof",
    title: "Collision proof",
    purpose: "Exercise route auditing.",
    entryInstanceIds: ["source"],
    exitInstanceIds: ["target"],
    modes: ["implemented"],
    nodes: [
      { instanceId: "source", role: "service", displayLabel: "Source", x: 0, y: 0, width: 120, height: 100 },
      { instanceId: "obstacle", role: "decision", displayLabel: "Meaningful decision", x: 180, y: 0, width: 140, height: 100 },
      { instanceId: "target", role: "service", displayLabel: "Target", x: 380, y: 0, width: 120, height: 100 },
    ],
    relationships: [
      { id: "cross", sourceInstanceId: "source", targetInstanceId: "target", kind: "control", label: "decision", sourcePort: "out-r", targetPort: "in-l", via: [{ x: 250, y: 50 }], modelRelationshipIds: [] },
      { id: "reenter", sourceInstanceId: "source", targetInstanceId: "target", kind: "request", sourcePort: "out-r", targetPort: "in-l", via: [{ x: 150, y: 50 }, { x: 60, y: 50 }, { x: 350, y: 120 }], modelRelationshipIds: [] },
    ],
  };
  const issues = routeIssues(scene, routeScene(scene));
  assert.ok(issues.some((issue) => issue === "cross:obstacle"));
  assert.ok(issues.some((issue) => issue === "reenter:source"));
  assert.ok(issues.some((issue) => issue.includes("cross:obstacle")), issues);
});

test("continuous Brahe projection retains root identity, parents, context, and relation lineage", () => {
  const states = [
    [],
    [BRAHE_GROUPS.assistant],
    [BRAHE_GROUPS.assistant, BRAHE_GROUPS.check],
    [BRAHE_GROUPS.assistant, BRAHE_GROUPS.check, BRAHE_GROUPS.requestInspection],
    [BRAHE_GROUPS.assistant, BRAHE_GROUPS.build],
    [BRAHE_GROUPS.assistant, BRAHE_GROUPS.build, BRAHE_GROUPS.hosting],
    [BRAHE_GROUPS.assistant, BRAHE_GROUPS.return],
    [BRAHE_GROUPS.assistant, BRAHE_GROUPS.return, BRAHE_GROUPS.answerInspection],
  ];
  const modelIds = new Set(catalogs["brahe-bank"].relationships.map((relationship) => relationship.id));
  for (const expanded of states) {
    const projection = projectBraheSystem(expanded, "implemented");
    assert.equal(projection.id, "brahe.journey");
    const ids = projection.nodes.map((node) => node.instanceId);
    assert.equal(new Set(ids).size, ids.length);
    assert.ok(ids.includes("brahe.ask"));
    assert.ok(ids.includes("brahe.assistant"));
    assert.ok(ids.includes("brahe.review"));
    const order = new Map(ids.map((id, index) => [id, index]));
    for (const node of projection.nodes) {
      if (node.parentId) assert.ok(order.get(node.parentId) < order.get(node.instanceId), `${node.parentId} must precede ${node.instanceId}`);
    }
    for (const relationship of projection.relationships) {
      assert.ok(order.has(relationship.sourceInstanceId), relationship.id);
      assert.ok(order.has(relationship.targetInstanceId), relationship.id);
      for (const modelId of relationship.modelRelationshipIds) assert.ok(modelIds.has(modelId), `${relationship.id} lineage ${modelId}`);
    }
    assert.deepEqual(routeIssues(projection, routeScene(projection)), [], expanded.join(","));
  }
  const check = projectBraheSystem([BRAHE_GROUPS.assistant, BRAHE_GROUPS.check], "implemented");
  assert.ok(check.nodes.some((node) => node.instanceId === "brahe.stage.build"));
  assert.ok(check.nodes.some((node) => node.instanceId === "brahe.stage.return"));
  assert.equal(check.relationships.find((relationship) => relationship.id === "rel.scope.allow")?.targetInstanceId, "brahe.stage.build");
  assert.equal(check.relationships.find((relationship) => relationship.id === "rel.inspect.request.stop")?.targetInstanceId, "brahe.scope.stop");
  const request = projectBraheSystem([BRAHE_GROUPS.assistant, BRAHE_GROUPS.check, BRAHE_GROUPS.requestInspection], "implemented");
  assert.equal(request.relationships.find((relationship) => relationship.id === "rel.inspect.request.summary")?.targetInstanceId, "brahe.inspect.request.call");
  assert.equal(request.relationships.find((relationship) => relationship.id === "rel.inspect.request.stop")?.targetInstanceId, "brahe.scope.stop");
  assert.equal(request.relationships.find((relationship) => relationship.id === "rel.inspect.request.stop")?.label, "Inspection denied");
  assert.equal(request.relationships.find((relationship) => relationship.id === "rel.scope.stop")?.sourceInstanceId, "brahe.scope.decision");
  const answer = projectBraheSystem([BRAHE_GROUPS.assistant, BRAHE_GROUPS.return, BRAHE_GROUPS.answerInspection], "implemented");
  assert.equal(answer.relationships.find((relationship) => relationship.id === "rel.answer.inspect")?.targetInstanceId, "brahe.inspect.answer.call");
  assert.equal(answer.relationships.find((relationship) => relationship.id === "rel.inspect.answer.stop")?.targetInstanceId, "brahe.answer.stop");
  assert.equal(answer.relationships.find((relationship) => relationship.id === "rel.answer.stop")?.targetInstanceId, "brahe.answer.stop");
  const compactAnswer = projectBraheSystem([BRAHE_GROUPS.assistant, BRAHE_GROUPS.return], "implemented");
  assert.equal(compactAnswer.relationships.find((relationship) => relationship.id === "rel.inspect.answer.stop")?.targetInstanceId, "brahe.answer.stop");
});

test("continuous interbank projection keeps identity, lineage, clean routes, and the lab's boundaries", () => {
  const modelIds = new Set(catalogs["interbank-a2a"].relationships.map((relationship) => relationship.id));
  for (const state of interbankStates()) {
    const projection = projectInterbankSystem(state.expanded, state.mode);
    assert.equal(projection.id, "interbank.journey");
    const ids = projection.nodes.map((node) => node.instanceId);
    assert.equal(new Set(ids).size, ids.length, state.id);
    for (const id of ["ib.open", "ib.investigation", "ib.approve", "ib.platform.defense", "ib.platform.observe", "ib.platform.infra"]) assert.ok(ids.includes(id), `${state.id} ${id}`);
    const order = new Map(ids.map((id, index) => [id, index]));
    for (const node of projection.nodes) {
      if (node.parentId) assert.ok(order.get(node.parentId) < order.get(node.instanceId), `${state.id}: ${node.parentId} must precede ${node.instanceId}`);
    }
    for (const relationship of projection.relationships) {
      assert.ok(order.has(relationship.sourceInstanceId) && order.has(relationship.targetInstanceId), `${state.id} ${relationship.id}`);
      for (const modelId of relationship.modelRelationshipIds) assert.ok(modelIds.has(modelId), `${state.id} ${relationship.id} lineage ${modelId}`);
    }
    assert.deepEqual(routeIssues(projection, routeScene(projection)), [], state.id);
  }

  const exchange = projectInterbankSystem([INTERBANK_GROUPS.investigation, INTERBANK_GROUPS.exchange], "implemented");
  const bankOf = (id) => {
    const byId = new Map(exchange.nodes.map((node) => [node.instanceId, node]));
    let current = byId.get(id);
    while (current) {
      if (current.instanceId === "ib.a.bank" || current.instanceId === "ib.b.bank") return current.instanceId;
      current = current.parentId ? byId.get(current.parentId) : undefined;
    }
    return null;
  };
  const crossing = exchange.relationships.filter((edge) => edge.kind === "request" && bankOf(edge.sourceInstanceId) && bankOf(edge.targetInstanceId) && bankOf(edge.sourceInstanceId) !== bankOf(edge.targetInstanceId));
  assert.deepEqual(crossing.map((edge) => [edge.sourceInstanceId, edge.targetInstanceId]), [["ib.a.gateway", "ib.b.gateway"]]);
  for (const bank of ["ib.a.bank", "ib.b.bank"]) {
    assert.ok(exchange.relationships.some((edge) => edge.kind === "telemetry" && edge.sourceInstanceId === bank && edge.targetInstanceId === "ib.exchange.trace"), `${bank} reaches Splunk`);
  }
  for (const gateway of ["ib.a.gateway", "ib.b.gateway"]) {
    assert.ok(exchange.nodes.find((node) => node.instanceId === gateway)?.bindingIds?.includes("defense.boundary"), `${gateway} inspects`);
  }

  for (const [groups, prefix, stop] of [
    [[INTERBANK_GROUPS.investigation, INTERBANK_GROUPS.kickoff, INTERBANK_GROUPS.kickoffInspection], "ib.kickoff.inspect", "ib.kickoff.stop"],
    [[INTERBANK_GROUPS.investigation, INTERBANK_GROUPS.report, INTERBANK_GROUPS.reportInspection], "ib.report.inspect", "ib.report.stop"],
  ]) {
    const scene = projectInterbankSystem(groups, "implemented");
    assert.ok(scene.relationships.some((edge) => edge.sourceInstanceId === `${prefix}.call` && edge.targetInstanceId === `${prefix}.api`), prefix);
    assert.ok(scene.relationships.some((edge) => edge.kind === "control" && edge.sourceInstanceId === `${prefix}.apply` && edge.targetInstanceId === stop), `${prefix} fails closed`);
  }

  const control = normalizeInterbankExpansion([INTERBANK_GROUPS.investigation, INTERBANK_GROUPS.exchange], INTERBANK_GROUPS.outboundControl);
  const hosting = normalizeInterbankExpansion(control, INTERBANK_GROUPS.hosting);
  assert.ok(hosting.includes(INTERBANK_GROUPS.hosting) && !hosting.includes(INTERBANK_GROUPS.outboundControl));
  const report = normalizeInterbankExpansion(hosting, INTERBANK_GROUPS.report);
  assert.ok(report.includes(INTERBANK_GROUPS.report) && !report.includes(INTERBANK_GROUPS.exchange) && !report.includes(INTERBANK_GROUPS.hosting));
  assert.deepEqual(collapseInterbankGroup(report, INTERBANK_GROUPS.investigation), []);
  assert.deepEqual(collapseInterbankGroup(hosting, INTERBANK_GROUPS.exchange), [INTERBANK_GROUPS.investigation]);
});

test("every generic catalog uses the shared continuous projection contract", () => {
  for (const catalog of Object.values(catalogs).filter((item) => !continuousSystems[item.id])) {
    const mode = catalog.scenes[catalog.rootSceneId].modes.includes("implemented") ? "implemented" : "proposed";
    const primary = primaryGroupId(catalog.id);
    const overview = projectGenericSystem(catalog, [], mode);
    assert.equal(overview.id, catalog.rootSceneId);
    const expandable = overview.nodes.find((node) => node.expandGroupId === primary);
    assert.ok(expandable, `${catalog.id} primary occurrence`);
    const primaryExpanded = normalizeGenericExpansion(catalog.id, [], primary);
    const system = projectGenericSystem(catalog, primaryExpanded, mode);
    assert.equal(system.id, catalog.rootSceneId);
    assert.ok(system.nodes.some((node) => node.instanceId === expandable.instanceId && node.expanded));
    assert.ok(system.nodes.some((node) => node.instanceId.startsWith(`${catalog.id}.core.`)));
    const core = system.nodes.find((node) => node.expandGroupId?.startsWith(`${catalog.id}.group.core.`));
    if (core?.entityId) {
      const coreGroup = coreGroupId(catalog.id, core.entityId);
      const deepExpanded = normalizeGenericExpansion(catalog.id, primaryExpanded, coreGroup);
      const detail = projectGenericSystem(catalog, deepExpanded, mode);
      assert.ok(detail.nodes.some((node) => node.instanceId === core.instanceId && node.expanded), `${catalog.id} core identity`);
      assert.ok(detail.nodes.some((node) => node.parentId === core.instanceId), `${catalog.id} core children`);
      assert.deepEqual(collapseGenericGroup(catalog.id, deepExpanded, coreGroup), primaryExpanded);
      assert.deepEqual(routeIssues(detail, routeScene(detail)), [], `${catalog.id} detail routes`);
    }
    const modelIds = new Set(catalog.relationships.map((relationship) => relationship.id));
    for (const relationship of system.relationships) {
      for (const modelId of relationship.modelRelationshipIds) assert.ok(modelIds.has(modelId), `${catalog.id} lineage ${modelId}`);
    }
    assert.deepEqual(routeIssues(system, routeScene(system)), [], `${catalog.id} system routes`);
  }
});

test("canonical bindings drive attribution, focus, modes, and evidence", () => {
  const brahe = catalogs["brahe-bank"];
  const prepare = brahe.scenes["brahe.prepare"];
  const scope = brahe.scenes["brahe.scope-control"];
  const service = scope.nodes.find((node) => node.instanceId === "service");
  const decision = scope.nodes.find((node) => node.instanceId === "decision");
  assert.equal(focusRoleFor(brahe, service, "splunk-agent-observability", "implemented"), "provider");
  assert.equal(focusRoleFor(brahe, decision, "splunk-agent-observability", "implemented"), "integration");
  assert.equal(resolveNodeBindings(brahe, prepare.nodes.find((node) => node.instanceId === "build"), "implemented").some(({ binding }) => binding.id === "infra.model-serving"), true);
  assert.equal(resolveNodeBindings(brahe, prepare.nodes.find((node) => node.instanceId === "build"), "proposed").some(({ binding }) => binding.id === "infra.private-model-serving"), true);
  assert.equal(resolveNodeBindings(brahe, prepare.nodes.find((node) => node.instanceId === "build"), "proposed").some(({ binding }) => binding.id === "infra.model-serving"), false);
  const scopeBinding = "observe.scope-control";
  assert.equal(prepare.nodes.some((node) => node.bindingIds?.includes(scopeBinding)), true);
  assert.equal(brahe.scenes["brahe.observe"].nodes.some((node) => node.bindingIds?.includes(scopeBinding)), true);
  assert.equal(scope.nodes.some((node) => node.bindingIds?.includes(scopeBinding)), true);
  for (const binding of brahe.bindings) {
    for (const id of binding.evidenceRefIds) assert.ok(sourceArtifacts.artifacts[id], `${binding.id} evidence ${id} was not captured`);
  }
  assert.ok(sourceRefsForNode(brahe, service, "implemented").includes("brahe.controls.remote-call"));
  assert.equal(sourceActionsForNode(brahe, service, "implemented")[0].label, "Call");
  const cardSpecialist = brahe.scenes["brahe.build"].nodes.find((node) => node.instanceId === "cards");
  assert.deepEqual(sourceActionsForNode(brahe, cardSpecialist, "implemented").map((source) => source.label), ["Agent setup"]);
  assert.deepEqual(sourceRefsForNode(brahe, cardSpecialist, "implemented"), ["brahe.card-specialist"]);
  const prepareTrace = prepare.relationships.find((edge) => edge.id === "build-trace");
  const prepareDefense = prepare.relationships.find((edge) => edge.id === "build-hop");
  const business = prepare.relationships.find((edge) => edge.id === "check-build");
  assert.equal(edgeRelevanceFor(brahe, prepareTrace, "splunk-agent-observability", "implemented"), "active");
  assert.equal(edgeRelevanceFor(brahe, prepareDefense, "splunk-agent-observability", "implemented"), "secondary");
  assert.equal(edgeRelevanceFor(brahe, business, "splunk-agent-observability", "implemented"), "context");
  assert.equal(relevanceForBindingIds(brahe, ["infra.model-serving"], "ai-infrastructure", "implemented"), "active");
  const observe = brahe.scenes["brahe.observe"];
  assert.equal(observe.relationships.some((edge) => edge.sourceInstanceId === "scope-control" && edge.targetInstanceId === "answer-control"), false);
  assert.deepEqual(observe.relationships.filter((edge) => ["o-question", "o-scope", "o-run", "o-answer-ready", "o-release"].includes(edge.id)).map((edge) => [edge.sourceInstanceId, edge.targetInstanceId]), [
    ["question", "scope-control"],
    ["scope-control", "workload"],
    ["workload", "draft"],
    ["draft", "answer-control"],
    ["answer-control", "response"],
  ]);
});

test("automatic framing stays inside the readable zoom range", () => {
  const scene = catalogs["brahe-bank"].scenes["brahe.journey"];
  const framed = frameScene(scene.nodes, routeScene(scene), scene.guides, 1100, 640);
  assert.ok(framed.zoom >= 0.9 && framed.zoom <= 1.05);
  assert.ok(18 * framed.zoom >= 16);
  assert.ok(16 * framed.zoom >= 14);
  const prepare = catalogs["brahe-bank"].scenes["brahe.prepare"];
  const wide = frameScene(prepare.nodes, routeScene(prepare), prepare.guides, 1000, 640);
  assert.ok(wide.zoom >= 0.9 && wide.zoom <= 1.05);
});

test("navigation commits one history entry and restores the saved viewport", () => {
  let state = initialNav("brahe.journey", "overview");
  state = reduceNav(state, { type: "prepare", transitionId: 1 });
  const entry = { sceneId: "brahe.journey", businessStepId: "overview", selectedId: "prepare", platformFocus: null, layoutKey: "same", viewport: { x: 12, y: 8, zoom: 1 } };
  state = reduceNav(state, { type: "commitEnter", transitionId: 1, sceneId: "brahe.prepare", businessStepId: "prepare", platformFocus: null, entry });
  state = reduceNav(state, { type: "commitEnter", transitionId: 1, sceneId: "brahe.prepare", businessStepId: "prepare", platformFocus: null, entry });
  assert.equal(state.history.length, 1);
  state = reduceNav(state, { type: "reveal" });
  state = reduceNav(state, { type: "idle" });
  state = reduceNav(state, { type: "prepare", transitionId: 2 });
  state = reduceNav(state, { type: "restoreTo", index: 0, transitionId: 2 });
  assert.equal(state.sceneId, "brahe.journey");
  assert.equal(state.viewport?.zoom, 1);
  assert.equal(state.history.length, 0);
  state = reduceNav(state, { type: "idle" });
  state = reduceNav(state, { type: "openSource", selection: { sourceId: "brahe.chat.boundary", bindingId: "defense.question" } });
  assert.equal(state.fitNonce, 0);
  const beforeFocus = state;
  state = reduceNav(state, { type: "setFocus", platformFocus: "cisco-ai-defense" });
  assert.equal(state.sceneId, beforeFocus.sceneId);
  assert.equal(state.selectedId, beforeFocus.selectedId);
  assert.deepEqual(state.sourceSelection, beforeFocus.sourceSelection);
  assert.deepEqual(state.history, beforeFocus.history);
  assert.deepEqual(state.viewport, beforeFocus.viewport);
  state = reduceNav(state, { type: "closeSource" });
  assert.equal(state.sourceSelection, null);
  assert.equal(state.fitNonce, 0);
});
