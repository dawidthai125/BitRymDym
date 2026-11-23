import { notFound } from "next/navigation";

import { GuidePageView, guideMetadata } from "@/components/seo/landing-page-view";
import { GUIDES, findGuide } from "@/lib/seo/guides";

type Props = { params: Promise<{ slug: string }> };

export const dynamicParams = false;

export function generateStaticParams() {
  return GUIDES.map((g) => ({ slug: g.slug }));
}

export async function generateMetadata({ params }: Props) {
  const guide = findGuide((await params).slug);
  if (!guide) notFound();
  return guideMetadata(guide);
}

export default async function GuidePage({ params }: Props) {
  const guide = findGuide((await params).slug);
  if (!guide) notFound();
  return <GuidePageView guide={guide} />;
}
