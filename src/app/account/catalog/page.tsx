import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { MyListings } from "@/components/account/my-listings";
import { PageFrame } from "@/components/brand/chrome";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listMyListings } from "@/lib/community/listing-service";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("community.consents");
  return { title: t("pageTitle") };
}

const SECTIONS = [
  { kind: "beat", addHref: "/account/beats" },
  { kind: "sample", addHref: "/studio/sample" },
  { kind: "work", addHref: "/studio" },
] as const;

/** One place where the author decides what is in the catalogue and in the ranking. */
export default async function AccountCatalogPage() {
  const t = await getTranslations("community.consents");
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") redirect(signInPathWithNext("/account/catalog"));
    redirect("/account");
  }
  const listings = await listMyListings(userId);
  return (
    <main className="pb-16">
      <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
        <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("pageTitle")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("pageLead")}</p>
        </header>
        {SECTIONS.map(({ kind, addHref }) => (
          <section key={kind} aria-labelledby={`listing-${kind}`} className="flex flex-col gap-3">
            <h2 id={`listing-${kind}`} className="text-lg font-semibold">
              {t(`section.${kind}`)} <span className="text-sm font-normal text-[var(--brd-mute)]">({listings[kind].length})</span>
            </h2>
            {listings[kind].length === 0 ? (
              <p className="text-sm text-[var(--brd-mute)]">
                {t(`empty.${kind}`)}{" "}
                <Link href={addHref} className="underline underline-offset-4">{t(`add.${kind}`)}</Link>
              </p>
            ) : (
              <MyListings items={listings[kind]} />
            )}
          </section>
        ))}
        <p className="max-w-prose text-xs text-[var(--brd-mute)]">{t("recordingsNote")}</p>
      </PageFrame>
    </main>
  );
}
