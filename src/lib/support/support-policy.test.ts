import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { BODY_MAX, cleanBody, cleanNewThread, cleanPagePath, isRead, pollDelayMs, type SupportMessage } from "./support-policy";

describe("support rules", () => {
  it("accepts a complete report and refuses gaps", () => {
    const ok = { kind: "bug", subject: "  Nie gra   bit ", body: " Po kliknięciu cisza.\r\nDruga linia ", page: "/beat/1?x=2" };
    expect(cleanNewThread(ok)).toEqual({ kind: "bug", subject: "Nie gra bit", body: "Po kliknięciu cisza.\nDruga linia", page: "/beat/1" });
    for (const bad of [{ ...ok, kind: "x" }, { ...ok, subject: "ab" }, { ...ok, subject: "a".repeat(121) }, { ...ok, body: "   " }]) {
      expect(cleanNewThread(bad)).toBeNull();
    }
    expect(cleanBody("a".repeat(BODY_MAX))).not.toBeNull();
    expect(cleanBody("a".repeat(BODY_MAX + 1))).toBeNull();
    expect(cleanBody(5)).toBeNull();
  });

  it("keeps only a path of our site and never a secret link", () => {
    expect(cleanPagePath("https://evil.example/x")).toBeNull();
    expect(cleanPagePath("//evil.example")).toBeNull();
    expect(cleanPagePath("/studio/p/abc#t")).toBe("/studio/p/abc");
    expect(cleanPagePath("/listen/SECRET")).toBe("/listen/…");
    expect(cleanPagePath("/r/SECRET")).toBe("/r/…");
  });

  it("shows read ticks from the other side's last visit", () => {
    const mine: SupportMessage = { id: "1", sender: "user", body: "x", createdAt: "2026-11-26T10:00:00Z" };
    expect(isRead(mine, { staffReadAt: null, userReadAt: "2026-11-26T11:00:00Z" })).toBe(false);
    expect(isRead(mine, { staffReadAt: "2026-11-26T09:59:00Z", userReadAt: null })).toBe(false);
    expect(isRead(mine, { staffReadAt: "2026-11-26T10:00:01Z", userReadAt: null })).toBe(true);
    expect(isRead({ ...mine, sender: "staff" }, { staffReadAt: null, userReadAt: "2026-11-26T11:00:00Z" })).toBe(true);
  });

  it("slows polling when nothing happens", () => {
    expect(pollDelayMs(0)).toBe(10_000);
    expect(pollDelayMs(6 * 60_000)).toBe(30_000);
  });

  it("the migration closes the tables and keeps the same limits", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261126200000_support_threads.sql"), "utf8");
    expect(sql).toContain("revoke all on table public.support_threads, public.support_messages from anon, authenticated");
    expect(sql.match(/enable row level security/g)).toHaveLength(2);
    expect(sql).toContain("char_length(subject) between 3 and 120");
    expect(sql).toContain(`char_length(body) between 1 and ${BODY_MAX}`);
    expect(sql).toMatch(/references auth\.users \(id\) on delete cascade/);
    expect(sql).not.toMatch(/create policy/i);
  });
});
