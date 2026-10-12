import type { StudioStatus } from "../studio-status";
import type { AnchorId } from "./anchors";
import type { CiscoFit, CiscoStatus, Condition, Step } from "./types";

export type ConditionContext = {
  /** The open demo's root, carrying data-guide-run / -source / -stage. Readable even while its panel is hidden. */
  root: Element | null;
  status: StudioStatus | null;
};

const visible = (element: Element) => element.getClientRects().length > 0;

/** Every rendered element carrying the anchor; visible ones first. */
export function findAnchors(id: AnchorId, scope: ParentNode = document): HTMLElement[] {
  const all = [...scope.querySelectorAll<HTMLElement>(`[data-guide~="${CSS.escape(id)}"]`)];
  return all.filter(visible);
}

export function demoRoot(): Element | null {
  return document.querySelector("#case-panel-demo [data-guide-run]");
}

const TRACED = new Set(["configured", "traces_present", "recorded"]);

function statusHolds(status: StudioStatus | null, rule: Extract<Condition, { status: unknown }>["status"]) {
  if (!status) return false;
  if (rule.service === "interbank") {
    const lab = status.interbank;
    if (rule.up !== undefined && lab.up !== rule.up) return false;
    if (rule.aiDefense && !(lab.up && lab.aiDefense)) return false;
    if (rule.agentControl && !(lab.up && lab.agentControl)) return false;
    if (rule.tracing && !(lab.up && lab.project)) return false;
    return true;
  }
  const service = status.services.find((item) => item.id === rule.service);
  if (!service) return false;
  if (rule.up !== undefined && service.up !== rule.up) return false;
  if (rule.aiDefense && !(service.up && service.aiDefense?.status === "configured" && service.aiDefense.mode && service.aiDefense.mode !== "off")) return false;
  if (rule.agentControl && !(service.up && service.agentControl?.status === "enforcing")) return false;
  if (rule.tracing && !(service.up && service.tracing && TRACED.has(service.tracing))) return false;
  return true;
}

export function evaluate(condition: Condition | undefined, context: ConditionContext): boolean {
  if (!condition) return true;
  if ("all" in condition) return condition.all.every((item) => evaluate(item, context));
  if ("any" in condition) return condition.any.some((item) => evaluate(item, context));
  if ("not" in condition) return !evaluate(condition.not, context);
  if ("status" in condition) return statusHolds(context.status, condition.status);
  if ("anchor" in condition) {
    const found = findAnchors(condition.anchor);
    const wantPresent = condition.present ?? true;
    if (!wantPresent) return found.length === 0;
    if (!found.length) return false;
    if (condition.enabled === undefined) return true;
    const enabled = found.some((element) => !(element as HTMLButtonElement).disabled && element.getAttribute("aria-disabled") !== "true");
    return enabled === condition.enabled;
  }
  const root = context.root;
  if (!root) return false;
  const { run, source, stage } = condition.state;
  if (run && !run.includes((root.getAttribute("data-guide-run") ?? "idle") as never)) return false;
  if (source && !source.includes((root.getAttribute("data-guide-source") ?? "none") as never)) return false;
  if (stage) {
    const stages = new Set((root.getAttribute("data-guide-stage") ?? "").split(/\s+/).filter(Boolean));
    if (!stage.every((item) => stages.has(item))) return false;
  }
  return true;
}

/** The step with the first matching variant applied. */
export function resolveStep(step: Step, context: ConditionContext): Step {
  const variant = step.variants?.find((item) => evaluate(item.when, context));
  return variant ? { ...step, ...variant.patch } : step;
}

export type ResolvedFit = { product: CiscoFit["product"]; how: string; status: CiscoStatus };

/** Tags each Cisco line from live status: "running" only when the page or the studio status proves it. */
export function resolveFit(fit: CiscoFit, context: ConditionContext): ResolvedFit {
  if (fit.status !== "running") return { product: fit.product, how: fit.how, status: fit.status };
  if (evaluate(fit.requires, context)) return { product: fit.product, how: fit.how, status: "running" };
  return { product: fit.product, how: fit.otherwise ?? fit.how, status: "when-configured" };
}
