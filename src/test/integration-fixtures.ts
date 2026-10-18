/**
 * Fixture registry for local integration tests: track every user, beat and
 * stray Storage object a test creates, then delete exactly those (and rows
 * hanging off them) in FK-safe order. Never deletes by pattern or age, so data
 * of other suites is never touched. Deletes tolerate already-missing rows, and
 * a second `cleanup()` call is a no-op.
 * `cleanup()` verifies nothing tracked is left and throws a secret-free
 * summary with the leftover ids otherwise — call it from `afterAll` / `finally`
 * so it also runs after a failing test.
 */
import type { SupabaseClient } from "@supabase/supabase-js";

import { TAKE_AUDIO_BUCKET } from "@/config/recording";

type StorageObject = { bucket: string; key: string };

export type IntegrationFixtures = {
  trackUser(userId: string): string;
  trackBeat(beatId: string): string;
  trackObject(bucket: string, key: string): void;
  cleanup(): Promise<void>;
};

function groupByBucket(objects: StorageObject[]): Map<string, string[]> {
  const byBucket = new Map<string, string[]>();
  for (const { bucket, key } of objects) {
    const keys = byBucket.get(bucket) ?? [];
    if (!keys.includes(key)) keys.push(key);
    byBucket.set(bucket, keys);
  }
  return byBucket;
}

export function createIntegrationFixtures(admin: SupabaseClient): IntegrationFixtures {
  const users = new Set<string>();
  const beats = new Set<string>();
  const objects: StorageObject[] = [];

  async function run(label: string, problems: string[], op: PromiseLike<{ error: unknown }>) {
    const { error } = await op;
    if (error) problems.push(`${label}: ${(error as { message?: string }).message ?? "error"}`);
  }

  async function cleanup() {
    const problems: string[] = [];
    const userIds = [...users];
    const beatIds = [...beats];
    const stray: StorageObject[] = [...objects];

    const takeRows: { id: string; object_key: string | null }[] = [];
    for (const [column, ids] of [
      ["beat_id", beatIds],
      ["owner_id", userIds],
    ] as const) {
      if (ids.length === 0) continue;
      const { data, error } = await admin.from("takes").select("id, object_key").in(column, ids);
      if (error) problems.push(`select takes: ${error.message}`);
      for (const row of data ?? []) {
        if (!takeRows.some((t) => t.id === row.id)) takeRows.push(row);
      }
    }
    const takeIds = takeRows.map((t) => t.id);
    for (const t of takeRows) {
      if (t.object_key) stray.push({ bucket: TAKE_AUDIO_BUCKET, key: t.object_key });
    }

    if (beatIds.length > 0) {
      const { data, error } = await admin
        .from("beat_audio_assets")
        .select("storage_bucket, object_key")
        .in("beat_id", beatIds);
      if (error) problems.push(`select assets: ${error.message}`);
      for (const row of data ?? []) {
        if (row.object_key) stray.push({ bucket: row.storage_bucket, key: row.object_key });
      }
    }

    for (const [bucket, keys] of groupByBucket(stray)) {
      await run(`remove ${bucket}`, problems, admin.storage.from(bucket).remove(keys));
    }

    if (takeIds.length > 0) {
      // takes.replaces_take_id is RESTRICT — unlink the chain before deleting.
      await run(
        "unlink takes",
        problems,
        admin.from("takes").update({ replaces_take_id: null }).in("id", takeIds),
      );
      await run("delete takes", problems, admin.from("takes").delete().in("id", takeIds));
    }
    if (beatIds.length > 0) {
      for (const table of [
        "beat_download_events",
        "beat_download_reservations",
        "beat_audio_assets",
      ]) {
        await run(`delete ${table}`, problems, admin.from(table).delete().in("beat_id", beatIds));
      }
      await run("delete beats", problems, admin.from("beats").delete().in("id", beatIds));
    }
    if (userIds.length > 0) {
      await run(
        "delete premium_entitlements",
        problems,
        admin.from("premium_entitlements").delete().in("user_id", userIds),
      );
    }
    for (const userId of userIds) {
      const { error } = await admin.auth.admin.deleteUser(userId);
      if (error && !/not found/i.test(error.message)) {
        problems.push(`deleteUser: ${error.message}`);
      }
    }

    // Ids (UUIDs, never secrets) so a failed cleanup names exactly what to remove.
    const left: string[] = [];
    for (const [table, ids] of [
      ["beats", beatIds],
      ["profiles", userIds],
      ["takes", takeIds],
    ] as const) {
      if (ids.length === 0) continue;
      const { data, error } = await admin.from(table).select("id").in("id", ids);
      if (error) problems.push(`verify ${table}: ${error.message}`);
      const remaining = (data ?? []).map((row) => row.id as string);
      if (remaining.length > 0) left.push(`${table}=[${remaining.join(", ")}]`);
    }
    for (const [table, idColumn, column, ids] of [
      ["beat_audio_assets", "id", "beat_id", beatIds],
      ["premium_entitlements", "user_id", "user_id", userIds],
      ["creator_experience_events", "id", "user_id", userIds],
    ] as const) {
      if (ids.length === 0) continue;
      const { data, error } = await admin.from(table).select(idColumn).in(column, ids);
      if (error) problems.push(`verify ${table}: ${error.message}`);
      const remaining = (data ?? []).map((row) => (row as Record<string, string>)[idColumn]);
      if (remaining.length > 0) left.push(`${table}=[${remaining.join(", ")}]`);
    }
    for (const [bucket, keys] of groupByBucket(stray)) {
      for (const key of keys) {
        const slash = key.lastIndexOf("/");
        const folder = slash >= 0 ? key.slice(0, slash) : "";
        const name = key.slice(slash + 1);
        const { data, error } = await admin.storage.from(bucket).list(folder, { search: name });
        if (error) problems.push(`verify ${bucket}: ${error.message}`);
        if ((data ?? []).some((entry) => entry.name === name)) {
          left.push(`storage ${bucket}=[${key}]`);
        }
      }
    }
    const authLeft: string[] = [];
    for (const userId of userIds) {
      const { data } = await admin.auth.admin.getUserById(userId);
      if (data?.user) authLeft.push(userId);
    }
    if (authLeft.length > 0) left.push(`auth.users=[${authLeft.join(", ")}]`);

    users.clear();
    beats.clear();
    objects.length = 0;
    if (left.length > 0 || problems.length > 0) {
      throw new Error(
        `Integration fixture cleanup incomplete (${left.join(", ") || "no rows left"}): ${problems.join("; ")}`,
      );
    }
  }

  return {
    trackUser(userId) {
      users.add(userId);
      return userId;
    },
    trackBeat(beatId) {
      beats.add(beatId);
      return beatId;
    },
    trackObject(bucket, key) {
      objects.push({ bucket, key });
    },
    cleanup,
  };
}
