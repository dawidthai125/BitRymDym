import { getTranslations } from "next-intl/server";
import Link from "@/components/ui/app-link";
import { redirect } from "next/navigation";

import { PageFrame } from "@/components/brand/chrome";
import { PublicProfileForm } from "@/components/creators/public-profile-form";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";
import { loadOwnProfile } from "@/lib/creators/creator-profile-server";
import { NO_SHARES } from "@/lib/creators/profile-policy";
import { absoluteUrl } from "@/lib/share/share-links";
import { getPublicSiteUrl } from "@/lib/site-url";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.publicProfile");
  return { title: t("metaTitle") };
}

export default async function PublicProfileSettingsPage() {
  const t = await getTranslations("account.publicProfile");
  let userId: string;
  try {
    userId = (await requireUser()).userId;
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") redirect(signInPathWithNext("/account/profil"));
    redirect("/account");
  }
  const own = await loadOwnProfile(userId);
  return (
    <main className="pb-16">
      <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
        <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
          <h1 className="brd-display text-3xl font-semibold tracking-tight sm:text-4xl">{t("title")}</h1>
          <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("lead")}</p>
        </header>
        {own.state === "off" ? (
          <p role="status" className="text-sm text-[var(--brd-mute)]" data-testid="public-profile-off">{t("unavailable")}</p>
        ) : (
          <>
            {own.displayName ? null : (
              <p role="status" className="text-sm">
                {t("noName")}{" "}
                <Link href="/account/settings#profil" className="underline underline-offset-4">{t("setName")}</Link>
              </p>
            )}
            <PublicProfileForm
              hasName={Boolean(own.displayName)}
              initial={{
                enabled: own.settings?.enabled ?? false,
                blocked: own.settings?.blocked ?? false,
                links: own.settings?.links ?? {},
                share: own.settings?.share ?? NO_SHARES,
              }}
              path={own.path}
              siteUrl={absoluteUrl(getPublicSiteUrl(), "/")}
            />
            <p className="text-sm text-[var(--brd-ink-soft)]">
              {t("catalogHint")}{" "}
              <Link href="/account/catalog" className="underline underline-offset-4">{t("catalogLink")}</Link>
            </p>
          </>
        )}
      </PageFrame>
    </main>
  );
}
