"use client";

import { createContext, useContext } from "react";
import type { StudioStatus } from "./studio-status";

export const USE_CASE_TABS = [
  { id: "demo", label: "Use case demo" },
  { id: "architecture", label: "Architecture" },
  { id: "capacity", label: "Capacity planning" },
] as const;

export type UseCaseTab = (typeof USE_CASE_TABS)[number]["id"];

/** What a demo can ask of the studio shell without being handed props for it. */
export type StudioNav = {
  /** Null selects shared platform views; a demo retains its owning app while cached. */
  appId?: string | null;
  demoId?: string;
  /** Cached demos keep running while their interaction surface is inactive. */
  active?: boolean;
  preview?: boolean;
  openSettings?: (section?: string) => void;
  links?: StudioStatus["links"] | null;
  /** Opens another use case by id, e.g. the fraud demo handing a case to "sar-support". */
  openUseCase?: (id: string) => void;
  /** True while Present mode is on; presenter-only hints may render. */
  presenting?: boolean;
};

export const StudioNavContext = createContext<StudioNav>({});

export const useStudioNav = () => useContext(StudioNavContext);
