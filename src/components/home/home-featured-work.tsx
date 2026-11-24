import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";

import { WorkClipButton } from "@/app/utwory/work-clip-button";
import { AuthorName } from "@/components/creators/author-name";
import type { FeaturedWorkView } from "@/lib/catalog/featured-work-server";

const wrap =
  "mx-auto w-full max-w-[var(--brd-max-wide)] px-[max(var(--brd-gutter),env(safe-area-inset-left))]";

/**
 * Home — "Utwór tygodnia". Rendered only when the page got a view (feature for this Warsaw week
 * AND the work is still live). Clip = the same 45 s button as /utwory; full page = /utwor/[id].
 */
export async function HomeFeaturedWork({ featured }: { featured: FeaturedWorkView }) {
  const t = await getTranslations("community.works");
  const catalog = await getTranslations("community.catalog");
  const { work, clip, coverUrl, note } = featured;
  return (
    <section aria-labelledby="home-utwor-tygodnia" className="border-b border-tape-line" data-testid="home-featured-work">
      <div className={`${wrap} py-[var(--tape-section-y)]`}>
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 border-b-4 border-tape-cream pb-3">
          <h2
            id="home-utwor-tygodnia"
            className="font-poster text-[length:var(--tape-text-xl)] font-black uppercase leading-[0.9] text-tape-cream"
          >
            {t("featuredTitle")}
          </h2>
          <Link
            href="/utwory"
            className="inline-flex min-h-11 items-center gap-2 font-mono text-sm uppercase tracking-[0.14em] text-tape-amber underline-offset-4 hover:underline"
          >
            {t("featuredAll")} <span aria-hidden="true">→</span>
          </Link>
        </div>
        <div className="grid grid-cols-[auto_minmax(0,1fr)] items-start gap-4 rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-panel p-4 shadow-[inset_0_1px_0_#ffffff0d,0_6px_16px_-10px_#000] sm:gap-5 sm:p-5">
          {coverUrl ? (
            // Approved public beat cover, square WebP from our API (no next/image proxy).
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={coverUrl}
              alt={t("featuredCover", { title: work.title })}
              loading="lazy"
              decoding="async"
              width={112}
              height={112}
              className="size-20 shrink-0 border border-tape-line object-cover sm:size-28"
            />
          ) : (
            <span aria-hidden="true" className="tape-rack-screw mt-1" />
          )}
          <div className="min-w-0 space-y-2">
            <p className="font-mono text-sm uppercase tracking-[0.08em] text-tape-amber">{t("featuredBadge")}</p>
            <h3 className="break-words font-poster text-2xl font-bold uppercase leading-none text-tape-cream sm:text-3xl">
              <Link href={`/utwor/${work.id}`} className="underline-offset-4 hover:underline">{work.title}</Link>
            </h3>
            <p className="text-sm text-tape-cream-soft">
              <AuthorName name={work.author} href={work.authorHref} label={catalog("by", { name: work.author })} />
            </p>
            {note ? (
              <p className="max-w-prose border-l-2 border-tape-amber pl-3 text-sm italic leading-relaxed text-tape-cream-soft">
                <span className="sr-only">{t("featuredNote")}: </span>
                {note}
              </p>
            ) : (
              <p className="max-w-prose text-sm leading-relaxed text-tape-cream-soft">{t("featuredLead")}</p>
            )}
            <div className="flex flex-wrap items-center gap-3 pt-1">
              {clip.state === "ready" ? (
                <>
                  <WorkClipButton workId={work.id} title={work.title} errorLabel={t("clipError")} />
                  <span className="text-sm text-tape-cream-soft">{t("clipBadge", { seconds: clip.seconds })}</span>
                </>
              ) : (
                <span className="text-sm text-tape-cream-soft">{t("clipPendingShort")}</span>
              )}
              <Link
                href={`/utwor/${work.id}`}
                className="inline-flex min-h-11 items-center gap-2 font-mono text-sm uppercase tracking-[0.14em] text-tape-amber underline-offset-4 hover:underline"
              >
                {t("featuredOpen")} <span aria-hidden="true">→</span>
              </Link>
            </div>
          </div>
        </div>
      </div>
    </section>
  );
}
