/**
 * SQL contract of the Windows recorder send limit:
 *   claim_desktop_studio_send (latest: 20261120090000_admin_usage_resets) — count + insert per UTC day,
 *   use_desktop_studio_send   (latest: 20261122110000_desktop_send_by_id) — bind a send to a project,
 *     exactly the recorder's send id when given; first version: 20261122050000_desktop_send_bound_to_project.
 * Atomicity lives here (advisory xact lock per owner, row lock on the bound send); the route tests
 * only model it.
 */
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const DIR = join(process.cwd(), "supabase/migrations");
const read = (f: string) => readFileSync(join(DIR, f), "utf8");
const bound = read("20261122050000_desktop_send_bound_to_project.sql");
const byId = read("20261122110000_desktop_send_by_id.sql");
const resets = read("20261120090000_admin_usage_resets.sql");

function body(sql: string, fn: string): string {
  const start = sql.search(new RegExp(`create or replace function public\\.${fn}\\(`, "i"));
  expect(start).toBeGreaterThanOrEqual(0);
  const end = sql.indexOf("$function$;", start);
  return sql.slice(start, end);
}

function lastDefinition(fn: string): string {
  const files = readdirSync(DIR).filter((f) => f.endsWith(".sql")).sort();
  const hits = files.filter((f) => new RegExp(`function public\\.${fn}\\(`, "i").test(read(f)));
  return hits.at(-1) ?? "";
}

describe("desktop send migrations", () => {
  it("the tested files hold the latest definitions (no later migration redefines them)", () => {
    expect(lastDefinition("claim_desktop_studio_send")).toBe("20261120090000_admin_usage_resets.sql");
    expect(lastDefinition("use_desktop_studio_send")).toBe("20261122110000_desktop_send_by_id.sql");
  });

  it("claim: service_role only, per-owner lock before count and insert, strict '>=' limit", () => {
    const fn = body(resets, "claim_desktop_studio_send");
    expect(fn).toMatch(/security definer/i);
    expect(fn).toMatch(/auth\.role\(\) is distinct from 'service_role'/);
    const lock = fn.indexOf("pg_advisory_xact_lock(hashtextextended('desktop-send:' || p_owner_id::text, 0))");
    const count = fn.search(/select count\(\*\)::integer into v_used/);
    const insert = fn.indexOf("insert into public.desktop_studio_sends");
    expect(lock).toBeGreaterThan(0);
    expect(lock).toBeLessThan(count);
    expect(count).toBeLessThan(insert);
    // At the limit nothing is inserted; peek never inserts.
    expect(fn).toMatch(/if p_peek or v_used >= p_max_per_utc_day then[\s\S]*?return;\s*end if;/);
    // UTC day, moved forward by an admin usage reset of "recordings".
    expect(fn).toMatch(/date_trunc\('day', timezone\('utc', now\(\)\)\)/);
    expect(fn).toMatch(/usage_reset_at\(p_owner_id, 'recordings'\)/);
  });

  it("bind: adds project_id / used_at additively", () => {
    expect(bound).toMatch(/alter table public\.desktop_studio_sends\s+add column if not exists project_id uuid,\s+add column if not exists used_at timestamptz;/i);
    expect(bound).not.toMatch(/drop (table|column)/i);
  });

  it("bind (latest): replaces the 2-arg function by one 3-arg signature, no data change", () => {
    expect(byId).toMatch(/drop function if exists public\.use_desktop_studio_send\(uuid, uuid\);/);
    expect(byId).toMatch(/create or replace function public\.use_desktop_studio_send\(\s*p_owner_id uuid,\s*p_project_id uuid,\s*p_send_id uuid default null\s*\)/);
    expect(byId).not.toMatch(/drop (table|column)|delete from|truncate|alter table/i);
    expect(byId.indexOf("drop function")).toBeLessThan(byId.indexOf("create or replace function"));
  });

  it("bind (latest): service_role only, owner lock first, same project at any age", () => {
    const fn = body(byId, "use_desktop_studio_send");
    expect(fn).toMatch(/security definer/i);
    expect(fn).toMatch(/set search_path to 'public'/);
    expect(fn).toMatch(/auth\.role\(\) is distinct from 'service_role'/);
    const lock = fn.indexOf("pg_advisory_xact_lock(hashtextextended('desktop_send_use:' || p_owner_id::text, 0))");
    expect(lock).toBeGreaterThan(0);
    const reuse = fn.search(/if exists \(\s*select 1 from public\.desktop_studio_sends\s*where owner_id = p_owner_id and project_id = p_project_id\s*\) then\s*return true;/);
    expect(reuse).toBeGreaterThan(lock);
    // No 24 h window on the same-project check.
    const reuseBlock = fn.slice(reuse, fn.indexOf("end if;", reuse));
    expect(reuseBlock).not.toMatch(/interval/);
  });

  it("bind (latest): exact send id when given (own, unused, 24 h), else newest free; both row-locked", () => {
    const fn = body(byId, "use_desktop_studio_send");
    const exact = fn.search(/if p_send_id is not null then/);
    const fallback = fn.search(/\belse\b[\s\S]*?order by created_at desc\s+limit 1\s+for update;/);
    expect(exact).toBeGreaterThan(0);
    expect(fallback).toBeGreaterThan(exact);
    const exactBlock = fn.slice(exact, fallback);
    expect(exactBlock).toMatch(/where id = p_send_id and owner_id = p_owner_id and project_id is null\s+and created_at > now\(\) - interval '24 hours'\s+for update;/);
    expect(exactBlock).not.toMatch(/order by/);
    expect(fn.match(/for update;/g)).toHaveLength(2);
    expect(fn).toMatch(/if v_id is null then\s+return false;/);
    expect(fn).toMatch(/update public\.desktop_studio_sends\s+set project_id = p_project_id, used_at = now\(\)\s+where id = v_id;/);
  });

  it("bind (latest): not callable by anon / authenticated", () => {
    expect(byId).toMatch(/revoke all on function public\.use_desktop_studio_send\(uuid, uuid, uuid\) from public, anon, authenticated;/);
    expect(byId).toMatch(/grant execute on function public\.use_desktop_studio_send\(uuid, uuid, uuid\) to service_role;/);
    expect(byId).not.toMatch(/to (anon|authenticated)/);
  });
});
