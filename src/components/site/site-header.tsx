import Link from "next/link";

import { siteConfig } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function SiteHeader({
  className,
}: {
  className?: string;
}) {
  const session = await getCurrentProfile();

  return (
    <header
      className={cn(
        "border-b border-border/80 bg-background/90 backdrop-blur-sm",
        className,
      )}
    >
      <div className="mx-auto flex w-full max-w-3xl items-center justify-between gap-4 px-6 py-4">
        <Link
          href="/"
          className="text-sm font-semibold tracking-tight text-foreground"
        >
          {siteConfig.name}
        </Link>
        <nav className="flex flex-wrap items-center gap-4 text-sm text-muted-foreground">
          <Link
            href="/beats"
            className="underline-offset-4 hover:text-foreground hover:underline"
          >
            Bity
          </Link>
          {session ? (
            <>
              {session.profile.role === "ADMIN" ? (
                <Link
                  href="/admin/beats"
                  className="underline-offset-4 hover:text-foreground hover:underline"
                >
                  Admin
                </Link>
              ) : null}
              <Link
                href="/account"
                className="underline-offset-4 hover:text-foreground hover:underline"
              >
                Konto
              </Link>
            </>
          ) : (
            <Link
              href="/sign-in"
              className="underline-offset-4 hover:text-foreground hover:underline"
            >
              Zaloguj
            </Link>
          )}
        </nav>
      </div>
    </header>
  );
}
