/**
 * Header plan badge and the studio quota line share one cache.
 * A take, master, or project change drops it and asks both to fetch again.
 */

import type { PlanUsage } from "@/lib/plans/plan-usage-model";

export const PLAN_USAGE_REFRESH_EVENT = "brd-plan-usage-refresh";

const CACHE_MS = 60_000;
const CACHE_PREFIX = "brd.planUsage.";

type CacheStore = {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
  key(index: number): string | null;
  readonly length: number;
};

function browserSession(): CacheStore | null {
  try {
    if (typeof sessionStorage === "undefined") return null;
    return sessionStorage;
  } catch {
    return null;
  }
}

function cacheKey(userKey: string): string {
  return `brd.planUsage.v1.${userKey}`;
}

export function readPlanUsageCache(userKey: string, storage: CacheStore | null = browserSession()): PlanUsage | null {
  try {
    const raw = storage?.getItem(cacheKey(userKey));
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { at: number; usage: PlanUsage };
    if (Date.now() - parsed.at > CACHE_MS) return null;
    return parsed.usage;
  } catch {
    return null;
  }
}

export function writePlanUsageCache(
  userKey: string,
  usage: PlanUsage,
  storage: CacheStore | null = browserSession(),
): void {
  try {
    storage?.setItem(cacheKey(userKey), JSON.stringify({ at: Date.now(), usage }));
  } catch {
    /* private mode */
  }
}

/** Drop every cached plan snapshot in this tab. */
export function invalidatePlanUsageCache(storage: CacheStore | null = browserSession()): void {
  if (!storage) return;
  try {
    for (let i = storage.length - 1; i >= 0; i--) {
      const key = storage.key(i);
      if (key?.startsWith(CACHE_PREFIX)) storage.removeItem(key);
    }
  } catch {
    /* ignore */
  }
}

/** Clear the tab cache and tell mounted badges to load again. */
export function requestPlanUsageRefresh(storage?: CacheStore | null): void {
  invalidatePlanUsageCache(storage);
  if (typeof window === "undefined") return;
  window.dispatchEvent(new Event(PLAN_USAGE_REFRESH_EVENT));
}

export async function fetchPlanUsage(): Promise<PlanUsage | null> {
  const response = await fetch("/api/account/plan-usage", {
    credentials: "same-origin",
    cache: "no-store",
  });
  if (!response.ok) return null;
  const json = (await response.json()) as { usage?: PlanUsage };
  return json.usage ?? null;
}
