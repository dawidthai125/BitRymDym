import { getLocale, getTranslations } from "next-intl/server";

import type { StudioTakeExpiryNotice } from "@/lib/studio/studio-take-expiry";

/** Server banner above the editor: recordings that expire soon or already expired. */
export async function StudioTakeExpiryBanner({ notice }: { notice: StudioTakeExpiryNotice }) {
  if (notice.kind === "none") return null;
  const t = await getTranslations("studio.takeExpiry");
  const locale = await getLocale();
  if (notice.kind === "expired") {
    return (
      <div
        role="alert"
        data-testid="studio-take-expiry-banner"
        data-kind="expired"
        className="rounded-[2px] border border-[var(--brd-danger)] bg-[color-mix(in_oklch,var(--brd-paper),var(--brd-danger)_10%)] px-3 py-2 text-sm"
      >
        <strong>{t("wygasloTytul", { n: notice.count })}</strong> {t("wygasloOpis")}
      </div>
    );
  }
  const when = new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
    timeZone: "Europe/Warsaw",
    day: "numeric",
    month: "long",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(notice.expiresAt));
  const left = notice.hoursLeft >= 48 ? t("zaDni", { n: Math.floor(notice.hoursLeft / 24) }) : t("zaGodzin", { n: notice.hoursLeft });
  return (
    <div
      role="status"
      data-testid="studio-take-expiry-banner"
      data-kind="soon"
      className="rounded-[2px] border border-[var(--brd-amber)] bg-[color-mix(in_oklch,var(--brd-paper),var(--brd-amber)_12%)] px-3 py-2 text-sm"
    >
      <strong>{t("wkrotceTytul", { n: notice.count, left })}</strong> {t("wkrotceOpis", { when })}
    </div>
  );
}
