import Link from "next/link";
import { redirect } from "next/navigation";

import { SiteHeader } from "@/components/site/site-header";
import { getCurrentProfile } from "@/lib/auth/session";
import { listMyDownloadHistory } from "@/lib/downloads/history";
import { getSupabasePublicEnv } from "@/lib/supabase/env";

function formatDownloadedAt(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleString("pl-PL", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "UTC",
  });
}

export default async function MyDownloadsPage() {
  const env = getSupabasePublicEnv();
  if (!env.isConfigured) {
    return (
      <main className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-4 px-6">
        <h1 className="text-2xl font-semibold">Moje pobrane</h1>
        <p className="text-sm text-muted-foreground">
          Supabase nie jest skonfigurowane lokalnie.
        </p>
        <Link href="/" className="text-sm underline underline-offset-4">
          Strona główna
        </Link>
      </main>
    );
  }

  const context = await getCurrentProfile();
  if (!context) {
    redirect("/sign-in");
  }

  const items = await listMyDownloadHistory();

  return (
    <div className="min-h-dvh bg-[radial-gradient(ellipse_at_top,_oklch(0.97_0.01_95)_0%,_var(--background)_55%)]">
      <SiteHeader />
      <main className="mx-auto flex w-full max-w-3xl flex-col gap-8 px-6 py-10">
        <div className="space-y-2">
          <Link
            href="/account"
            className="w-fit text-sm text-muted-foreground underline-offset-4 hover:text-foreground hover:underline"
          >
            ← Konto
          </Link>
          <h1 className="text-3xl font-semibold tracking-tight">Moje pobrane</h1>
          <p className="text-sm text-muted-foreground">
            Minimalna historia pobrań zalogowanego konta.
          </p>
        </div>

        {items.length === 0 ? (
          <p className="text-sm text-muted-foreground" role="status">
            Nie pobrano jeszcze żadnych bitów.
          </p>
        ) : (
          <ul className="divide-y divide-border/80 border-y border-border/80">
            {items.map((item) => (
              <li key={item.beatId} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between">
                <div className="space-y-1">
                  <Link
                    href={`/beat/${item.beatId}`}
                    className="font-medium underline-offset-4 hover:underline"
                  >
                    {item.title}
                  </Link>
                  {item.producer ? (
                    <p className="text-sm text-muted-foreground">{item.producer}</p>
                  ) : null}
                </div>
                <time
                  className="text-xs text-muted-foreground tabular-nums"
                  dateTime={item.lastDownloadedAt}
                >
                  {formatDownloadedAt(item.lastDownloadedAt)} UTC
                </time>
              </li>
            ))}
          </ul>
        )}
      </main>
    </div>
  );
}
