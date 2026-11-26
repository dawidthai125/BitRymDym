import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import { PurchasedWavButton } from "@/components/beats/purchased-wav-button";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame } from "@/components/brand/chrome";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { getCurrentProfile } from "@/lib/auth/session";
import { listPurchasedCatalog } from "@/lib/beats/purchased-catalog";
import { isStoreApp } from "@/lib/site/store-app-server";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.purchasedPage");
  return { title: t("title") };
}

export default async function AccountPurchasedPage() {
  const session = await getCurrentProfile();
  if (!session) redirect(signInPathWithNext("/account/purchased"));
  const t = await getTranslations("account.purchasedPage");
  // Store apps show no way to buy.
  const storeApp = await isStoreApp();
  const beats = await listPurchasedCatalog(session.userId);

  return (
    <main className="pb-16">
      <PageFrame className="flex max-w-3xl flex-col gap-6 py-10">
        <header className="space-y-2">
          <h1 className="brd-display text-3xl font-semibold tracking-tight">{t("title")}</h1>
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("lead")}</p>
        </header>
        {beats.length === 0 ? (
          <div className="space-y-4 border border-[var(--brd-line)] p-5">
            <p className="text-sm text-[var(--brd-mute)]">{t("empty")}</p>
            {storeApp ? null : <BrdLink href="/beats?katalog=platny">{t("browsePaid")}</BrdLink>}
          </div>
        ) : (
          <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
            {beats.map((beat) => (
              <li key={beat.id} className="flex flex-wrap items-center justify-between gap-3 py-4">
                <div className="min-w-0">
                  <Link href={`/beat/${beat.id}`} className="inline-flex min-h-11 items-center font-medium underline-offset-4 hover:underline">
                    {beat.title}
                  </Link>
                  <p className="text-sm text-[var(--brd-mute)]">
                    {[beat.producer, `${beat.bpm} BPM`].filter(Boolean).join(" · ")}
                  </p>
                </div>
                <PurchasedWavButton beatId={beat.id} title={beat.title} />
              </li>
            ))}
          </ul>
        )}
      </PageFrame>
    </main>
  );
}
