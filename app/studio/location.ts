"use client";

import { useCallback, useSyncExternalStore } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const subscribe = (notify: () => void) => {
  window.addEventListener("popstate", notify);
  window.addEventListener("studio:navigate", notify);
  return () => { window.removeEventListener("popstate", notify); window.removeEventListener("studio:navigate", notify); };
};
const browserLocation = () => `${window.location.pathname}${window.location.search}`;

/** Retained workspaces follow the browser URL, including restored history entries. */
export function useStudioLocation() {
  const serverPath = usePathname();
  const serverSearch = useSearchParams().toString();
  const serverLocation = useCallback(() => `${serverPath}${serverSearch ? `?${serverSearch}` : ""}`, [serverPath, serverSearch]);
  const location = useSyncExternalStore(subscribe, browserLocation, serverLocation);
  const split = location.indexOf("?");
  return { pathname: split < 0 ? location : location.slice(0, split), search: split < 0 ? "" : location.slice(split + 1) };
}
