import type { Metadata } from "next";
import { getLocale, getTranslations } from "next-intl/server";
import Image from "next/image";
import Link from "next/link";

import { BrdLogo } from "@/components/brand/brd-logo";
import { intlTag, type AppLocale } from "@/i18n/config";
import { readSiteMaintenanceForViewer } from "@/lib/site/maintenance-settings";

/**
 * "Trwają prace" — branded maintenance page (design v3 "Nocna sesja").
 * Middleware rewrites gated requests here while the admin toggle is on;
 * it is also reachable directly (admin preview). Standalone: no site header,
 * so there are no links into gated pages. Primary copy follows the locale
 * cookie (PL default); the other language is shown below for visitors.
 */
export const dynamic = "force-dynamic";

export async function generateMetadata(): Promise<Metadata> {
  const t = await getTranslations("maintenance.page");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
    robots: { index: false, follow: false },
  };
}

function formatUntil(iso: string, locale: AppLocale): string {
  return new Intl.DateTimeFormat(intlTag(locale), {
    timeZone: "Europe/Warsaw",
    weekday: "long",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(iso));
}

export default async function MaintenancePage() {
  const locale = (await getLocale()) as AppLocale;
  const other: AppLocale = locale === "en" ? "pl" : "en";
  const t = await getTranslations("maintenance.page");
  const tOther = await getTranslations({ locale: other, namespace: "maintenance.page" });
  const state = await readSiteMaintenanceForViewer();
  const until = state.until ? formatUntil(state.until, locale) : null;
  const untilOther = state.until ? formatUntil(state.until, other) : null;

  return (
    <main
      data-surface="tape"
      className="tape-surface tape-grain flex min-h-dvh flex-col overflow-hidden"
    >
      <header className="mx-auto flex w-full max-w-[var(--brd-max-wide)] items-center justify-between gap-4 px-[max(var(--brd-gutter),env(safe-area-inset-left))] pt-6 sm:pt-8">
        <BrdLogo height={44} priority className="w-auto" />
        <p className="inline-flex items-center gap-2 rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-panel px-3 py-1.5 font-mono text-[11px] uppercase tracking-[var(--tape-tracking-label)] text-tape-cream-soft">
          <span
            aria-hidden="true"
            className="size-2 rounded-full bg-[var(--tape-rec)] shadow-[0_0_10px_var(--tape-rec)] motion-safe:animate-pulse"
          />
          {t("status")}
        </p>
      </header>

      <div className="mx-auto grid w-full max-w-[var(--brd-max-wide)] flex-1 items-center gap-10 px-[max(var(--brd-gutter),env(safe-area-inset-left))] py-10 sm:py-14 lg:grid-cols-12 lg:gap-8">
        <section aria-labelledby="maint-title" className="order-2 lg:order-1 lg:col-span-7">
          <p className="font-mono text-xs uppercase tracking-[var(--tape-tracking-label)] text-tape-amber">
            {t("kicker")}
          </p>
          <h1
            id="maint-title"
            className="mt-3 font-poster text-[length:var(--tape-text-mega)] font-black uppercase leading-[0.84] tracking-[-0.01em] text-tape-cream"
          >
            <span className="block">{t("headlineTop")}</span>
            <span className="block text-tape-amber">{t("headlineBottom")}</span>
          </h1>
          <p className="mt-5 font-[family-name:var(--font-display)] text-[clamp(1.35rem,2.4vw,1.9rem)] italic leading-snug text-tape-cream">
            {t("lead")}
          </p>
          <p className="mt-3 max-w-[48ch] text-base leading-relaxed text-tape-cream-soft sm:text-lg">
            {t("body")}
          </p>

          <div className="mt-7 grid gap-2 sm:max-w-xl">
            {state.message ? (
              <RackPanel label={t("messageLabel")}>
                <p className="whitespace-pre-line text-base leading-relaxed text-tape-cream">
                  {state.message}
                </p>
              </RackPanel>
            ) : null}
            <RackPanel label={t("untilLabel")}>
              <p className="font-poster text-2xl font-bold uppercase leading-none text-tape-cream tabular-nums">
                {until ?? t("noEta")}
              </p>
            </RackPanel>
          </div>

          <div
            lang={other}
            className="mt-8 max-w-xl border-l-2 border-tape-line-strong pl-4 text-sm leading-relaxed text-tape-mute"
          >
            <p className="font-mono text-[11px] uppercase tracking-[var(--tape-tracking-label)] text-tape-cream-soft">
              {t("otherLanguage")}
            </p>
            <p className="mt-1 text-tape-cream-soft">
              <strong className="font-semibold text-tape-cream">
                {tOther("headlineTop")} {tOther("headlineBottom")}.
              </strong>{" "}
              {tOther("body")}
              {untilOther ? ` ${tOther("untilLabel")}: ${untilOther}.` : ""}
            </p>
          </div>

          <div className="mt-8 flex flex-wrap items-center gap-x-6 gap-y-2 text-sm">
            {state.enabled ? null : (
              <Link
                href="/"
                className="inline-flex min-h-11 items-center font-mono uppercase tracking-[0.14em] text-tape-amber underline-offset-4 hover:underline"
              >
                {t("backHome")} <span aria-hidden="true">&nbsp;→</span>
              </Link>
            )}
            <Link
              href="/sign-in"
              className="inline-flex min-h-11 items-center text-tape-mute underline-offset-4 hover:text-tape-cream-soft hover:underline"
            >
              {t("adminLogin")}
            </Link>
          </div>
        </section>

        <figure className="order-1 mx-auto w-full max-w-[17rem] sm:max-w-sm lg:order-2 lg:col-span-5 lg:max-w-none">
          <div className="relative mx-auto aspect-square w-full max-w-[26rem]">
            <div
              aria-hidden="true"
              className="absolute inset-[-6%] rounded-full bg-[radial-gradient(circle,rgba(242,169,59,0.22),transparent_62%)]"
            />
            <div
              aria-hidden="true"
              className="absolute inset-0 rounded-full border border-tape-line-strong [background:repeating-radial-gradient(circle,transparent_0_9px,rgba(241,231,211,0.035)_9px_10px)]"
            />
            <Image
              src="/bitek/bitek-hero.webp"
              alt={t("bitekAlt")}
              width={480}
              height={480}
              priority
              sizes="(max-width: 1024px) 18rem, 26rem"
              className="relative size-full rounded-full object-cover p-[6%]"
            />
          </div>
          <figcaption className="mt-4 flex items-center justify-center gap-3 font-mono text-[11px] uppercase tracking-[var(--tape-tracking-label)] text-tape-cream-soft">
            <VuMeter />
            {t("bitekCaption")}
          </figcaption>
        </figure>
      </div>
    </main>
  );
}

function RackPanel({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid grid-cols-[auto_1fr_auto] items-start gap-4 rounded-[var(--tape-r-panel)] border border-tape-line-strong bg-tape-panel px-4 py-4 shadow-[inset_0_1px_0_#ffffff0d,0_6px_16px_-10px_#000]">
      <span className="tape-rack-screw mt-1" aria-hidden="true" />
      <div>
        <p className="font-mono text-[11px] uppercase tracking-[var(--tape-tracking-label)] text-tape-amber">
          {label}
        </p>
        <div className="mt-2">{children}</div>
      </div>
      <span className="tape-rack-screw mt-1" aria-hidden="true" />
    </div>
  );
}

/** Static "signal low" meter — decorative only. */
function VuMeter() {
  const bars = [3, 5, 4, 2, 1, 1, 0, 0];
  return (
    <span aria-hidden="true" className="inline-flex h-3 items-end gap-[2px]">
      {bars.map((h, i) => (
        <span
          key={i}
          className={h > 0 ? "w-[3px] bg-tape-amber" : "w-[3px] bg-tape-line-strong"}
          style={{ height: `${Math.max(h, 1) * 2 + 2}px` }}
        />
      ))}
    </span>
  );
}
