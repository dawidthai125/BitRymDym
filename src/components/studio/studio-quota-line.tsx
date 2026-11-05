"use client";

import { useTranslations } from "next-intl";
import { useEffect, useState } from "react";

import type { PlanUsageItem } from "@/lib/plans/plan-usage-model";

type Pair = { used: number; limit: number };

function pairOf(items: PlanUsageItem[], id: PlanUsageItem["id"]): Pair | null {
  const item = items.find((row) => row.id === id);
  if (!item || item.used === null || item.limit === null) return null;
  return { used: item.used, limit: item.limit };
}

/**
 * Recordings left today and masters left this month, including unused packs.
 * Same numbers as the header badge. Hidden when the request fails.
 */
export function StudioQuotaLine() {
  const t = useTranslations("common.planUsage");
  const [row, setRow] = useState<{ takes: Pair; masters: Pair } | null>(null);

  useEffect(() => {
    let alive = true;
    fetch("/api/account/plan-usage", { credentials: "same-origin" })
      .then(async (response) => (response.ok ? response.json() : null))
      .then((json: { usage?: { items?: PlanUsageItem[] } } | null) => {
        if (!alive || !json?.usage?.items) return;
        const takes = pairOf(json.usage.items, "recordingsToday");
        const masters = pairOf(json.usage.items, "masters");
        if (takes && masters) setRow({ takes, masters });
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, []);

  if (!row) return null;
  return (
    <p data-testid="studio-record-quota" className="text-xs text-[var(--brd-mute)]" role="status">
      {t("pozycja.recordingsToday")} {row.takes.used}/{row.takes.limit}
      {" · "}
      {t("pozycja.masters")} {row.masters.used}/{row.masters.limit}
    </p>
  );
}
