/**
 * STU-16 — server upload window for PENDING_UPLOAD reservations (migration
 * 20261018120000_stu16_pending_upload_window.sql), LOCAL Supabase only.
 * Gate: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* + bpm fixture; catalog
 * checks via `docker exec` on the local DB container. Every user, beat and
 * take is created here and removed by `createIntegrationFixtures`.
 * "Window elapsed" is simulated by moving `created_at` of the test's own take
 * back in time (service role); all assertions read the rows back.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { applyIntegrationEnv, resolveIntegrationEnv } from "@/test/integration-env";
import { createIntegrationFixtures } from "@/test/integration-fixtures";

import {
  TAKE_AUDIO_BUCKET,
  TAKE_PENDING_UPLOAD_WINDOW_SECONDS,
} from "@/config/recording";
import type { AuthContext } from "@/lib/auth/types";
import { buildAnonTakeObjectKey, buildUserTakeObjectKey } from "@/lib/takes/object-key";
import { finalizeTakeRecordingFor } from "@/lib/takes/take-transport";
import {
  PENDING_UPLOAD_WINDOW_ELAPSED,
  runTakesRetentionJanitor,
} from "@/lib/takes/takes-janitor";

const fixturePath = resolve(process.cwd(), "../bitrymdym-fixtures/bpm-120-steady.wav");
const integration = resolveIntegrationEnv({ fixturePath });
const live = integration.enabled;
const url = integration.enabled ? integration.url : "";
const anonKey = integration.enabled ? integration.anonKey : "";
const serviceKey = integration.enabled ? integration.serviceKey : "";
const dbContainer = process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_bitrymdym-local";

if (integration.enabled) applyIntegrationEnv(integration);

const WINDOW = TAKE_PENDING_UPLOAD_WINDOW_SECONDS;

function psql(sql: string): string {
  return execFileSync(
    "docker",
    ["exec", "-i", dbContainer, "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1", "-U", "postgres", "-d", "postgres"],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

function context(userId: string): AuthContext {
  return {
    userId,
    email: `${userId}@example.com`,
    profile: {
      id: userId,
      displayName: "STU16",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: [],
  };
}

type ClaimResult = { takeId: string; error: string | null };

describe.runIf(live)("STU-16 PENDING_UPLOAD server upload window", () => {
  let admin: SupabaseClient;
  let fixtures: ReturnType<typeof createIntegrationFixtures>;
  let bytes: Buffer;
  let ownerA = "";
  let ownerB = "";
  let userClientA: SupabaseClient;
  let beatId = "";
  const anonHash = randomUUID().replace(/-/g, "") + randomUUID().replace(/-/g, "");

  async function makeUser(tag: string) {
    const email = `stu16-${tag}-${randomUUID().slice(0, 8)}@example.com`;
    const password = `S16!${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error || !data.user) throw new Error(error?.message ?? "createUser");
    const id = fixtures.trackUser(data.user.id);
    const { error: profileErr } = await admin
      .from("profiles")
      .upsert({ id, role: "USER", account_level: "BEGINNER_RAPPER", display_name: `STU16 ${tag}` });
    if (profileErr) throw new Error(profileErr.message);
    return { id, email, password };
  }

  async function claim(
    ownerId: string,
    opts: { takeId?: string; maxSessions?: number; maxActive?: number } = {},
  ): Promise<ClaimResult> {
    const takeId = opts.takeId ?? randomUUID();
    const { error } = await admin.rpc("claim_take_recording_session", {
      p_owner_id: ownerId,
      p_beat_id: beatId,
      p_take_id: takeId,
      p_object_key: buildUserTakeObjectKey({ ownerId, takeId }),
      p_content_type: "audio/wav",
      p_byte_size: bytes.byteLength,
      p_recording_mode: "FULL",
      p_beat_duration_seconds: 60,
      p_recording_max_seconds: 180,
      p_beat_bpm: 120,
      p_expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      p_max_active_ready: opts.maxActive ?? 50,
      p_max_sessions_utc_day: opts.maxSessions ?? 500,
      p_replace_take_id: null,
    });
    return { takeId, error: error?.message ?? null };
  }

  async function claimAnon(): Promise<ClaimResult> {
    const takeId = randomUUID();
    const { error } = await admin.rpc("claim_anon_take_recording_session", {
      p_anonymous_token_hash: anonHash,
      p_beat_id: beatId,
      p_take_id: takeId,
      p_object_key: buildAnonTakeObjectKey({ tokenHashPrefix: anonHash.slice(0, 32), takeId }),
      p_content_type: "audio/wav",
      p_byte_size: bytes.byteLength,
      p_recording_mode: "QUICK",
      p_beat_duration_seconds: 60,
      p_recording_max_seconds: 30,
      p_beat_bpm: 120,
      p_expires_at: new Date(Date.now() + 2 * 3600_000).toISOString(),
      p_max_active_ready: 50,
      p_max_sessions_utc_day: 500,
      p_replace_take_id: null,
    });
    return { takeId, error: error?.message ?? null };
  }

  async function row(takeId: string) {
    const { data, error } = await admin
      .from("takes")
      .select("id, status, failure_reason, expires_at, created_at, deleted_at")
      .eq("id", takeId)
      .maybeSingle();
    if (error) throw new Error(error.message);
    return data;
  }

  async function ageTake(takeId: string, seconds: number) {
    const { error } = await admin
      .from("takes")
      .update({ created_at: new Date(Date.now() - seconds * 1000).toISOString() })
      .eq("id", takeId);
    if (error) throw new Error(error.message);
  }

  async function uploadObject(ownerId: string, takeId: string) {
    const key = buildUserTakeObjectKey({ ownerId, takeId });
    fixtures.trackObject(TAKE_AUDIO_BUCKET, key);
    const { error } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .upload(key, bytes, { contentType: "audio/wav" });
    if (error) throw new Error(error.message);
  }

  async function objectExists(ownerId: string, takeId: string): Promise<boolean> {
    const key = buildUserTakeObjectKey({ ownerId, takeId });
    const slash = key.lastIndexOf("/");
    const name = key.slice(slash + 1);
    const { data, error } = await admin.storage
      .from(TAKE_AUDIO_BUCKET)
      .list(key.slice(0, slash), { search: name });
    if (error) throw new Error(error.message);
    return (data ?? []).some((entry) => entry.name === name);
  }

  async function pendingOf(ownerId: string): Promise<string[]> {
    const { data, error } = await admin
      .from("takes")
      .select("id")
      .eq("owner_id", ownerId)
      .eq("status", "PENDING_UPLOAD")
      .is("deleted_at", null);
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => r.id as string);
  }

  /** UTC-day session counter — same predicate as claim RPCs (any status). */
  async function sessionsToday(ownerId: string): Promise<number> {
    const dayStart = new Date();
    dayStart.setUTCHours(0, 0, 0, 0);
    const { count, error } = await admin
      .from("takes")
      .select("id", { count: "exact", head: true })
      .eq("owner_id", ownerId)
      .gte("created_at", dayStart.toISOString());
    if (error) throw new Error(error.message);
    return count ?? 0;
  }

  /** Ends the fixture owner's own open reservation between scenarios. */
  async function clearPending(ownerId: string) {
    const { error } = await admin
      .from("takes")
      .update({ status: "FAILED", failure_reason: "STU16_TEST_RESET" })
      .eq("owner_id", ownerId)
      .eq("status", "PENDING_UPLOAD");
    if (error) throw new Error(error.message);
  }

  async function releaseBatch(): Promise<string[]> {
    const { data, error } = await admin.rpc("release_stale_pending_take_reservations", { p_limit: 500 });
    if (error) throw new Error(error.message);
    return ((data ?? []) as { take_id: string }[]).map((r) => r.take_id);
  }

  beforeAll(async () => {
    admin = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    fixtures = createIntegrationFixtures(admin);
    bytes = readFileSync(fixturePath);
    const a = await makeUser("a");
    ownerA = a.id;
    ownerB = (await makeUser("b")).id;
    userClientA = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { error: signErr } = await userClientA.auth.signInWithPassword({ email: a.email, password: a.password });
    if (signErr) throw new Error(signErr.message);
    beatId = fixtures.trackBeat(randomUUID());
    const { error: beatErr } = await admin.from("beats").insert({
      id: beatId,
      owner_id: ownerA,
      ownership_type: "USER",
      title: `STU16 Beat ${beatId.slice(0, 6)}`,
      bpm: 120,
      duration_seconds: 60,
      status: "PUBLISHED",
      tags: [],
    });
    if (beatErr) throw new Error(beatErr.message);
  }, 60_000);

  afterAll(async () => {
    if (fixtures) await fixtures.cleanup();
  }, 60_000);

  it("1–3: creates one reservation; a retry or second claim inside the window is refused and changes nothing", async () => {
    const first = await claim(ownerA);
    expect(first.error).toBeNull();
    const created = await row(first.takeId);
    expect(created?.status).toBe("PENDING_UPLOAD");
    expect(new Date(created!.expires_at as string).getTime()).toBeGreaterThan(Date.now() + 3600_000);

    const retry = await claim(ownerA, { takeId: first.takeId });
    expect(retry.error).toMatch(/CONCURRENT_SESSION/);
    const second = await claim(ownerA);
    expect(second.error).toMatch(/CONCURRENT_SESSION/);
    expect(await row(second.takeId)).toBeNull();
    expect(await pendingOf(ownerA)).toEqual([first.takeId]);
    expect((await row(first.takeId))?.status).toBe("PENDING_UPLOAD");
    await clearPending(ownerA);
  });

  it("4: just inside the window, or past it with the object uploaded, the reservation keeps blocking", async () => {
    const inside = await claim(ownerA);
    await ageTake(inside.takeId, WINDOW - 60);
    expect((await claim(ownerA)).error).toMatch(/CONCURRENT_SESSION/);
    expect(await releaseBatch()).not.toContain(inside.takeId);
    expect((await row(inside.takeId))?.status).toBe("PENDING_UPLOAD");
    await clearPending(ownerA);

    const landed = await claim(ownerA);
    await uploadObject(ownerA, landed.takeId);
    await ageTake(landed.takeId, WINDOW + 120);
    expect((await claim(ownerA)).error).toMatch(/CONCURRENT_SESSION/);
    expect(await releaseBatch()).not.toContain(landed.takeId);
    expect(await row(landed.takeId)).toMatchObject({ status: "PENDING_UPLOAD", failure_reason: null });

    const done = await finalizeTakeRecordingFor(context(ownerA), { takeId: landed.takeId });
    expect(done.status).toBe("READY");
    expect((await row(landed.takeId))?.status).toBe("READY");
  });

  it("5: the janitor batch releases a stale reservation without object exactly once", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    expect(await releaseBatch()).toContain(stale.takeId);
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect(await releaseBatch()).not.toContain(stale.takeId);
    expect(await pendingOf(ownerA)).toEqual([]);
  });

  it("5b: the retention janitor releases via the RPC and removes an object uploaded after the release", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    const first = await runTakesRetentionJanitor();
    expect(first.pendingWindowError).toBeNull();
    expect(first.pendingWindowReleasedIds).toContain(stale.takeId);
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });

    await uploadObject(ownerA, stale.takeId);
    expect(await objectExists(ownerA, stale.takeId)).toBe(true);
    const second = await runTakesRetentionJanitor();
    expect(second.pendingWindowReleasedIds).not.toContain(stale.takeId);
    expect(second.storageErrors).toBe(0);
    expect(await objectExists(ownerA, stale.takeId)).toBe(false);
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect(await pendingOf(ownerA)).toEqual([]);
  });

  it("6, 8, 10: a new claim takes over a stale reservation; the old take id can no longer be finalized", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    const next = await claim(ownerA);
    expect(next.error).toBeNull();
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect(await pendingOf(ownerA)).toEqual([next.takeId]);

    await expect(finalizeTakeRecordingFor(context(ownerA), { takeId: stale.takeId })).rejects.toThrow(
      /not awaiting finalize/i,
    );
    const { error: rpcErr } = await admin.rpc("finalize_take_ready_swap", {
      p_take_id: stale.takeId,
      p_actor_owner_id: ownerA,
      p_actor_anon_hash: null,
      p_duration_seconds: 5,
      p_byte_size: bytes.byteLength,
      p_content_type: "audio/wav",
    });
    expect(rpcErr?.message).toMatch(/not awaiting finalize/i);
    await expect(finalizeTakeRecordingFor(context(ownerA), { takeId: randomUUID() })).rejects.toThrow(
      /not found/i,
    );
    expect((await row(stale.takeId))?.status).toBe("FAILED");
    expect(await pendingOf(ownerA)).toEqual([next.takeId]);
    await clearPending(ownerA);
  });

  it("7: parallel takeover attempts yield exactly one new reservation", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    const results = await Promise.all([claim(ownerA), claim(ownerA), claim(ownerA)]);
    const winners = results.filter((r) => r.error === null);
    expect(winners).toHaveLength(1);
    for (const loser of results.filter((r) => r.error !== null)) {
      expect(loser.error).toMatch(/CONCURRENT_SESSION/);
      expect(await row(loser.takeId)).toBeNull();
    }
    expect(await pendingOf(ownerA)).toEqual([winners[0]!.takeId]);
    expect((await row(stale.takeId))?.status).toBe("FAILED");
    await clearPending(ownerA);
  });

  it("9, 16: another actor's claim or finalize never releases or touches someone else's reservation", async () => {
    const staleA = await claim(ownerA);
    await ageTake(staleA.takeId, WINDOW + 60);
    expect((await claim(ownerB)).error).toBeNull();
    expect((await claimAnon()).error).toBeNull();
    expect((await row(staleA.takeId))?.status).toBe("PENDING_UPLOAD");
    await expect(finalizeTakeRecordingFor(context(ownerB), { takeId: staleA.takeId })).rejects.toThrow(
      /not take owner/i,
    );
    expect((await row(staleA.takeId))?.status).toBe("PENDING_UPLOAD");
    await clearPending(ownerA);
    await clearPending(ownerB);
  });

  it("anonymous claim releases only the same guest's stale reservation", async () => {
    const { data: openAnon } = await admin
      .from("takes")
      .select("id")
      .eq("anonymous_token_hash", anonHash)
      .eq("status", "PENDING_UPLOAD");
    const staleAnonId = (openAnon ?? [])[0]?.id as string;
    expect(staleAnonId).toBeTruthy();
    expect((await claimAnon()).error).toMatch(/CONCURRENT_SESSION/);
    await ageTake(staleAnonId, WINDOW + 60);
    const next = await claimAnon();
    expect(next.error).toBeNull();
    expect(await row(staleAnonId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect((await row(next.takeId))?.status).toBe("PENDING_UPLOAD");
    await ageTake(next.takeId, WINDOW + 60);
    expect(await releaseBatch()).toContain(next.takeId);
  });

  it("11, 12: a known take id resumes inside the window; finalize retries are idempotent", async () => {
    const session = await claim(ownerA);
    await uploadObject(ownerA, session.takeId);
    const first = await finalizeTakeRecordingFor(context(ownerA), { takeId: session.takeId });
    const again = await finalizeTakeRecordingFor(context(ownerA), { takeId: session.takeId });
    expect(first).toMatchObject({ takeId: session.takeId, status: "READY" });
    expect(again).toMatchObject({ takeId: session.takeId, status: "READY", durationSeconds: first.durationSeconds });
    const { count } = await admin
      .from("takes")
      .select("id", { count: "exact", head: true })
      .eq("object_key", buildUserTakeObjectKey({ ownerId: ownerA, takeId: session.takeId }));
    expect(count).toBe(1);
  });

  it("13: claim racing finalize on a stale reservation whose object landed — finalize wins, no data lost", async () => {
    const session = await claim(ownerA);
    await uploadObject(ownerA, session.takeId);
    await ageTake(session.takeId, WINDOW + 60);
    const [claimed, finalized] = await Promise.allSettled([
      claim(ownerA),
      finalizeTakeRecordingFor(context(ownerA), { takeId: session.takeId }),
    ]);
    expect(finalized.status).toBe("fulfilled");
    expect((await row(session.takeId))?.status).toBe("READY");
    expect(claimed.status).toBe("fulfilled");
    const claimError = (claimed as PromiseFulfilledResult<ClaimResult>).value.error;
    expect(claimError === null || /CONCURRENT_SESSION/.test(claimError)).toBe(true);
    expect((await pendingOf(ownerA)).length).toBeLessThanOrEqual(1);
    await clearPending(ownerA);
  });

  it("14: janitor racing claim on a stale reservation — released once, one new reservation", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    const [released, claimed] = await Promise.all([releaseBatch(), claim(ownerA)]);
    expect(claimed.error).toBeNull();
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect(released).not.toContain(claimed.takeId);
    expect(await pendingOf(ownerA)).toEqual([claimed.takeId]);
    await clearPending(ownerA);
  });

  it("15: READY takes older than the window are never released", async () => {
    const session = await claim(ownerA);
    await uploadObject(ownerA, session.takeId);
    await finalizeTakeRecordingFor(context(ownerA), { takeId: session.takeId });
    await ageTake(session.takeId, WINDOW * 10);
    expect(await releaseBatch()).not.toContain(session.takeId);
    expect((await claim(ownerA)).error).toBeNull();
    expect(await row(session.takeId)).toMatchObject({ status: "READY", failure_reason: null });
    await clearPending(ownerA);
  });

  it("17: anon and authenticated callers cannot execute the RPCs; nothing changes", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    const anonClient = createClient(url, anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
    for (const client of [anonClient, userClientA]) {
      const release = await client.rpc("release_stale_pending_take_reservations", { p_limit: 10 });
      expect(release.error).not.toBeNull();
      const window = await client.rpc("take_pending_upload_window_seconds");
      expect(window.error).not.toBeNull();
      const takeId = randomUUID();
      const claimed = await client.rpc("claim_take_recording_session", {
        p_owner_id: ownerA,
        p_beat_id: beatId,
        p_take_id: takeId,
        p_object_key: buildUserTakeObjectKey({ ownerId: ownerA, takeId }),
        p_content_type: "audio/wav",
        p_byte_size: 10,
        p_recording_mode: "FULL",
        p_beat_duration_seconds: 60,
        p_recording_max_seconds: 180,
        p_beat_bpm: 120,
        p_expires_at: new Date(Date.now() + 3600_000).toISOString(),
        p_max_active_ready: 50,
        p_max_sessions_utc_day: 500,
        p_replace_take_id: null,
      });
      expect(claimed.error).not.toBeNull();
      expect(await row(takeId)).toBeNull();
    }
    expect((await row(stale.takeId))?.status).toBe("PENDING_UPLOAD");
    await clearPending(ownerA);
  });

  it("18: catalog — search_path, SECURITY mode and grants of the STU-16 functions", () => {
    const rows = psql(`
      SELECT p.proname || '|' || p.prosecdef || '|' || array_to_string(p.proconfig, ',') || '|' ||
             has_function_privilege('anon', p.oid, 'EXECUTE') || '|' ||
             has_function_privilege('authenticated', p.oid, 'EXECUTE') || '|' ||
             has_function_privilege('service_role', p.oid, 'EXECUTE')
      FROM pg_proc p
      WHERE p.pronamespace = 'public'::regnamespace
        AND p.proname IN ('claim_take_recording_session', 'claim_anon_take_recording_session',
                          'release_stale_pending_take_reservations', 'take_pending_upload_window_seconds')
      ORDER BY 1;`).split("\n");
    expect(rows).toEqual([
      'claim_anon_take_recording_session|true|search_path=""|false|false|true',
      'claim_take_recording_session|true|search_path=""|false|false|true',
      'release_stale_pending_take_reservations|false|search_path=""|false|false|true',
      'take_pending_upload_window_seconds|false|search_path=""|false|false|true',
    ]);
    expect(psql("SELECT public.take_pending_upload_window_seconds();")).toBe(String(WINDOW));
  });

  it("19, 20: daily cap still applies to a takeover, and a failed claim rolls the release back", async () => {
    const stale = await claim(ownerA);
    await ageTake(stale.takeId, WINDOW + 60);
    const today = await sessionsToday(ownerA);
    const capped = await claim(ownerA, { maxSessions: today });
    expect(capped.error).toMatch(/SESSION_DAY_CAP/);
    expect((await row(stale.takeId))?.status).toBe("PENDING_UPLOAD");

    const activeCap = await claim(ownerA, { maxActive: 0 });
    expect(activeCap.error).toMatch(/REPLACE_REQUIRED/);
    expect((await row(stale.takeId))?.status).toBe("PENDING_UPLOAD");

    // Unique violation after the release statement → whole claim rolled back.
    const duplicateId = await claim(ownerA, { takeId: stale.takeId });
    expect(duplicateId.error).toMatch(/CONCURRENT_SESSION/);
    expect(await row(stale.takeId)).toMatchObject({ status: "PENDING_UPLOAD", failure_reason: null });
    expect(await pendingOf(ownerA)).toEqual([stale.takeId]);
    await clearPending(ownerA);
  });

  it("SESSION_DAY_CAP: retry/resume do not spend; expiry does not refund; takeover spends one more", async () => {
    const before = await sessionsToday(ownerA);
    const first = await claim(ownerA);
    expect(first.error).toBeNull();
    expect(await sessionsToday(ownerA)).toBe(before + 1);

    // Same takeId retry — no new row.
    expect((await claim(ownerA, { takeId: first.takeId })).error).toMatch(/CONCURRENT_SESSION/);
    expect(await sessionsToday(ownerA)).toBe(before + 1);

    // Finalize path for a known take is resume, not a new claim (no second INSERT).
    await uploadObject(ownerA, first.takeId);
    const ready = await finalizeTakeRecordingFor(context(ownerA), { takeId: first.takeId });
    expect(ready.status).toBe("READY");
    expect(await sessionsToday(ownerA)).toBe(before + 1);

    // New reservation, then window elapse without object → FAILED still counts.
    const stale = await claim(ownerA);
    expect(await sessionsToday(ownerA)).toBe(before + 2);
    await ageTake(stale.takeId, WINDOW + 60);
    expect(await releaseBatch()).toContain(stale.takeId);
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect(await sessionsToday(ownerA)).toBe(before + 2);

    // Cap-1: exactly one slot left → takeover OK and spends that slot.
    const atCapMinus1 = await sessionsToday(ownerA);
    const takeover = await claim(ownerA, { maxSessions: atCapMinus1 + 1 });
    expect(takeover.error).toBeNull();
    expect(await sessionsToday(ownerA)).toBe(atCapMinus1 + 1);
    expect(await row(stale.takeId)).toMatchObject({
      status: "FAILED",
      failure_reason: PENDING_UPLOAD_WINDOW_ELAPSED,
    });
    expect(await pendingOf(ownerA)).toEqual([takeover.takeId]);

    // Exact cap: next claim refused; expired row still in the count.
    const atCap = await sessionsToday(ownerA);
    expect((await claim(ownerA, { maxSessions: atCap })).error).toMatch(/SESSION_DAY_CAP/);
    await clearPending(ownerA);
  });
});

describe("STU-16 live gate", () => {
  it("documents live skip when env/fixtures missing", () => {
    expect(typeof live).toBe("boolean");
  });
});
