import test from "node:test";
import assert from "node:assert/strict";
import { existsSync, readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { ANCHORS, ANCHOR_PREFIXES } from "../app/guide/anchors.ts";
import { LIFECYCLE_TOUR_ID, TOURS, mainTourFor } from "../app/guide/tours/index.ts";
import { presenterNotes } from "../app/presenter-notes.ts";
import { RESEARCH_SCENARIOS } from "../app/research-note.ts";

const ROOT = new URL("..", import.meta.url).pathname;
const tours = Object.values(TOURS);

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    if (name === "node_modules" || name.startsWith(".")) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path, out);
    else if (/\.(tsx?|json)$/.test(name)) out.push(path);
  }
  return out;
}
const appFiles = [...walk(join(ROOT, "app")), ...readdirSync(join(ROOT, "demos")).flatMap(id => { const dir = join(ROOT, "demos", id, "ui"); return existsSync(dir) ? walk(dir) : []; })].filter((path) => !path.includes("/guide/tours/") && !path.endsWith("/guide/anchors.ts"));
const appSource = appFiles.map((path) => readFileSync(path, "utf8")).join("\n");
const componentSource = appFiles.filter((path) => path.endsWith(".tsx")).map((path) => readFileSync(path, "utf8")).join("\n");

/** Every step of every tour, including offline variants, with variant patches applied as separate copies. */
function allSteps(tour) {
  const base = [...tour.steps, ...(tour.offline ?? [])];
  return base.flatMap((step) => [step, ...(step.variants ?? []).map((variant) => ({ ...step, ...variant.patch, id: `${step.id} (variant)` }))]);
}
function conditionAnchors(condition, out = []) {
  if (!condition) return out;
  if ("anchor" in condition) out.push(condition.anchor);
  for (const key of ["all", "any"]) if (condition[key]) condition[key].forEach((item) => conditionAnchors(item, out));
  if (condition.not) conditionAnchors(condition.not, out);
  return out;
}
function anchorsOf(step) {
  return [
    ...step.targets,
    ...(step.action && "anchor" in step.action ? [step.action.anchor] : []),
    ...conditionAnchors(step.waitFor), ...conditionAnchors(step.showIf), ...conditionAnchors(step.needs),
    ...(step.variants ?? []).flatMap((variant) => conditionAnchors(variant.when)),
  ];
}
const declared = new Set(ANCHORS);
const prefixOf = (id) => ANCHOR_PREFIXES.find((prefix) => id.startsWith(`${prefix}.`));

test("every anchor a tour names is declared", () => {
  for (const tour of tours) for (const step of allSteps(tour)) for (const id of anchorsOf(step)) {
    assert.ok(declared.has(id) || prefixOf(id), `${tour.id} › ${step.id} names undeclared anchor ${id}`);
  }
});

test("every declared anchor is rendered by a component (anchor drift)", () => {
  for (const id of ANCHORS) {
    const rendered = componentSource.includes(`"${id}"`) || componentSource.includes(`'${id}'`);
    assert.ok(rendered, `anchor ${id} is declared but no component renders it`);
  }
  for (const prefix of ANCHOR_PREFIXES) {
    assert.ok(componentSource.includes(`\`${prefix}.\${`), `anchor prefix ${prefix} is declared but no component renders it`);
  }
});

test("per-item anchors name items that exist", () => {
  const data = [appSource, ...walk(join(ROOT, "services")).filter((path) => !path.includes(".venv") && /\.json$/.test(path) && !path.includes("/recorded/")).map((path) => readFileSync(path, "utf8")), ...readdirSync(join(ROOT, "services")).flatMap((service) => {
    const dir = join(ROOT, "services", service);
    if (!statSync(dir).isDirectory()) return [];
    const tests = join(dir, "tests");
    return [dir, ...(existsSync(tests) ? [tests] : [])].flatMap((folder) => readdirSync(folder).filter((name) => name.endsWith(".py")).map((name) => readFileSync(join(folder, name), "utf8")));
  })].join("\n");
  for (const tour of tours) for (const step of allSteps(tour)) for (const id of anchorsOf(step)) {
    const prefix = prefixOf(id);
    if (!prefix || prefix === "library.guide") continue;
    const item = id.slice(prefix.length + 1);
    assert.ok(data.includes(`"${item}"`) || data.includes(`'${item}'`), `${tour.id} › ${step.id}: no ${prefix} item "${item}" exists`);
  }
});

