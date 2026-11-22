import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { RankingView } from "@/components/community/ranking-view";
import { readBoard } from "@/lib/community/community-service";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";

export async function generateMetadata() {
  const t = await getTranslations("community.shelf");
  const m = await getTranslations("meta.pages");
  return pageMetadata({ title: t("sampleRank"), description: m("sampleRankDescription"), path: "/ranking/sampel" });
}

export default async function SampleRankingPage({
  searchParams,
}: {
  searchParams?: Promise<{ okres?: string }>;
}) {
  const params = searchParams ? await searchParams : {};
  const period = params.okres === "miesiac" ? "month" : "week";
  void readBoard("sample", period).catch(() => null);
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
