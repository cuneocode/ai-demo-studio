"use client";

import { createContext, useContext } from "react";
import type { StudioStatus } from "./studio-status";

/** What a demo can ask of the studio shell without being handed props for it. */
export type StudioNav = {
  openSettings?: (section?: string) => void;
  links?: StudioStatus["links"] | null;
};

export const StudioNavContext = createContext<StudioNav>({});

export const useStudioNav = () => useContext(StudioNavContext);
