import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PLAN_PACK_CATALOG } from "@/config/plan-policy";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261105120000_studio_quota_packs.sql"), "utf8");

describe("studio quota pack migration", () => {
  it("keeps the balance readable by the owner and writable only by service_role", () => {
    expect(sql).toMatch(/create table public\.studio_quota_credits/i);
    expect(sql).toMatch(/references auth\.users \(id\) on delete cascade/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/studio_quota_credits_select_own/);
    expect(sql).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/grant select on public\.studio_quota_credits to authenticated/i);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.studio_quota_credits to service_role/i);
    expect(sql).toMatch(/revoke all on public\.studio_quota_credits from anon, authenticated/i);
    expect(sql).toMatch(/Only service_role may mutate studio_quota_credits/);
    expect(sql).not.toMatch(/grant insert on public\.studio_quota_credits to authenticated/i);
  });

  it("grants a pack once and spends a credit only after the plan cap", () => {
    expect(sql).toMatch(/product_kind in \('plan', 'addon', 'pack'\)/);
    expect(sql).toMatch(/period in \('month', 'year', 'once'\)/);
    expect(sql).toMatch(/pack in \('take', 'master'\)/);
    expect(sql).toMatch(/p_units is distinct from 10/);
    expect(sql).toMatch(/p_units is distinct from 5/);
    expect(sql.indexOf("result', 'already'")).toBeLessThan(sql.indexOf("insert into public.studio_quota_credits"));
    expect(sql).toMatch(/consume_studio_quota_credit\(p_owner_id, 'take'\)/);
    expect(sql).toMatch(/consume_studio_quota_credit\(p_owner_id, 'master'\)/);
    expect(sql).toMatch(/SESSION_DAY_CAP/);
    expect(PLAN_PACK_CATALOG.take).toEqual({ units: 10, pricePln: 9.99 });
    expect(PLAN_PACK_CATALOG.master).toEqual({ units: 5, pricePln: 14.99 });
  });
});
