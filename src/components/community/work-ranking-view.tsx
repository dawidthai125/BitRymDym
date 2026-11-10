import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { CommunityShelf } from "@/components/community/community-shelf";
import { readHalfYearPlaces, readWorkBoard } from "@/lib/catalog/catalog-service";
import type { WorkBoardPeriod } from "@/lib/catalog/catalog-policy";

export async function WorkRankingView({ period }: { period: WorkBoardPeriod }) {
  const t = await getTranslations("community.works");
  const rank = await getTranslations("community.rank");
  const board = await readWorkBoard(period).catch(() => null);
  const half = period === "all" ? await readHalfYearPlaces().catch(() => null) : null;
  const tabs = [
    { id: "week" as const, href: "/ranking/utwor", label: t("week") },
    { id: "month" as const, href: "/ranking/utwor?okres=miesiac", label: t("month") },
    { id: "all" as const, href: "/ranking/utwor?okres=ogolny", label: t("all") },
  ];
  return (
    <section>
      <CommunityShelf current="workRank" />
      <h1 className="mb-2 font-poster text-2xl font-bold uppercase">{period === "all" ? t("allTitle") : t("rankTitle")}</h1>
      <p className="mb-4 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("rankLead")}</p>
      <nav aria-label={t("rankTitle")} className="mb-4 flex flex-wrap gap-2">
        {tabs.map((tab) => (
          <Link key={tab.id} href={tab.href} aria-current={period === tab.id ? "page" : undefined} className="inline-flex min-h-11 items-center border border-[var(--brd-line)] px-3 text-sm">
            {tab.label}
          </Link>
        ))}
      </nav>
      {!board || !board.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p> : null}
      {board?.enabled && board.lead ? (
        <p className="mb-4 font-poster text-xl uppercase">
          {period === "week" ? t("leadWeek") : t("leadMonth")}:{" "}
          <Link href={`/utwor/${board.lead.targetId}`} className="underline underline-offset-4">{board.lead.title}</Link>
          <span className="ml-2 font-sans text-sm normal-case text-[var(--brd-mute)]">{board.lead.author}</span>
        </p>
      ) : null}
      {board?.enabled && !board.closed && period !== "all" ? <p className="mb-3 text-sm text-[var(--brd-mute)]">{t("open")}</p> : null}
      {board?.enabled && board.rows.length === 0 ? <p className="text-sm">{t("emptyRank")}</p> : null}
      {board && board.rows.length > 0 ? (
        <ol className="space-y-3">
          {board.rows.map((row) => (
            <li key={row.targetId} className="border-b border-[var(--brd-line)] pb-3">
              <p className="text-sm text-[var(--brd-mute)]">{rank("place", { place: row.place })}</p>
              <p className="text-base text-[var(--brd-ink)]">
                <Link href={`/utwor/${row.targetId}`} className="underline underline-offset-4">{row.title}</Link>
                <span className="ml-2 text-sm text-[var(--brd-mute)]">{row.author}</span>
              </p>
              <p className="text-sm text-[var(--brd-ink-soft)]">{rank("votes", { count: row.count, score: row.score.toFixed(1) })}</p>
            </li>
          ))}
        </ol>
      ) : null}
      {half ? (
        <section className="mt-8 border-t border-[var(--brd-line)] pt-4" aria-labelledby="work-half-title">
          <h2 id="work-half-title" className="font-poster text-xl uppercase">{t("halfTitle")}</h2>
          <p className="mb-4 max-w-prose text-sm text-[var(--brd-ink-soft)]">
            {t("halfLead", { year: half.year, half: half.half === 1 ? t("halfFirst") : t("halfSecond") })}
          </p>
          {!half.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p> : null}
          {half.enabled && half.rows.length === 0 ? <p className="text-sm">{t("halfEmpty")}</p> : null}
          {half.rows.length > 0 ? (
            <ol className="space-y-3">
              {half.rows.map((row) => (
                <li key={row.targetId} className="border-b border-[var(--brd-line)] pb-3">
                  <p className="text-sm text-[var(--brd-mute)]">{rank("place", { place: row.place })}</p>
                  <p className="text-base">
                    <Link href={`/utwor/${row.targetId}`} className="underline underline-offset-4">{row.title}</Link>
                    <span className="ml-2 text-sm text-[var(--brd-mute)]">{row.author}</span>
                  </p>
                  <p className="text-sm text-[var(--brd-ink-soft)]">{rank("votes", { count: row.count, score: row.score.toFixed(1) })}</p>
                </li>
              ))}
            </ol>
          ) : null}
        </section>
      ) : null}
    </section>
  );
}
