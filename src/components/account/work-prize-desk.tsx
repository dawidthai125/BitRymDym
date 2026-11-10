import { getLocale, getTranslations } from "next-intl/server";

import { WorkPrizeButton } from "@/components/account/work-prize-button";
import { loadWorkPrizeDesk } from "@/lib/catalog/catalog-prize-service";
import { labelPremiumTier } from "@/lib/ui/labels";

function formatUntil(iso: string, locale: string): string {
  const ms = Date.parse(iso);
  if (!Number.isFinite(ms)) return iso;
  return new Date(ms).toLocaleDateString(locale, { year: "numeric", month: "long", day: "numeric" });
}

export async function WorkPrizeDesk({ userId }: { userId: string }) {
  const t = await getTranslations("community.works");
  const locale = await getLocale();
  const desk = await loadWorkPrizeDesk(userId).catch(() => null);
  if (!desk?.enabled) return null;
  if (!desk.offer && !desk.hold) return null;

  const consent = desk.consent;
  let notice: string | null = null;
  let action: "activate" | "resume" | null = null;
  let label = t("prizeActivate");
  if (desk.offer && consent.kind === "free") {
    notice = t("prizeFree");
    action = "activate";
    label = t("prizeActivate");
  } else if (desk.offer && consent.kind === "gold") {
    notice = t("prizeGold", { until: formatUntil(consent.until, locale), days: consent.daysLeft });
    if (consent.queued) notice = `${notice} ${t("prizeQueue")}`;
    action = "activate";
    label = t("prizeAgree");
  } else if (desk.offer && consent.kind === "pause") {
    notice = t("prizePause", {
      tier: labelPremiumTier(consent.tier),
      until: formatUntil(consent.until, locale),
      days: consent.daysLeft,
    });
    if (consent.queued) notice = `${notice} ${t("prizeQueue")}`;
    action = "activate";
    label = t("prizeAgree");
  } else if (desk.offer && consent.kind === "perpetual") {
    notice = t("prizePerpetual");
  } else if (desk.offer && consent.kind === "already") {
    notice = t("prizeAlready");
  }

  return (
    <section className="space-y-3 border border-[var(--brd-line)] p-5" aria-labelledby="work-prize-title">
      <h2 id="work-prize-title" className="font-poster text-lg font-bold uppercase tracking-[0.08em]">{t("prizeTitle")}</h2>
      {desk.offer ? <p className="text-sm text-[var(--brd-mute)]">{desk.offer.halfKey} · {desk.offer.place}</p> : null}
      {notice ? <p className="text-sm text-[var(--brd-ink)]">{notice}</p> : null}
      {action ? <WorkPrizeButton action={action} label={label} /> : null}
      {desk.hold && desk.resumeReady ? (
        <div className="space-y-2 border-t border-[var(--brd-line)] pt-3">
          <p className="text-sm text-[var(--brd-ink)]">{t("prizeResume", { tier: labelPremiumTier(desk.hold.tier), days: desk.hold.days })}</p>
          <WorkPrizeButton action="resume" label={t("prizeResumeButton")} />
        </div>
      ) : null}
      {desk.hold && !desk.resumeReady ? (
        <p className="text-sm text-[var(--brd-mute)]">{t("prizeHold", { tier: labelPremiumTier(desk.hold.tier), days: desk.hold.days })}</p>
      ) : null}
    </section>
  );
}
