import { getLibText } from "@/i18n/get-lib-text";
import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";
import { BeatsCatalogClient } from "@/components/brand/beats-catalog-client";
import { PurchasedCatalogList } from "@/components/beats/purchased-catalog-list";
import { PageFrame } from "@/components/brand/chrome";
import { CommunityShelf, CommunitySource } from "@/components/community/community-shelf";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { catalogLaneOf } from "@/lib/beats/catalog-lane";
import { listFavoriteBeatIds } from "@/lib/beats/favorites";
import { listPurchasedCatalog } from "@/lib/beats/purchased-catalog";
import { toPublicCatalogItem } from "@/lib/beats/public";
import { listPublishedBeats } from "@/lib/beats/service";
import { getCurrentProfile } from "@/lib/auth/session";
import { isStoreApp } from "@/lib/site/store-app-server";
import { parseCatalogPage } from "@/lib/ui/paginate";
import { presentBeats } from "@/lib/ui/demo-beats";
import { beatListJsonLd } from "@/lib/seo/json-ld";
import { JsonLdScript } from "@/lib/seo/json-ld-script";
import { getPublicSiteUrl } from "@/lib/site-url";
import { collectGenres, genrePagePath } from "@/lib/seo/genre-pages";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("beats.beatsPage");
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription"), path: "/beats" });
}

type BeatsPageProps = {
  searchParams?: Promise<{ q?: string; zrodlo?: string; katalog?: string; strona?: string }>;
};

