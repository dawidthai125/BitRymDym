/**
 * STU-16 — server upload window for PENDING_UPLOAD reservations. The DB
 * behaviour is covered live by stu16-pending-upload-window-live.test.ts; this
 * file pins the parity between the TS constant, the migration and the client
 * lease, the client message, and janitor resilience when the RPC is missing.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import { TAKE_PENDING_UPLOAD_WINDOW_SECONDS } from "@/config/recording";
import {
  TAKE_RECOVERY_CLAIM_MAX_HOLD_MS,
  createTakeRecoveryWriter,
  recoverTakeRecording,
  takeRecoveryOutcomePl,
  type TakeRecoveryDeps,
  type TakeRecoverySurface,
} from "@/lib/takes/take-recording-recovery";
import { MemoryTakeRecoveryStore } from "@/test/take-recovery-memory-store";

const rpc = vi.fn();
const from = vi.fn();
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ rpc, from }),
}));

const migration = readFileSync(
  join(process.cwd(), "supabase/migrations/20261018120000_stu16_pending_upload_window.sql"),
  "utf8",
);

function emptyQuery() {
  const result = Promise.resolve({ data: [], error: null });
  const chain: Record<string, unknown> = {};
  for (const method of ["select", "in", "is", "eq", "not", "lte", "order", "limit"]) {
    chain[method] = () => chain;
  }
  chain.then = result.then.bind(result);
  return chain;
}

afterEach(() => {
  rpc.mockReset();
  from.mockReset();
});

const OLD_TAKE = "44444444-4444-4444-8444-444444444444";
const NEW_TAKE = "55555555-5555-4555-8555-555555555555";
const USER = "66666666-6666-4666-8666-666666666666";
const RELEASED = "Take is not awaiting finalize (status=FAILED).";

function transportError(raw: string) {
  return Object.assign(new Error(`PL: ${raw}`), { rawMessage: raw });
}

async function copyWithServerTake(
  store: MemoryTakeRecoveryStore,
  surface: TakeRecoverySurface,
  ownerUserId: string | null,
  stages: ("SESSION_CREATED" | "BINARY_UPLOADED")[],
) {
  let t = 1_000_000;
  const writer = createTakeRecoveryWriter({
    store,
    recoveryId: crypto.randomUUID(),
    claimant: "tab-A",
    surface,
    projectId: surface === "STUDIO" ? "11111111-1111-4111-8111-111111111111" : null,
    ownerUserId,
    beatId: "22222222-2222-4222-8222-222222222222",
    mimeType: "audio/webm;codecs=opus",
    maxRecordingSeconds: 60,
    now: () => t,
  });
  for (const part of ["a", "bb", "ccc"]) {
    t += 250;
    writer.append(new Blob([part], { type: "audio/webm" }));
  }
  expect(await writer.finish("COMPLETE", 1_000)).toBe(true);
  for (const stage of stages) await writer.noteStage(stage, OLD_TAKE);
  await writer.release();
  return { writer, now: () => t };
}

function recoveryDeps(
  store: MemoryTakeRecoveryStore,
  now: () => number,
  viewerUserId: string | null,
  overrides: Partial<TakeRecoveryDeps> = {},
) {
  const upload = vi.fn(async (params: Parameters<TakeRecoveryDeps["upload"]>[0]) => {
    await params.onStage({ stage: "SESSION_CREATED", takeId: NEW_TAKE });
    await params.onStage({ stage: "BINARY_UPLOADED", takeId: NEW_TAKE });
    return { takeId: NEW_TAKE };
  });
  const finalize = vi.fn<TakeRecoveryDeps["finalize"]>(async () => {
    throw transportError(RELEASED);
  });
  return { store, claimant: "tab-B", now, viewerUserId, upload, finalize, ...overrides } as TakeRecoveryDeps & {
    upload: typeof upload;
    finalize: typeof finalize;
  };
}

describe("STU-16 PENDING_UPLOAD server upload window", () => {
  it("TS constant equals the window returned by the migration", () => {
    const match = migration.match(
      /FUNCTION public\.take_pending_upload_window_seconds\(\)[\s\S]*?AS \$\$\s*SELECT (\d+)\s*\$\$/,
    );
    expect(match?.[1]).toBe(String(TAKE_PENDING_UPLOAD_WINDOW_SECONDS));
  });

  it("window is not shorter than the client lease hold, so a live upload is never released mid-flight", () => {
    expect(TAKE_PENDING_UPLOAD_WINDOW_SECONDS * 1000).toBeGreaterThanOrEqual(
      TAKE_RECOVERY_CLAIM_MAX_HOLD_MS,
    );
  });

  it("both claim RPCs and the janitor RPC only release reservations without an uploaded object", () => {
    const guards = migration.match(
      /AND NOT EXISTS \(\s*SELECT 1\s+FROM storage\.objects o\s+WHERE o\.bucket_id = t\.storage_bucket\s+AND o\.name = t\.object_key\s*\)/g,
    );
    expect(guards?.length).toBe(3);
    expect(migration).not.toMatch(/status\s*=\s*'READY'[^;]*PENDING_UPLOAD_WINDOW_ELAPSED/);
  });

  it("concurrent-session message tells the user when a stale reservation stops blocking", () => {
    const text = takeRecoveryOutcomePl({
      kind: "UPLOAD_FAILED",
      message: "CONCURRENT_SESSION",
      concurrentSession: true,
      dailyLimit: false,
    });
    expect(text).toMatch(/inna sesja nagrania/);
    expect(text).toContain(`${TAKE_PENDING_UPLOAD_WINDOW_SECONDS / 60} min`);
    expect(text).toMatch(/Lokalna kopia została zachowana/);
  });

  it.each([
    ["STUDIO", USER, ["SESSION_CREATED"]],
    ["STUDIO", USER, ["SESSION_CREATED", "BINARY_UPLOADED"]],
    ["QUICK_TAKE", null, ["SESSION_CREATED"]],
    ["QUICK_TAKE", USER, ["SESSION_CREATED", "BINARY_UPLOADED"]],
  ] as const)(
    "%s (owner %s, stages %j): a reservation released by the server is replaced by exactly one fresh upload",
    async (surface, owner, stages) => {
      const store = new MemoryTakeRecoveryStore();
      const { writer, now } = await copyWithServerTake(store, surface, owner, [...stages]);
      const d = recoveryDeps(store, now, owner);
      expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({
        kind: "SAVED",
        takeId: NEW_TAKE,
        alreadySaved: false,
        localCopyRemoved: true,
      });
      expect(d.finalize).toHaveBeenCalledTimes(1);
      expect(d.finalize).toHaveBeenCalledWith(OLD_TAKE, { anonymous: owner === null });
      expect(d.upload).toHaveBeenCalledTimes(1);
      expect(store.records.has(writer.recoveryId)).toBe(false);
    },
  );

  it("fresh upload refused because another reservation is still inside the window keeps the local copy", async () => {
    const store = new MemoryTakeRecoveryStore();
    const { writer, now } = await copyWithServerTake(store, "STUDIO", USER, ["SESSION_CREATED"]);
    const d = recoveryDeps(store, now, USER, {
      upload: vi.fn(async () => {
        throw transportError("CONCURRENT_SESSION: another recording session is in progress");
      }),
    });
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toMatchObject({ kind: "UPLOAD_FAILED", concurrentSession: true });
    expect(store.records.get(writer.recoveryId)?.upload ?? null).toBeNull();
    expect(store.records.get(writer.recoveryId)?.claim ?? null).toBeNull();
    expect(takeRecoveryOutcomePl(outcome)).toContain(`${TAKE_PENDING_UPLOAD_WINDOW_SECONDS / 60} min`);
  });

  it("janitor reports a failing release RPC and still runs retention", async () => {
    rpc.mockResolvedValue({ data: null, error: { message: "function does not exist" } });
    from.mockImplementation(() => emptyQuery());
    const { runTakesRetentionJanitor } = await import("@/lib/takes/takes-janitor");
    const result = await runTakesRetentionJanitor();
    expect(rpc).toHaveBeenCalledWith("release_stale_pending_take_reservations", { p_limit: 50 });
    expect(result.pendingWindowError).toBe("function does not exist");
    expect(result.pendingWindowReleased).toBe(0);
    expect(from).toHaveBeenCalledTimes(3);
  });
});
