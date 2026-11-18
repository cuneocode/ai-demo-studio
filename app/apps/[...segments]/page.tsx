import { notFound } from "next/navigation";
import { parseStudioRoute } from "../../studio/route.ts";
import { appById } from "../../../config/apps.ts";
import { demoById } from "../../../config/demos.ts";
import { PRODUCT_NAME } from "../../../config/product.ts";

type Props = { params: Promise<{ segments: string[] }> };
export async function generateMetadata({ params }: Props) {
  const { segments } = await params;
  const route = parseStudioRoute(`/apps/${segments.join("/")}`);
  const app = appById(route.appId);
  const demo = route.demoId ? demoById(route.demoId) : null;
  return { title: [demo?.title, app?.name, PRODUCT_NAME].filter(Boolean).join(" | ") };
}
export default async function AppPage({ params }: Props) {
  const { segments } = await params;
  // The host validates approved JSON membership after the shell mounts. Reserve
  // its route namespace so a refreshed external workspace can fetch that snapshot.
  const contentRoute = segments.length === 3 && appById(segments[0]) && segments[1] === "demos" && /^json-[a-z0-9-]+$/.test(segments[2]);
  if (!parseStudioRoute(`/apps/${segments.join("/")}`).valid && !contentRoute) notFound();
  return null;
}