export default async function BeatsCatalogPage({ searchParams }: BeatsPageProps) {
  const tl = await getLibText();
  const t = await getTranslations("beats.beatsPage");
  const catalog = await getTranslations("community.catalog");
  const seoTitle = (await getTranslations("beats.genrePage"))("okruszekBity");
  const params = searchParams ? await searchParams : {};
  const source = params.zrodlo === "user" ? "USER" : "PLATFORM";
  const mine = params.katalog === "moj";
  const paid = !mine && params.katalog === "platny";
  const lane = paid ? "paid" : "free";
  const session = await getCurrentProfile();
  const page = parseCatalogPage(params.strona);
  const pageQuery = new URLSearchParams({
    ...(paid ? { katalog: "platny" } : {}),
    ...(source === "USER" ? { zrodlo: "user" } : {}),
    ...(typeof params.q === "string" && params.q ? { q: params.q.slice(0, 80) } : {}),
  }).toString();
  const storeApp = await isStoreApp();
  // Store apps (Google Play / App Store) sell nothing: no paid catalogue there (exclusive beats are bought on the web).
  if (storeApp && paid) redirect("/beats");
  if (mine && !session) redirect(signInPathWithNext("/beats?katalog=moj"));
  const [listed, purchased] = await Promise.all([
    mine ? Promise.resolve([]) : listPublishedBeats({ catalogLane: lane, ownershipType: source }),
    mine && session ? listPurchasedCatalog(session.userId) : Promise.resolve([]),
  ]);
  const raw = listed
    .filter((beat) => beat.ownershipType === source)
    .filter((beat) => catalogLaneOf(beat.catalogLane) === lane)
    .map(toPublicCatalogItem);
  const favoriteIds = session ? await listFavoriteBeatIds(session.userId) : [];
  const beats = presentBeats(raw);
  const genreLinks = !mine && !paid ? collectGenres(beats) : [];
  const initialQuery =
    typeof params.q === "string" ? params.q.trim().slice(0, 80) : "";

  return (
    <AppShell tone="public">
      <main data-surface="tape" className="tape-grain">
        {/* Canonical /beats view only (free platform catalogue); filtered variants share the canonical URL. */}
        {!mine && !paid && source === "PLATFORM" && beats.length > 0 ? (
          <JsonLdScript data={beatListJsonLd(getPublicSiteUrl(), { name: seoTitle, path: "/beats", beats })} />
        ) : null}
        <PageFrame width="wide" className="py-5 sm:py-6">
          <CommunityShelf current="beats" />
          <CommunitySource kind="beats" source={source === "USER" ? "user" : "brd"} />
          <header className="mb-6 flex flex-wrap items-end justify-between gap-x-6 gap-y-3 border-b-4 border-[var(--brd-ink)] pb-4 pt-4 sm:pt-8">
            <div className="min-w-0 space-y-1">
              <h1 className="brd-display text-[length:var(--tape-text-xl)] leading-[0.88]">
                {t("znajdzSwojBit")}
              </h1>
              <p className="brd-meta pt-2 text-xs uppercase tracking-[0.14em] text-[var(--brd-green)]">
                {tl(beats.length > 0
                  ? t("bitowSluchajPotemNagraj", { v0: beats.length })
                  : t("cichoKatalogWDrodze"))}
              </p>
            </div>
            <p className="max-w-xs pb-1 font-[family-name:var(--font-display)] text-lg italic leading-snug text-[var(--brd-ink-soft)]">
              {t("czystaListaBitowBez")}{" "}
              <Link href="/nagrywarka" className="underline underline-offset-4">{t("programWindows")}</Link>
            </p>
          </header>

          <nav aria-label={t("katalogiAria")} className="mb-5 flex flex-wrap gap-2" data-testid="beats-catalog-tabs">
            <Link
              href="/beats"
              aria-current={!paid && !mine ? "page" : undefined}
              className={`border-2 border-[var(--brd-ink)] px-4 py-2 text-sm font-semibold ${!paid && !mine ? "bg-[var(--brd-ink)] text-[var(--brd-paper)]" : ""}`}
            >
              {t("darmowyKatalog")}
            </Link>
{storeApp ? null : (
            <Link
              href="/beats?katalog=platny"
              aria-current={paid ? "page" : undefined}
              className={`border-2 border-[var(--brd-ink)] px-4 py-2 text-sm font-semibold ${paid ? "bg-[var(--brd-ink)] text-[var(--brd-paper)]" : ""}`}
            >
              {t("platnyKatalog")}
            </Link>
            )}
            {session ? (
              <Link
                href="/beats?katalog=moj"
                aria-current={mine ? "page" : undefined}
                className={`border-2 border-[var(--brd-ink)] px-4 py-2 text-sm font-semibold ${mine ? "bg-[var(--brd-ink)] text-[var(--brd-paper)]" : ""}`}
              >
                {t("mojKatalog")}
              </Link>
            ) : null}
          </nav>

          {genreLinks.length > 0 ? (
            <nav
              aria-label={t("gatunkiAria")}
              className="-mt-2 mb-4 flex flex-wrap items-center gap-x-3 text-sm text-[var(--brd-mute)]"
              data-testid="beats-genre-links"
            >
              <span>{t("gatunki")}</span>
              {genreLinks.map((g) => (
                <Link
                  key={g.slug}
                  href={genrePagePath(g.slug)}
                  className="inline-flex min-h-11 items-center underline underline-offset-4 hover:text-[var(--brd-ink)]"
                >
                  {g.label}
                </Link>
              ))}
            </nav>
          ) : null}

          {mine ? (
            <div className="space-y-6">
              <div className="border border-[var(--brd-line)] px-5 py-5" data-testid="beats-my-catalog">
                <p className="brd-display text-xl font-semibold">{t("mojKatalog")}</p>
                <p className="mt-2 max-w-xl text-sm text-[var(--brd-mute)]">{t("mojOpis")}</p>
              </div>
              <PurchasedCatalogList beats={purchased} />
            </div>
          ) : paid ? (
            <div className="space-y-6">
              <div className="border border-[var(--brd-line)] px-5 py-5" data-testid="beats-paid-catalog">
                <p className="brd-display text-xl font-semibold">{t("platnyTytul")}</p>
                {storeApp ? (
                  // Store app: no price, no PayU (store rules).
                  <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--brd-mute)]">{t("platnyOpisSklep")}</p>
                ) : (
                  <>
                    <p className="mx-auto mt-2 max-w-xl text-sm text-[var(--brd-mute)]">{t("platnyOpis")}</p>
                    <p className="mt-3 text-sm font-semibold">{t("platnyWkrotce")}</p>
                    <p className="mt-3 text-sm text-[var(--brd-mute)]">{t("platnyZakup")}</p>
                  </>
                )}
              </div>
              {beats.length > 0 ? (
                <BeatsCatalogClient
                key={pageQuery}
                  beats={beats}
                  initialQuery={initialQuery}
                  favoriteIds={favoriteIds}
                  signedIn={session != null}
                  initialPage={page}
                  pageQuery={pageQuery}
                />
              ) : null}
            </div>
          ) : beats.length === 0 ? (
            <div className="border border-[var(--brd-line)] px-5 py-12 text-center">
              <p className="brd-display text-xl font-semibold">{t("cicho")}</p>
              <p className="mt-2 text-sm text-[var(--brd-mute)]">
                {source === "USER" ? catalog("emptyUser") : catalog("emptyBrd")}
              </p>
            </div>
          ) : (
            <BeatsCatalogClient
                key={pageQuery}
              beats={beats}
              initialQuery={initialQuery}
              favoriteIds={favoriteIds}
              signedIn={session != null}
              initialPage={page}
              pageQuery={pageQuery}
            />
          )}
        </PageFrame>
      </main>
    </AppShell>
  );
}
