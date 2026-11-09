import { getTranslations } from "next-intl/server";

import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { BrdLink } from "@/components/brand/brd-button";
import { AppShell } from "@/components/site/app-shell";
import { PLAN_POLICY } from "@/config/plan-policy";
import type { PremiumTier } from "@/types/premium";

/** Public Windows setup. The file is not in git and not on Vercel. */
export const RECORDER_SETUP_URL =
  "https://pub-8c6908a0590848aeb53ab34c2317d857.r2.dev/bitrymdym/BitRymDym-Setup.exe";

const TIERS: PremiumTier[] = ["FREE", "BRONZE", "SILVER", "GOLD"];

function lines(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((item): item is string => typeof item === "string");
}

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("common.recorderPage");
  return {
    title: t("metaTitle"),
    description: t("metaDescription"),
  };
}

export default async function RecorderPage() {
  const t = await getTranslations("common.recorderPage");
  const can = lines(t.raw("can"));
  const cannot = lines(t.raw("cannot"));
  const steps = lines(t.raw("steps"));
  const siteDoes = lines(t.raw("siteDoes"));

  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-12">
          <SectionLabel>{t("kicker")}</SectionLabel>
          <h1 className="brd-display mt-2 text-4xl font-semibold tracking-tight">
            {t("title")}
          </h1>
          <p className="mt-6 text-[var(--brd-ink-soft)] leading-relaxed">{t("lead")}</p>

          <div className="mt-8 flex flex-wrap gap-2">
            <a
              href={RECORDER_SETUP_URL}
              rel="noopener noreferrer"
              className="inline-flex min-h-11 items-center rounded-[var(--brd-radius,10px)] bg-[var(--brd-amber)] px-4 font-poster text-base font-bold uppercase tracking-[0.08em] text-[var(--brd-on-amber,#1a1006)]"
            >
              {t("download")}
            </a>
            <BrdLink href="/studio" variant="secondary">
              {t("openStudio")}
            </BrdLink>
          </div>
          <p className="mt-3 text-sm text-[var(--brd-mute)]">{t("downloadNote")}</p>

          <section className="mt-12 space-y-4">
            <h2 className="brd-display text-2xl font-semibold">{t("windowsTitle")}</h2>
            <p className="text-[var(--brd-ink-soft)] leading-relaxed">{t("windowsLead")}</p>
            <h3 className="pt-2 text-lg font-semibold">{t("canTitle")}</h3>
            <ul className="list-disc space-y-2 pl-5 text-[var(--brd-ink-soft)] leading-relaxed">
              {can.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="pt-2 text-lg font-semibold">{t("cannotTitle")}</h3>
            <ul className="list-disc space-y-2 pl-5 text-[var(--brd-ink-soft)] leading-relaxed">
              {cannot.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <h3 className="pt-2 text-lg font-semibold">{t("stepsTitle")}</h3>
            <ol className="list-decimal space-y-2 pl-5 text-[var(--brd-ink-soft)] leading-relaxed">
              {steps.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ol>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="brd-display text-2xl font-semibold">{t("siteTitle")}</h2>
            <p className="text-[var(--brd-ink-soft)] leading-relaxed">{t("siteLead")}</p>
            <ul className="list-disc space-y-2 pl-5 text-[var(--brd-ink-soft)] leading-relaxed">
              {siteDoes.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className="brd-display text-2xl font-semibold">{t("limitsTitle")}</h2>
            <p className="text-[var(--brd-ink-soft)] leading-relaxed">{t("limitsLead")}</p>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[36rem] border-collapse text-left text-sm">
                <thead>
                  <tr className="border-b border-[var(--brd-line)] text-[var(--brd-mute)]">
                    <th className="py-2 pr-3 font-medium">{t("colPlan")}</th>
                    <th className="py-2 pr-3 font-medium">{t("colSeconds")}</th>
                    <th className="py-2 pr-3 font-medium">{t("colTracks")}</th>
                    <th className="py-2 pr-3 font-medium">{t("colFx")}</th>
                    <th className="py-2 pr-3 font-medium">{t("colStems")}</th>
                    <th className="py-2 font-medium">{t("colSilver")}</th>
                  </tr>
                </thead>
                <tbody>
                  {TIERS.map((tier) => {
                    const plan = PLAN_POLICY[tier];
                    return (
                      <tr key={tier} className="border-b border-[var(--brd-line)]">
                        <th className="py-2 pr-3 font-semibold">{tier === "FREE" ? "Free" : tier[0] + tier.slice(1).toLowerCase()}</th>
                        <td className="py-2 pr-3">{plan.recording.maxTakeSeconds} s</td>
                        <td className="py-2 pr-3">{plan.studio.maxRecordingTracks}</td>
                        <td className="py-2 pr-3">{plan.studio.maxFxEffects}</td>
                        <td className="py-2 pr-3">{plan.studio.maxStems}</td>
                        <td className="py-2">{plan.studio.sidechain ? t("yes") : t("no")}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
            <p className="text-sm text-[var(--brd-mute)]">{t("limitsNote")}</p>
          </section>
        </PageFrame>
      </main>
    </AppShell>
  );
}
