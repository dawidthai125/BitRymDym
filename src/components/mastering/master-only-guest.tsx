import { getTranslations } from "next-intl/server";

import { BrdLink } from "@/components/brand/brd-button";
import { PLAN_POLICY } from "@/config/plan-policy";
import { signInPathWithNext } from "@/lib/auth/next-path";
import { isStoreApp } from "@/lib/site/store-app-server";
import { MASTER_ONLY_MAX_MB, MASTER_ONLY_MAX_SECONDS } from "@/lib/studio/master/master-only-bootstrap";

/** What a guest sees on /mastering: what the feature does and which plan has it. */
export async function MasterOnlyGuest() {
  const t = await getTranslations("mastering.gosc");
  // Store apps show no purchase links.
  const storeApp = await isStoreApp();
  const steps = Object.keys(t.raw("kroki") as string[]);
  const values = { mb: MASTER_ONLY_MAX_MB, min: Math.floor(MASTER_ONLY_MAX_SECONDS / 60) };

  return (
    <div className="max-w-prose space-y-8" data-testid="master-only-guest">
      <section className="space-y-3">
        <h2 className="brd-display text-2xl font-semibold">{t("jakTitle")}</h2>
        <ol className="list-decimal space-y-2 pl-5 text-[var(--brd-ink-soft)]">
          {steps.map((i) => (
            <li key={i}>{t(`kroki.${i}`, values)}</li>
          ))}
        </ol>
      </section>
      <section className="space-y-3">
        <h2 className="brd-display text-2xl font-semibold">{t("planTitle")}</h2>
        <p className="text-[var(--brd-ink-soft)]">
          {t("plan", {
            silver: PLAN_POLICY.SILVER.mastering.mastersPerMonth,
            gold: PLAN_POLICY.GOLD.mastering.mastersPerMonth,
          })}
        </p>
        <p className="text-[var(--brd-ink-soft)]">{t("studio")}</p>
      </section>
      <div className="flex flex-wrap gap-2">
        <BrdLink href="/sign-up">{t("zaloz")}</BrdLink>
        <BrdLink href={signInPathWithNext("/mastering")} variant="secondary">
          {t("zaloguj")}
        </BrdLink>
        {storeApp ? null : (
          <BrdLink href="/premium" variant="secondary">
            {t("plany")}
          </BrdLink>
        )}
      </div>
    </div>
  );
}
