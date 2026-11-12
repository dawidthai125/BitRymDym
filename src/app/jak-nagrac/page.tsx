import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/site/app-shell";
import { LicenseSummary } from "@/components/site/license-summary";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { PLAN_POLICY } from "@/config/plan-policy";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("common.howToPage");
  return { title: t("metaTitle"), description: t("metaDescription") };
}

const PLANS = ["FREE", "BRONZE", "SILVER", "GOLD"] as const;

export default function HowToRecordPage() {
  const t = useTranslations("common.howToPage");
  const download = (tier: (typeof PLANS)[number]) => {
    const q = PLAN_POLICY[tier].downloads.qualities;
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

          <h2 className="mt-8 text-xl font-medium text-[var(--brd-ink)]">{t("wskazowkiTytul")}</h2>
          <ul className="mt-3 list-disc space-y-2 pl-5 text-sm text-[var(--brd-ink-soft)]" data-testid="how-to-tips">
            {(["w1", "w2", "w3", "w4"] as const).map((k) => (
              <li key={k}>{t(`wskazowki.${k}`)}</li>
            ))}
          </ul>

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

          <LicenseSummary className="mt-10" />

          <div className="mt-8 flex flex-wrap gap-2">
            <BrdLink href="/beats">{t("przegladajBity")}</BrdLink>
            <BrdLink href="/premium" variant="secondary">{t("zobaczPlany")}</BrdLink>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
