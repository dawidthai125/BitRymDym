import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { RankingView } from "@/components/community/ranking-view";
import { readBoard } from "@/lib/community/community-service";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  const m = await getTranslations("meta.pages");
  return pageMetadata({ title: t("beatRank"), description: m("beatRankDescription"), path: "/ranking" });
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
