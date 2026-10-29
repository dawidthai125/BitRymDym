import { useTranslations } from "next-intl";
import { getTranslations } from "next-intl/server";
import { AppShell } from "@/components/site/app-shell";
import { BrdLink } from "@/components/brand/brd-button";
import { PageFrame, SectionLabel } from "@/components/brand/chrome";

export async function generateMetadata(): Promise<import("next").Metadata> {
  const t = await getTranslations("common.aboutPage");
  return {
  title: t("metaTitle"),
  description: t("metaDescription"),
};
}

export default function AboutPage() {
  const t = useTranslations("common.aboutPage");
  return (
    <AppShell tone="public">
      <main>
        <PageFrame className="max-w-2xl py-12">
          <SectionLabel>{t("oBitrymdym")}</SectionLabel>
          <h1 className="brd-display mt-2 text-4xl font-semibold tracking-tight">
            {t("bitGlosStudio")}
          </h1>
          <div className="mt-6 space-y-4 text-[var(--brd-ink-soft)] leading-relaxed">
            <p>
              {t("bitrymdymToMiejsceW")}
            </p>
            <p>
              {t("dlaProducentowRaperowI")}
            </p>
          </div>
          <div className="mt-8 flex flex-wrap gap-2">
            <BrdLink href="/beats">{t("przegladajBity")}</BrdLink>
            <BrdLink href="/sign-up" variant="secondary">
              {t("zalozKonto")}
            </BrdLink>
          </div>
        </PageFrame>
      </main>
    </AppShell>
  );
}
