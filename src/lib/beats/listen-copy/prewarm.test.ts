/** Warm-up of the personal listen copy: queued at low priority, capped per hour, never for staff / owner / paid beats. */
import { beforeEach, describe, expect, it, vi } from "vitest";

const db = vi.hoisted(() => ({ beat: {} as Record<string, unknown>, role: "USER", recent: 0, countError: false, upserts: [] as unknown[] }));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/session", () => ({ AuthError: class extends Error {} }));
vi.mock("@/lib/beats/playback-guard", () => ({ PLAYBACK_MAX_DISTINCT_BEATS_PER_HOUR: 12 }));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({
    from: (table: string) => {
      const q: Record<string, unknown> = {};
      for (const m of ["select", "eq"]) q[m] = () => q;
      q.maybeSingle = async () => ({ data: table === "beats" ? db.beat : table === "profiles" ? { role: db.role } : { id: "master-1" } });
      q.gte = async () => ({ count: db.countError ? null : db.recent, error: db.countError ? { message: "x" } : null });
      q.upsert = async (row: unknown) => {
        db.upserts.push(row);
        return { error: null };
      };
      return q;
    },
  }),
}));

import { prewarmListenCopy } from "@/lib/beats/listen-copy/listen-copy-server";

describe("prewarmListenCopy", () => {
  beforeEach(() => {
    vi.stubEnv("BEAT_LISTEN_COPY", "1");
    Object.assign(db, { beat: { owner_id: "other", catalog_lane: "free" }, role: "USER", recent: 0, countError: false, upserts: [] });
  });
  const run = () => prewarmListenCopy({ beatId: "b", userId: "u" });

  it("queues one low-priority copy", async () => {
    await run();
    expect(db.upserts).toEqual([{ beat_id: "b", user_id: "u", master_asset_id: "master-1", priority: 1 }]);
  });

  it("stops at the hourly cap, and when the count cannot be read", async () => {
    db.recent = 12;
    await run();
    db.recent = 0;
    db.countError = true;
    await run();
    expect(db.upserts).toEqual([]);
  });

  it("no copy for the owner, staff, or a paid beat", async () => {
    db.beat = { owner_id: "u", catalog_lane: "free" };
    await run();
    db.beat = { owner_id: "other", catalog_lane: "paid" };
    await run();
    db.beat = { owner_id: "other", catalog_lane: "free" };
    db.role = "ADMIN";
    await run();
    expect(db.upserts).toEqual([]);
  });
});
