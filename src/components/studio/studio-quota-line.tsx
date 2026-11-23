"use client";

import { useLocale, useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { PlanUsageItem } from "@/lib/plans/plan-usage-model";
import { fetchPlanUsage, PLAN_USAGE_REFRESH_EVENT } from "@/lib/plans/plan-usage-refresh";

type Pair = { used: number; limit: number; resetAt: string | null };

function pairOf(items: PlanUsageItem[], id: PlanUsageItem["id"]): Pair | null {
  const item = items.find((row) => row.id === id);
  if (!item || item.used === null || item.limit === null) return null;
  return { used: item.used, limit: item.limit, resetAt: item.resetAt };
}

/**
 * Recordings left today and masters left this month, including unused packs.
 * Same numbers as the header badge. Hidden when the request fails.
 */
export function StudioQuotaLine() {
  const t = useTranslations("studio.studioRecordingPanel");
  const locale = useLocale();
  const [row, setRow] = useState<{ takes: Pair; masters: Pair } | null>(null);

  useEffect(() => {
    let alive = true;
    const load = () => {
      void fetchPlanUsage()
        .then((usage) => {
          if (!alive || !usage) return;
          const takes = pairOf(usage.items, "recordingsToday");
          const masters = pairOf(usage.items, "masters");
          if (takes && masters) setRow({ takes, masters });
        })
        .catch(() => undefined);
    };
    load();
    window.addEventListener(PLAN_USAGE_REFRESH_EVENT, load);
    return () => {
      alive = false;
      window.removeEventListener(PLAN_USAGE_REFRESH_EVENT, load);
    };
  }, []);

  if (!row) return null;
  const reset = row.takes.resetAt ? new Date(row.takes.resetAt) : null;
  const when =
    reset && Number.isFinite(reset.getTime())
      ? reset.toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" })
      : null;
  return (
    <>
      <p data-testid="studio-record-quota" className="text-xs text-[var(--brd-mute)]" role="status">
        {t("limitNagranDzis", { used: row.takes.used, limit: row.takes.limit })}
        {" · "}
        {t("limitMasterow", { used: row.masters.used, limit: row.masters.limit })}
      </p>
      {row.takes.limit > 0 && row.takes.used >= row.takes.limit ? (
        <p data-testid="studio-record-quota-full" className="text-sm text-[var(--brd-warn)]" role="alert">
          {when ? t("limitNagranPelny", { when }) : t("limitNagranPelnyBezCzasu")}
        </p>
      ) : null}
    </>
  );
}
