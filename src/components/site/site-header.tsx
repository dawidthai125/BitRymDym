import Link from "next/link";

import { BrdLogoHomeLink } from "@/components/brand/brd-logo";
import { PageFrame } from "@/components/brand/chrome";
import { HeaderSearch } from "@/components/site/header-search";
import { UserMenu } from "@/components/site/user-menu";
import {
  canAccessAdminNav,
  canAccessCommunityUpload,
} from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

const navLinkClass =
  "inline-flex min-h-11 items-center px-2.5 text-sm text-[var(--brd-ink-soft)] transition-colors hover:text-[var(--brd-ink)]";

export async function SiteHeader({
  className,
  tone = "public",
}: {
  className?: string;
  tone?: "public" | "studio" | "admin";
}) {
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
    <header
      className={cn(
        "sticky top-0 z-40 border-b border-[var(--brd-line)] bg-[color-mix(in_srgb,var(--brd-paper)_94%,transparent)] backdrop-blur-[2px]",
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

          <nav
            className="hidden items-center lg:flex"
            aria-label="Główne menu"
          >
            <Link href="/beats" className={navLinkClass}>
              Bity
            </Link>
            <Link href="/about" className={navLinkClass}>
              Społeczność
            </Link>
            <Link href="/about" className={navLinkClass}>
              O nas
            </Link>
            <Link href="/studio" className={navLinkClass}>
              Studio
            </Link>
          </nav>
        </div>

        <div className="flex items-center gap-2">
          <HeaderSearch className="hidden sm:block" compact />
          {session ? (
            <UserMenu
              displayName={displayName}
              email={session.email}
              showAdmin={showAdmin}
              showUpload={showUpload}
            />
          ) : (
            <>
              <Link
                href="/sign-in"
                className={cn(navLinkClass, "hidden sm:inline-flex")}
              >
                Zaloguj
              </Link>
              <Link
                href="/sign-up"
                className="inline-flex min-h-11 items-center border border-[var(--brd-green)] bg-[var(--brd-green)] px-3.5 text-sm text-[var(--brd-paper)]"
              >
                Dołącz
              </Link>
            </>
          )}
        </div>
      </PageFrame>
    </header>
  );
}
