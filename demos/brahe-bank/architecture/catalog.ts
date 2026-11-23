import type { Catalog } from "../../../app/map/journey.ts";
import { braheDrill, braheScenes } from "./scenes.ts";

export const brahe: Catalog = {
    ...braheScenes,
    resolveScene(sceneId, mode) {
      if (sceneId === "brahe.hosting" || sceneId === "brahe.hosting-proposed") return braheDrill[mode]["brahe.hosting"];
      return sceneId;
    },
  };
