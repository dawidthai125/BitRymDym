import Link from "next/link";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/site/app-shell";
import { pageMetadata } from "@/config/site";
import { LicenseSummary } from "@/components/site/license-summary";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { PLAN_POLICY } from "@/config/plan-policy";
import { isStoreApp } from "@/lib/site/store-app-server";
import { FREE_WATERMARK_PER_DAY, freeWatermarkDownloadEnabled } from "@/lib/studio/deliver/policy";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("common.howToPage");
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription"), path: "/jak-nagrac" });
}

const PLANS = ["FREE", "BRONZE", "SILVER", "GOLD"] as const;
const STEPS = ["k1", "k2", "k3", "k4", "k5", "k6", "k7"] as const;

export default async function HowToRecordPage() {
  const t = await getTranslations("common.howToPage");
  const storeApp = await isStoreApp();
  const download = (tier: (typeof PLANS)[number]) => {
    const q = PLAN_POLICY[tier].downloads.qualities;
    if (tier === "FREE" && freeWatermarkDownloadEnabled()) return t("pobranieZnak", { n: FREE_WATERMARK_PER_DAY });
    if (q.length === 0) return t("pobranieBrak");
    const top = q[q.length - 1];
    if (top.startsWith("WAV")) return t("pobranieWav");
    return t("pobranieMp3", { q: top.replace("MP3_", "") });
  };
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-12">
          <SectionLabel>{t("etykieta")}</SectionLabel>
          <h1 className="brd-display mt-2 text-4xl font-semibold tracking-tight">{t("tytul")}</h1>
          <p className="mt-4 text-[var(--brd-ink-soft)] leading-relaxed">{t("wstep")}</p>

          <p className="mt-4 text-sm">
            <Link href="/#jak-to-dziala" className="underline underline-offset-4" data-testid="how-to-overview-link">
              {t("przegladLink")}
            </Link>
          </p>

          <section aria-labelledby="how-to-guide" className="mt-10" data-testid="how-to-guide">
            <h2 id="how-to-guide" className="text-2xl font-semibold text-[var(--brd-ink)]">{t("poradnikTytul")}</h2>
            <p className="mt-3 leading-relaxed text-[var(--brd-ink-soft)]">{t("poradnikWstep")}</p>
            <ol className="mt-5 space-y-5">
              {STEPS.map((k, i) => (
                <li key={k} className="flex gap-4">
                  <span aria-hidden className="brd-display shrink-0 text-2xl leading-none text-[var(--brd-green)]">{i + 1}</span>
                  <div>
                    <h3 className="font-medium text-[var(--brd-ink)]">{t(`kroki.${k}.tytul`)}</h3>
                    <p className="mt-1 text-sm leading-relaxed text-[var(--brd-ink-soft)]">
                      {t.rich(`kroki.${k}.tekst`, {
                        bity: (c) => <Link href="/beats" className="underline underline-offset-4 hover:text-[var(--brd-ink)]">{c}</Link>,
                        nagrywarka: (c) => <Link href="/nagrywarka" className="underline underline-offset-4 hover:text-[var(--brd-ink)]">{c}</Link>,
                        utwory: (c) => <Link href="/utwory" className="underline underline-offset-4 hover:text-[var(--brd-ink)]">{c}</Link>,
                      })}
                    </p>
                  </div>
                </li>
              ))}
            </ol>
          </section>

          <h2 className="mt-8 text-xl font-medium text-[var(--brd-ink)]">{t("wskazowkiTytul")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--brd-ink-soft)]" data-testid="how-to-tips">
            {(["w1", "w2", "w3", "w4"] as const).map((k) => (
              <li key={k}>{t(`wskazowki.${k}`)}</li>
            ))}
          </ul>

{storeApp ? null : (
          <>
          <h2 className="mt-10 text-xl font-medium text-[var(--brd-ink)]">{t("planyTytul")}</h2>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[34rem] text-sm" data-testid="how-to-plans">
              <thead>
                <tr className="text-left text-xs text-[var(--brd-mute)]">
                  <th className="py-1 pr-2 font-normal">{t("kolPlan")}</th>
                  <th className="py-1 pr-2 font-normal">{t("kolUjecie")}</th>
                  <th className="py-1 pr-2 font-normal">{t("kolSesje")}</th>
                  <th className="py-1 pr-2 font-normal">{t("kolPliki")}</th>
                  <th className="py-1 font-normal">{t("kolPobranie")}</th>
                </tr>
              </thead>
              <tbody>
                {PLANS.map((tier) => {
                  const p = PLAN_POLICY[tier];
                  return (
                    <tr key={tier} className="border-t border-[var(--brd-line)]">
                      <td className="py-1.5 pr-2 font-medium text-[var(--brd-ink)]">{tier}</td>
                      <td className="py-1.5 pr-2">{t("sekundy", { n: p.recording.maxTakeSeconds })}</td>
                      <td className="py-1.5 pr-2">{p.recording.sessionsPerDay}</td>
                      <td className="py-1.5 pr-2">{t("dni", { n: p.retentionDays })}</td>
                      <td className="py-1.5">{download(tier)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <p className="mt-2 text-xs text-[var(--brd-mute)]">{t("planyUwaga")}</p>
          </>
          )}

          {freeWatermarkDownloadEnabled() ? (
            <p className="mt-4 rounded border border-[var(--brd-line)] p-3 text-sm text-[var(--brd-ink-soft)]" data-testid="how-to-watermark-note">
              {t("znakNota", { n: FREE_WATERMARK_PER_DAY })}
            </p>
          ) : null}

          <LicenseSummary className="mt-10" />

          <div className="mt-8 flex flex-wrap gap-2">
            <BrdLink href="/beats">{t("przegladajBity")}</BrdLink>
            {storeApp ? null : <BrdLink href="/premium" variant="secondary">{t("zobaczPlany")}</BrdLink>}
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
