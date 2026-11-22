import Link from "next/link";
import { redirect } from "next/navigation";
import { getTranslations } from "next-intl/server";

import { PageFrame } from "@/components/brand/chrome";
import { MasterOnlyPanel } from "@/components/mastering/master-only-panel";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { resolveProductEntitlementForAuthContext } from "@/lib/audio/load-premium-entitlement";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { AuthError, requireUser } from "@/lib/auth/session";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const m = await getTranslations("meta.pages");
  return pageMetadata({ title: m("masteringTitle"), description: m("masteringDescription"), path: "/mastering" });
}

export default async function MasteringPage() {
  let tier: "FREE" | "BRONZE" | "SILVER" | "GOLD" = "FREE";
  try {
    const auth = await requireUser();
    tier = (await resolveProductEntitlementForAuthContext(auth)).premiumTier;
  } catch (error) {
    if (error instanceof AuthError && error.code === "UNAUTHENTICATED") {
      redirect(signInPathWithNext("/mastering"));
    }
    redirect("/account");
  }

  const t = await getTranslations("mastering");
  const tNav = await getTranslations("nav.items");

  return (
    <AppShell tone="studio">
      <main
        data-brd-surface="control-room"
        data-surface="tape"
        className="min-h-[calc(100dvh-4.5rem)] pb-16"
        data-testid="mastering-page"
      >
        <PageFrame className="flex flex-col gap-8 py-10 sm:py-12">
          <header className="space-y-2 border-b border-[var(--brd-line)] pb-6">
            <h1 className="brd-display text-4xl tracking-tight sm:text-6xl">{tNav("mastering")}</h1>
            <p className="max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("intro")}</p>
          </header>
          <MasterOnlyPanel tier={tier} />
          <Link
            href="/studio"
            className="text-sm text-[var(--brd-mute)] underline-offset-4 hover:text-[var(--brd-ink)] hover:underline"
          >
            {tNav("studio")}
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
