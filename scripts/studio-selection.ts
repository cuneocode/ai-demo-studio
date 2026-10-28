import { runtimes, runtimeById, runtimeForUseCase } from "../config/use-cases.ts";
import { resolveScope, scopedRuntimeIds } from "./studio-scope.ts";

/** One parser for dashboard-equivalent app selection in operator and doctor commands. */
export function selectRuntimes(arguments_: string[], defaultAll = false) {
  const args = [...arguments_];
  const appIndex = args.indexOf("--app");
  const allIndex = args.indexOf("--all");
  if (appIndex >= 0 && allIndex >= 0) throw new Error("Choose --app or --all.");
  let appId: string | undefined;
  if (appIndex >= 0) {
    appId = args[appIndex + 1];
    if (!appId || appId.startsWith("--")) throw new Error("Provide an app id after --app.");
    args.splice(appIndex, 2);
  }
  if (args.includes("--all")) args.splice(args.indexOf("--all"), 1);
  if (args.some(arg => arg.startsWith("--"))) throw new Error("Unknown selection option.");
  const scope = resolveScope(appId);
  const ids = args.map(id => runtimeById(id)?.id ?? runtimeForUseCase(id)?.id ?? id);
  if (ids.length) scopedRuntimeIds(ids, scope);
  return { scope, selected: runtimes.filter(spec => (ids.length ? ids.includes(spec.id) : Boolean(appId || allIndex >= 0 || defaultAll)) && scope.runtimeIds.includes(spec.id)) };
}
