import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261122130000_community_comment_moderation.sql"), "utf8");

describe("community comment moderation migration", () => {
  it("adds the soft-delete and hide columns", () => {
    expect(sql).toMatch(/add column if not exists deleted_at timestamptz/);
    expect(sql).toMatch(/add column if not exists hidden_at timestamptz/);
    expect(sql).toMatch(/add column if not exists hidden_by uuid references public\.profiles \(id\) on delete set null/);
    expect(sql).toMatch(/add column if not exists hidden_reason text/);
    expect(sql).toContain("hidden_reason in ('owner', 'staff', 'reports')");
    expect(sql).toMatch(/where deleted_at is null and hidden_at is null/);
  });

  it("creates a service_role-only reports table, one report per member per comment", () => {
    expect(sql).toMatch(/create table if not exists public\.community_comment_reports/);
    expect(sql).toMatch(/unique \(comment_id, reporter_id\)/);
    expect(sql).toContain("reason in ('spam', 'abuse', 'illegal', 'other')");
    expect(sql).toContain("char_length(details) between 1 and 500");
    expect(sql).toMatch(/alter table public\.community_comment_reports enable row level security/);
    expect(sql).toMatch(/alter table public\.community_comment_reports force row level security/);
    expect(sql).toMatch(/revoke all on table public\.community_comment_reports from public, anon, authenticated/);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.community_comment_reports to service_role/);
    expect(sql).not.toMatch(/grant [^;]* to (anon|authenticated)/);
    expect(sql).not.toMatch(/security definer/);
  });

  it("keeps every audit action and adds the two moderation actions", () => {
    for (const action of [
      "ROLE_CHANGE", "USER_ACCOUNT_DELETE", "BEAT_COVER_REVIEW", "USAGE_RESET", "PAYMENT_REVIEW_RESOLVE",
      "COMMUNITY_COMMENT_HIDE", "COMMUNITY_REPORT_DISMISS",
    ]) {
      expect(sql).toContain(`'${action}'`);
    }
  });

  it("is additive", () => {
    expect(sql).not.toMatch(/drop table|drop column|delete from|truncate/i);
  });
});
