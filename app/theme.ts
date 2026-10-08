"use client";

import { useSyncExternalStore } from "react";

export type Theme = "dark" | "light";

export const THEME_KEY = "fsi-studio.theme";

/** Runs in <head> before paint so a saved light theme never flashes dark. */
export const THEME_BOOT = `try{if(localStorage.getItem("${THEME_KEY}")==="light")document.documentElement.dataset.theme="light"}catch(e){}`;

const current = (): Theme => (document.documentElement.dataset.theme === "light" ? "light" : "dark");

function subscribe(onChange: () => void) {
  const observer = new MutationObserver(onChange);
  observer.observe(document.documentElement, { attributes: true, attributeFilter: ["data-theme"] });
  return () => observer.disconnect();
}

export function setTheme(theme: Theme) {
  if (theme === "light") document.documentElement.dataset.theme = "light";
  else delete document.documentElement.dataset.theme;
  try { localStorage.setItem(THEME_KEY, theme); } catch { /* private mode: this page only */ }
}

export function useTheme(): Theme {
  return useSyncExternalStore(subscribe, current, () => "dark");
}
