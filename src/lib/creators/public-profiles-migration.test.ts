import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { CREATOR_SERVICES } from "./creator-links";
import { PROFILE_COLUMNS, SHARE_COLUMN } from "./profile-policy";

const read = (name: string) => readFileSync(join(process.cwd(), "supabase/migrations", name), "utf8");
const sql = read("20261123220000_public_profiles.sql");
const actions = (text: string) => [...text.slice(text.lastIndexOf("admin_audit_events_action_chk check")).matchAll(/'([A-Z_]+)'/g)].map((m) => m[1]!);

describe("public profiles migration", () => {
  it("is service_role only: RLS on and forced, nothing for visitors or members", () => {
    expect(sql).toMatch(/alter table public\.public_profiles enable row level security/);
    expect(sql).toMatch(/alter table public\.public_profiles force row level security/);
    expect(sql).toMatch(/revoke all on table public\.public_profiles from public, anon, authenticated/);
    expect(sql).toMatch(/grant select, insert, update, delete on table public\.public_profiles to service_role/);
    for (const fn of ["public_profile_ids\\(uuid\\[\\]\\)", "public_profile_sitemap\\(integer\\)"]) {
      expect(sql).toMatch(new RegExp(`revoke all on function public\\.${fn} from public, anon, authenticated`));
      expect(sql).toMatch(new RegExp(`grant execute on function public\\.${fn} to service_role`));
    }
    expect(sql).not.toMatch(/grant [^;]* to (public|anon|authenticated)/);
    expect(sql).not.toMatch(/security definer/i);
    expect(sql.match(/to service_role\b/g)!.length).toBeGreaterThanOrEqual(4);
  });

  it("goes away with the account", () => {
    expect(sql).toMatch(/owner_id uuid primary key references public\.profiles \(id\) on delete cascade/);
  });

  it("is off by default, every switch too", () => {
    for (const column of ["enabled", "blocked", ...Object.values(SHARE_COLUMN)]) {
      expect(sql, column).toMatch(new RegExp(`\\n  ${column} boolean not null default false`));
    }
    expect(sql).not.toMatch(/default true/);
  });

  it("checks every link: https, one host, length", () => {
    for (const service of CREATOR_SERVICES) {
      expect(sql).toMatch(new RegExp(`link_${service} is null or \\(char_length\\(link_${service}\\) <= 200 and link_${service} ~ '\\^https://`));
    }
  });

  it("has every column the app reads", () => {
    for (const column of PROFILE_COLUMNS.split(", ")) expect(sql, column).toMatch(new RegExp(`\\n  ${column} `));
  });

  it("keeps every earlier audit action and adds the two profile actions", () => {
    const before = actions(read("20261122130000_community_comment_moderation.sql"));
    const now = actions(sql);
    expect(before.length).toBeGreaterThan(10);
    expect(now).toEqual([...before, "PUBLIC_PROFILE_BLOCK", "PUBLIC_PROFILE_UNBLOCK"]);
  });

  it("is additive", () => {
    expect(sql).not.toMatch(/drop table|drop column|delete from|truncate/i);
  });
});
