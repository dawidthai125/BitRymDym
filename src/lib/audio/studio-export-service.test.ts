/**
 * STUDIO_EXPORT Stage B — enqueue / claim / API source contracts (unit).
 * Does not prove live Postgres CHECK / RLS.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_EXPORT_MAX_UNIQUE_BEATS,
  STUDIO_EXPORT_MAX_UNIQUE_TAKES,
  STUDIO_EXPORT_MVP_TIER,
} from "@/config/audio-render";
import { rejectClientRenderSourceClaims } from "@/lib/audio/render-source-core";
import { RenderJobDomainError } from "@/lib/audio/render-job-core";
import { assertRenderBeatEligibleAtBake } from "@/lib/audio/render-source-core";

const ROOT = process.cwd();

describe("STUDIO_EXPORT Stage B — migration source", () => {
  it("adds nullable document_snapshot + STUDIO_EXPORT NOT NULL check", () => {
    const sql = readFileSync(
      join(
        ROOT,
        "supabase/migrations/20261010020000_studio_export_document_snapshot.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/ADD COLUMN IF NOT EXISTS document_snapshot jsonb/);
    expect(sql).toMatch(/render_jobs_studio_export_snapshot_chk/);
    expect(sql).toMatch(/kind <> 'STUDIO_EXPORT'/);
    expect(sql).toMatch(/document_snapshot IS NOT NULL/);
    expect(sql).not.toMatch(/DROP TABLE/);
    expect(sql).not.toMatch(/CREATE POLICY/);
  });
});

describe("STUDIO_EXPORT Stage B — enqueue service contracts", () => {
  const service = readFileSync(
    join(ROOT, "src/lib/audio/studio-export-service.ts"),
    "utf8",
  );

  it("requires expectedDocumentVersion and rejects client source claims", () => {
    expect(service).toMatch(/expectedDocumentVersion/);
    expect(service).toMatch(/rejectClientRenderSourceClaims/);
    expect(service).toMatch(/Document version conflict/);
    expect(service).toMatch(/getStudioProjectDocumentFor/);
    expect(service).toMatch(/authorizeStudioExportSourcesForDocument/);
    expect(service).toMatch(/document_snapshot/);
    expect(service).toMatch(/kind: "STUDIO_EXPORT"/);
    expect(service).toMatch(/STUDIO_EXPORT_MVP_TIER/);
  });

  it("re-checks document_version before insert (TOCTOU best-effort)", () => {
    expect(service).toMatch(/document changed before enqueue/);
    expect(service).toMatch(/\.select\("document_version, owner_id"\)/);
  });

  it("reuses daily/concurrent/quota caps", () => {
    expect(service).toMatch(/assertUnderDailyCap/);
    expect(service).toMatch(/assertUnderConcurrentCap/);
    expect(service).toMatch(/assertUnderQuota/);
    expect(service).toMatch(/idempotency_key/);
  });

  it("MVP tier is WAV", () => {
    expect(STUDIO_EXPORT_MVP_TIER).toBe("WAV");
  });

  it("source limits are conservative vs GOLD track cap", () => {
    expect(STUDIO_EXPORT_MAX_UNIQUE_TAKES).toBe(64);
    expect(STUDIO_EXPORT_MAX_UNIQUE_BEATS).toBe(2);
  });
});

describe("STUDIO_EXPORT Stage B — claim / mapJob / bake guard", () => {
  it("mapJob recognizes STUDIO_EXPORT (no silent MIX fallback)", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/audio/render-job-service.ts"),
      "utf8",
    );
    expect(src).toMatch(/kind === "STUDIO_EXPORT"/);
    expect(src).toMatch(/resolveAuthorizedStudioExportSourcesForJob/);
    expect(src).toMatch(/mapJobKind/);
    expect(src).toMatch(/return "STUDIO_EXPORT"/);
  });

  it("MIX resolver rejects STUDIO_EXPORT", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/audio/render-source-resolution.ts"),
      "utf8",
    );
    expect(src).toMatch(
      /STUDIO_EXPORT must use resolveAuthorizedStudioExportSourcesForJob/,
    );
  });

  it("worker bake path dispatches STUDIO_EXPORT offline bake (not MIX)", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/audio/render-worker-pipeline.ts"),
      "utf8",
    );
    expect(src).toMatch(/job\.kind === "STUDIO_EXPORT"/);
    expect(src).toMatch(/runClaimedStudioExportWorkerJob/);
    expect(src).toMatch(/renderStudioDocumentOffline/);
    expect(src).not.toMatch(/STUDIO_EXPORT bake is not implemented/);
    const studioIdx = src.indexOf('job.kind === "STUDIO_EXPORT"');
    const basicIdx = src.indexOf('job.requestedTier === "BASIC_MP3"');
    expect(studioIdx).toBeGreaterThan(-1);
    expect(studioIdx).toBeLessThan(basicIdx);
    // Studio path must not call E3 MIX bake helpers.
    const studioFn = src.indexOf("async function runClaimedStudioExportWorkerJob");
    const studioEnd = src.indexOf(
      "async function runClaimedTakeExportWorkerJob",
      studioFn,
    );
    expect(studioFn).toBeGreaterThan(-1);
    expect(studioEnd).toBeGreaterThan(studioFn);
    const studioBody = src.slice(studioFn, studioEnd);
    expect(studioBody).toMatch(/renderStudioDocumentOffline/);
    expect(studioBody).not.toMatch(/bakeServerBasicV1/);
    expect(studioBody).not.toMatch(/bakeServerProV1/);
  });

  it("studio resolver re-AuthZ and does not trust snapshot object keys", () => {
    const src = readFileSync(
      join(ROOT, "src/lib/audio/studio-export-source-resolution.ts"),
      "utf8",
    );
    expect(src).toMatch(/assertRenderTakeEligibleAtBake/);
    expect(src).toMatch(/assertRenderBeatEligibleAtBake/);
    expect(src).toMatch(/parseStudioExportDocumentSnapshot/);
    expect(src).toMatch(/Studio project does not belong to job owner/);
    expect(src).not.toMatch(/createSignedUrl/);
  });
});

describe("STUDIO_EXPORT Stage B — BEAT PLAYBACK-strict (no own-draft exception)", () => {
  it("unpublished beat denied for USER actor via bake gate", () => {
    expect(() =>
      assertRenderBeatEligibleAtBake({
        beatId: "beat-1",
        beatStatus: "DRAFT",
        actorRole: "USER",
        durationSeconds: 10,
        asset: {
          id: "a1",
          object_key: "platform/beat-1/a1/playback.bin",
          storage_bucket: "beat-audio",
          content_type: "audio/mpeg",
          byte_size: 1000,
          status: "READY",
          is_active: true,
          purpose: "PLAYBACK",
        },
      }),
    ).toThrow();
  });
});

describe("STUDIO_EXPORT Stage B — client claims rejected", () => {
  it("rejectClientRenderSourceClaims blocks objectKey", () => {
    expect(() =>
      rejectClientRenderSourceClaims({ objectKey: "x" }),
    ).toThrow(RenderJobDomainError);
  });
});

describe("STUDIO_EXPORT Stage B — API route", () => {
  it("exposes enqueue + project-scoped status with artifactId", () => {
    const src = readFileSync(
      join(
        ROOT,
        "src/app/api/studio/projects/[projectId]/export/route.ts",
      ),
      "utf8",
    );
    expect(src).toMatch(/createStudioExportJob/);
    expect(src).toMatch(/expectedDocumentVersion/);
    expect(src).toMatch(/getOwnStudioExportJob\(jobId, \{ projectId \}\)/);
    expect(src).toMatch(/artifactId: job\.artifactId \?\? null/);
    expect(src).not.toMatch(/startContabo|contabo\.start/i);
  });
});
