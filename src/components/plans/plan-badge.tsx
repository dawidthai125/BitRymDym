"use client";

import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import {
  isPlanItemExhausted,
  type PlanUsage,
  type PlanUsageItem,
} from "@/lib/plans/plan-usage-model";
import { cn } from "@/lib/utils";
import type { PremiumTier } from "@/types/premium";

const TIER_LABEL: Record<PremiumTier, string> = {
  FREE: "Free",
  BRONZE: "Bronze",
  SILVER: "Silver",
  GOLD: "Gold",
};

const TIER_CLASS: Record<PremiumTier, string> = {
  FREE: "border-[var(--brd-line)] text-[var(--brd-ink-soft)]",
  BRONZE: "border-[#a0643a] text-[#a0643a]",
  SILVER: "border-[#7c8691] text-[#5f6973] dark:text-[#c3cbd3]",
  GOLD: "border-[#b8901f] text-[#9a7712] dark:text-[#e4c25a]",
};

const CACHE_MS = 60_000;
const cacheKey = (userKey: string) => `brd.planUsage.v1.${userKey}`;

function readCache(userKey: string): PlanUsage | null {
  try {
    const raw = sessionStorage.getItem(cacheKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; usage: PlanUsage };
    if (Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.usage;
  } catch {
    return null;
  }
}

function writeCache(userKey: string, usage: PlanUsage) {
  try {
    sessionStorage.setItem(cacheKey(userKey), JSON.stringify({ at: Date.now(), usage }));
  } catch {
    /* private mode — no cache */
  }
}

/** Drop the cached limits (after a download, new project, master…). */
export function invalidatePlanUsageCache() {
  try {
    for (let i = sessionStorage.length - 1; i >= 0; i--) {
      const k = sessionStorage.key(i);
      if (k?.startsWith("brd.planUsage.")) sessionStorage.removeItem(k);
    }
  } catch {
    /* ignore */
  }
}

/**
 * Header plan badge + limits popover (Owner 2026-10-29). One request to
 * /api/account/plan-usage (server: plan-policy + usage), cached 60 s per tab.
 */
export function PlanBadge({ userKey }: { userKey: string }) {
  const t = useTranslations("common.planUsage");
  const locale = useLocale();
  const [usage, setUsage] = useState<PlanUsage | null>(null);
  const [failed, setFailed] = useState(false);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement | null>(null);
  const panelId = useId();

  useEffect(() => {
    let alive = true;
    const cached = readCache(userKey);
    if (cached) {
      // Cached read is external state (sessionStorage) — sync once on mount.
      queueMicrotask(() => alive && setUsage(cached));
      return () => {
        alive = false;
      };
    }
    fetch("/api/account/plan-usage", { credentials: "same-origin" })
      .then(async (r) => {
        if (!r.ok) throw new Error(String(r.status));
        const json = (await r.json()) as { usage?: PlanUsage };
        if (!json.usage) throw new Error("no_usage");
        if (!alive) return;
        writeCache(userKey, json.usage);
        setUsage(json.usage);
      })
      .catch(() => alive && setFailed(true));
    return () => {
      alive = false;
    };
  }, [userKey]);

  useEffect(() => {
    if (!open) return;
    const onDown = (e: PointerEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("pointerdown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("pointerdown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (failed && !usage) return null;

  const tier = usage?.tier ?? null;
  const byId = (id: PlanUsageItem["id"]) => usage?.items.find((i) => i.id === id);
  const anyExhausted = usage?.items.some(isPlanItemExhausted) ?? false;
  const fmtWhen = (iso: string) =>
    new Intl.DateTimeFormat(locale === "en" ? "en-GB" : "pl-PL", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
      timeZone: "Europe/Warsaw",
    }).format(new Date(iso));

  const value = (item: PlanUsageItem): string => {
    if (item.locked) return t("odPlanu", { plan: "Bronze" });
    if (item.id === "tracks") return t("naProjekt", { n: item.limit ?? 0 });
    if (item.limit === null) return t("bezLimitu", { used: item.used ?? 0 });
    return `${item.used ?? 0}/${item.limit}`;
  };

  const chip = (id: PlanUsageItem["id"], label: string) => {
    const item = byId(id);
    if (!item) return null;
    return (
      <span
        className={cn(
          "font-mono tabular-nums",
          isPlanItemExhausted(item) ? "text-[var(--brd-rec)]" : "text-[var(--brd-ink-soft)]",
        )}
      >
        {label} {item.locked ? "🔒" : value(item)}
      </span>
    );
  };

  return (
    <div ref={wrapRef} className="relative" data-testid="plan-badge">
      <button
        type="button"
        aria-expanded={open}
        aria-controls={panelId}
        aria-label={tier ? t("aria", { plan: TIER_LABEL[tier] }) : t("wczytuje")}
        data-tier={tier ?? "loading"}
        onClick={() => setOpen((v) => !v)}
        className="inline-flex min-h-11 items-center gap-2 rounded-[var(--tape-r-panel,0.375rem)] px-1.5 text-xs outline-none hover:bg-[var(--brd-paper-deep)] focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
      >
        <span
          className={cn(
            "relative inline-flex min-w-[3.25rem] items-center justify-center rounded-full border px-2 py-0.5 font-semibold uppercase tracking-wide",
            tier ? TIER_CLASS[tier] : "border-[var(--brd-line)] text-transparent",
          )}
        >
          {tier ? TIER_LABEL[tier] : "····"}
          {anyExhausted ? (
            <span aria-hidden className="absolute -right-1 -top-1 h-2 w-2 rounded-full bg-[var(--brd-amber)]" />
          ) : null}
        </span>
        {usage ? (
          <span className="hidden items-center gap-2 lg:inline-flex" data-testid="plan-badge-chips">
            {chip("beatDownloads", t("chipPobrania"))}
            <span aria-hidden className="text-[var(--brd-line)]">·</span>
            {chip("projects", t("chipProjekty"))}
          </span>
        ) : null}
      </button>

      {open ? (
        <div
          id={panelId}
          role="dialog"
          aria-label={tier ? t("tytul", { plan: TIER_LABEL[tier] }) : t("wczytuje")}
          data-testid="plan-badge-popover"
          className="fixed inset-x-2 top-[4.25rem] z-50 rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 text-[var(--brd-ink)] shadow-xl sm:absolute sm:inset-x-auto sm:right-0 sm:top-full sm:mt-2 sm:w-80"
        >
          {usage && tier ? (
            <>
              <p className="text-sm font-semibold">{t("tytul", { plan: TIER_LABEL[tier] })}</p>
              <ul className="mt-2 divide-y divide-[var(--brd-line)] text-sm">
                {usage.items.map((item) => (
                  <li
                    key={item.id}
                    data-testid={`plan-usage-${item.id}`}
                    className="flex items-baseline justify-between gap-3 py-1.5"
                  >
                    <span className="min-w-0">
                      <span className="text-[var(--brd-ink)]">{t(`pozycja.${item.id}`)}</span>
                      <span className="block text-xs text-[var(--brd-mute)]">
                        {t(`okres.${item.period}`)}
                        {item.resetAt && !item.locked && item.period !== "day"
                          ? ` · ${t("odnowienie", { kiedy: fmtWhen(item.resetAt) })}`
                          : ""}
                      </span>
                    </span>
                    <span
                      className={cn(
                        "shrink-0 font-mono text-sm tabular-nums",
                        item.locked
                          ? "text-[var(--brd-mute)]"
                          : isPlanItemExhausted(item)
                            ? "text-[var(--brd-rec)]"
                            : "text-[var(--brd-ink)]",
                      )}
                    >
                      {item.locked ? "🔒 " : ""}
                      {value(item)}
                    </span>
                  </li>
                ))}
              </ul>
              <p className="mt-2 text-xs text-[var(--brd-mute)]">{t("dobaUtc")}</p>
              <Link
                href="/premium"
                onClick={() => setOpen(false)}
                className="mt-2 inline-flex min-h-11 items-center text-sm font-medium text-[var(--brd-green)] underline underline-offset-4"
              >
                {t("plany")}
              </Link>
            </>
          ) : (
            <p className="text-sm text-[var(--brd-mute)]">{t("wczytuje")}</p>
          )}
        </div>
      ) : null}
    </div>
  );
}
