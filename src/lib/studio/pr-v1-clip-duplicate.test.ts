/**
 * POST-RECORDING V1 — Duplicate Clip (same Take, independent Clip, CAS atomic).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { resolveDuplicateClipPlacement } from "@/lib/studio/studio-clip-ops";
import { StudioFxCasConflictError } from "@/lib/studio/studio-fx-chain";

const MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261007151000_pr_v1_studio_cas_clip_duplicate.sql",
);

describe("PR-03 Duplicate placement", () => {
  it("places duplicate immediately after source when it fits", () => {
    expect(
      resolveDuplicateClipPlacement({
        clip: {
          timelineStartMs: 1000,
          durationMs: 2000,
          sourceOffsetMs: 100,
        },
        timelineLengthMs: 10_000,
      }),
    ).toEqual({ timelineStartMs: 3000 });
  });

  it("falls back to same start when after-placement would exceed timeline", () => {
    expect(
      resolveDuplicateClipPlacement({
        clip: {
          timelineStartMs: 8000,
          durationMs: 2000,
          sourceOffsetMs: 0,
        },
        timelineLengthMs: 10_000,
      }),
    ).toEqual({ timelineStartMs: 8000 });
  });

  it("rejects impossible geometry that cannot fit anywhere", () => {
    expect(() =>
      resolveDuplicateClipPlacement({
        clip: {
          timelineStartMs: 0,
          durationMs: 12_000,
          sourceOffsetMs: 0,
        },
        timelineLengthMs: 10_000,
      }),
    ).toThrow();
  });
});

describe("PR-03 Duplicate AuthZ / CAS / source contract", () => {
  it("maps unauth / non-owner / conflict statuses", () => {
    expect(
      studioApiErrorResponse(new AuthError("UNAUTHENTICATED", "x")).status,
    ).toBe(401);
    expect(studioApiErrorResponse(new AuthError("FORBIDDEN", "x")).status).toBe(
      403,
    );
    expect(studioApiErrorResponse(new AuthError("NOT_FOUND", "x")).status).toBe(
      404,
    );
    expect(studioApiErrorResponse(new StudioFxCasConflictError()).status).toBe(
      409,
    );
  });

  it("duplicate route wires CAS expectedDocumentVersion", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/clips/[clipId]/duplicate/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/duplicateStudioClip/);
    expect(routeSrc).toMatch(/expectedDocumentVersion/);
    expect(routeSrc).toMatch(/documentVersion:\s*result\.documentVersion/);
    expect(routeSrc).toMatch(/status: 201/);
    expect(routeSrc).not.toMatch(/VocalEditorEngine/);
  });

  it("service copies Clip fields via CAS RPC; does not rewrite Take", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/duplicateStudioClipFor/);
    expect(service).toMatch(/studio_cas_apply_clip_duplicate/);
    expect(service).toMatch(/resolveDuplicateClipPlacement/);
    expect(service).toMatch(/loadOwnedClip/);
    expect(service).toMatch(/parseExpectedDocumentVersion/);
    expect(service).toMatch(/StudioFxCasConflictError/);
    expect(service).toMatch(/p_timeline_start_ms/);
    expect(service).not.toMatch(/from\("takes"\)\.update/);
    expect(service).not.toMatch(/storage\.from/);
  });

  it("CAS SQL inserts new clip from source row; service_role only; no Take mutation", () => {
    const sql = readFileSync(MIGRATION, "utf8");
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.studio_cas_apply_clip_duplicate/,
    );
    expect(sql).toMatch(/INSERT INTO public\.studio_clips/);
    expect(sql).toMatch(/c\.source_take_id/);
    expect(sql).toMatch(/c\.gain_db/);
    expect(sql).toMatch(/c\.muted/);
    expect(sql).toMatch(/c\.fade_in_ms/);
    expect(sql).toMatch(/c\.fade_out_ms/);
    expect(sql).toMatch(/p_timeline_start_ms/);
    expect(sql).toMatch(
      /document_version = studio_projects\.document_version \+ 1/,
    );
    expect(sql).toMatch(/AND studio_projects\.document_version = p_expected/);
    expect(sql).toMatch(/CLIP_NOT_FOUND/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/UPDATE public\.takes/);
    expect(sql).not.toMatch(/storage\.objects/);
    expect(sql).not.toMatch(/CREATE TABLE/);
  });

  it("UI exposes Powiel without second engine", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/Powiel/);
    expect(editor).toMatch(/onDuplicate/);
    expect(editor).toMatch(/duplicateSelectedClip/);
    expect(editor).toMatch(/\/duplicate/);
    expect(editor).not.toMatch(/VocalEditorEngine/);
  });

  it("duplicate does not invent second audio / storage path", () => {
    const files = [
      "src/lib/studio/studio-clip-ops.ts",
      "src/lib/studio/studio-service.ts",
      "src/app/api/studio/projects/[projectId]/clips/[clipId]/duplicate/route.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/VocalEditorEngine/);
      expect(src).not.toMatch(/PostProductionEngine/);
      expect(src).not.toMatch(/new AudioContext/);
      expect(src).not.toMatch(/PlayerProvider/);
    }
  });
});
