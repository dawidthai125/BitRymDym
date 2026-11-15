import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { RankingView } from "@/components/community/ranking-view";
import { readBoard } from "@/lib/community/community-service";
import { AppShell } from "@/components/site/app-shell";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  return { title: t("beatRank") };
}

export default async function BeatRankingPage({
  searchParams,
}: {
  searchParams?: Promise<{ okres?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const period = params.okres === "miesiac" ? "month" : "week";
  // Shell waits on the profile. Start the board in the same request first.
  void readBoard("beat", period).catch(() => null);
  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        <PageFrame width="wide" className="py-5 sm:py-6">
          <RankingView kind="beat" period={period} />
        </PageFrame>
      </main>
    </AppShell>
  );
}
