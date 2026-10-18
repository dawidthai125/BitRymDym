/**
 * STU-15 — shared recording recovery (Studio + Quick Take), owner binding,
 * bounded lease renewal and PENDING_UPLOAD resume. Scenarios already pinned by
 * STU-14 (stu-14-recording-recovery.test.ts) are not repeated here; this file
 * covers regression scenarios 2, 21–25 (recovery), 26–36 (lock / lease) and
 * 37–43 (network before / after upload, several copies, TTL, discard + reopen,
 * daily limit, keyboard discard confirm).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";

import {
  TAKE_RECOVERY_CLAIM_LEASE_MS,
  TAKE_RECOVERY_CLAIM_MAX_HOLD_MS,
  TAKE_RECOVERY_CLAIM_RENEW_MS,
  TAKE_RECOVERY_FORMAT_VERSION,
  TakeRecoveryLeaseLostError,
  TakeRecoveryStoreError,
  claimMutation,
  createRecoveryRecordMutation,
  createTakeRecoveryChunkBuffer,
  createTakeRecoveryWriter,
  discardTakeRecording,
  listTakeRecoveries,
  recoverTakeRecording,
  releaseClaimMutation,
  renewClaimMutation,
  startTakeRecoveryLeaseKeeper,
  takeRecoveryOutcomePl,
  takeRecoveryWriterStatusPl,
  uploadStageMutation,
  type TakeRecoveryDeps,
  type TakeRecoverySurface,
  type TakeRecoveryWriter,
} from "@/lib/takes/take-recording-recovery";
import { TAKE_LOCAL_RECOVERY_TTL_SECONDS } from "@/config/recording";
import { MemoryTakeRecoveryStore } from "@/test/take-recovery-memory-store";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const quickTake = read("src/components/takes/recording-panel.tsx");
const studioPanel = read("src/components/studio/studio-recording-panel.tsx");
const banner = read("src/components/takes/take-recording-recovery-banner.tsx");
const idbSrc = read("src/lib/takes/take-recording-recovery-idb.ts");
const clientUpload = read("src/lib/takes/client-upload.ts");
const claimErrors = read("src/lib/takes/claim-errors.ts");

const PROJECT = "11111111-1111-4111-8111-111111111111";
const BEAT = "22222222-2222-4222-8222-222222222222";
const TAKE = "33333333-3333-4333-8333-333333333333";
const USER_A = "66666666-6666-4666-8666-666666666666";
const USER_B = "77777777-7777-4777-8777-777777777777";

function clock(start = 1_000_000) {
  let t = start;
  return {
    now: () => t,
    advance: (ms: number) => {
      t += ms;
    },
  };
}

function chunk(text: string) {
  return new Blob([text], { type: "audio/webm" });
}

function transportError(raw: string) {
  return Object.assign(new Error(`PL: ${raw}`), { rawMessage: raw });
}

type Owner = { surface: TakeRecoverySurface; ownerUserId: string | null };
const STUDIO_A: Owner = { surface: "STUDIO", ownerUserId: USER_A };
const QUICK_GUEST: Owner = { surface: "QUICK_TAKE", ownerUserId: null };
const QUICK_A: Owner = { surface: "QUICK_TAKE", ownerUserId: USER_A };

function makeWriter(
  store: MemoryTakeRecoveryStore | null,
  now: () => number,
  owner: Owner,
  claimant = "tab-A",
): TakeRecoveryWriter {
  return createTakeRecoveryWriter({
    store,
    recoveryId: crypto.randomUUID(),
    claimant,
    surface: owner.surface,
    projectId: owner.surface === "STUDIO" ? PROJECT : null,
    ownerUserId: owner.ownerUserId,
    beatId: BEAT,
    mimeType: "audio/webm;codecs=opus",
    maxRecordingSeconds: 60,
    now,
  });
}

async function recordComplete(
  store: MemoryTakeRecoveryStore,
  c: { now: () => number; advance: (ms: number) => void },
  owner: Owner = STUDIO_A,
  claimant = "tab-A",
) {
  const writer = makeWriter(store, c.now, owner, claimant);
  for (const p of ["a", "bb", "ccc"]) {
    c.advance(250);
    writer.append(chunk(p));
  }
  expect(await writer.finish("COMPLETE", 1_000)).toBe(true);
  return writer;
}

/** Complete copy whose lease was released (as after a failed upload). */
async function releasedCopy(
  store: MemoryTakeRecoveryStore,
  c: ReturnType<typeof clock>,
  owner: Owner = STUDIO_A,
) {
  const writer = await recordComplete(store, c, owner);
  await writer.release();
  return writer;
}

function deps(
  store: MemoryTakeRecoveryStore,
  now: () => number,
  viewerUserId: string | null,
  overrides: Partial<TakeRecoveryDeps> = {},
  claimant = "tab-B",
) {
  const upload = vi.fn(async (params: Parameters<TakeRecoveryDeps["upload"]>[0]) => {
    await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
    await params.onStage({ stage: "BINARY_UPLOADED", takeId: TAKE });
    return { takeId: TAKE };
  });
  const finalize = vi.fn<TakeRecoveryDeps["finalize"]>(async (takeId) => ({ takeId }));
  return { store, claimant, now, viewerUserId, upload, finalize, ...overrides } as TakeRecoveryDeps & {
    upload: typeof upload;
    finalize: typeof finalize;
  };
}

