import type { Catalog } from "./catalog.ts";
import { attributionFor, type Mode, type SceneNode, type SceneSourceAction } from "./scene-model.ts";

export function sourceAttribution(catalog: Catalog, node: SceneNode, mode: Mode, action?: SceneSourceAction) {
  const resolved = attributionFor(catalog, node, mode);
  if (!action?.bindingId) {
    return {
      subject: node.displayLabel,
      ownership: node.serviceLabel,
      platforms: [],
      mechanism: mode === "proposed" ? "Design reference" : "Occurrence implementation",
      effect: action?.evidenceSummary ?? node.supportingByMode?.[mode] ?? node.supportingText ?? "Shows how this occurrence is configured and behaves.",
      disclosure: node.disclosure,
    };
  }
  const relevant = resolved.filter((item) => item.bindingId === action.bindingId);
  const selected = relevant[0];
  if (!selected) return null;
  return {
    subject: node.displayLabel,
    ownership: node.serviceLabel && !resolved.some((item) => item.platformName === node.serviceLabel) ? node.serviceLabel : undefined,
    platforms: [...new Set(relevant.map((item) => item.platformName))],
    mechanism: selected.mechanismLabel,
    effect: selected.applicationEffect,
    disclosure: node.disclosure,
  };
}
