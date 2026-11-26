import { getTranslations } from "next-intl/server";

import { GuestSignUpLink } from "@/components/auth/guest-sign-up-link";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";
import { AppShell } from "@/components/site/app-shell";
import Link from "@/components/ui/app-link";
import { GUEST_POLICY, PLAN_POLICY } from "@/config/plan-policy";
import { pageMetadata } from "@/config/site";
import { OPERATOR } from "@/lib/legal/legal-config";
import { SOCIAL_PROFILES } from "@/lib/seo/social";
import { isStoreApp } from "@/lib/site/store-app-server";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("common.aboutPage");
  return pageMetadata({ title: t("metaTitle"), description: t("metaDescription"), path: "/about" });
}

type Items = Record<string, { t: string; d: string; href?: string }>;

const H2 = "brd-display text-2xl font-semibold";
const TEXT = "text-[var(--brd-ink-soft)] leading-relaxed";
const LINK = "text-[var(--brd-green)] underline-offset-4 hover:underline";

export default async function AboutPage() {
  const t = await getTranslations("common.aboutPage");
  const why = t.raw("poCo") as string[];
  const audience = Object.values(t.raw("dlaKogo") as Items);
  // The preview length comes from the plan policy, not from the translation.
  const steps = Object.values(t.raw("droga") as Items).map((s) => ({
    ...s,
    d: s.d.replace("{preview}", String(GUEST_POLICY.previewSeconds)),
  }));
  const places = Object.values(t.raw("wSerwisie") as Items);
  const rights = t.raw("prawa") as string[];
  const free = PLAN_POLICY.FREE;
  // Store apps show no prices and no purchase links.
  const storeApp = await isStoreApp();

  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-3xl py-12">
          <SectionLabel>{t("oBitrymdym")}</SectionLabel>
          <h1 className="brd-display mt-2 text-4xl font-semibold tracking-tight">{t("bitGlosStudio")}</h1>
          <p className={`mt-6 text-lg ${TEXT}`}>{t("lead")}</p>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("poCoTitle")}</h2>
            <ul className={`list-disc space-y-2 pl-5 ${TEXT}`}>
              {why.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("dlaKogoTitle")}</h2>
            {audience.map((item) => (
              <div key={item.t}>
                <h3 className="text-lg font-semibold">{item.t}</h3>
                <p className={`mt-1 ${TEXT}`}>{item.d}</p>
              </div>
            ))}
          </section>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("drogaTitle")}</h2>
            <ol className={`list-decimal space-y-2 pl-5 ${TEXT}`}>
              {steps.map((item) => (
                <li key={item.t}>
                  <strong className="text-[var(--brd-ink)]">{item.t}.</strong> {item.d}
                </li>
              ))}
            </ol>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("wSerwisieTitle")}</h2>
            <ul className="grid gap-3 sm:grid-cols-2">
              {places.map((item) => (
                <li key={item.href} className="border border-[var(--brd-line)] p-4">
                  <Link href={item.href ?? "/"} className={`inline-flex min-h-11 items-center font-semibold ${LINK}`}>
                    {item.t}
                  </Link>
                  <p className={`text-sm ${TEXT}`}>{item.d}</p>
                </li>
              ))}
            </ul>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("prawaTitle")}</h2>
            <ul className={`list-disc space-y-2 pl-5 ${TEXT}`}>
              {rights.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
            <Link href="/regulamin" className={`inline-flex min-h-11 items-center text-sm ${LINK}`}>
              {t("regulaminLink")}
            </Link>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("aiTitle")}</h2>
            <p className={TEXT}>{t("ai")}</p>
          </section>

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("gdzieTitle")}</h2>
            <p className={TEXT}>{t("gdzie")}</p>
          </section>

          {storeApp ? null : (
            <section className="mt-12 space-y-4">
              <h2 className={H2}>{t("cenaTitle")}</h2>
              <p className={TEXT}>
                {t("cena", {
                  seconds: free.recording.maxTakeSeconds,
                  perDay: free.recording.sessionsPerDay,
                  tracks: free.studio.maxRecordingTracks,
                  masters: free.mastering.mastersPerMonth,
                })}
              </p>
              <Link href="/premium" className={`inline-flex min-h-11 items-center text-sm ${LINK}`}>
                {t("cenaLink")}
              </Link>
            </section>
          )}

          <section className="mt-12 space-y-4">
            <h2 className={H2}>{t("ktoTitle")}</h2>
            <p className={TEXT}>{t("kto", { name: OPERATOR.name, address: OPERATOR.address, nip: OPERATOR.nip })}</p>
            <p className={TEXT}>
              {t("kontakt")}{" "}
              <a href={`mailto:${OPERATOR.email}`} className={LINK}>
                {OPERATOR.email}
              </a>
            </p>
            <p className={TEXT}>{t("sledz")}</p>
            <ul className="flex flex-wrap gap-x-5">
              {SOCIAL_PROFILES.map((profile) => (
                <li key={profile.name}>
                  <a href={profile.url} target="_blank" rel="noopener noreferrer" className={`inline-flex min-h-11 items-center ${LINK}`}>
                    {profile.name}
                  </a>
                </li>
              ))}
            </ul>
          </section>

          <div className="mt-12 flex flex-wrap gap-2">
            <BrdLink href="/beats">{t("przegladajBity")}</BrdLink>
            <BrdLink href="/nagrywarka" variant="secondary">
              {t("programWindows")}
            </BrdLink>
            <GuestSignUpLink>{t("zalozKonto")}</GuestSignUpLink>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
