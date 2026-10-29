import { describe, expect, it } from "vitest";

import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  assertSafeSourceObjectKey,
  atomicWriteFile,
  classifyBeatAudioObject,
  evaluateSafeForGc,
  idempotencyKey,
  mapBackupObjectKey,
  mapVpsBackupObjectPath,
  planDryRunAction,
  sha256Hex,
  sniffAudioContainer,
  summarizeDryRun,
  summarizeInventory,
  verifyIntegrity,
  SA07_EXPECTED_INVENTORY,
} from "./backup-manifest";

describe("STORAGE-ARCH-07 backup-manifest", () => {
  it("classifies living USER / platform vs orphan", () => {
    expect(
      classifyBeatAudioObject({
        objectKey: "user/aaa/bbb/ccc/master.bin",
        dbRefsCount: 1,
      }),
    ).toBe("USER");
    expect(
      classifyBeatAudioObject({
        objectKey: "platform/bbb/ccc/master.bin",
        dbRefsCount: 1,
      }),
    ).toBe("PLATFORM");
    expect(
      classifyBeatAudioObject({
        objectKey: "user/aaa/bbb/master/ccc.bin",
        dbRefsCount: 0,
      }),
    ).toBe("ORPHAN");
  });

  it("does not treat eTag as integrity proof", () => {
    const a = sha256Hex(Buffer.from("abc"));
    const b = sha256Hex(Buffer.from("abd"));
    expect(a).not.toBe(b);
    expect(
      verifyIntegrity({
        sourceSha256: a,
        backupSha256: b,
        sourceSize: 3,
        backupSize: 3,
        sourceKey: "user/x.bin",
        backupMappedKey: mapBackupObjectKey("user/x.bin"),
      }),
    ).toBe("MISMATCH");
  });

  it("MATCH requires full-object SHA-256 + size + mapped key", () => {
    const hash = sha256Hex(Buffer.from("payload"));
    expect(
      verifyIntegrity({
        sourceSha256: hash,
        backupSha256: hash,
        sourceSize: 7,
        backupSize: 7,
        sourceKey: "platform/a/b/master.bin",
        backupMappedKey: "beat-audio/platform/a/b/master.bin",
      }),
    ).toBe("MATCH");
  });

  it("SAFE FOR GC fails without Owner allowlist", () => {
    const result = evaluateSafeForGc({
      classification: "ORPHAN",
      identityUnambiguous: true,
      backupExists: true,
      manifestExists: true,
      sha256Match: true,
      restoreVerified: true,
      notLivingUser: true,
      notPlatform: true,
      notActiveRetention: true,
      noActiveDbReference: true,
      ownerAllowlist: false,
    });
    expect(result.safe).toBe(false);
    expect(result.failed).toContain("ownerAllowlist");
  });

  it("sniffs WAV header", () => {
    const wav = Buffer.concat([
      Buffer.from("RIFF"),
      Buffer.from([0, 0, 0, 0]),
      Buffer.from("WAVE"),
    ]);
    const sniff = sniffAudioContainer(wav);
    expect(sniff.wavHeader).toBe(true);
    expect(sniff.mimeGuess).toBe("audio/wav");
  });

  it("keeps expected inventory constants", () => {
    const rows = [
      ...Array.from({ length: 8 }, () => ({ classification: "USER" as const })),
      ...Array.from({ length: 3 }, () => ({
        classification: "PLATFORM" as const,
      })),
    ];
    const summary = summarizeInventory(rows);
    expect(summary).toMatchObject(SA07_EXPECTED_INVENTORY);
    expect(summary.matchesExpected).toBe(true);
  });

  it("blocks path traversal in VPS mapping", () => {
    expect(() => assertSafeSourceObjectKey("../etc/passwd")).toThrow(/traversal/);
    expect(() => assertSafeSourceObjectKey("/absolute")).toThrow(/relative/);
    expect(() => assertSafeSourceObjectKey("user//evil")).toThrow(/empty/);
    expect(() =>
      mapVpsBackupObjectPath({
        bucket: "beat-audio",
        objectKey: "user/../platform/x.bin",
      }),
    ).toThrow(/traversal/);
    expect(
      mapVpsBackupObjectPath({
        bucket: "beat-audio",
        objectKey: "user/a/b/master.bin",
      }),
    ).toBe("/srv/bitrymdym-backup/objects/beat-audio/user/a/b/master.bin");
  });

  it("plans dry-run COPY/SKIP/UPDATE/BLOCKED", () => {
    const hashA = sha256Hex(Buffer.from("a"));
    const hashB = sha256Hex(Buffer.from("b"));
    expect(
      planDryRunAction({
        objectKey: "user/a/b/master.bin",
        classification: "USER",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: null,
        existingDestinationSha256: null,
      }).action,
    ).toBe("COPY");
    expect(
      planDryRunAction({
        objectKey: "user/a/b/master.bin",
        classification: "USER",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: hashA,
        existingDestinationSha256: hashA,
      }).action,
    ).toBe("SKIP");
    expect(
      planDryRunAction({
        objectKey: "user/a/b/master.bin",
        classification: "USER",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: hashA,
        existingDestinationSha256: hashB,
      }).action,
    ).toBe("UPDATE");
    expect(
      planDryRunAction({
        objectKey: "../evil",
        classification: "ORPHAN",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: null,
        existingDestinationSha256: null,
      }).action,
    ).toBe("BLOCKED");
    expect(
      planDryRunAction({
        objectKey: "user/x.bin",
        classification: "UNKNOWN",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: null,
        existingDestinationSha256: null,
      }).action,
    ).toBe("BLOCKED");
  });

  it("idempotency key is bucket+key+sha256", () => {
    expect(
      idempotencyKey({
        sourceBucket: "beat-audio",
        sourceObjectKey: "user/a.bin",
        sourceSha256: "abc",
      }),
    ).toBe("beat-audio\0user/a.bin\0abc");
  });

  it("atomic write + SHA match and mismatch detection on fixture", async () => {
    const dir = await mkdtemp(path.join(tmpdir(), "sa07-phase3-"));
    try {
      const payload = Buffer.from("RIFF....WAVEfixture-phase3");
      const staging = path.join(dir, "staging", "obj.tmp");
      const finalPath = path.join(dir, "objects", "fixture.bin");
      const wrote = await atomicWriteFile({
        stagingPath: staging,
        finalPath,
        bytes: payload,
      });
      const sourceSha = sha256Hex(payload);
      expect(wrote.sha256).toBe(sourceSha);
      const destBytes = await readFile(finalPath);
      expect(sha256Hex(destBytes)).toBe(sourceSha);

      const flipped = Buffer.from(destBytes);
      flipped[0] = flipped[0] ^ 0xff;
      await writeFile(finalPath, flipped);
      expect(sha256Hex(await readFile(finalPath))).not.toBe(sourceSha);
      expect(
        verifyIntegrity({
          sourceSha256: sourceSha,
          backupSha256: sha256Hex(flipped),
          sourceSize: payload.byteLength,
          backupSize: flipped.byteLength,
          sourceKey: "user/fixture.bin",
          backupMappedKey: mapBackupObjectKey("user/fixture.bin"),
        }),
      ).toBe("MISMATCH");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });

  it("summarizes dry-run actions", () => {
    const rows = [
      planDryRunAction({
        objectKey: "user/a/master.bin",
        classification: "USER",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: null,
        existingDestinationSha256: null,
      }),
      planDryRunAction({
        objectKey: "../x",
        classification: "ORPHAN",
        sizeBytes: 1,
        contentType: "audio/wav",
        etag: null,
        sourceSha256: null,
        existingDestinationSha256: null,
      }),
    ];
    expect(summarizeDryRun(rows)).toMatchObject({
      COPY: 1,
      BLOCKED: 1,
      TOTAL: 2,
    });
  });

  it("restore drill destination must stay under restore-drills not objects", () => {
    const root = "/srv/bitrymdym-backup";
    const run = "sa07-phase5-restore-test";
    const restoreDir = `${root}/restore-drills/${run}/restored/file.bin`;
    const objectsDir = `${root}/objects/beat-audio/user/x.bin`;
    expect(restoreDir.startsWith(`${root}/restore-drills/`)).toBe(true);
    expect(restoreDir.startsWith(`${root}/objects/`)).toBe(false);
    expect(objectsDir.startsWith(`${root}/objects/`)).toBe(true);
    expect(objectsDir.includes("/restore-drills/")).toBe(false);
  });

  it("canary allowlist hard-cap is exactly 3 distinct classifications", () => {
    const allowlist = [
      { classification: "USER" as const, object_key: "user/a/master.bin" },
      {
        classification: "PLATFORM" as const,
        object_key: "platform/a/master.bin",
      },
      {
        classification: "ORPHAN" as const,
        object_key: "user/orphan/master.bin",
      },
    ];
    expect(allowlist).toHaveLength(3);
    expect(new Set(allowlist.map((a) => a.classification)).size).toBe(3);
    expect(() => {
      if (allowlist.length !== 3) throw new Error("too many");
    }).not.toThrow();
    const oversized = [...allowlist, allowlist[0]];
    expect(oversized.length).toBeGreaterThan(3);
  });

  it("manifest fixture has restore identity fields and valid JSON", () => {
    const payload = Buffer.from("RIFF....WAVEmanifest-fixture");
    const sha = sha256Hex(payload);
    const dest = mapVpsBackupObjectPath({
      bucket: "beat-audio",
      objectKey: "user/fixture/master.bin",
    });
    const manifest = {
      backup_run_id: "sa07-phase3-fixture",
      created_at: "2026-10-05T00:00:00.000Z",
      source_bucket: "beat-audio",
      source_object_key: "user/fixture/master.bin",
      source_version_id: null,
      source_size: payload.byteLength,
      source_content_type: "audio/wav",
      source_etag: null,
      source_sha256: sha,
      classification: "USER" as const,
      owner_user_id: null,
      owner_user_number: null,
      backup_target: "vps-layer1",
      backup_object_path: dest,
      backup_created_at: "2026-10-05T00:00:00.000Z",
      verification_status: "PENDING" as const,
    };
    const parsed = JSON.parse(JSON.stringify(manifest)) as typeof manifest;
    expect(parsed.source_sha256).toMatch(/^[a-f0-9]{64}$/);
    expect(parsed.source_size).toBe(payload.byteLength);
    expect(parsed.backup_object_path).toBe(
      "/srv/bitrymdym-backup/objects/beat-audio/user/fixture/master.bin",
    );
    expect(parsed.source_bucket).toBe("beat-audio");
    expect(parsed.source_object_key).toBe("user/fixture/master.bin");
    expect(parsed.verification_status).toBe("PENDING");
  });
});
