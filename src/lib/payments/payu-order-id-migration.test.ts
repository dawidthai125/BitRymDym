import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261107180000_payu_order_id_text.sql"), "utf8");

describe("PayU order id migration", () => {
  it("stores the provider id as text and replaces both grant functions", () => {
    expect(sql).toMatch(/alter column p24_order_id type text using p24_order_id::text/);
    expect(sql).toMatch(/drop function if exists public\.apply_p24_purchase\(text, integer, text, bigint, text, jsonb\)/);
    expect(sql).toMatch(/drop function if exists public\.grant_p24_quota_pack\(text, integer, text, bigint, text, text, integer\)/);
    expect(sql).toMatch(/p_p24_order_id text/);
    expect(sql).toContain("p_p24_order_id !~ '^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$'");
    expect(sql).toMatch(/grant execute on function public\.apply_p24_purchase\(text, integer, text, text, text, jsonb\) to service_role/);
    expect(sql).toMatch(/grant execute on function public\.grant_p24_quota_pack\(text, integer, text, text, text, text, integer\) to service_role/);
    expect(sql).not.toMatch(/p_p24_order_id bigint/);
    expect(sql).toContain("provider in ('p24', 'payu')");
    expect(sql).toContain("alter column provider set default 'payu'");
    expect(sql).not.toMatch(/enqueue_studio_youtube_video/);
  });
});
