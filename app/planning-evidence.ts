"use client";

import { createContext } from "react";
import type { ObservedRun } from "./RunStats";

/** A workspace receives the same observations shown in its shared run stats. */
export const PlanningRunContext = createContext<((run: ObservedRun | undefined) => void) | null>(null);
