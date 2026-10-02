import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/site/app-shell";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata = { title: "Ustawienia" };

export default async function SettingsPage() {
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>Konto</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">Ustawienia</h1>
          <p className="mt-3 text-sm text-[var(--brd-ink-soft)]">
            Pełne ustawienia pojawią się w kolejnej fali. Na razie edytuj profil
            w studio.
          </p>
          <Link
            href="/account#profil"
            className="mt-6 inline-flex min-h-11 text-[var(--brd-green)] hover:underline"
          >
            Przejdź do profilu →
          </Link>
        </PageFrame>
      </main>
    </AppShell>
  );
}
