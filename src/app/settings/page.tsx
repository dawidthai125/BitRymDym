import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { getCurrentProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export const metadata = { title: "Ustawienia" };

/**
 * Settings is a navigation hub only — no new preferences or product rules.
 * Every destination below must already exist as a working surface.
 */
const SETTINGS_HUB_LINKS = [
  {
    group: "Konto",
    items: [
      {
        href: "/account#profil",
        title: "Profil i ksywka",
        description: "Nazwa wyświetlana, e-mail i podsumowanie planu.",
      },
      {
        href: "/account#security",
        title: "Bezpieczeństwo",
        description: "Zmiana e-maila, hasła oraz reset hasła przez e-mail.",
      },
      {
        href: "/account#danger",
        title: "Usuwanie konta",
        description: "Trwałe usunięcie konta — istniejący formularz na koncie.",
      },
    ],
  },
  {
    group: "Konto — powiązane ekrany",
    items: [
      {
        href: "/account",
        title: "Przegląd konta",
        description: "Studio, biblioteka i skróty do nagrań oraz bitów.",
      },
      {
        href: "/account/takes",
        title: "Moje nagrania",
        description: "Lista własnych nagrań.",
      },
      {
        href: "/account/beats",
        title: "Moje bity",
        description: "Wgrane bity i status moderacji.",
      },
      {
        href: "/account/downloads",
        title: "Pobrane bity",
        description: "Historia pobrań.",
      },
      {
        href: "/account/shared",
        title: "Bity udostępnione",
        description: "Bity, na których masz aktywne udostępnienie do nagrania.",
      },
      {
        href: "/premium",
        title: "Premium — limity",
        description:
          "Informacja o poziomach i limitach. Zakup w aplikacji nie jest dostępny.",
      },
    ],
  },
] as const;

export default async function SettingsPage() {
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>Konto</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">Ustawienia</h1>
          <p className="mt-3 max-w-[42ch] text-sm text-[var(--brd-ink-soft)]">
            Ta strona prowadzi do istniejących ustawień i ekranów konta. Nie
            dodaje nowych opcji — formularze i przełączniki działają w miejscach
            docelowych (albo tutaj, przy motywie).
          </p>

          <section
            aria-labelledby="settings-theme"
            className="mt-8 border border-[var(--brd-line)] p-5"
          >
            {/* Decorative eyebrow — announced name is the h2 below. */}
            <div aria-hidden="true">
              <SectionLabel>Wygląd</SectionLabel>
            </div>
            <h2
              id="settings-theme"
              className="mt-2 text-lg font-semibold tracking-tight"
            >
              Motyw
            </h2>
            <p className="mt-1 max-w-[40ch] text-sm text-[var(--brd-ink-soft)]">
              Ten sam przełącznik co w nagłówku — jasny albo ciemny motyw w
              przeglądarce.
            </p>
            <div className="mt-4">
              <ThemeToggle />
            </div>
          </section>

          {SETTINGS_HUB_LINKS.map((group) => {
            const headingId = `settings-group-${group.group
              .toLowerCase()
              .normalize("NFD")
              .replace(/[\u0300-\u036f]/g, "")
              .replace(/[^a-z0-9]+/g, "-")
              .replace(/^-|-$/g, "")}`;
            return (
              <section
                key={group.group}
                aria-labelledby={headingId}
                className="mt-8"
              >
                <h2
                  id={headingId}
                  className="brd-meta text-[11px] uppercase tracking-[0.18em] text-[var(--brd-mute)]"
                >
                  {group.group}
                </h2>
                <ul className="mt-3 divide-y divide-[var(--brd-line)] border border-[var(--brd-line)]">
                  {group.items.map((item) => (
                    <li key={item.href}>
                      <Link
                        href={item.href}
                        className={cn(
                          "flex min-h-11 flex-col gap-0.5 px-4 py-3 outline-none transition-colors",
                          "hover:bg-[var(--brd-paper-deep)]",
                          "focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--brd-focus)]",
                        )}
                      >
                        <span className="text-sm font-medium text-[var(--brd-ink)]">
                          {item.title}
                        </span>
                        <span className="text-sm text-[var(--brd-ink-soft)]">
                          {item.description}
                        </span>
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}
        </PageFrame>
      </main>
    </AppShell>
  );
}
