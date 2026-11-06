import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import type { PlanUsage } from "@/lib/plans/plan-usage-model";
import {
  invalidatePlanUsageCache,
  readPlanUsageCache,
  requestPlanUsageRefresh,
  writePlanUsageCache,
} from "@/lib/plans/plan-usage-refresh";

function memoryStore() {
  const rows = new Map<string, string>();
  return {
    getItem: (key: string) => rows.get(key) ?? null,
    setItem: (key: string, value: string) => {
      rows.set(key, value);
    },
    removeItem: (key: string) => {
      rows.delete(key);
    },
    key: (index: number) => [...rows.keys()][index] ?? null,
    get length() {
      return rows.size;
    },
  };
}

const usage = {
  tier: "FREE",
  items: [],
  generatedAt: "2026-11-06T00:00:00.000Z",
} as PlanUsage;

describe("plan usage refresh", () => {
  it("drops a cached snapshot and keeps a fresh one readable", () => {
    const store = memoryStore();
    writePlanUsageCache("user-1", usage, store);
    expect(readPlanUsageCache("user-1", store)?.tier).toBe("FREE");
    invalidatePlanUsageCache(store);
    expect(readPlanUsageCache("user-1", store)).toBeNull();
  });

  it("requestPlanUsageRefresh clears the same prefix", () => {
    const store = memoryStore();
    writePlanUsageCache("user-1", usage, store);
    requestPlanUsageRefresh(store);
    expect(readPlanUsageCache("user-1", store)).toBeNull();
  });

  it("wires the studio actions that spend a limit", () => {
    const root = process.cwd();
    const read = (path: string) => readFileSync(join(root, path), "utf8");
    expect(read("src/lib/takes/client-upload.ts")).toMatch(/requestPlanUsageRefresh\(\)/);
    expect(read("src/components/studio/studio-master-step.tsx")).toMatch(/requestPlanUsageRefresh\(\)/);
    expect(read("src/components/studio/studio-project-list.tsx")).toMatch(/requestPlanUsageRefresh\(\)/);
    expect(read("src/components/plans/plan-badge.tsx")).toMatch(/PLAN_USAGE_REFRESH_EVENT/);
    expect(read("src/components/studio/studio-quota-line.tsx")).toMatch(/PLAN_USAGE_REFRESH_EVENT/);
    expect(read("src/lib/plans/plan-usage-refresh.ts")).toMatch(/cache: "no-store"/);
    expect(read("src/app/api/account/plan-usage/route.ts")).toMatch(/no-store/);
  });
});
