import type { PlatformViewContext } from "../../../app/map/drawio/platform-connections.ts";

export function customizePlatform({ page }: PlatformViewContext) {
  for (const scope of ["check", "return"]) page(scope).edges = page(scope).edges.filter(edge => !edge.id.endsWith(".inspection"));
}
