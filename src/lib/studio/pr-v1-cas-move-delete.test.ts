/**
 * POST-RECORDING V1 PR-04 — CAS alignment for Move / Delete.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { StudioFxCasConflictError } from "@/lib/studio/studio-fx-chain";

const DELETE_MIGRATION = join(
  process.cwd(),
  "supabase/migrations/20261007152000_pr_v1_studio_cas_clip_delete.sql",
);

describe("PR-04 Move CAS alignment", () => {
  it("geometry service always uses CAS RPC (including move)", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/studio_cas_apply_clip_geometry_fades/);
    expect(service).toMatch(
      /all geometry ops \(including move\) use atomic CAS/,
    );
    expect(service).not.toMatch(/pre-P6\.7 non-CAS path/);
    expect(service).not.toMatch(/if \(!durationChanged\)/);
  });

  it("UI sends expectedDocumentVersion on move (panel + timeline drag)", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    // Inspector panel still uses op:"move" + expectedDocumentVersion.
    expect(editor).toMatch(/op:\s*"move"[\s\S]*?expectedDocumentVersion/);
    // Timeline drag commits via persistClipGeometryCommit (CAS body).
    expect(editor).toMatch(/persistClipGeometryCommit/);
    expect(editor).toMatch(/body\.op = \"move\"/);
    expect(editor).toMatch(
      /expectedDocumentVersion: doc\.project\.documentVersion/,
    );
  });
});

describe("PR-04 Delete CAS alignment", () => {
  it("maps auth / conflict statuses", () => {
    expect(
      studioApiErrorResponse(new AuthError("UNAUTHENTICATED", "x")).status,
    ).toBe(401);
    expect(studioApiErrorResponse(new StudioFxCasConflictError()).status).toBe(
      409,
    );
  });

  it("DELETE route requires expectedDocumentVersion and returns documentVersion", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/export async function DELETE/);
    expect(routeSrc).toMatch(/expectedDocumentVersion/);
    expect(routeSrc).toMatch(/documentVersion:\s*result\.documentVersion/);
    expect(routeSrc).toMatch(/deletedClipId:\s*result\.deletedClipId/);
  });

  it("service uses studio_cas_apply_clip_delete + ownership", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/studio_cas_apply_clip_delete/);
    expect(service).toMatch(/deleteStudioClipFor/);
    expect(service).toMatch(/loadOwnedClip/);
    expect(service).toMatch(/parseExpectedDocumentVersion/);
    expect(service).toMatch(/StudioFxCasConflictError/);
  });

  it("CAS SQL is service_role only; Take untouched", () => {
    const sql = readFileSync(DELETE_MIGRATION, "utf8");
    expect(sql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.studio_cas_apply_clip_delete/,
    );
    expect(sql).toMatch(/DELETE FROM public\.studio_clips/);
    expect(sql).toMatch(
      /document_version = studio_projects\.document_version \+ 1/,
    );
    expect(sql).toMatch(/AND studio_projects\.document_version = p_expected/);
    expect(sql).toMatch(/CLIP_NOT_FOUND/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/UPDATE public\.takes/);
    expect(sql).not.toMatch(/storage\.objects/);
  });

  it("UI delete sends expectedDocumentVersion", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/async function deleteSelectedClip/);
    expect(editor).toMatch(/method: "DELETE"/);
    expect(editor).toMatch(
      /expectedDocumentVersion:\s*doc\.project\.documentVersion/,
    );
  });
});