afterEach(() => {
  vi.useRealTimers();
});

// ---------------------------------------------------------------------------
// Recovery — scenarios not covered by STU-14
// ---------------------------------------------------------------------------

describe("STU-15 recovery — Quick Take and remaining scenarios", () => {
  it("2. Quick Take normal flow (guest + account): same writer, stages, delete only after READY", async () => {
    for (const owner of [QUICK_GUEST, QUICK_A]) {
      const store = new MemoryTakeRecoveryStore();
      const c = clock();
      const writer = await recordComplete(store, c, owner);
      const rec = store.records.get(writer.recoveryId)!;
      expect(rec).toMatchObject({
        surface: "QUICK_TAKE",
        projectId: null,
        ownerUserId: owner.ownerUserId,
        formatVersion: TAKE_RECOVERY_FORMAT_VERSION,
        status: "COMPLETE",
      });
      await writer.noteStage("SESSION_CREATED", TAKE);
      await writer.noteStage("BINARY_UPLOADED", TAKE);
      expect(store.records.size).toBe(1);
      expect(await writer.confirmSaved(TAKE)).toBe(true);
      expect(store.records.size).toBe(0);
    }

    // One record format for both surfaces; scope is validated, not guessed.
    expect(() =>
      createRecoveryRecordMutation({
        recoveryId: "x",
        surface: "QUICK_TAKE",
        projectId: PROJECT,
        ownerUserId: null,
        beatId: BEAT,
        mimeType: "audio/webm",
        maxRecordingSeconds: 60,
        now: 1,
      })(null),
    ).toThrow(TakeRecoveryStoreError);
    expect(() =>
      createRecoveryRecordMutation({
        recoveryId: "y",
        surface: "STUDIO",
        projectId: null,
        ownerUserId: USER_A,
        beatId: BEAT,
        mimeType: "audio/webm",
        maxRecordingSeconds: 60,
        now: 1,
      })(null),
    ).toThrow(TakeRecoveryStoreError);

    // Panel wiring: the same writer / recorder / upload helpers as Studio.
    expect(quickTake).toMatch(/surface: "QUICK_TAKE"/);
    expect(quickTake).toMatch(/recorder\.start\(\{ onChunk: chunkBuffer\.onChunk \}\)/);
    expect(quickTake).toMatch(/chunkBuffer\.attach\(writer\)/);
    expect(quickTake).toMatch(/writer\.finish\("COMPLETE", 3_000\)/);
    expect(quickTake.match(/await writer\.confirmSaved\(uploaded\.takeId\)/g)).toHaveLength(2);
    expect(quickTake.match(/writer\?\.noteStage\(stage\.stage, stage\.takeId\)/g)).toHaveLength(2);
    for (const src of [quickTake, studioPanel]) {
      expect(src).not.toMatch(/indexedDB\.open|new MediaRecorder\(/);
      expect(src).toMatch(/createTakeRecoveryChunkBuffer\(\)/);
    }
    expect(quickTake).toMatch(
      /<TakeRecordingRecoveryBanner\s+surface="QUICK_TAKE"\s+scopeId=\{beatId\}\s+authenticated=\{isAuthenticated\}/,
    );
    expect(quickTake).toMatch(/hidden=\{busy \|\| replaceCandidates != null\}/);
  });

  it("2b. Quick Take lifecycle: unmount seals INTERRUPTED, cancel discards, replace flow keeps the lease", () => {
    const unmount = quickTake.slice(
      quickTake.indexOf("mountedRef.current = true;"),
      quickTake.indexOf("// D02: anonymous Quick Take"),
    );
    expect(unmount).toMatch(/recoveryWriterRef\.current = null;/);
    expect(unmount).toMatch(/if \(writer\) sealInterruptedRecovery\(writer, stopped/);
    expect(unmount).toMatch(/replaceWriter\.release\(\)/);
    expect(quickTake).toMatch(
      /void stopped\s*\.then\(\(\) => writer\.finish\("INTERRUPTED", 5_000\)\)/,
    );
    const cancel = quickTake.slice(
      quickTake.indexOf("function cancelAll()"),
      quickTake.indexOf("async function confirmReplace"),
    );
    expect(cancel).toMatch(/if \(writer\) void writer\.discard\(\);/);
    expect(cancel).toMatch(/releaseReplaceWriter\(\);/);
    // REPLACE_REQUIRED: copy (and its lease) is handed to confirmReplace, not released.
    expect(quickTake.match(/if \(writer\) replaceWriterRef\.current = writer;/g)).toHaveLength(2);
    const confirm = quickTake.slice(
      quickTake.indexOf("async function confirmReplace"),
      quickTake.indexOf("async function showRecoveredTake"),
    );
    expect(confirm).toMatch(/const writer = replaceWriterRef\.current;/);
    expect(confirm).toMatch(/replaceTakeId,\s*onStage,/);
    // Mic is never opened after the panel is gone.
    expect(quickTake).toMatch(
      /if \(!mountedRef\.current\) \{\s*await recorder\.cancel\(\)\.catch\(\(\) => undefined\);/,
    );
  });

  it("2c. scope and owner: copies show only on their surface / beat and only to their owner", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const guest = await releasedCopy(store, c, QUICK_GUEST);
    const quickA = await releasedCopy(store, c, QUICK_A);
    const studioA = await releasedCopy(store, c, STUDIO_A);
    const ids = async (viewer: string | null, scope: Parameters<typeof listTakeRecoveries>[1]) =>
      (await listTakeRecoveries(deps(store, c.now, viewer), scope)).items.map(
        (i) => i.record.recoveryId,
      );
    expect(await ids(null, { surface: "QUICK_TAKE", beatId: BEAT })).toEqual([guest.recoveryId]);
    expect(await ids(USER_A, { surface: "QUICK_TAKE", beatId: BEAT })).toEqual([quickA.recoveryId]);
    expect(await ids(USER_A, { surface: "STUDIO", projectId: PROJECT })).toEqual([studioA.recoveryId]);
    expect(await ids(USER_B, { surface: "QUICK_TAKE", beatId: BEAT })).toEqual([]);
    expect(await ids(USER_A, { surface: "QUICK_TAKE", beatId: "other-beat" })).toEqual([]);

    // Another account can neither recover nor discard it (copy and lease untouched).
    const other = deps(store, c.now, USER_B);
    expect(await recoverTakeRecording(other, quickA.recoveryId)).toEqual({ kind: "OWNER_MISMATCH" });
    expect(await discardTakeRecording(other, quickA.recoveryId)).toBe("NOT_FOUND");
    expect(other.upload).not.toHaveBeenCalled();
    expect(store.records.get(quickA.recoveryId)!.claim).toBeNull();
    expect(takeRecoveryOutcomePl({ kind: "OWNER_MISMATCH" })).toMatch(/innego konta/);

    // Unknown (future) format is never listed for anyone, only purged by TTL.
    store.records.set(guest.recoveryId, {
      ...store.records.get(guest.recoveryId)!,
      formatVersion: 99,
    });
    expect(await ids(null, { surface: "QUICK_TAKE", beatId: BEAT })).toEqual([]);
    expect(store.records.has(guest.recoveryId)).toBe(true);
  });

  it("2d. guest recovery routes upload and finalize through the anonymous endpoints", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const guest = await releasedCopy(store, c, QUICK_GUEST);
    const d = deps(store, c.now, null);
    const outcome = await recoverTakeRecording(d, guest.recoveryId);
    expect(outcome).toEqual({ kind: "SAVED", takeId: TAKE, alreadySaved: false, localCopyRemoved: true });
    expect(d.upload.mock.calls[0][0].anonymous).toBe(true);
    expect(takeRecoveryOutcomePl(outcome, "QUICK_TAKE")).toMatch(/zapisane na serwerze/);

    const resumed = await recordComplete(store, c, QUICK_GUEST);
    await resumed.noteStage("SESSION_CREATED", TAKE);
    await resumed.noteStage("BINARY_UPLOADED", TAKE);
    await resumed.release();
    const d2 = deps(store, c.now, null);
    await recoverTakeRecording(d2, resumed.recoveryId);
    expect(d2.finalize).toHaveBeenCalledWith(TAKE, { anonymous: true });
    expect(banner).toMatch(/anonymous\s*\? uploadAnonTakeRecordingBlob\(params\)/);
    expect(banner).toMatch(/anonymous\s*\? finalizeAnonTakeRecordingUpload\(takeId\)/);
    expect(clientUpload).toMatch(/postTakeFinalize\("\/api\/takes\/anon\/finalize", takeId\)/);
  });

  it("21. connection lost during upload: copy and server stage kept, lease released, nothing claimed as saved", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c);
    const d = deps(store, c.now, USER_A, {
      upload: vi.fn(async (params) => {
        await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
        throw transportError("Failed to fetch");
      }),
    });
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toMatchObject({ kind: "UPLOAD_FAILED", concurrentSession: false });
    expect(store.records.get(writer.recoveryId)).toMatchObject({
      claim: null,
      upload: { stage: "SESSION_CREATED", takeId: TAKE },
    });
    expect(takeRecoveryOutcomePl(outcome)).toMatch(/Lokalna kopia została zachowana/);
    expect(quickTake).toMatch(/LOCALLY_SECURED_SUFFIX_PL/);
  });

  it("22. connection back: banner reloads on `online`; retry confirms the known take before any new upload", async () => {
    expect(banner).toMatch(/window\.addEventListener\("online", reload\)/);
    expect(banner).toMatch(/window\.removeEventListener\("online", reload\)/);
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.release();
    const d = deps(store, c.now, USER_A);
    expect((await recoverTakeRecording(d, writer.recoveryId)).kind).toBe("SAVED");
    expect(d.finalize).toHaveBeenCalledTimes(1);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("23. local save refused: honest status, no copy; signed-in page without a known account keeps none", async () => {
    const c = clock();
    const store = new MemoryTakeRecoveryStore();
    store.faultOnTransact = { at: "always", fault: "UNAVAILABLE" };
    const w = makeWriter(store, c.now, QUICK_GUEST);
    w.append(chunk("a"));
    expect(await w.finish("COMPLETE", 1_000)).toBe(false);
    expect(w.state).toBe("UNAVAILABLE");
    expect(takeRecoveryWriterStatusPl("UNAVAILABLE")).toMatch(/Nie zamykaj strony/);
    expect(takeRecoveryWriterStatusPl("SECURING")).toMatch(/niepotwierdzone/);
    expect(quickTake).toMatch(/store: ownerUserId === undefined \? null : recoveryStore/);
    expect(studioPanel).toMatch(/store: ownerUserId \? recoveryStore : null/);
    expect(idbSrc).toMatch(/if \(!authenticated\) return null;/);
    expect(idbSrc).toMatch(/auth\.getSession\(\)/);
    expect(banner).toMatch(/if \(!store \|\| viewerUserId === undefined\)/);
  });

  it("23b. status is visible from the first chunk and the decision notice takes focus", () => {
    for (const src of [quickTake, studioPanel]) {
      expect(src).toMatch(/recoveryWriterRef\.current = writer;\s*setLocalSafety\(writer\.state\);/);
    }
    expect(quickTake.match(/setLocalSafety\(null\)/g)?.length ?? 0).toBeGreaterThanOrEqual(3);
    expect(banner.match(/focusNoticeRef\.current = true;/g)?.length).toBe(2);
    expect(banner).toMatch(/if \(el && focusNoticeRef\.current\) \{\s*focusNoticeRef\.current = false;\s*el\.focus\(\);/);
  });

  it("24. finalize error that is not a dead session: no re-upload, copy and stage kept", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.noteStage("BINARY_UPLOADED", TAKE);
    await writer.release();
    for (const raw of ["Take duration could not be verified.", "Take audio object missing."]) {
      const d = deps(store, c.now, USER_A, {
        finalize: vi.fn(async () => {
          throw transportError(raw);
        }),
      });
      expect(await recoverTakeRecording(d, writer.recoveryId)).toMatchObject({
        kind: "UPLOAD_FAILED",
      });
      expect(d.upload).not.toHaveBeenCalled();
      expect(store.records.get(writer.recoveryId)!.upload).toEqual({
        stage: "BINARY_UPLOADED",
        takeId: TAKE,
      });
    }
  });

  it("25. resume an existing PENDING_UPLOAD: finalize first; only a dead session allows exactly one new upload", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", "old-take");
    await writer.release();
    const order: string[] = [];
    const d = deps(store, c.now, USER_A, {
      finalize: vi.fn(async (takeId: string) => {
        order.push(`finalize:${takeId}`);
        throw transportError("Take audio object missing.");
      }),
      upload: vi.fn(async (params) => {
        order.push("upload");
        await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
        await params.onStage({ stage: "BINARY_UPLOADED", takeId: TAKE });
        return { takeId: TAKE };
      }),
    });
    expect(await recoverTakeRecording(d, writer.recoveryId)).toMatchObject({
      kind: "SAVED",
      takeId: TAKE,
    });
    expect(order).toEqual(["finalize:old-take", "upload"]);
    expect(store.records.size).toBe(0);
  });
});

