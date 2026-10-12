import type { CiscoFit, Condition, Tour } from "../types";

const RUN_STARTED: Condition = { state: { run: ["running", "done", "blocked"] } };
const HAS_RESULT: Condition = { state: { stage: ["result"] } };

const publishControl: CiscoFit = {
  product: "Splunk Agent Control",
  how: "research.publish blocks restricted issuers and rating or price-target language before anything reaches advisors.",
  status: "running",
  requires: { status: { service: "wealth", agentControl: "enforcing" } },
  otherwise: "Hosted Agent Control isn't enforcing for wealth yet; each policy list says when a local check evaluated it.",
};

export const researchTour: Tour = {
  id: "market-research",
  useCaseId: "market-research",
  title: "Market event → house-view update",
  recording: "research-hcyn",
  encores: ["market-research.attack-poisoned", "market-research.restricted"],
  steps: [
    {
      id: "research.problem", kind: "observe", targets: ["research.intro"],
      title: "When an issuer reports",
      body: "Sam, a CIO-office strategist, must tell advisors what changed and whether the house view moves, with every number sourced and restricted issuers respected.",
      variants: [{ when: { anchor: "research.intro", present: false }, patch: { targets: ["research.scenarios"] } }],
    },
    {
      id: "research.scenario", kind: "auto", story: true, targets: ["research.scenario.earnings"],
      action: { type: "selectScenario", value: "earnings" },
      title: "Earnings on a Focus List name",
      body: "Halcyon Interconnect (HCYN) is a fictional issuer with synthetic data. It employs Dana Whitfield, so this update later reaches her advisor.",
    },
    {
      id: "research.run", kind: "act", story: true, targets: ["research.replay"],
      replay: { arg: "earnings" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the research desk",
      body: "This tour replays a real recorded run: a research Deep Agent with fundamentals, valuation, macro, and compliance subagents. Run live stays available outside the tour.",
    },
    {
      id: "research.timeline", kind: "wait", targets: ["research.timeline"], scroll: "start",
      waitFor: { state: { stage: ["events"] } }, waitingText: "Waiting for the first event…",
      needs: HAS_RESULT, resumeFrom: "research.run",
      title: "Subagents at work",
      body: "Each plan step, tool call, model call, and policy check streams here with a lane tag. A line's source button highlights its evidence.",
      ciscoFit: [
        {
          product: "Splunk Agent Observability",
          how: "A live run's supervisor and subagent spans form one trace. A replay sends no new trace.",
          status: "running",
          requires: { status: { service: "wealth", tracing: "configured" } },
          otherwise: "Agent tracing isn't configured for wealth on this machine; the timeline comes from the run's own events.",
        },
        {
          product: "Splunk Observability Cloud",
          how: "OTLP spans from the same run can export to Splunk Observability Cloud once an endpoint is configured.",
          status: "when-configured",
        },
      ],
    },
    {
      id: "research.impact", kind: "wait", story: true, targets: ["research.impact", "research.result"],
      waitFor: HAS_RESULT, waitingText: "Waiting for the update…",
      title: "Does the view change?",
      body: "The update says whether the event trips a thesis point or key risk. The AI never sets ratings or targets; the CIO office owns that call.",
      variants: [{ when: { anchor: "research.impact", present: false }, patch: { targets: ["research.result"] } }],
    },
    {
      id: "research.claims", kind: "observe", targets: ["research.count", "research.claims"],
      title: "Every claim verified",
      body: "Code checks each claim against its cited field or quote, unit-aware. Claims that fail are struck and shown, not silently dropped.",
    },
    {
      id: "research.news", kind: "observe", targets: ["research.news"],
      showIf: { anchor: "research.news" },
      title: "Screened news",
      body: "Allowlisted news items are inspected as tool results. A withheld item never reaches the agent, and each row names who checked it.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspects each news item as a tool result before the agent reads it.",
        status: "running",
        requires: { status: { service: "wealth", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for wealth on this machine now; each row names the check that screened it.",
      }],
    },
    {
      id: "research.policies", kind: "observe", targets: ["research.policies"],
      title: "Policy checks",
      body: "research.precheck ran before any data pull; research.publish runs when Sam decides. Each list says whether Agent Control or a local check evaluated it.",
    },
    {
      id: "research.affected", kind: "observe", targets: ["research.affected"],
      showIf: { anchor: "research.affected" },
      title: "Who is affected",
      body: "Households that hold the name, and how many are concentrated above the threshold. This links the update to advisor meeting prep.",
    },
    {
      id: "research.publish", kind: "act", story: true, targets: ["research.publish"],
      waitFor: { any: [{ state: { stage: ["publish-published"] } }, { state: { stage: ["publish-denied"] } }, { state: { stage: ["publish-rejected"] } }] },
      waitingText: "Publish update is Sam's decision: press it to continue, or Skip.",
      title: "Sam publishes",
      body: "Only verified claims reach advisors. Publishing runs the research.publish policies; Prepare client meeting then opens meeting prep with this update attached.",
      ciscoFit: [publishControl],
      variants: [{
        when: { any: [{ state: { stage: ["publish-published"] } }, { state: { stage: ["publish-denied"] } }] },
        patch: { kind: "observe", body: "Only verified claims reach advisors, and publishing ran the research.publish policies. Prepare client meeting opens meeting prep with this update attached." },
      }],
    },
    {
      id: "research.stats", kind: "observe", targets: ["stats"],
      title: "Measured from this run",
      body: "Elapsed time, model calls, tokens, and news inspections come from this run. The badge says the run is recorded, with its date.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "The defense card counts this run's news inspections and anything withheld.",
        status: "running",
        requires: { status: { service: "wealth", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for wealth now, so the defense card claims no live inspections.",
      }],
    },
    {
      id: "research.architecture", kind: "observe", tab: "architecture", targets: ["arch.mode"],
      title: "Private inference, proposed",
      body: "With Sparky up, drafts stay on private inference; otherwise the hosted fallback is allowed here because no client data is involved.",
      ciscoFit: [{
        product: "Cisco AI infrastructure",
        how: "Proposed: private Nemotron inference on Cisco AI POD or UCS GPU nodes.",
        status: "proposed",
      }],
    },
  ],
};

export const researchPoisonedTour: Tour = {
  id: "market-research.attack-poisoned",
  useCaseId: "market-research",
  title: "Attack: poisoned news story",
  recording: "research-hcyn-poisoned",
  encore: true,
  steps: [
    {
      id: "research-poisoned.scenario", kind: "auto", targets: ["research.scenario.poisoned-news"],
      action: { type: "selectScenario", value: "poisoned-news" },
      title: "A blog post with orders",
      body: "A blog post in the news feed tells the agent to push a $2,000 price target on Halcyon.",
    },
    {
      id: "research-poisoned.run", kind: "act", targets: ["research.replay"],
      replay: { arg: "poisoned-news" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the attack",
      body: "This recorded run shows what the agent read, and what it never saw.",
    },
    {
      id: "research-poisoned.news", kind: "wait", targets: ["research.news"],
      waitFor: HAS_RESULT, waitingText: "Waiting for the update…",
      needs: HAS_RESULT, resumeFrom: "research-poisoned.run",
      title: "Withheld as a tool result",
      body: "The post is withheld before the agent reads it, and the row names who checked it. The verified update can still be published.",
      ciscoFit: [{
        product: "Cisco AI Defense",
        how: "Inspected each news item as a tool result; in this recording it withheld the injected post.",
        status: "running",
        requires: { status: { service: "wealth", aiDefense: "on" } },
        otherwise: "AI Defense isn't active for wealth on this machine now; the verdict shown is from the recording.",
      }],
    },
  ],
};

export const researchRestrictedTour: Tour = {
  id: "market-research.restricted",
  useCaseId: "market-research",
  title: "Restricted issuer",
  recording: "research-kstl-restricted",
  encore: true,
  steps: [
    {
      id: "research-restricted.scenario", kind: "auto", targets: ["research.scenario.restricted"],
      action: { type: "selectScenario", value: "restricted" },
      title: "A name under restriction",
      body: "Kestrel Ridge is on the restricted list during a pending deal, so research on it must stop.",
    },
    {
      id: "research-restricted.run", kind: "act", targets: ["research.replay"],
      replay: { arg: "restricted" }, waitFor: RUN_STARTED,
      waitingText: "Choose Replay the recorded run.",
      title: "Replay the recorded run",
      body: "This recorded run shows the pre-check stopping the request.",
    },
    {
      id: "research-restricted.blocked", kind: "wait", targets: ["research.blocked"],
      waitFor: { state: { stage: ["blocked"] } }, waitingText: "Waiting for the pre-check…",
      needs: { state: { stage: ["blocked"] } }, resumeFrom: "research-restricted.run",
      title: "Stopped before any data",
      body: "research.precheck stops the request before any data pull or model call, and says why.",
      ciscoFit: [{
        product: "Splunk Agent Control",
        how: "research.precheck evaluates the restricted list before the research agent starts.",
        status: "running",
        requires: { status: { service: "wealth", agentControl: "enforcing" } },
        otherwise: "Hosted Agent Control isn't enforcing for wealth yet; the policy list says a local check evaluated it.",
      }],
    },
  ],
};
