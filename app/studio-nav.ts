"use client";

import { createContext, useContext } from "react";
import type { StudioStatus } from "./studio-status";

/** What a demo can ask of the studio shell without being handed props for it. */
export type StudioNav = {
  openSettings?: (section?: string) => void;
  links?: StudioStatus["links"] | null;
  /** Opens another use case by id, e.g. the fraud demo handing a case to "sar-support". */
  openUseCase?: (id: string) => void;
};

export const StudioNavContext = createContext<StudioNav>({});

export const useStudioNav = () => useContext(StudioNavContext);
