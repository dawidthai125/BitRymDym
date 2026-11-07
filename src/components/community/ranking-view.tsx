import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { CommunityShelf } from "@/components/community/community-shelf";
import { readBoard } from "@/lib/community/community-service";
import type { PeriodKind, TargetKind } from "@/lib/community/ranking-policy";

export async function RankingView({
  kind,
  period,
}: {
  kind: TargetKind;
  period: PeriodKind;
}) {
  const t = await getTranslations("community");
  const rank = await getTranslations("community.rank");
  const board = await readBoard(kind, period).catch(() => null);
  const base = kind === "beat" ? "/ranking" : "/ranking/sampel";
  const championLabel = kind === "beat"
    ? (period === "week" ? rank("bitWeek") : rank("bitMonth"))
    : (period === "week" ? rank("sampleWeek") : rank("sampleMonth"));
  return (
    <section>
      <CommunityShelf current={kind === "beat" ? "beatRank" : "sampleRank"} />
      <nav aria-label={rank("week")} className="mb-4 flex flex-wrap gap-2">
        <Link href={base} aria-current={period === "week" ? "page" : undefined} className="inline-flex min-h-11 items-center border border-[var(--brd-line)] px-3 text-sm">
          {rank("week")}
        </Link>
        <Link href={`${base}?okres=miesiac`} aria-current={period === "month" ? "page" : undefined} className="inline-flex min-h-11 items-center border border-[var(--brd-line)] px-3 text-sm">
          {rank("month")}
        </Link>
      </nav>
      <p className="mb-4 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("rules")}</p>
      {!board || !board.enabled ? <p className="text-sm text-[var(--brd-mute)]">{t("off")}</p> : null}
      {board?.enabled && board.champion ? (
        <p className="mb-4 font-poster text-xl uppercase">
          {championLabel}:{" "}
          <Link href={kind === "beat" ? `/beat/${board.champion.targetId}` : `/sampel#${board.champion.targetId}`} className="underline underline-offset-4">
            {board.champion.title}
          </Link>
          <span className="ml-2 font-sans text-sm normal-case text-[var(--brd-mute)]">{board.champion.author}</span>
        </p>
      ) : null}
      {board?.enabled && !board.closed ? <p className="mb-3 text-sm text-[var(--brd-mute)]">{rank("open")}</p> : null}
      {board?.enabled && board.rows.length === 0 ? <p className="text-sm">{rank("empty")}</p> : null}
      {board && board.rows.length > 0 ? (
        <ol className="space-y-3">
          {board.rows.map((row) => (
            <li key={row.targetId} className="border-b border-[var(--brd-line)] pb-3">
              <p className="text-sm text-[var(--brd-mute)]">{rank("place", { place: row.place })}</p>
              <p className="text-base text-[var(--brd-ink)]">
                <Link href={kind === "beat" ? `/beat/${row.targetId}` : `/sampel#${row.targetId}`} className="underline underline-offset-4">
                  {row.title}
                </Link>
                <span className="ml-2 text-sm text-[var(--brd-mute)]">{row.author}</span>
              </p>
              <p className="text-sm text-[var(--brd-ink-soft)]">
                {rank("votes", { count: row.count, score: row.score.toFixed(1) })}
              </p>
              {row.prize ? (
                <p className="text-sm text-[var(--brd-green)]">
                  {row.prize.mode === "package_month"
                    ? rank("prizeTier", { tier: row.prize.tier })
                    : rank("prizeDays", { days: row.prize.days })}
                </p>
              ) : board.closed && row.place <= 3 && row.count < 3 ? (
                <p className="text-xs text-[var(--brd-mute)]">{rank("needsVotes")}</p>
              ) : null}
            </li>
          ))}
        </ol>
      ) : null}
    </section>
  );
}
