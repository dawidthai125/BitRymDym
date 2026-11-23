import { notFound } from "next/navigation";

import { ToolPageView } from "@/components/tools/tool-page-view";
import { pageMetadata } from "@/config/site";
import { TOOL_PAGES, toolPage, toolPath } from "@/lib/seo/tool-pages";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return TOOL_PAGES.map((t) => ({ slug: t.slug }));
}

export async function generateMetadata({ params }: Props) {
  const page = toolPage((await params).slug);
  if (!page) return {};
  return pageMetadata({ title: page.metaTitle, description: page.metaDescription, path: toolPath(page.slug) });
}

export default async function ToolPageRoute({ params }: Props) {
  const page = toolPage((await params).slug);
  if (!page) notFound();
  return <ToolPageView page={page} />;
}
