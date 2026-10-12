import type { AnchorId } from "./anchors";

export type GuideTab = "demo" | "architecture";
export type RunState = "idle" | "starting" | "running" | "awaiting-human" | "done" | "failed" | "blocked";
export type Source = "live" | "recorded" | "sample" | "scripted" | "illustrative" | "none";
export type ServiceId = "banking" | "fraud" | "briefing" | "wealth" | "sar" | "interbank";

export type CiscoProduct =
  | "Cisco AI Defense"
  | "Splunk Agent Control"
  | "Splunk Agent Observability"
  | "Splunk Observability Cloud"
  | "Cisco AI infrastructure";

export type CiscoStatus = "running" | "proposed" | "when-configured";

export type CiscoFit = {
  product: CiscoProduct;
  /** One sentence, at most 25 words. */
  how: string;
  status: CiscoStatus;
  /** Live proof required to keep the "running" tag; when unmet the line is tagged "when configured". */
  requires?: Condition;
  /** Replaces `how` when `requires` is unmet. */
  otherwise?: string;
};

export type Condition =
  | { state: { run?: RunState[]; source?: Source[]; stage?: string[] } }
  | { anchor: AnchorId; present?: boolean; enabled?: boolean }
  | { status: { service: ServiceId; up?: boolean; aiDefense?: "on"; agentControl?: "enforcing"; tracing?: "configured" } }
  | { all: Condition[] }
  | { any: Condition[] }
  | { not: Condition };

export type StepAction =
  | { type: "click"; anchor: AnchorId }
  | { type: "openDetails"; anchor: AnchorId }
  | { type: "setPlatformFocus"; value: string }
  | { type: "selectScenario"; value: string };

export type StepPatch = Partial<Pick<Step, "targets" | "title" | "body" | "ciscoFit" | "kind" | "waitFor" | "waitingText">>;

export type Step = {
  /** Stable id used in deep links and persistence. */
  id: string;
  kind: "observe" | "act" | "auto" | "wait";
  tab?: GuideTab;
  /** First target is primary. Empty means the card is centred with no spotlight. */
  targets: AnchorId[];
  /** At most 6 words. */
  title: string;
  /** At most 35 words. */
  body: string;
  ciscoFit?: CiscoFit[];
  /** `auto` steps perform one non-consequential action on entering. */
  action?: StepAction;
  /** `act` and `wait` steps advance when this becomes true. */
  waitFor?: Condition;
  /** Milliseconds before "Skip ahead" is offered on wait steps. */
  patience?: number;
  waitingText?: string;
  /** Offers the demo's registered replay action on the card; the person clicks it. */
  replay?: { label?: string; arg?: string };
  showIf?: Condition;
  variants?: { when: Condition; patch: StepPatch }[];
  placement?: "auto" | "right" | "left" | "below" | "above";
  scroll?: "center" | "start";
  /** On deep link or resume, start at `resumeFrom` unless `needs` holds. */
  needs?: Condition;
  resumeFrom?: string;
  /** Story tours: the use case this step runs in (defaults to the tour's). */
  case?: string;
  /** Story tours: the moment label shown in the kicker, e.g. "Moment 2 of 4 · Fraud". */
  moment?: string;
  /** Kept in the short cut that Present mode's "Guide this moment" plays. */
  story?: boolean;
};

export type Tour = {
  id: string;
  useCaseId: string;
  title: string;
  /** Stamped on every card. */
  label?: "Illustrative prototype · no live service";
  /** Which recorded run the tour replays, for the first card. */
  recording?: string;
  steps: Step[];
  /** Used when the demo's service is unreachable and no recording can be served. */
  offline?: Step[];
  offlineWhen?: Condition;
  encores?: string[];
  /** Short tours are hidden from the launcher and offered as encores. */
  encore?: boolean;
  /** Story tours cross use cases: each step may name the case it runs in. */
  story?: boolean;
};
