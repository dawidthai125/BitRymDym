import { siteConfig } from "@/config/site";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

/**
 * Minimal application shell — Phase 1.2 scaffold only.
 * No product modules (beats, player, Quick Take, etc.).
 */
export default function HomePage() {
  const supabase = getSupabasePublicEnv();

  return (
    <main className="mx-auto flex min-h-dvh max-w-2xl flex-col justify-center gap-6 px-6 py-16">
      <p className="text-sm tracking-wide text-muted-foreground uppercase">
        Phase 1.2 · Technical bootstrap
      </p>
      <h1 className="text-4xl font-semibold tracking-tight text-balance">
        {siteConfig.name}
      </h1>
      <p className="text-base leading-relaxed text-muted-foreground text-pretty">
        Scaffold aplikacji (Next.js App Router, TypeScript, Tailwind, shadcn/ui
        jako baza, punkt integracji Supabase). Funkcje produktowe nie są jeszcze
        zaimplementowane.
      </p>
      <ul className="space-y-2 text-sm text-muted-foreground">
        <li>Application server: Next.js (OD-02)</li>
        <li>Infrastructure target: Supabase (OD-03)</li>
        <li>
          Supabase env:{" "}
          {supabase.isConfigured ? "configured (local)" : "not configured"}
        </li>
        <li>Design System: foundation tokens only (OD-15 OPEN)</li>
      </ul>
    </main>
  );
}
