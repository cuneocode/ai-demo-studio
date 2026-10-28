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
  if (!parseStudioRoute(`/apps/${segments.join("/")}`).valid) notFound();
  return null;
}
