import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { WEEKLY_STAT_KEYS } from "@/lib/reports/owner-weekly-report";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261122100000_no_recording_nudge_and_owner_weekly_report.sql"), "utf8");

describe("no-recording nudge + owner weekly report migration", () => {
  it("is additive (no drops, deletes or truncates)", () => {
    expect(sql).not.toMatch(/\bdrop\s+(table|column|function)\b/i);
    expect(sql).not.toMatch(/\bdelete\s+from\b/i);
    expect(sql).not.toMatch(/\btruncate\b/i);
    expect(sql).toMatch(/add column if not exists no_recording_nudge_sent_at timestamptz/);
  });
  it("owner_report_runs: RLS on, client roles revoked, one row per kind + week", () => {
    expect(sql).toMatch(/alter table public\.owner_report_runs enable row level security/);
    expect(sql).toMatch(/revoke all on table public\.owner_report_runs from public, anon, authenticated/);
    expect(sql).toMatch(/primary key \(kind, period_key\)/);
    expect(sql).not.toMatch(/create policy/i);
  });
  it("both functions are security definer with an empty search_path and service_role only", () => {
    for (const sig of ["list_no_recording_nudge_candidates(timestamptz, timestamptz, integer)", "owner_weekly_report_stats(timestamptz, timestamptz)"]) {
      expect(sql).toContain(`revoke all on function public.${sig} from public, anon, authenticated;`);
      expect(sql).toContain(`grant execute on function public.${sig} to service_role;`);
    }
    expect(sql.match(/security definer\s+set search_path to ''/g)).toHaveLength(2);
  });
  it("candidates exclude sample/catalog copies and stems, deleted and anonymous users", () => {
    expect(sql).toContain("t.title not like 'smp:%' and t.title not like 'catalog:%'");
    expect(sql).toContain("not t.is_stem");
    expect(sql).toContain("u.deleted_at is null");
    expect(sql).toContain("not coalesce(u.is_anonymous, false)");
    expect(sql).toContain("np.no_recording_nudge_sent_at is null");
  });
  it("the stats function returns every key the report reads, and no e-mail column", () => {
    for (const k of WEEKLY_STAT_KEYS) expect(sql).toContain(`'${k}'`);
    expect(sql).toContain("'funnel'");
    const stats = sql.slice(sql.indexOf("create or replace function public.owner_weekly_report_stats"));
    expect(stats).not.toMatch(/buyer_email|\bemail\b/);
  });
});