test("auto actions only touch anchors marked data-guide-safe", () => {
  const safe = new Set();
  const safePrefixes = new Set();
  for (const match of componentSource.matchAll(/guideSafeAnchor\(([^)]*)\)/g)) {
    for (const literal of match[1].matchAll(/"([^"]+)"/g)) safe.add(literal[1]);
    for (const literal of match[1].matchAll(/`([a-z.-]+)\.\$\{/g)) safePrefixes.add(literal[1]);
  }
  for (const tour of tours) for (const step of allSteps(tour)) {
    if (!step.action || !("anchor" in step.action)) continue;
    const id = step.action.anchor;
    assert.ok(safe.has(id) || safePrefixes.has(prefixOf(id)), `${tour.id} › ${step.id} acts on ${id}, which is not data-guide-safe`);
    assert.ok(step.kind === "auto" || step.kind === "wait", `${tour.id} › ${step.id}: only auto and wait steps may act`);
  }
});

test("recordings a tour names are committed", () => {
  const dirs = ["services/fraud/data/recorded", "services/sar/data/recorded", "services/wealth/data/recorded", "services/banking/data/recorded", "services/briefing/data/recorded", "services/interbank/recorded"];
  const exists = (name) => dirs.some((dir) => existsSync(join(ROOT, dir, `${name}.json`)));
  for (const tour of tours) {
    if (tour.recording) assert.ok(exists(tour.recording), `${tour.id}: recording ${tour.recording} is not committed`);
    for (const step of tour.steps) {
      const arg = step.replay?.arg;
      if (!arg) continue;
      if (tour.useCaseId === "brahe-bank") {
        const turns = JSON.parse(readFileSync(join(ROOT, "services/banking/data/recorded", `${tour.recording}.json`), "utf8")).result.turns.map((turn) => turn.id);
        assert.ok(turns.includes(arg), `${tour.id} › ${step.id}: ${tour.recording} has no turn ${arg}`);
      } else if (tour.useCaseId === "market-research") {
        const scenario = RESEARCH_SCENARIOS.find((item) => item.id === arg);
        assert.ok(scenario && exists(scenario.recording), `${tour.id} › ${step.id}: research scenario ${arg} has no committed recording`);
        assert.equal(scenario.recording, tour.recording, `${tour.id} › ${step.id} replays ${scenario.recording}, not the tour's ${tour.recording}`);
      } else assert.ok(exists(arg), `${tour.id} › ${step.id}: recording ${arg} is not committed`);
    }
  }
});

test("structure: unique ids, resolvable jumps and encores, a story cut, one main tour per demo", () => {
  for (const tour of tours) {
    for (const list of [tour.steps, tour.offline ?? []]) {
      const ids = list.map((step) => step.id);
      assert.equal(new Set(ids).size, ids.length, `${tour.id} has duplicate step ids`);
      for (const step of list) if (step.resumeFrom) assert.ok(ids.includes(step.resumeFrom), `${tour.id} › ${step.id}: resumeFrom ${step.resumeFrom} is not a step`);
    }
    for (const id of tour.encores ?? []) assert.ok(TOURS[id]?.encore, `${tour.id}: encore ${id} is missing`);
    if (!tour.encore && !tour.story) assert.ok(tour.steps.some((step) => step.story), `${tour.id} has no story-cut steps`);
    if (!tour.encore && !tour.story && !tour.label && !tour.liveOnly) assert.ok(tour.steps.some((step) => step.replay), `${tour.id} has no recorded-run step`);
    for (const step of tour.steps) if (step.kind === "act") assert.ok(step.waitFor, `${tour.id} › ${step.id}: act steps need waitFor`);
  }
  for (const id of ["fraud-modeling", "sar-support", "market-research", "client-advisory", "kyc-processing", "interbank-a2a", "brahe-bank", "company-briefing"]) assert.ok(mainTourFor(id), `no main tour for ${id}`);
  assert.equal(TOURS[LIFECYCLE_TOUR_ID].steps.at(-1).ciscoFit.length, 4);
});

const words = (text) => text.trim().split(/\s+/).filter(Boolean).length;

test("copy limits: titles ≤ 6 words, bodies ≤ 35, Cisco lines ≤ 25", () => {
  for (const tour of tours) for (const step of allSteps(tour)) {
    assert.ok(words(step.title) <= 6, `${tour.id} › ${step.id} title has ${words(step.title)} words`);
    assert.ok(words(step.body) <= 35, `${tour.id} › ${step.id} body has ${words(step.body)} words`);
    for (const fit of step.ciscoFit ?? []) for (const text of [fit.how, fit.otherwise].filter(Boolean)) {
      assert.ok(words(text) <= 25, `${tour.id} › ${step.id} Cisco line has ${words(text)} words: ${text}`);
    }
  }
});

const BANNED = [/ThousandEyes/i, /AppDynamics/i, /Hyperfabric/i, /Hypershield/i, /Isovalent/i, /guarantee/i];
function texts(step) {
  return [step.title, step.body, step.waitingText, ...(step.ciscoFit ?? []).flatMap((fit) => [fit.how, fit.otherwise])].filter(Boolean);
}

