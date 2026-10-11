/**
 * Stage I.17 — Studio Export typed failure contract (variant B).
 * Local unit/source only — no DB, worker, Storage, Contabo.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  STUDIO_EXPORT_EMPTY_SESSION_CODE,
  publicStudioExportFailure,
  studioExportPublicErrorMessage,
} from "@/lib/audio/studio-export-failure-contract";
import { mapStudioExportHttpResult } from "@/lib/studio/studio-export-client";

const PIPELINE = "src/lib/audio/render-worker-pipeline.ts";
const EXPORT_SERVICE = "src/lib/audio/studio-export-service.ts";
const EXPORT_ROUTE =
  "src/app/api/studio/projects/[projectId]/export/route.ts";
const EXPORT_CONTROL = "src/components/studio/studio-export-control.tsx";
const RENDER_JOB_SERVICE = "src/lib/audio/render-job-service.ts";

describe("I.17 — public failure allowlist", () => {
  it("preserves STUDIO_RENDER_EMPTY_SESSION with Polish public copy", () => {
    const pub = publicStudioExportFailure({
      status: "FAILED",
      rawErrorCode: STUDIO_EXPORT_EMPTY_SESSION_CODE,
    });
    expect(pub.errorCode).toBe(STUDIO_EXPORT_EMPTY_SESSION_CODE);
    expect(pub.errorMessage).toContain("wyciszonej sesji");
    expect(pub.errorMessage).not.toMatch(/No audible|stack|Error:|\\\\|C:\\/i);
  });

  it("maps unknown DB codes to ENCODE_FAILED + generic message", () => {
    const pub = publicStudioExportFailure({
      status: "FAILED",
      rawErrorCode: "INTERNAL_STACK_LEAK_PLEASE_NO",
    });
    expect(pub.errorCode).toBe("ENCODE_FAILED");
    expect(pub.errorMessage).toBe(
      studioExportPublicErrorMessage("ENCODE_FAILED"),
    );
    expect(pub.errorMessage).not.toContain("INTERNAL_STACK");
  });

  it("returns null failure fields for non-failed statuses", () => {
    expect(
      publicStudioExportFailure({
        status: "SUCCEEDED",
        rawErrorCode: STUDIO_EXPORT_EMPTY_SESSION_CODE,
      }),
    ).toEqual({ errorCode: null, errorMessage: null });
    expect(
      publicStudioExportFailure({
        status: "RUNNING",
        rawErrorCode: "ENCODE_FAILED",
      }),
    ).toEqual({ errorCode: null, errorMessage: null });
  });

  it("never uses raw renderer wording as public EMPTY_SESSION message", () => {
    const msg = studioExportPublicErrorMessage(STUDIO_EXPORT_EMPTY_SESSION_CODE);
    expect(msg).not.toContain("TAKE/BEAT_REF");
    expect(msg).not.toContain("No audible");
  });
});

describe("I.17 — client mapping for FAILED status", () => {
  it("distinguishes empty-session message from generic FAILED", () => {
    const empty = mapStudioExportHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        jobId: "j1",
        projectId: "p1",
        status: "FAILED",
        artifactId: null,
        errorCode: STUDIO_EXPORT_EMPTY_SESSION_CODE,
        errorMessage: "RAW_SHOULD_BE_IGNORED_No audible TAKE/BEAT_REF",
      },
    });
    expect(empty.ok).toBe(true);
    if (empty.ok) {
      expect(empty.phase).toBe("FAILED");
      expect(empty.artifactId).toBeNull();
      expect(empty.errorCode).toBe(STUDIO_EXPORT_EMPTY_SESSION_CODE);
      expect(empty.message).toContain("wyciszonej sesji");
      expect(empty.message).not.toContain("RAW_SHOULD_BE_IGNORED");
      expect(empty.message).not.toContain("TAKE/BEAT_REF");
    }

    const generic = mapStudioExportHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        jobId: "j2",
        projectId: "p1",
        status: "FAILED",
        artifactId: null,
        errorCode: "ENCODE_FAILED",
      },
    });
    expect(generic.ok).toBe(true);
    if (generic.ok) {
      expect(generic.message).toBe(
        "Eksport nie powiódł się. Możesz spróbować ponownie.",
      );
      expect(generic.message).not.toContain("wyciszonej");
    }
  });

  it("SUCCEEDED keeps artifactId path and null failure fields", () => {
    const mapped = mapStudioExportHttpResult({
      httpStatus: 200,
      json: {
        success: true,
        jobId: "j3",
        projectId: "p1",
        status: "SUCCEEDED",
        artifactId: "art-1",
        errorCode: STUDIO_EXPORT_EMPTY_SESSION_CODE,
      },
    });
    expect(mapped.ok).toBe(true);
    if (mapped.ok) {
      expect(mapped.phase).toBe("SUCCEEDED");
      expect(mapped.artifactId).toBe("art-1");
      expect(mapped.errorCode).toBeNull();
      expect(mapped.message).toBeNull();
    }
  });
});

describe("I.17 — worker / API / UI source contracts", () => {
  it("worker maps EMPTY_SESSION → STUDIO_RENDER_EMPTY_SESSION job code", () => {
    const src = readFileSync(join(process.cwd(), PIPELINE), "utf8");
    const mapStart = src.indexOf("function mapStudioOfflineRenderFail");
    const mapEnd = src.indexOf("export async function runRealRenderWorkerJob");
    const mapBody = src.slice(mapStart, mapEnd);
    expect(mapBody).toMatch(
      /case\s+"STUDIO_RENDER_EMPTY_SESSION"\s*:\s*return\s*\{\s*code:\s*"STUDIO_RENDER_EMPTY_SESSION"/,
    );
    // Other Studio offline failures still use ENCODE_FAILED category.
    expect(mapBody).toMatch(
      /STUDIO_RENDER_INVALID_DOCUMENT[\s\S]*code:\s*"ENCODE_FAILED"/,
    );
  });

  it("Studio GET exposes allowlisted errorCode/errorMessage; select includes error_code", () => {
    const route = readFileSync(join(process.cwd(), EXPORT_ROUTE), "utf8");
    const service = readFileSync(join(process.cwd(), EXPORT_SERVICE), "utf8");
    expect(service).toMatch(/error_code/);
    expect(service).toMatch(/publicStudioExportFailure/);
    expect(route).toMatch(/errorCode:\s*job\.errorCode/);
    expect(route).toMatch(/errorMessage:\s*job\.errorMessage/);
    expect(service).toMatch(/owner_id/);
    expect(service).toMatch(/options\?\.projectId/);
  });

  it("UI uses mapped.message for FAILED (not raw errorMessage)", () => {
    const ui = readFileSync(join(process.cwd(), EXPORT_CONTROL), "utf8");
    expect(ui).toMatch(/mapped\.message/);
    expect(ui).not.toMatch(/json\.errorMessage/);
  });

  it("MIX/TAKE job mapper still independently exposes errorCode (unchanged path)", () => {
    const mix = readFileSync(join(process.cwd(), RENDER_JOB_SERVICE), "utf8");
    expect(mix).toMatch(/errorCode:\s*row\.error_code/);
    expect(mix).toMatch(/errorMessage:\s*row\.error_message/);
    // Studio Export sanitize module must not be imported into MIX service.
    expect(mix).not.toMatch(/studio-export-failure-contract/);
  });
});
