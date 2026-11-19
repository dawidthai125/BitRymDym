import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { OwnTakesList } from "@/components/takes/own-takes-list";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listPurchasedBeatIds } from "@/lib/beats/purchased-catalog";
import { listOwnTakes } from "@/lib/takes/list-own-takes";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.accountTakesPage");
  return {
  title: t("metaTitle"),
};
}

export default async function AccountTakesPage() {
  const t = await getTranslations("account.accountTakesPage");
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const [takes, purchasedBeatIds] = await Promise.all([
    // Usunięte nagrania znikają z listy (nie zostają z etykietą „usunięte”).
    listOwnTakes({ includeDeleted: false }),
    listPurchasedBeatIds(userId),
  ]);

  return (
      <main
        data-brd-surface="control-room"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <SectionLabel className="text-[var(--brd-amber)]">
              {t("archiwumSesji")}
            </SectionLabel>
            <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">
              {t("mojeNagrania")}
            </h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">
              {t("podgladPobieranieUsuwanieTylko")}
            </p>
          </header>

          <OwnTakesList items={takes} purchasedBeatIds={purchasedBeatIds} />

          <div className="flex flex-wrap gap-4 text-sm">
            <Link
              href="/studio"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("studio")}
            </Link>
            <Link
              href="/account"
              className="text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
            >
              {t("konto")}
            </Link>
          </div>
        </PageFrame>
      </main>
  );
}
