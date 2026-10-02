import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/site/app-shell";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata = { title: "Ulubione" };

export default async function LibraryFavoritesPage() {
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>Biblioteka</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">Ulubione</h1>
          <p className="mt-3 max-w-prose text-sm text-[var(--brd-ink-soft)]">
            Lista ulubionych bitów pojawi się w kolejnej wersji. Na razie możesz
            wracać do katalogu i studia.
          </p>
          <Link
            href="/beats"
            className="mt-6 inline-flex min-h-11 items-center text-[var(--brd-green)] hover:underline"
          >
            Przeglądaj bity →
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