test("copy lint: banned claims", () => {
  for (const tour of tours) for (const step of allSteps(tour)) for (const text of texts(step)) {
    for (const pattern of BANNED) assert.ok(!pattern.test(text), `${tour.id} › ${step.id} uses banned term ${pattern}: ${text}`);
    assert.ok(!(/AI Defense/.test(text) && /\bmask/i.test(text)), `${tour.id} › ${step.id} attributes masking to AI Defense: ${text}`);
    if (/\bUCS\b|AI POD/.test(text)) assert.ok(/proposed/i.test(text), `${tour.id} › ${step.id} names UCS or AI POD without "proposed": ${text}`);
  }
  for (const tour of tours) for (const step of allSteps(tour)) for (const fit of step.ciscoFit ?? []) {
    if (fit.product === "Cisco AI Defense") assert.ok(![fit.how, fit.otherwise].some((text) => text && /\bmask/i.test(text)), `${tour.id} › ${step.id}: an AI Defense line mentions masking`);
  }
});

const PRODUCTS = {
  "Cisco AI Defense": /AI Defense/,
  "Splunk Agent Control": /Agent Control/,
  "Splunk Agent Observability": /Agent Observability/,
  "Splunk Observability Cloud": /Observability Cloud/,
  "Cisco AI infrastructure": /AI infrastructure|AI POD|\bUCS\b/i,
};
/** docs/plans/fsi-demo-redesign.md §1.3, by use case. Observability Cloud and AI infrastructure apply studio-wide (optional exporter; proposed in the explorer). */
const VALUE_MAP = {
  "fraud-modeling": ["Cisco AI Defense", "Splunk Agent Control", "Splunk Agent Observability"],
  "market-research": ["Cisco AI Defense", "Splunk Agent Control", "Splunk Agent Observability"],
  "client-advisory": ["Cisco AI Defense", "Splunk Agent Control", "Splunk Agent Observability"],
  "brahe-bank": ["Cisco AI Defense", "Splunk Agent Control", "Splunk Agent Observability"],
  "interbank-a2a": ["Cisco AI Defense", "Splunk Agent Control", "Splunk Agent Observability"],
};
const STUDIO_WIDE = ["Splunk Observability Cloud", "Cisco AI infrastructure"];

test("Cisco products in a tour are ones the presenter notes or the value map name for that demo", () => {
  for (const tour of tours) for (const step of allSteps(tour)) {
    const caseId = step.case ?? tour.useCaseId;
    const note = presenterNotes[caseId]?.cisco ?? "";
    const allowed = new Set([...Object.entries(PRODUCTS).filter(([, pattern]) => pattern.test(note)).map(([name]) => name), ...(VALUE_MAP[caseId] ?? []), ...STUDIO_WIDE]);
    for (const fit of step.ciscoFit ?? []) {
      if (step.id === "lifecycle.recap") continue;
      assert.ok(allowed.has(fit.product), `${tour.id} › ${step.id} names ${fit.product}, which ${caseId}'s notes and value map do not`);
    }
  }
});

test("Cisco status rules: infrastructure proposed, Observability Cloud when configured, running needs proof", () => {
  for (const tour of tours) for (const step of allSteps(tour)) {
    const fits = step.ciscoFit ?? [];
    assert.ok(fits.length <= 2 || step.id === "lifecycle.recap", `${tour.id} › ${step.id} has ${fits.length} Cisco lines`);
    for (const fit of fits) {
      if (fit.product === "Cisco AI infrastructure") assert.equal(fit.status, "proposed", `${tour.id} › ${step.id}: AI infrastructure must be proposed`);
      if (fit.product === "Splunk Observability Cloud") assert.equal(fit.status, "when-configured", `${tour.id} › ${step.id}: Observability Cloud must be when-configured`);
      if (fit.status === "running") {
        assert.ok(fit.requires, `${tour.id} › ${step.id}: a running ${fit.product} line needs a live-status requirement`);
        assert.ok(fit.otherwise, `${tour.id} › ${step.id}: a running ${fit.product} line needs the copy for when it is not running`);
      }
    }
    if (tour.label) assert.ok(fits.every((fit) => fit.status === "proposed"), `${tour.id} is illustrative: every Cisco line must be proposed`);
  }
});

test("illustrative tours carry the label and replay nothing", () => {
  const kyc = TOURS["kyc-processing"];
  assert.equal(kyc.label, "Illustrative prototype · no live service");
  assert.ok(kyc.steps.every((step) => !step.replay && step.kind !== "act"));
});

test("the story's advisory moment mentions the reissued card and nothing that tips off the customer", () => {
  const TIPPING_OFF = /\bSARs?\b|suspicious activity|escalat|investigat|referral|FinCEN|money mule/i;
  const advisory = TOURS.lifecycle.steps.filter((step) => step.case === "client-advisory");
  const context = advisory.find((step) => step.id === "advisory.context");
  assert.match(context.body, /reissued/);
  for (const step of advisory.filter((item) => item.id !== "lifecycle.recap")) {
    assert.doesNotMatch(`${step.title} ${step.body}`, TIPPING_OFF, `${step.id} could tip off the customer`);
  }
});