// ---------------------------------------------------------------------------
// Recovery — remaining matrix cases (master prompt A: 4, 7, 9, 11, 18, 19)
// ---------------------------------------------------------------------------

describe("STU-15 recovery — network, copies, TTL, discard, daily limit", () => {
  it("37. network lost before upload: no server take, copy kept without a stage, next try uploads the same bytes once", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c, QUICK_A);
    const offline = deps(store, c.now, USER_A, {
      upload: vi.fn(async () => {
        throw transportError("Failed to fetch");
      }),
    });
    expect(await recoverTakeRecording(offline, writer.recoveryId)).toMatchObject({
      kind: "UPLOAD_FAILED",
      concurrentSession: false,
      dailyLimit: false,
    });
    const kept = store.records.get(writer.recoveryId)!;
    expect(kept.claim).toBeNull();
    expect(kept.upload ?? null).toBeNull();
    expect(offline.finalize).not.toHaveBeenCalled();

    // The browser's own TypeError (no rawMessage) never reaches the UI in English.
    const native = deps(store, c.now, USER_A, {
      upload: vi.fn(async () => {
        throw new TypeError("Failed to fetch");
      }),
    });
    const nativeOutcome = await recoverTakeRecording(native, writer.recoveryId);
    expect(nativeOutcome).toMatchObject({ kind: "UPLOAD_FAILED", message: "Brak połączenia z serwerem." });
    expect(takeRecoveryOutcomePl(nativeOutcome)).toBe(
      "Błąd zapisu: Brak połączenia z serwerem. Lokalna kopia została zachowana — spróbuj ponownie po odzyskaniu połączenia.",
    );

    const online = deps(store, c.now, USER_A);
    expect(await recoverTakeRecording(online, writer.recoveryId)).toMatchObject({
      kind: "SAVED",
      takeId: TAKE,
    });
    expect(online.upload).toHaveBeenCalledTimes(1);
    expect(online.upload.mock.calls[0][0].blob.size).toBe("abbccc".length);
    expect(store.records.size).toBe(0);
  });

  it("38. ambiguous reply: server committed READY but the response was lost; retry finalizes the same take, never uploads again", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c);
    const lostReply = deps(store, c.now, USER_A, {
      upload: vi.fn(async (params) => {
        await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
        await params.onStage({ stage: "BINARY_UPLOADED", takeId: TAKE });
        throw transportError("Failed to fetch");
      }),
    });
    expect((await recoverTakeRecording(lostReply, writer.recoveryId)).kind).toBe("UPLOAD_FAILED");
    expect(store.records.get(writer.recoveryId)!.upload).toEqual({
      stage: "BINARY_UPLOADED",
      takeId: TAKE,
    });

    const retry = deps(store, c.now, USER_A);
    expect(await recoverTakeRecording(retry, writer.recoveryId)).toEqual({
      kind: "SAVED",
      takeId: TAKE,
      alreadySaved: false,
      localCopyRemoved: true,
    });
    expect(retry.finalize).toHaveBeenCalledTimes(1);
    expect(retry.finalize).toHaveBeenCalledWith(TAKE, { anonymous: false });
    expect(retry.upload).not.toHaveBeenCalled();
  });

  it("39. several local copies: each listed on its own; recovering one leaves the others and their bytes untouched", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const first = await releasedCopy(store, c);
    const second = await releasedCopy(store, c);
    const third = await releasedCopy(store, c);
    const scope = { surface: "STUDIO", projectId: PROJECT } as const;
    const listed = async () =>
      (await listTakeRecoveries(deps(store, c.now, USER_A), scope)).items
        .map((i) => i.record.recoveryId)
        .sort();
    expect(await listed()).toEqual([first, second, third].map((w) => w.recoveryId).sort());
    const thirdChunksBefore = await store.readChunks(third.recoveryId);

    const d = deps(store, c.now, USER_A);
    expect((await recoverTakeRecording(d, second.recoveryId)).kind).toBe("SAVED");
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(await listed()).toEqual([first, third].map((w) => w.recoveryId).sort());
    expect(await store.readChunks(third.recoveryId)).toEqual(thirdChunksBefore);
    expect(store.records.get(first.recoveryId)!.claim).toBeNull();
  });

  it("40. TTL: past 24 h a copy is no longer offered; a stale recovery attempt removes it without any upload", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const listedCopy = await releasedCopy(store, c, QUICK_A);
    const staleTabCopy = await releasedCopy(store, c, QUICK_A);
    const scope = { surface: "QUICK_TAKE", beatId: BEAT } as const;
    c.advance(TAKE_LOCAL_RECOVERY_TTL_SECONDS * 1000 - 5_000);
    expect((await listTakeRecoveries(deps(store, c.now, USER_A), scope)).items).toHaveLength(2);

    c.advance(10_000);
    // A tab still showing the old list clicks "Odzyskaj" after the TTL.
    const d = deps(store, c.now, USER_A);
    expect(await recoverTakeRecording(d, staleTabCopy.recoveryId)).toEqual({ kind: "EXPIRED" });
    expect(store.records.has(staleTabCopy.recoveryId)).toBe(false);
    // The next listing purges the rest instead of offering it.
    expect((await listTakeRecoveries(deps(store, c.now, USER_A), scope)).items).toEqual([]);
    expect(store.records.has(listedCopy.recoveryId)).toBe(false);
    expect(d.upload).not.toHaveBeenCalled();
    expect(d.finalize).not.toHaveBeenCalled();
    expect(takeRecoveryOutcomePl({ kind: "EXPIRED" })).toMatch(/wygasła/);
  });

  it("41. discard, then reopen: the copy is gone for good, nothing is offered, recovery reports NOT_FOUND", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c, QUICK_GUEST);
    const d = deps(store, c.now, null);
    expect(await discardTakeRecording(d, writer.recoveryId)).toBe("DISCARDED");
    expect(store.records.size).toBe(0);
    expect(await store.readChunks(writer.recoveryId).catch(() => [])).toEqual([]);

    const reopened = deps(store, c.now, null);
    expect(
      (await listTakeRecoveries(reopened, { surface: "QUICK_TAKE", beatId: BEAT })).items,
    ).toEqual([]);
    expect(await recoverTakeRecording(reopened, writer.recoveryId)).toEqual({ kind: "NOT_FOUND" });
    expect(await discardTakeRecording(reopened, writer.recoveryId)).toBe("NOT_FOUND");
    expect(reopened.upload).not.toHaveBeenCalled();
    expect(reopened.finalize).not.toHaveBeenCalled();
  });

  it("42. daily session limit: copy kept, one attempt only, message explains the limit instead of promising a retry", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c, QUICK_A);
    const d = deps(store, c.now, USER_A, {
      upload: vi.fn(async () => {
        throw transportError(
          "SESSION_DAY_CAP: Daily recording session limit reached for your sample policy.",
        );
      }),
    });
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toMatchObject({ kind: "UPLOAD_FAILED", dailyLimit: true, concurrentSession: false });
    expect(d.upload).toHaveBeenCalledTimes(1);
    expect(store.records.get(writer.recoveryId)).toMatchObject({ claim: null });
    const text = takeRecoveryOutcomePl(outcome, "QUICK_TAKE");
    expect(text).toMatch(/Dzienny limit sesji nagrań/);
    expect(text).toMatch(/Lokalna kopia została zachowana/);
    expect(text).toMatch(/24 h/);
    expect(text).not.toMatch(/spróbuj ponownie\.?$/);
  });

  it("42b. full active-take limit (REPLACE_REQUIRED) during recovery: Polish explanation, copy kept, no English API text", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c, QUICK_GUEST);
    const d = deps(store, c.now, null, {
      upload: vi.fn(async () => {
        throw Object.assign(
          new Error("REPLACE_REQUIRED: Active READY take limit reached — choose a sample to replace."),
          { code: "REPLACE_REQUIRED" },
        );
      }),
    });
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toMatchObject({ kind: "UPLOAD_FAILED" });
    const text = takeRecoveryOutcomePl(outcome, "QUICK_TAKE");
    expect(text).toMatch(/pełny limit aktywnych nagrań/);
    expect(text).toMatch(/Lokalna kopia została zachowana/);
    expect(text).not.toMatch(/REPLACE_REQUIRED|Active READY|choose a sample/);
    expect(store.records.get(writer.recoveryId)).toMatchObject({ claim: null });
  });

  it("43. discard confirm: Escape cancels like „Nie, zostaw” (focus back on the trigger); the group is labelled", () => {
    expect(banner).toMatch(/role="group"\s*aria-label="Potwierdzenie odrzucenia nagrania"/);
    expect(banner).toMatch(
      /if \(event\.key === "Escape" && busyId == null\) \{\s*event\.preventDefault\(\);\s*cancelDiscard\(\);/,
    );
    expect(banner).toMatch(/const cancelDiscard = \(\) => \{\s*restoreFocusIdRef\.current = id;\s*setConfirmDiscardId\(null\);/);
    expect(banner).toMatch(/onClick=\{cancelDiscard\}/);
  });
});

