import { getTranslations } from "next-intl/server";
import Link from "next/link";

import { BrdLogoHomeLink } from "@/components/brand/brd-logo";
import { PageFrame } from "@/components/brand/chrome";
import { HeaderSearch } from "@/components/site/header-search";
import { SiteMainNav } from "@/components/site/site-main-nav";
import { siteNavLinkClass } from "@/components/site/site-nav-active";
import { SkipToMainContent } from "@/components/site/skip-to-main";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { PlanBadge } from "@/components/plans/plan-badge";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { UserMenu } from "@/components/site/user-menu";
import {
  canAccessAdminNav,
  canAccessCommunityUpload,
} from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function SiteHeader({
  className,
  tone = "public",
}: {
  className?: string;
  tone?: "public" | "studio" | "admin";
}) {
  const t = await getTranslations("nav.siteHeader");
  const session = await getCurrentProfile();
  const role = session?.profile.role;
  const showAdmin = canAccessAdminNav(role);
  // Community upload is USER-only; do not advertise /beats/upload to ADMIN
  // (page requireRole(["USER"]) would otherwise bounce staff to /account).
  const showUpload = canAccessCommunityUpload(role);
  const rawName =
    session?.profile.displayName?.trim() ||
    session?.email?.split("@")[0] ||
    "Konto";
  const displayName = /grantee|fixture|mock|test|uuid|[0-9a-f]{8}/i.test(
    rawName,
  )
    ? "Konto"
    : rawName;

  return (
    <>
      <SkipToMainContent />
      <header
        className={cn(
          "sticky top-0 z-40 border-b border-[var(--brd-line)] bg-[var(--brd-paper)] shadow-[0_1px_0_0_rgba(0,0,0,0.6)]",
          className,
        )}
      >
      <PageFrame
        width={tone === "admin" ? "ops" : "wide"}
        className={cn(
          "flex items-center justify-between gap-3 py-2.5",
          "pt-[max(0.65rem,env(safe-area-inset-top))]",
        )}
      >
        <div className="flex min-w-0 items-center gap-1 sm:gap-2">
          <BrdLogoHomeLink />

          <SiteMainNav />
        </div>

        <div className="flex items-center gap-1.5 sm:gap-2">
          <HeaderSearch className="hidden sm:block" compact />
          {/* Motyw bezpośrednio przy Zaloguj / menu konta — także na mobile */}
          <LanguageSwitcher className="hidden shrink-0 md:inline-flex" />
          <ThemeToggle className="shrink-0" />
          {session ? (
            <PlanBadge userKey={session.userId} />
          ) : null}
          {session ? (
            <UserMenu
              displayName={displayName}
              email={session.email}
              showAdmin={showAdmin}
              showUpload={showUpload}
            />
          ) : (
            <>
              <Link href="/sign-in" className={siteNavLinkClass}>
                {t("zaloguj")}
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex min-h-11 items-center rounded-[var(--tape-r-panel)] border border-[var(--brd-green)] bg-[var(--brd-green)] px-3 font-poster text-base font-extrabold uppercase tracking-[0.1em] text-[var(--primary-foreground)] shadow-[0_3px_0_0_var(--brd-green-muted)] transition-[transform,box-shadow] duration-[var(--tape-dur-fast)] active:translate-y-[3px] active:shadow-none sm:px-4"
              >
                {t("dolacz")}
              </Link>
            </>
          )}
        </div>
      </PageFrame>
    </header>
    </>
  );
}
