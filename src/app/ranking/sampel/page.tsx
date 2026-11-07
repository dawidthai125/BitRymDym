import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { RankingView } from "@/components/community/ranking-view";
import { AppShell } from "@/components/site/app-shell";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  return { title: t("sampleRank") };
}

export default async function SampleRankingPage({
  searchParams,
}: {
  searchParams?: Promise<{ okres?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const period = params.okres === "miesiac" ? "month" : "week";
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <RankingView kind="sample" period={period} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