// ---------------------------------------------------------------------------
// Lock / lease — scenarios 26–36
// ---------------------------------------------------------------------------

describe("STU-15 lease — bounded renewal and ownership", () => {
  async function claimedCopy(store: MemoryTakeRecoveryStore, claimant = "tab-A") {
    vi.useFakeTimers({ now: 1_000_000 });
    const writer = await recordComplete(
      store,
      { now: Date.now, advance: (ms) => vi.setSystemTime(Date.now() + ms) },
      STUDIO_A,
      claimant,
    );
    return writer;
  }

  it("26. active operation renews its lease on a single bounded timer", async () => {
    const store = new MemoryTakeRecoveryStore();
    const writer = await claimedCopy(store);
    const before = store.records.get(writer.recoveryId)!.claim!;
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(TAKE_RECOVERY_CLAIM_RENEW_MS);
    const after = store.records.get(writer.recoveryId)!.claim!;
    expect(after.owner).toBe("tab-A");
    expect(after.acquiredAt).toBe(before.acquiredAt);
    expect(after.expiresAt).toBe(Date.now() + TAKE_RECOVERY_CLAIM_LEASE_MS);
    expect(after.expiresAt).toBeGreaterThan(before.expiresAt);
    expect(vi.getTimerCount()).toBe(1);
    await writer.release();
  });

  it("27. no renewal after finish / cancel / save: timers are gone", async () => {
    for (const end of ["confirmSaved", "release", "discard"] as const) {
      const store = new MemoryTakeRecoveryStore();
      const writer = await claimedCopy(store);
      if (end === "confirmSaved") {
        await writer.noteStage("SESSION_CREATED", TAKE);
        await writer.confirmSaved(TAKE);
      } else {
        await writer[end]();
      }
      expect(vi.getTimerCount()).toBe(0);
      const calls = store.transactCalls;
      await vi.advanceTimersByTimeAsync(TAKE_RECOVERY_CLAIM_LEASE_MS * 2);
      expect(store.transactCalls).toBe(calls);
      vi.useRealTimers();
    }

    // Recovery stops its keeper in `finally`, whatever the outcome.
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c);
    vi.useFakeTimers({ now: c.now() });
    const d = deps(store, Date.now, USER_A, {
      upload: vi.fn(async () => {
        throw transportError("Failed to fetch");
      }),
    });
    await recoverTakeRecording(d, writer.recoveryId);
    expect(vi.getTimerCount()).toBe(0);
  });

  it("28. expired lease: still ours until someone takes it; then another tab may claim", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await expect(
      store.transact(writer.recoveryId, claimMutation("tab-B", c.now())),
    ).rejects.toMatchObject({ code: "BUSY" });
    c.advance(TAKE_RECOVERY_CLAIM_LEASE_MS + 1);
    const renewed = await store.transact(writer.recoveryId, renewClaimMutation("tab-A", c.now()));
    expect(renewed.claim!.expiresAt).toBe(c.now() + TAKE_RECOVERY_CLAIM_LEASE_MS);
    c.advance(TAKE_RECOVERY_CLAIM_LEASE_MS + 1);
    const taken = await store.transact(writer.recoveryId, claimMutation("tab-B", c.now()));
    expect(taken.claim!.owner).toBe("tab-B");
    await writer.release();
  });

  it("29. old owner cannot renew a lease taken over by another tab; its keeper stops and reports loss", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    vi.useFakeTimers({ now: c.now() });
    await store.transact(writer.recoveryId, claimMutation("tab-A", Date.now()));
    const onLost = vi.fn();
    const keeper = startTakeRecoveryLeaseKeeper({
      store,
      recoveryId: writer.recoveryId,
      claimant: "tab-A",
      now: Date.now,
      onLost,
    });
    vi.setSystemTime(Date.now() + TAKE_RECOVERY_CLAIM_LEASE_MS + 1);
    await store.transact(writer.recoveryId, claimMutation("tab-B", Date.now()));
    await vi.advanceTimersByTimeAsync(TAKE_RECOVERY_CLAIM_RENEW_MS);
    expect(keeper.lost).toBe(true);
    expect(onLost).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBe(0);
    expect(store.records.get(writer.recoveryId)!.claim!.owner).toBe("tab-B");
    await expect(
      store.transact(writer.recoveryId, renewClaimMutation("tab-A", Date.now())),
    ).rejects.toMatchObject({ code: "LEASE_LOST" });
    await expect(
      store.transact(
        writer.recoveryId,
        uploadStageMutation({ stage: "SESSION_CREATED", takeId: TAKE, claimant: "tab-A", now: Date.now() }),
      ),
    ).rejects.toMatchObject({ code: "LEASE_LOST" });
  });

  it("30. old owner cannot release the new lease", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    c.advance(TAKE_RECOVERY_CLAIM_LEASE_MS + 1);
    await store.transact(writer.recoveryId, claimMutation("tab-B", c.now()));
    await writer.release();
    await store.transact(writer.recoveryId, releaseClaimMutation("tab-A"));
    expect(store.records.get(writer.recoveryId)!.claim!.owner).toBe("tab-B");
  });

  it("31. double release (and double renew) is idempotent", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await store.transact(writer.recoveryId, renewClaimMutation("tab-A", c.now()));
    const once = await store.transact(writer.recoveryId, renewClaimMutation("tab-A", c.now()));
    const twice = await store.transact(writer.recoveryId, renewClaimMutation("tab-A", c.now()));
    expect(twice.claim).toEqual(once.claim);
    await writer.release();
    await writer.release();
    await store.transact(writer.recoveryId, releaseClaimMutation("tab-A"));
    expect(store.records.get(writer.recoveryId)!.claim).toBeNull();
  });

  it("32. transient storage / connection failure: keeper retries on the next tick; renewal is capped by max hold", async () => {
    const store = new MemoryTakeRecoveryStore();
    const writer = await claimedCopy(store);
    const acquiredAt = store.records.get(writer.recoveryId)!.claim!.acquiredAt;
    store.faultOnTransact = { at: store.transactCalls + 1, fault: "UNAVAILABLE" };
    await vi.advanceTimersByTimeAsync(TAKE_RECOVERY_CLAIM_RENEW_MS);
    expect(vi.getTimerCount()).toBe(1);
    store.faultOnTransact = null;
    await vi.advanceTimersByTimeAsync(TAKE_RECOVERY_CLAIM_RENEW_MS);
    expect(store.records.get(writer.recoveryId)!.claim!.expiresAt).toBe(
      Date.now() + TAKE_RECOVERY_CLAIM_LEASE_MS,
    );
    await vi.advanceTimersByTimeAsync(TAKE_RECOVERY_CLAIM_MAX_HOLD_MS);
    expect(vi.getTimerCount()).toBe(0);
    expect(store.records.get(writer.recoveryId)!.claim!.expiresAt).toBeLessThanOrEqual(
      acquiredAt + TAKE_RECOVERY_CLAIM_MAX_HOLD_MS,
    );
  });

  it("33. ownership lost during finalize: no finalize, no deletion, foreign lease untouched", async () => {
    // Recovery path: lease stolen right before the resume-finalize.
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.noteStage("BINARY_UPLOADED", TAKE);
    await writer.release();
    const claimCall = store.transactCalls + 1;
    store.beforeTransact = (call, s) => {
      if (call !== claimCall + 1) return;
      const rec = s.records.get(writer.recoveryId)!;
      s.records.set(writer.recoveryId, {
        ...rec,
        claim: { owner: "tab-X", acquiredAt: c.now(), expiresAt: c.now() + TAKE_RECOVERY_CLAIM_LEASE_MS },
      });
    };
    const d = deps(store, c.now, USER_A);
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toEqual({ kind: "LEASE_LOST" });
    expect(d.finalize).not.toHaveBeenCalled();
    expect(store.records.get(writer.recoveryId)!.claim!.owner).toBe("tab-X");
    expect(takeRecoveryOutcomePl(outcome)).toMatch(/przejęła inna karta/);
    store.beforeTransact = null;

    // Upload path: stage write after takeover aborts before finalize.
    const store2 = new MemoryTakeRecoveryStore();
    const w2 = await recordComplete(store2, c);
    c.advance(TAKE_RECOVERY_CLAIM_LEASE_MS + 1);
    await store2.transact(w2.recoveryId, claimMutation("tab-X", c.now()));
    await expect(w2.noteStage("SESSION_CREATED", TAKE)).rejects.toBeInstanceOf(
      TakeRecoveryLeaseLostError,
    );
    expect(await w2.confirmSaved(TAKE)).toBe(false);
    expect(store2.records.has(w2.recoveryId)).toBe(true);
    for (const src of [quickTake, studioPanel]) {
      expect(src).toMatch(/error instanceof TakeRecoveryLeaseLostError/);
    }
  });

  it("34. simultaneous resume in two tabs: one finalize, the other tab is BUSY", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.noteStage("BINARY_UPLOADED", TAKE);
    await writer.release();
    let open!: () => void;
    const gate = new Promise<void>((r) => (open = r));
    const d = deps(store, c.now, USER_A, {
      finalize: vi.fn(async (takeId: string) => {
        await gate;
        return { takeId };
      }),
    });
    const first = recoverTakeRecording(d, writer.recoveryId);
    await new Promise((r) => setTimeout(r, 0));
    await expect(
      store.transact(writer.recoveryId, claimMutation("tab-C", c.now())),
    ).rejects.toMatchObject({ code: "BUSY" });
    expect(
      await discardTakeRecording(deps(store, c.now, USER_A, {}, "tab-C"), writer.recoveryId),
    ).toBe("BUSY");
    open();
    expect((await first).kind).toBe("SAVED");
    expect(d.finalize).toHaveBeenCalledTimes(1);
    expect(d.upload).not.toHaveBeenCalled();
  });

  it("35. retry after a failed finalize never uploads twice", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c);
    const upload = vi.fn(async (params: Parameters<TakeRecoveryDeps["upload"]>[0]) => {
      await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
      await params.onStage({ stage: "BINARY_UPLOADED", takeId: TAKE });
      throw transportError("Failed to fetch");
    });
    const d = deps(store, c.now, USER_A, { upload });
    expect((await recoverTakeRecording(d, writer.recoveryId)).kind).toBe("UPLOAD_FAILED");
    expect((await recoverTakeRecording(d, writer.recoveryId)).kind).toBe("SAVED");
    expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({ kind: "NOT_FOUND" });
    expect(upload).toHaveBeenCalledTimes(1);
    expect(d.finalize).toHaveBeenCalledTimes(1);
  });

  it("36. CONCURRENT_SESSION keeps the current server contract: kept, explained, never blind-finalized", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const writer = await releasedCopy(store, c);
    const d = deps(store, c.now, USER_A, {
      upload: vi.fn(async () => {
        throw transportError("CONCURRENT_SESSION: Another recording session is already in progress.");
      }),
    });
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toMatchObject({ kind: "UPLOAD_FAILED", concurrentSession: true });
    expect(d.finalize).not.toHaveBeenCalled();
    expect(store.records.get(writer.recoveryId)).toMatchObject({ claim: null, upload: null });
    expect(takeRecoveryOutcomePl(outcome)).toMatch(/inna sesja nagrania/);
    expect(claimErrors).toMatch(
      /return "CONCURRENT_SESSION: Another recording session is already in progress\.";/,
    );
  });
});

describe("STU-15 shared chunk buffer", () => {
  it("buffers chunks in order until the writer exists, then forwards directly", async () => {
    const store = new MemoryTakeRecoveryStore();
    const c = clock();
    const buffer = createTakeRecoveryChunkBuffer();
    buffer.onChunk(chunk("1"));
    buffer.onChunk(chunk("22"));
    const writer = makeWriter(store, c.now, QUICK_GUEST);
    buffer.attach(writer);
    buffer.onChunk(chunk("333"));
    expect(await writer.finish("COMPLETE", 1_000)).toBe(true);
    const text = await new Blob(await store.readChunks(writer.recoveryId)).text();
    expect(text).toBe("122333");
    await writer.release();
  });
});
