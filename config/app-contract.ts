export const APP_IDS = ["fsi", "healthcare", "manufacturing", "retail", "public-sector"] as const;
export type AppId = (typeof APP_IDS)[number];
export type AppDefinition = {
  id: AppId; name: string; shortName: string; description: string; iconKey: string;
  categories: readonly { id: string; label: string; iconKey: string }[];
  catalog: readonly { demoId: string; categoryId: string; featured?: boolean }[];
  defaultStory: readonly string[]; context: "company" | null; storyId: string | null;
};
