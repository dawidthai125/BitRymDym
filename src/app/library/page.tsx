import Link from "next/link";
import { redirect } from "next/navigation";

import { AppShell } from "@/components/site/app-shell";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { getCurrentProfile } from "@/lib/auth/session";

export const metadata = { title: "Biblioteka" };

export default async function LibraryPage() {
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>Biblioteka</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">
            Twoja biblioteka
          </h1>
          <ul className="mt-8 divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
            <LibLink href="/studio/recordings" title="Nagrania" meta="Twoje próby" />
            <LibLink href="/library/downloads" title="Pobrane" meta="Pobrane bity" />
            <LibLink
              href="/library/favorites"
              title="Ulubione"
              meta="Wkrótce"
            />
            <LibLink href="/account/shared" title="Udostępnione" meta="Bity od innych" />
          </ul>
        </PageFrame>
      </main>
    </AppShell>
  );
}

function LibLink({
  href,
  title,
  meta,
}: {
  href: string;
  title: string;
  meta: string;
}) {
  return (
    <li>
      <Link
        href={href}
        className="flex min-h-12 items-center justify-between py-3 hover:text-[var(--brd-green)]"
      >
        <div>
          <p className="font-medium">{title}</p>
          <p className="text-sm text-[var(--brd-mute)]">{meta}</p>
        </div>
        <span aria-hidden>→</span>
      </Link>
    </li>
  );
}
