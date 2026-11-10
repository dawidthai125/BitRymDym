import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { WorkRankingView } from "@/components/community/work-ranking-view";
import { AppShell } from "@/components/site/app-shell";
import type { WorkBoardPeriod } from "@/lib/catalog/catalog-policy";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  return { title: t("workRank") };
}

export default async function WorkRankingPage({
  searchParams,
}: {
  searchParams?: Promise<{ okres?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const period: WorkBoardPeriod = params.okres === "miesiac" ? "month" : params.okres === "ogolny" ? "all" : "week";
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <WorkRankingView period={period} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
