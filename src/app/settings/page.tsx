import { getTranslations } from "next-intl/server";
import Link from "next/link";
import { redirect } from "next/navigation";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import { LanguageSwitcher } from "@/components/site/language-switcher";
import { ThemeToggle } from "@/components/site/theme-toggle";
import { getCurrentProfile } from "@/lib/auth/session";
import { cn } from "@/lib/utils";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("account.settingsPage");
  return { title: t("metaTitle") };
}

/**
 * Settings is a navigation hub only — no new preferences or product rules.
 * Every destination below must already exist as a working surface.
 */
const SETTINGS_HUB_LINKS = [
  {
    group: "konto",
    items: [
      {
        href: "/account#profil",
        title: "profilIKsywka",
        description: "nazwaWyswietlanaEMail",
      },
      {
        href: "/account#security",
        title: "bezpieczenstwo",
        description: "zmianaEMailaHasla",
      },
      {
        href: "/account#danger",
        title: "usuwanieKonta",
        description: "trwaleUsuniecieKontaIstniejacy",
      },
    ],
  },
  {
    group: "kontoPowiazaneEkrany",
    items: [
      {
        href: "/account",
        title: "przegladKonta",
        description: "studioBibliotekaISkroty",
      },
      {
        href: "/account/takes",
        title: "mojeNagrania",
        description: "listaWlasnychNagran",
      },
      {
        href: "/account/beats",
        title: "mojeBity",
        description: "wgraneBityIStatus",
      },
      {
        href: "/account/downloads",
        title: "pobraneBity",
        description: "historiaPobran",
      },
      {
        href: "/account/shared",
        title: "bityUdostepnione",
        description: "bityNaKtorychMasz",
      },
      {
        href: "/premium",
        title: "premiumLimity",
        description: "informacjaOPoziomachI",
      },
    ],
  },
] as const;

export default async function SettingsPage() {
  const t = await getTranslations("account.settingsPage");
  const tc = await getTranslations("account.settingsPage.consts");
  const tl = await getTranslations("language");
  const session = await getCurrentProfile();
  if (!session) redirect("/sign-in");

  return (
    <AppShell tone="studio">
      <main>
        <PageFrame className="py-10">
          <SectionLabel>{t("konto")}</SectionLabel>
          <h1 className="brd-display mt-2 text-3xl font-semibold">{t("ustawienia")}</h1>
          <p className="mt-3 max-w-[42ch] text-sm text-[var(--brd-ink-soft)]">
            {t("taStronaProwadziDo")}
          </p>

          <section
            aria-labelledby="settings-theme"
            className="mt-8 border border-[var(--brd-line)] p-5"
          >
            {/* Decorative eyebrow — announced name is the h2 below. */}
            <div aria-hidden="true">
              <SectionLabel>{t("wyglad")}</SectionLabel>
            </div>
            <h2
              id="settings-theme"
              className="mt-2 text-lg font-semibold tracking-tight"
            >
              {t("motyw")}
            </h2>
            <p className="mt-1 max-w-[40ch] text-sm text-[var(--brd-ink-soft)]">
              {t("tenSamPrzelacznikCo")}
            </p>
            <div className="mt-4">
              <ThemeToggle />
            </div>
            <h2
              id="settings-language"
              className="mt-6 text-lg font-semibold tracking-tight"
            >
              {tl("label")}
            </h2>
            <p className="mt-1 max-w-[40ch] text-sm text-[var(--brd-ink-soft)]">
              {tl("hint")}
            </p>
            <div className="mt-4">
              <LanguageSwitcher />
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
                key={tc(group.group)}
                aria-labelledby={headingId}
                className="mt-8"
              >
                <h2
                  id={headingId}
                  className="brd-meta text-[11px] uppercase tracking-[0.18em] text-[var(--brd-mute)]"
                >
                  {tc(group.group)}
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
                          {tc(item.title)}
                        </span>
                        <span className="text-sm text-[var(--brd-ink-soft)]">
                          {tc(item.description)}
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
