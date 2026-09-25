import Link from "next/link";

import { SiteHeader } from "@/components/site/site-header";
import { siteConfig } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Application home — Phase 1.6 points to published beats surface.
 */
export default async function HomePage() {
  const supabase = getSupabasePublicEnv();
  const session = await getCurrentProfile();

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_95)_0%,_var(--background)_55%)]">
      <SiteHeader />
      <main className="mx-auto flex max-w-2xl flex-col justify-center gap-6 px-6 py-16">
        <p className="text-xs tracking-[0.18em] text-muted-foreground uppercase">
          Phase 1.6 · Published Beats + Playback Shell
        </p>
        <h1 className="text-4xl font-semibold tracking-tight text-balance">
          {siteConfig.name}
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground text-pretty">
          Publiczny katalog opublikowanych bitów i odsłuch przez Access Gate
          (PLAYBACK). Download, Quick Take i waveform pozostają poza tym etapem.
        </p>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>
            Supabase env:{" "}
            {supabase.isConfigured ? "configured (local)" : "not configured"}
          </li>
          <li>
            Session:{" "}
            {session
              ? `${session.profile.role} / ${session.profile.accountLevel}`
              : "anonymous"}
          </li>
        </ul>
        <div className="flex flex-wrap gap-3 text-sm">
          <Link href="/beats" className="underline underline-offset-4">
            Przeglądaj bity
          </Link>
          {session ? (
            <Link href="/account" className="underline underline-offset-4">
              Konto
            </Link>
          ) : (
            <>
              <Link href="/sign-in" className="underline underline-offset-4">
                Zaloguj się
              </Link>
              <Link href="/sign-up" className="underline underline-offset-4">
                Załóż konto
              </Link>
            </>
          )}
        </div>
      </main>
    </div>
  );
}
