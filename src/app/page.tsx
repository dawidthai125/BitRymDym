import Link from "next/link";

import { siteConfig } from "@/config/site";
import { getCurrentProfile } from "@/lib/auth/session";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Application shell — Phase 1.3 identity foundation links.
 * No product modules (beats, player, Quick Take, etc.).
 */
export default async function HomePage() {
  const supabase = getSupabasePublicEnv();
  const session = await getCurrentProfile();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm tracking-wide text-muted-foreground uppercase">
        Phase 1.3 · Identity & access
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        {siteConfig.name}
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground text-pretty">
        Fundament tożsamości: Supabase Auth, profile, role, permissions, account
        level. Funkcje produktowe (bity, player, Quick Take) nie są jeszcze
        zaimplementowane.
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
  );
}
