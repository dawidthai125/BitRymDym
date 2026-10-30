import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261030230000_payment_orders.sql"), "utf8");

describe("payment_orders migration", () => {
  it("is additive, lets a user read only their rows, and keeps writes on service_role", () => {
    expect(sql).toMatch(/create table public\.payment_orders/i);
    expect(sql).toMatch(/enable row level security/i);
    expect(sql).toMatch(/payment_orders_select_own/);
    expect(sql).toMatch(/using \(user_id = \(select auth\.uid\(\)\)\)/);
    expect(sql).toMatch(/grant select on public\.payment_orders to authenticated/i);
    expect(sql).toMatch(/grant select, insert, update, delete on public\.payment_orders to service_role/i);
    expect(sql).toMatch(/revoke all on public\.payment_orders from anon, authenticated/i);
    expect(sql).not.toMatch(/to authenticated;\s*\n\s*grant (insert|update|delete)/i);
    expect(sql).toMatch(/Only service_role may mutate payment_orders/);
    expect(sql.indexOf("result', 'already'")).toBeLessThan(sql.indexOf("source = 'purchase'"));
    expect(sql).toMatch(/source = 'purchase'/);
  });
});
