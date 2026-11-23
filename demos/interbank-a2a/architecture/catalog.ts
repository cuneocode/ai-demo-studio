import type { Catalog } from "../../../app/map/journey.ts";
import { interbankScenes } from "./scenes.ts";
import { interbankStates, projectInterbankSystem } from "./system.ts";

export const interbank: Catalog = {
  ...interbankScenes,
  scenes: {
    ...interbankScenes.scenes,
    ...Object.fromEntries(interbankStates().map((state) => {
      const id = `interbank.state.${state.id}`;
      return [id, { ...projectInterbankSystem(state.expanded, state.mode), id, modes: [state.mode] }];
    })),
  },
};
