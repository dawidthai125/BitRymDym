import { getLocale, getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import {
  MAIN_CONTENT_ID,
  MAIN_CONTENT_LANDMARK_CLASS,
} from "@/components/site/skip-to-main";
import { AuthError, requireUser } from "@/lib/auth/session";
import { listActiveGranteeGrantsFor } from "@/lib/grants/beat-access-grants";
import { cn } from "@/lib/utils";
import { intlTag, resolveLocale } from "@/i18n/config";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.accountSharedPage");
  return {
  title: t("metaTitle"),
};
}

export default async function AccountSharedBeatsPage() {
  const t = await getTranslations("account.accountSharedPage");
  const tag = intlTag(resolveLocale(await getLocale()));
  let context;
  try {
    context = await requireUser();
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect("/sign-in");
    }
    redirect("/account");
  }

  const grants = await listActiveGranteeGrantsFor(context);

  return (
    <div className="min-h-dvh bg-background">
      <SiteHeader />
      <main
        id={MAIN_CONTENT_ID}
        tabIndex={-1}
        className={cn(
          "mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-12",
          MAIN_CONTENT_LANDMARK_CLASS,
        )}
      >
        <header className="space-y-2">
          <h1 className="text-3xl font-semibold tracking-tight">
            {t("bityUdostepnione")}
          </h1>
          <p className="text-sm text-muted-foreground">
            {t("bityNaKtorychWlasciciele")}
          </p>
        </header>

        {grants.length === 0 ? (
          <p className="text-sm text-muted-foreground">
            {t("nieMaszAktywnychUdostepnien")}
          </p>
        ) : (
          <ul className="divide-y divide-border border-y border-border">
            {grants.map((g) => (
              <li
                key={g.id}
                className="flex flex-col gap-2 py-5 sm:flex-row sm:items-center sm:justify-between"
              >
                <div className="space-y-1">
                  <p className="font-medium tracking-tight">{g.beatTitle}</p>
                  <p className="text-xs text-muted-foreground">
                    {t("nagrywanie")}
                    {g.expiresAt
                      ? t("wygasa", { v0: new Date(g.expiresAt).toLocaleString(tag) })
                      : t("bezterminowy")}
                  </p>
                </div>
                <Link
                  href={`/beat/${g.beatId}`}
                  className="text-sm font-medium underline underline-offset-4"
                >
                  {t("otworzINagraj")}
                </Link>
              </li>
            ))}
          </ul>
        )}

        <Link
          href="/account"
          className="text-sm text-muted-foreground underline-offset-4 hover:underline"
        >
          {t("konto")}
        </Link>
      </main>
    </div>
  );
}
