/**
 * STU-14 — Studio recording recovery + lifecycle safety.
 * Behaviour runs through the real recovery module and TakeMediaRecorder with
 * an in-memory store that serialises transactions like IndexedDB, plus a fake
 * MediaRecorder (no real microphone, no network). Source contracts pin the
 * panel / editor lifecycle wiring (no DOM in this vitest environment).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  RECORDING_GLOBAL_MAX_SECONDS,
  TAKE_AUDIO_MAX_BYTES,
  TAKE_LOCAL_RECOVERY_TTL_SECONDS,
} from "@/config/recording";
import {
  TakeMediaRecorder,
  TakeRecorderError,
} from "@/lib/takes/media-recorder";
import { recordingInterruptedNoticePl } from "@/lib/takes/recording-ui-state";
import {
  TAKE_RECOVERY_CLAIM_LEASE_MS,
  TAKE_RECOVERY_DURATION_SLACK_MS,
  TAKE_RECOVERY_LIVE_STALE_MS,
  TakeRecoveryStoreError,
  claimMutation,
  classifyTakeRecoveryRecord,
  createTakeRecoveryWriter,
  discardTakeRecording,
  listTakeRecoveries,
  recoverTakeRecording,
  releaseClaimMutation,
  takeRecoveryItemSummaryPl,
  takeRecoveryOutcomePl,
  takeRecoveryWriterStatusPl,
  uploadStageMutation,
  type TakeRecoveryDeps,
  type TakeRecoveryStore,
  type TakeRecoveryWriter,
} from "@/lib/takes/take-recording-recovery";
import { MemoryTakeRecoveryStore } from "@/test/take-recovery-memory-store";

const root = process.cwd();
const read = (p: string) => readFileSync(join(root, p), "utf8");
const panel = read("src/components/studio/studio-recording-panel.tsx");
const editor = read("src/components/studio/studio-editor.tsx");
const banner = read("src/components/takes/take-recording-recovery-banner.tsx");
const recoverySrc = read("src/lib/takes/take-recording-recovery.ts");
const idbSrc = read("src/lib/takes/take-recording-recovery-idb.ts");

const MemoryStore = MemoryTakeRecoveryStore;
type MemoryStore = MemoryTakeRecoveryStore;

const PROJECT = "11111111-1111-4111-8111-111111111111";
const BEAT = "22222222-2222-4222-8222-222222222222";
const TAKE = "33333333-3333-4333-8333-333333333333";
const USER = "66666666-6666-4666-8666-666666666666";

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

async function settle(writer: TakeRecoveryWriter) {
  // Drain the writer queue without finishing it.
  await writer.noteStage("SESSION_CREATED", "probe-not-secured");
}

function makeWriter(
  store: TakeRecoveryStore | null,
  c: ReturnType<typeof clock>,
  extra: Partial<Parameters<typeof createTakeRecoveryWriter>[0]> = {},
) {
  return createTakeRecoveryWriter({
    store,
    surface: "STUDIO",
    projectId: PROJECT,
    ownerUserId: USER,
    beatId: BEAT,
    mimeType: "audio/webm;codecs=opus",
    maxRecordingSeconds: 60,
    now: c.now,
    ...extra,
    recoveryId: extra.recoveryId ?? crypto.randomUUID(),
    claimant: extra.claimant ?? "tab-A",
  });
}

async function recordComplete(
  store: MemoryStore,
  c: ReturnType<typeof clock>,
  parts = ["a", "bb", "ccc"],
  claimant = "tab-A",
) {
  const writer = makeWriter(store, c, { claimant });
  for (const p of parts) {
    c.advance(250);
    writer.append(chunk(p));
  }
  expect(await writer.finish("COMPLETE", 1_000)).toBe(true);
  return writer;
}

async function recordInterrupted(
  store: MemoryStore,
  c: ReturnType<typeof clock>,
  parts = ["a", "bb"],
) {
  const writer = makeWriter(store, c);
  for (const p of parts) {
    c.advance(250);
    writer.append(chunk(p));
  }
  await settle(writer);
  return writer;
}

function deps(
  store: TakeRecoveryStore,
  c: ReturnType<typeof clock>,
  overrides: Partial<TakeRecoveryDeps> = {},
): TakeRecoveryDeps & {
  upload: ReturnType<typeof vi.fn>;
  finalize: ReturnType<typeof vi.fn>;
} {
  const upload = vi.fn(async (params: Parameters<TakeRecoveryDeps["upload"]>[0]) => {
    await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
    await params.onStage({ stage: "BINARY_UPLOADED", takeId: TAKE });
    return { takeId: TAKE };
  });
  const finalize = vi.fn(async (takeId: string) => ({ takeId }));
  return {
    store,
    claimant: "tab-B",
    now: c.now,
    viewerUserId: USER,
    upload,
    finalize,
    ...overrides,
  } as never;
}

async function listItems(
  d: Parameters<typeof listTakeRecoveries>[0],
  projectId: string,
) {
  return (await listTakeRecoveries(d, { surface: "STUDIO", projectId })).items;
}

function transportError(raw: string) {
  return Object.assign(new Error(`PL: ${raw}`), { rawMessage: raw });
}

// ---------------------------------------------------------------------------
// Fake MediaRecorder (no microphone)
// ---------------------------------------------------------------------------

class FakeMediaRecorder {
  static last: FakeMediaRecorder | null = null;
  state: "inactive" | "recording" = "inactive";
  ondataavailable: ((event: { data: Blob }) => void) | null = null;
  onstop: (() => void) | null = null;
  onerror: (() => void) | null = null;
  requestDataCalls = 0;
  private seq = 0;

  constructor(
    readonly stream: unknown,
    readonly options: { mimeType: string },
  ) {
    FakeMediaRecorder.last = this;
  }

  start() {
    this.state = "recording";
  }

  emit() {
    this.seq += 1;
    this.ondataavailable?.({ data: new Blob([`chunk-${this.seq}`]) });
  }

  requestData() {
    this.requestDataCalls += 1;
    this.emit();
  }

  stop() {
    this.state = "inactive";
    setTimeout(() => {
      this.emit();
      this.onstop?.();
    }, 0);
  }
}

function fakeMic() {
  const track = { stop: vi.fn(), kind: "audio" };
  const stream = { getTracks: () => [track], getAudioTracks: () => [track] };
  return { track, stream };
}

function recorderDeps(getUserMedia: () => Promise<unknown>) {
  return {
    getUserMedia: getUserMedia as never,
    MediaRecorderCtor: FakeMediaRecorder as never,
    isTypeSupported: () => true,
    now: () => 0,
  };
}

// ---------------------------------------------------------------------------
// Scenarios
// ---------------------------------------------------------------------------

describe("STU-14 recording recovery — 25 scenarios", () => {
  it("1. normal flow to READY_TAKE: incremental copy, server stages, delete only after confirmation", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    expect(writer.state).toBe("SECURED");
    const rec = store.records.get(writer.recoveryId)!;
    expect(rec.status).toBe("COMPLETE");
    expect(rec.chunkCount).toBe(3);
    expect(rec.byteSize).toBe(6);
    expect(rec.claim?.owner).toBe("tab-A");

    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.noteStage("BINARY_UPLOADED", TAKE);
    expect(store.records.get(writer.recoveryId)!.upload).toEqual({
      stage: "BINARY_UPLOADED",
      takeId: TAKE,
    });
    expect(await writer.confirmSaved(TAKE)).toBe(true);
    expect(store.records.size).toBe(0);
    expect(store.chunks.size).toBe(0);
    expect(store.log.at(-2)).toBe("transact:COMPLETE:FINALIZED");
    expect(store.log.at(-1)).toBe("remove");
  });

  it("2. unmount in RECORDING: final chunk arrives before seal, copy is a recoverable fragment", async () => {
    const store = new MemoryStore();
    const c = clock();
    const { stream, track } = fakeMic();
    const recorder = new TakeMediaRecorder(recorderDeps(async () => stream));
    const writerHolder: { w: TakeRecoveryWriter | null } = { w: null };
    await recorder.start({ onChunk: (b) => writerHolder.w?.append(b) });
    writerHolder.w = makeWriter(store, c);
    FakeMediaRecorder.last!.emit();
    c.advance(250);
    FakeMediaRecorder.last!.emit();

    const stopped = recorder.cancel();
    await stopped;
    expect(track.stop).toHaveBeenCalled();
    expect(await writerHolder.w.finish("INTERRUPTED", 1_000)).toBe(true);

    const rec = store.records.get(writerHolder.w.recoveryId)!;
    expect(rec.status).toBe("INTERRUPTED");
    expect(rec.chunkCount).toBe(3);
    const cls = classifyTakeRecoveryRecord(rec, {
      now: c.now(),
      claimant: "tab-B",
      chunkSizes: (await store.readChunks(rec.recoveryId)).map((b) => b.size),
    });
    expect(cls).toMatchObject({ kind: "RECOVERABLE", partial: true });
    expect(
      recordingInterruptedNoticePl("RECORDING", { locallySecured: true }),
    ).toMatch(/zabezpieczona lokalnie/);
    expect(recordingInterruptedNoticePl("RECORDING")).toMatch(
      /Nagranie nie zostało zapisane\.$/,
    );
  });

  it("3. pagehide/crash: no seal ever runs; a stale RECORDING copy becomes recoverable, a fresh one is LIVE", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordInterrupted(store, c);
    const rec = store.records.get(writer.recoveryId)!;
    expect(rec.status).toBe("RECORDING");
    expect(
      classifyTakeRecoveryRecord(rec, { now: c.now(), claimant: "tab-B", chunkSizes: null }),
    ).toEqual({ kind: "LIVE" });
    // Reloaded page: the dead page's copy still looks live → hidden, re-check scheduled.
    const fresh = await listTakeRecoveries(deps(store, c), { surface: "STUDIO", projectId: PROJECT });
    expect(fresh.items).toEqual([]);
    expect(fresh.recheckInMs).toBe(TAKE_RECOVERY_LIVE_STALE_MS + 250);
    expect(banner).toMatch(/recheckTimer = setTimeout\(reload, next\.recheckInMs\)/);
    expect(banner).toMatch(/if \(recheckTimer\) clearTimeout\(recheckTimer\)/);
    c.advance(TAKE_RECOVERY_LIVE_STALE_MS + 1);
    expect((await listTakeRecoveries(deps(store, c), { surface: "STUDIO", projectId: PROJECT })).items).toHaveLength(1);
    expect(
      classifyTakeRecoveryRecord(rec, { now: c.now(), claimant: "tab-B", chunkSizes: null }),
    ).toMatchObject({ kind: "RECOVERABLE", partial: true });

    const { stream } = fakeMic();
    const recorder = new TakeMediaRecorder(recorderDeps(async () => stream));
    await recorder.start({});
    recorder.flush();
    expect(FakeMediaRecorder.last!.requestDataCalls).toBe(1);
    expect(panel).toMatch(/window\.addEventListener\("pagehide", flush\)/);
    expect(panel).toMatch(/window\.removeEventListener\("pagehide", flush\)/);
    void recorder.cancel();
  });

  it("4. visibilitychange: flush only when hidden, capture keeps running", () => {
    expect(panel).toMatch(
      /document\.visibilityState === "hidden"\) flush\(\)/,
    );
    expect(panel).toMatch(
      /document\.removeEventListener\("visibilitychange", onVisibility\)/,
    );
    const block = panel.slice(
      panel.indexOf("const onVisibility"),
      panel.indexOf('document.removeEventListener("visibilitychange", onVisibility)'),
    );
    expect(block).not.toMatch(/cancel\(|stopAndFinalize|clearTick/);
  });

  it("5. Back/Forward: no history interception; soft navigation reuses the unmount seal", () => {
    for (const src of [panel, banner, recoverySrc, idbSrc]) {
      expect(src).not.toMatch(/pushState|replaceState|history\.go|popstate/);
    }
    expect(panel).toMatch(/if \(writer\) sealInterruptedRecovery\(writer, stopped\)/);
  });

  it("6. return with a complete local copy: one upload of the exact bytes, then the copy is gone", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    const d = deps(store, c);
    const items = await listItems(d, PROJECT);
    expect(items).toHaveLength(1);
    expect(items[0].classification).toMatchObject({ kind: "RECOVERABLE", partial: false });
    expect(takeRecoveryItemSummaryPl(items[0])).toMatch(/zabezpieczone lokalnie/);

    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toEqual({ kind: "SAVED", takeId: TAKE, alreadySaved: false, localCopyRemoved: true });
    expect(d.upload).toHaveBeenCalledTimes(1);
    const sent = d.upload.mock.calls[0][0];
    expect(await sent.blob.text()).toBe("abbccc");
    expect(sent.beatId).toBe(BEAT);
    expect(sent.contentType).toBe("audio/webm");
    expect(store.records.size).toBe(0);
    expect(takeRecoveryOutcomePl(outcome)).toMatch(/Zapis potwierdzony/);
  });

  it("7. return with an incomplete local copy: labelled as fragment, uploads the consistent prefix", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordInterrupted(store, c, ["x", "yy"]);
    c.advance(TAKE_RECOVERY_LIVE_STALE_MS + 1);
    const d = deps(store, c);
    const [item] = await listItems(d, PROJECT);
    expect(takeRecoveryItemSummaryPl(item)).toMatch(/fragment/);
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome.kind).toBe("SAVED");
    expect(await d.upload.mock.calls[0][0].blob.text()).toBe("xyy");
  });

  it("8. corrupted data: missing chunk, bad format or version → error state, never uploaded", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    store.chunks.get(writer.recoveryId)!.delete(1);
    const d = deps(store, c);
    const outcome = await recoverTakeRecording(d, writer.recoveryId);
    expect(outcome).toEqual({ kind: "CORRUPT", reason: "CHUNKS" });
    expect(d.upload).not.toHaveBeenCalled();
    expect(store.records.has(writer.recoveryId)).toBe(true);
    expect(takeRecoveryOutcomePl(outcome)).toMatch(/Odzyskanie niemożliwe/);

    const base = store.records.get(writer.recoveryId)!;
    const opts = { now: c.now(), claimant: "tab-B", chunkSizes: null };
    expect(classifyTakeRecoveryRecord({ ...base, mimeType: "video/x-evil" }, opts)).toEqual({
      kind: "CORRUPT",
      reason: "MIME",
    });
    expect(classifyTakeRecoveryRecord({ ...base, formatVersion: 99 }, opts)).toEqual({
      kind: "CORRUPT",
      reason: "FORMAT_VERSION",
    });
    expect(classifyTakeRecoveryRecord({ ...base, chunkCount: 0, byteSize: 0 }, opts)).toEqual({
      kind: "CORRUPT",
      reason: "EMPTY",
    });
  });

  it("9. IndexedDB unavailable: capture continues, status is honest, nothing claims to be secured", async () => {
    const c = clock();
    const none = makeWriter(null, c);
    expect(none.state).toBe("UNAVAILABLE");
    none.append(chunk("a"));
    expect(await none.finish("COMPLETE", 100)).toBe(false);
    expect(await none.confirmSaved(TAKE)).toBe(false);
    expect(takeRecoveryWriterStatusPl("UNAVAILABLE")).toMatch(/niedostępne/);

    const store = new MemoryStore();
    store.faultOnTransact = { at: 1, fault: "UNAVAILABLE" };
    const states: string[] = [];
    const w = makeWriter(store, c, { onStateChange: (s) => states.push(s) });
    w.append(chunk("a"));
    expect(await w.finish("COMPLETE", 1_000)).toBe(false);
    expect(w.state).toBe("UNAVAILABLE");
    expect(states).toEqual(["UNAVAILABLE"]);
    expect(store.records.size).toBe(0);
    expect(panel).toMatch(/getBrowserTakeRecoveryStore\(\)\.catch\(\(\) => null\)/);
    expect(idbSrc).toMatch(/OPEN_TIMEOUT_MS/);
  });

  it("10. quota exceeded mid-take: partial copy is removed instead of pretending it is safe", async () => {
    const store = new MemoryStore();
    const c = clock();
    store.faultOnTransact = { at: 3, fault: "QUOTA" };
    const w = makeWriter(store, c);
    w.append(chunk("a"));
    w.append(chunk("b"));
    w.append(chunk("c"));
    expect(await w.finish("COMPLETE", 1_000)).toBe(false);
    expect(w.state).toBe("UNAVAILABLE");
    expect(store.records.size).toBe(0);
    expect(store.chunks.size).toBe(0);
    expect(idbSrc).toMatch(/QuotaExceededError/);
  });

  it("11. mic denied: PERMISSION_DENIED, no recorder, panel discards the (absent) copy", async () => {
    const recorder = new TakeMediaRecorder(
      recorderDeps(async () => {
        throw Object.assign(new Error("denied"), { name: "NotAllowedError" });
      }),
    );
    FakeMediaRecorder.last = null;
    await expect(recorder.start({})).rejects.toMatchObject({ code: "PERMISSION_DENIED" });
    expect(FakeMediaRecorder.last).toBeNull();
    expect(recorder.isRecording).toBe(false);
    expect(panel).toMatch(/void writer\?\.discard\(\);/);
  });

  it("12. no input device: RECORDING_ERROR; no getUserMedia at all → UNSUPPORTED", async () => {
    const noDevice = new TakeMediaRecorder(
      recorderDeps(async () => {
        throw Object.assign(new Error("Requested device not found"), { name: "NotFoundError" });
      }),
    );
    await expect(noDevice.start({})).rejects.toMatchObject({ code: "RECORDING_ERROR" });
    const unsupported = new TakeMediaRecorder({
      getUserMedia: undefined,
      MediaRecorderCtor: undefined,
      isTypeSupported: undefined,
    });
    const err = await unsupported.start({}).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(TakeRecorderError);
    expect(err).toMatchObject({ code: "UNSUPPORTED" });
  });

  it("13. double recovery: same-tab double click shares one run; another tab is BUSY", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    let release!: () => void;
    const gate = new Promise<void>((r) => (release = r));
    const d = deps(store, c, {
      upload: vi.fn(async (params) => {
        await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
        await gate;
        await params.onStage({ stage: "BINARY_UPLOADED", takeId: TAKE });
        return { takeId: TAKE };
      }),
    });
    const first = recoverTakeRecording(d, writer.recoveryId);
    const second = recoverTakeRecording(d, writer.recoveryId);
    expect(second).toBe(first);
    await new Promise((r) => setTimeout(r, 0));
    // Another tab has its own module instance; only the store claim is shared.
    await expect(
      store.transact(writer.recoveryId, claimMutation("tab-C", c.now())),
    ).rejects.toMatchObject({ code: "BUSY" });
    expect(
      await discardTakeRecording({ ...d, claimant: "tab-C" }, writer.recoveryId),
    ).toBe("BUSY");
    release();
    expect((await first).kind).toBe("SAVED");
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it("14. double upload: an in-flight original upload blocks recovery; after save nothing is left to re-upload", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c, ["a"], "tab-A");
    const d = deps(store, c);
    expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({ kind: "BUSY" });
    expect(await listItems(d, PROJECT)).toMatchObject([
      { classification: { kind: "BUSY" } },
    ]);
    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.noteStage("BINARY_UPLOADED", TAKE);
    await writer.confirmSaved(TAKE);
    expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({ kind: "NOT_FOUND" });
    expect(d.upload).not.toHaveBeenCalled();

    const lease = await recordComplete(store, c, ["z"], "tab-A");
    c.advance(TAKE_RECOVERY_CLAIM_LEASE_MS + 1);
    expect((await recoverTakeRecording(d, lease.recoveryId)).kind).toBe("SAVED");
  });

  it("15. upload error: copy kept, claim released, concurrent session explained, retry possible", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    const failing = deps(store, c, {
      upload: vi.fn(async (params) => {
        await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
        throw transportError("Take binary upload failed.");
      }),
    });
    const outcome = await recoverTakeRecording(failing, writer.recoveryId);
    expect(outcome).toMatchObject({ kind: "UPLOAD_FAILED", concurrentSession: false });
    const kept = store.records.get(writer.recoveryId)!;
    expect(kept.claim).toBeNull();
    expect(kept.upload).toEqual({ stage: "SESSION_CREATED", takeId: TAKE });
    expect(takeRecoveryOutcomePl(outcome)).toMatch(/Lokalna kopia została zachowana/);

    const concurrent = deps(store, c, {
      finalize: vi.fn(async () => {
        throw transportError("Take audio object missing.");
      }),
      upload: vi.fn(async () => {
        throw transportError(
          "CONCURRENT_SESSION: Another recording session is already in progress.",
        );
      }),
    });
    const second = await recoverTakeRecording(concurrent, writer.recoveryId);
    expect(second).toMatchObject({ kind: "UPLOAD_FAILED", concurrentSession: true });
    expect(takeRecoveryOutcomePl(second)).toMatch(/inna sesja nagrania/);
    expect(store.records.has(writer.recoveryId)).toBe(true);

    await store.transact(writer.recoveryId, claimMutation("tab-B", c.now()));
    await store.transact(
      writer.recoveryId,
      uploadStageMutation({
        stage: "SESSION_CREATED",
        takeId: TAKE,
        claimant: "tab-B",
        now: c.now(),
      }),
    );
    await store.transact(writer.recoveryId, releaseClaimMutation("tab-B"));
    const network = deps(store, c, {
      finalize: vi.fn(async () => {
        throw transportError("Failed to fetch");
      }),
    });
    expect(await recoverTakeRecording(network, writer.recoveryId)).toMatchObject({
      kind: "UPLOAD_FAILED",
    });
    expect(network.upload).not.toHaveBeenCalled();
  });

  it("16. upload success + confirmation: FINALIZED is written for the same takeId before deletion", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    const d = deps(store, c);
    await recoverTakeRecording(d, writer.recoveryId);
    const tail = store.log.slice(-4);
    expect(tail).toEqual([
      "transact:COMPLETE:SESSION_CREATED",
      "transact:COMPLETE:BINARY_UPLOADED",
      "transact:COMPLETE:FINALIZED",
      "remove",
    ]);
  });

  it("17. cleanup after success: a FINALIZED leftover (failed delete) is purged on next listing", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", TAKE);
    store.failRemove = true;
    expect(await writer.confirmSaved(TAKE)).toBe(false);
    expect(store.records.get(writer.recoveryId)!.upload?.stage).toBe("FINALIZED");
    store.failRemove = false;
    expect(await listItems(deps(store, c), PROJECT)).toEqual([]);
    expect(store.records.size).toBe(0);
  });

  it("18. READY_TAKE + reopen: binary already uploaded → finalize only (idempotent), no second upload", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", TAKE);
    await writer.noteStage("BINARY_UPLOADED", TAKE);
    await writer.release();
    const d = deps(store, c);
    const [item] = await listItems(d, PROJECT);
    expect(takeRecoveryItemSummaryPl(item)).toMatch(/dokończenia zapisu/);
    expect(banner).toMatch(/"Dokończ zapis"/);
    expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({
      kind: "SAVED",
      takeId: TAKE,
      alreadySaved: false,
      localCopyRemoved: true,
    });
    expect(d.finalize).toHaveBeenCalledWith(TAKE, { anonymous: false });
    expect(d.upload).not.toHaveBeenCalled();
    expect(await listItems(d, PROJECT)).toEqual([]);

    // Session known but binary state unknown: READY replay wins over a new session.
    const w2 = await recordComplete(store, c);
    await w2.noteStage("SESSION_CREATED", TAKE);
    await w2.release();
    const d2 = deps(store, c);
    expect((await recoverTakeRecording(d2, w2.recoveryId)).kind).toBe("SAVED");
    expect(d2.upload).not.toHaveBeenCalled();
  });

  it("19. auto-stop on limit: tick stops at maxSeconds; copy within limit + slack is recoverable", async () => {
    expect(panel).toMatch(
      /if \(elapsed >= maxSecondsRef\.current \* 1000\) \{\s*void stopAndFinalize\(\);/,
    );
    expect(panel).toMatch(/maxRecordingSeconds: maxSecondsRef\.current/);
    const store = new MemoryStore();
    const c = clock();
    const w = makeWriter(store, c, { maxRecordingSeconds: 60 });
    w.append(chunk("a"));
    await settle(w);
    c.advance(60_000 + TAKE_RECOVERY_DURATION_SLACK_MS - 1);
    w.append(chunk("b"));
    expect(await w.finish("COMPLETE", 1_000)).toBe(true);
    const rec = store.records.get(w.recoveryId)!;
    expect(
      classifyTakeRecoveryRecord(rec, { now: c.now(), claimant: "tab-A", chunkSizes: null }),
    ).toMatchObject({ kind: "RECOVERABLE" });
  });

  it("20. route change unmount: unmount takes the writer, cancels once, seals after stop, reports lock release", () => {
    const unmount = panel.slice(
      panel.indexOf("mountedRef.current = true;"),
      panel.indexOf("function clearTick()"),
    );
    expect(unmount).toMatch(/phaseRef\.current === "RECORDING" \|\| phaseRef\.current === "STOPPING"/);
    expect(unmount).toMatch(/recoveryWriterRef\.current = null;/);
    expect(unmount.match(/\.cancel\(\)/g)).toHaveLength(1);
    expect(unmount).toMatch(/report\.onRecordingActiveChange\?\.\(false\)/);
    expect(unmount).toMatch(/clearInterval\(tickRef\.current\)/);
    expect(panel).toMatch(
      /void stopped\s*\.then\(\(\) => writer\.finish\("INTERRUPTED", 5_000\)\)/,
    );
  });

  it("21. multi-tab: live capture in tab A is hidden from tab B and cannot be discarded or claimed", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = makeWriter(store, c, { claimant: "tab-A" });
    writer.append(chunk("a"));
    await settle(writer);
    const tabB = deps(store, c);
    expect(await listItems(tabB, PROJECT)).toEqual([]);
    expect(await discardTakeRecording(tabB, writer.recoveryId)).toBe("BUSY");
    expect(await recoverTakeRecording(tabB, writer.recoveryId)).toEqual({ kind: "BUSY" });

    // Atomic check-and-set: two tabs racing for a stale copy, exactly one wins.
    c.advance(TAKE_RECOVERY_LIVE_STALE_MS + 1);
    const results = await Promise.allSettled([
      store.transact(writer.recoveryId, claimMutation("tab-B", c.now())),
      store.transact(writer.recoveryId, claimMutation("tab-C", c.now())),
    ]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(idbSrc).toMatch(/serialises[\s*]+overlapping readwrite transactions/);
  });

  it("22. no local recording: nothing listed, banner renders nothing, unknown id → NOT_FOUND", async () => {
    const store = new MemoryStore();
    const c = clock();
    const d = deps(store, c);
    expect(await listItems(d, PROJECT)).toEqual([]);
    expect(await recoverTakeRecording(d, "missing")).toEqual({ kind: "NOT_FOUND" });
    expect(banner).toMatch(/if \(hidden \|\| \(items\.length === 0 && !notice\)\) return null;/);

    const other = await recordComplete(store, c);
    await other.release();
    expect(await listItems(d, "other-project")).toEqual([]);
  });

  it("23. take identity mismatch: different server takeId never deletes the copy", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    const d = deps(store, c, {
      upload: vi.fn(async (params) => {
        await params.onStage({ stage: "SESSION_CREATED", takeId: TAKE });
        return { takeId: "44444444-4444-4444-8444-444444444444" };
      }),
    });
    expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({
      kind: "IDENTITY_MISMATCH",
    });
    expect(store.records.has(writer.recoveryId)).toBe(true);

    const fin = deps(store, c, {
      finalize: vi.fn(async () => ({ takeId: "55555555-5555-4555-8555-555555555555" })),
    });
    expect(await recoverTakeRecording(fin, writer.recoveryId)).toEqual({
      kind: "IDENTITY_MISMATCH",
    });
    expect(store.records.has(writer.recoveryId)).toBe(true);

    const rec = store.records.get(writer.recoveryId)!;
    expect(() =>
      uploadStageMutation({
        stage: "BINARY_UPLOADED",
        takeId: "other",
        claimant: "tab-B",
        now: c.now(),
      })(rec),
    ).toThrow(TakeRecoveryStoreError);
    const w3 = await recordComplete(store, c, ["q"]);
    await w3.noteStage("BINARY_UPLOADED", TAKE);
    expect(await w3.confirmSaved("unrelated-take")).toBe(false);
    expect(store.records.has(w3.recoveryId)).toBe(true);
  });

  it("24. time / size limit exceeded: no upload, limits come from the recording SSOT", async () => {
    const store = new MemoryStore();
    const c = clock();
    const big = makeWriter(store, c);
    big.append(new Blob([new Uint8Array(TAKE_AUDIO_MAX_BYTES)]));
    big.append(chunk("x"));
    expect(await big.finish("COMPLETE", 1_000)).toBe(false);
    expect(big.state).toBe("UNAVAILABLE");
    expect(store.records.size).toBe(0);

    const w = await recordComplete(store, c);
    const rec = store.records.get(w.recoveryId)!;
    const opts = { now: c.now(), claimant: "tab-A", chunkSizes: null };
    expect(
      classifyTakeRecoveryRecord(
        { ...rec, updatedAt: rec.startedAt + 60_000 + TAKE_RECOVERY_DURATION_SLACK_MS + 1 },
        opts,
      ),
    ).toEqual({ kind: "LIMIT_EXCEEDED" });
    expect(
      classifyTakeRecoveryRecord(
        { ...rec, maxRecordingSeconds: RECORDING_GLOBAL_MAX_SECONDS + 1 },
        opts,
      ),
    ).toEqual({ kind: "CORRUPT", reason: "LIMIT_FIELD" });
    expect(recoverySrc).not.toMatch(/RECORDING_GLOBAL_MAX_SECONDS\s*=/);
    expect(recoverySrc).not.toMatch(/TAKE_AUDIO_MAX_BYTES\s*=/);

    c.advance(TAKE_LOCAL_RECOVERY_TTL_SECONDS * 1000 + 1);
    await w.release();
    expect(await listItems(deps(store, c), PROJECT)).toEqual([]);
    expect(store.records.size).toBe(0);
  });

  it("25. user discards: conscious two-step discard removes the copy; explicit cancel never keeps one", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.release();
    const d = deps(store, c);
    expect(await discardTakeRecording(d, writer.recoveryId)).toBe("DISCARDED");
    expect(store.records.size).toBe(0);
    expect(store.chunks.size).toBe(0);
    expect(d.upload).not.toHaveBeenCalled();
    expect(banner).toMatch(/Na pewno odrzucić to nagranie\? Tego nie da się cofnąć\./);
    expect(banner).toMatch(/onClick=\{\(\) => setConfirmDiscardId\(id\)\}/);
    // Confirm UI is a fresh subtree with focus on the safe option — a double
    // click on "Odrzuć nagranie" must not land on "Tak, odrzuć".
    expect(banner).toMatch(/<div key="confirm"/);
    expect(banner).toMatch(/<div key="actions"/);
    expect(banner).toMatch(/ref=\{\(el\) => el\?\.focus\(\)\}[\s\S]{0,700}Nie, zostaw/);

    const cancelBlock = panel.slice(
      panel.indexOf("function cancelRecording()"),
      panel.indexOf("async function onPreviewWorkflowTake"),
    );
    expect(cancelBlock).toMatch(/recoveryWriterRef\.current\?\.discard\(\)/);
  });
});

describe("STU-14 recovery — security, identity and wiring invariants", () => {
  it("local copy holds no tokens, signed URLs or user secrets", async () => {
    const store = new MemoryStore();
    const writer = await recordComplete(store, clock());
    const keys = Object.keys(store.records.get(writer.recoveryId)!).sort();
    expect(keys).toEqual(
      [
        "beatId",
        "byteSize",
        "chunkCount",
        "claim",
        "formatVersion",
        "maxRecordingSeconds",
        "mimeType",
        "ownerUserId",
        "projectId",
        "recoveryId",
        "startedAt",
        "status",
        "surface",
        "updatedAt",
        "upload",
      ].sort(),
    );
    for (const src of [recoverySrc, idbSrc]) {
      expect(src).not.toMatch(/\btoken\s*[:=]|signedUrl|localStorage|sessionStorage|document\.cookie/);
    }
  });

  it("recovery id is unique per capture and independent of project name / beat", () => {
    const c = clock();
    const ids = new Set(
      Array.from({ length: 50 }, () => makeWriter(null, c, { recoveryId: undefined }).recoveryId),
    );
    expect(ids.size).toBe(50);
    expect(panel).toMatch(/recoveryId: crypto\.randomUUID\(\)/);
  });

  it("dead server session (expired) falls through to exactly one fresh upload", async () => {
    const store = new MemoryStore();
    const c = clock();
    const writer = await recordComplete(store, c);
    await writer.noteStage("SESSION_CREATED", "old-take");
    await writer.noteStage("BINARY_UPLOADED", "old-take");
    await writer.release();
    const d = deps(store, c, {
      finalize: vi.fn(async () => {
        throw transportError("Take session expired.");
      }),
    });
    expect(await recoverTakeRecording(d, writer.recoveryId)).toEqual({
      kind: "SAVED",
      takeId: TAKE,
      alreadySaved: false,
      localCopyRemoved: true,
    });
    expect(d.upload).toHaveBeenCalledTimes(1);
  });

  it("panel wires the writer into the existing recorder and upload helper (no second recording system)", () => {
    expect(panel).toMatch(/onStage: \(stage\) => writer\?\.noteStage\(stage\.stage, stage\.takeId\)/);
    expect(panel).toMatch(/\.confirmSaved\(uploaded\.takeId\)/);
    expect(panel).toMatch(/writer\.finish\("COMPLETE", 3_000\)/);
    expect(panel).not.toMatch(/new MediaRecorder\(|indexedDB\.open/);
    expect(recoverySrc).not.toMatch(/new MediaRecorder\(|getUserMedia/);
    expect(panel).toMatch(/chunkBuffer\.attach\(writer\)/);
  });

  it("editor mounts one banner, hidden during capture, and wires recoverySavedKey", () => {
    expect(editor.match(/<TakeRecordingRecoveryBanner/g)).toHaveLength(1);
    expect(editor).toMatch(/hidden=\{recordingLocked\}/);
    expect(editor).toMatch(/onLocalRecoveryChanged=\{\(\) => setRecoveryRefreshKey/);
    expect(editor).toMatch(/recoverySavedKey=\{recoverySavedKey\}/);
    expect(editor).toMatch(/onSaved=\{\(\) => setRecoverySavedKey/);
    expect(panel).toMatch(/if \(recoverySavedKey === 0\) return/);
    expect(panel).toMatch(/dispatch\(\{ type: "RETRY_IDLE" \}\)/);
    expect(banner).not.toMatch(/beforeunload|useStudioLeaveGuard/);
  });

  it("banner never uploads without an explicit click", () => {
    const effects = banner.slice(
      banner.indexOf("async function loadTakeRecoveries"),
      banner.indexOf("async function onRecover"),
    );
    expect(effects.length).toBeGreaterThan(100);
    expect(effects).not.toMatch(/recoverTakeRecording|uploadTakeRecordingBlob/);
    expect(banner).toMatch(/onClick=\{\(\) => void onRecover\(id\)\}/);
  });

  it("recorder.cancel resolves only after the final chunk and releases the mic exactly once", async () => {
    const { stream, track } = fakeMic();
    const chunks: Blob[] = [];
    const recorder = new TakeMediaRecorder(recorderDeps(async () => stream));
    await recorder.start({ onChunk: (b) => chunks.push(b) });
    FakeMediaRecorder.last!.emit();
    await recorder.cancel();
    expect(chunks).toHaveLength(2);
    expect(track.stop).toHaveBeenCalledTimes(1);
    await recorder.cancel();
    expect(track.stop).toHaveBeenCalledTimes(1);
  });

  it("stop during STOPPING-then-unmount: stop rejects CANCELLED, cancel waits for onstop", async () => {
    const { stream, track } = fakeMic();
    const chunks: Blob[] = [];
    const recorder = new TakeMediaRecorder(recorderDeps(async () => stream));
    await recorder.start({ onChunk: (b) => chunks.push(b) });
    const stopping = recorder.stop();
    const cancelled = recorder.cancel();
    await expect(stopping).rejects.toMatchObject({ code: "CANCELLED" });
    await cancelled;
    expect(chunks).toHaveLength(1);
    expect(track.stop).toHaveBeenCalledTimes(1);
  });
});
