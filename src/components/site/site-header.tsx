import Link from "next/link";

import { siteConfig } from "@/config/site";
import {
  canAccessAdminNav,
  canAccessModerationNav,
} from "@/lib/auth/permissions";
import { getCurrentProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

/** W6.2: ≥44×44 CSS px hit area without hamburger/sheet redesign. */
const navLinkClass =
  "inline-flex min-h-11 min-w-11 items-center px-2.5 py-2 underline-offset-4 hover:text-foreground hover:underline";

export async function SiteHeader({
  className,
}: {
  className?: string;
}) {
  const session = await getCurrentProfile();
  const role = session?.profile.role;
  const showAdminNav = canAccessAdminNav(role);
  const showModerationNav = canAccessModerationNav(role);
  const showMyBeats = role === "USER";

  return (
    <header
      className={cn(
        "border-b border-border/80 bg-background/90 backdrop-blur-sm",
        className,
      )}
    >
      <div
        className={cn(
          "mx-auto flex w-full max-w-3xl items-center justify-between gap-3 py-3",
          "pl-[max(1.5rem,env(safe-area-inset-left))] pr-[max(1.5rem,env(safe-area-inset-right))]",
          "pt-[max(0.75rem,env(safe-area-inset-top))]",
        )}
      >
        <Link
          href="/"
          className="inline-flex min-h-11 items-center text-sm font-semibold tracking-tight text-foreground"
        >
          {siteConfig.name}
        </Link>
        <nav className="flex flex-wrap items-center gap-x-1 gap-y-0 text-sm text-muted-foreground">
          <Link href="/beats" className={navLinkClass}>
            Bity
          </Link>
          {session ? (
            <>
              {showMyBeats ? (
                <Link href="/account/beats" className={navLinkClass}>
                  Moje bity
                </Link>
              ) : null}
              <Link href="/account/takes" className={navLinkClass}>
                Moje próbki
              </Link>
              {showModerationNav && !showAdminNav ? (
                <Link href="/admin/moderation" className={navLinkClass}>
                  Moderacja
                </Link>
              ) : null}
              {showAdminNav ? (
                <Link href="/admin" className={navLinkClass}>
                  Panel administratora
                </Link>
              ) : null}
              <Link href="/account/downloads" className={navLinkClass}>
                Pobrane
              </Link>
              <Link href="/account" className={navLinkClass}>
                Konto
              </Link>
            </>
          ) : (
            <Link href="/sign-in" className={navLinkClass}>
              Zaloguj
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
