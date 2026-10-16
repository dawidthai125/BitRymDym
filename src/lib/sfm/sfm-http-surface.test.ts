/**
 * GO-SFM-HTTP-SURFACE — route contracts + handler AuthZ / error mapping.
 * Domain services are mocked; no remote Supabase / Storage / RPC.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  sfmApiErrorResponse,
  sfmHttpStatusForDomainCode,
} from "@/lib/sfm/sfm-api-error";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const ACCEPT =
  "src/app/api/studio/projects/[projectId]/final/accept/route.ts";
const VERSION = "src/app/api/studio/final/versions/[versionId]/route.ts";
const STAGE_START =
  "src/app/api/studio/final/versions/[versionId]/stages/start/route.ts";
const GRANTS =
  "src/app/api/studio/final/versions/[versionId]/grants/route.ts";
const ENCODE =
  "src/app/api/studio/final/versions/[versionId]/encode/route.ts";
const JOB =
  "src/app/api/studio/final/versions/[versionId]/jobs/[jobId]/route.ts";
const SFM_DL =
  "src/app/api/studio/artifacts/[artifactId]/download/route.ts";
const MIX_DL = "src/app/api/mix/artifacts/[id]/download/route.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";
const API_ERROR = "src/lib/sfm/sfm-api-error.ts";
const READ_SVC = "src/lib/sfm/sfm-version-read-service.ts";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const PROJECT = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const VERSION_ID = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const JOB_ID = "ffffffff-ffff-ffff-ffff-ffffffffffff";

function ownerCtx(userId = OWNER): AuthContext {
  return {
    userId,
    email: "owner@bitrymdym.test",
    profile: {
      id: userId,
      displayName: "owner",
      userNumber: 1,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: [],
  };
}

describe("GO-SFM-HTTP-SURFACE — source contracts", () => {
  it("exposes Accept / Version / Stage start / Grant / Encode / Job status routes", () => {
    for (const path of [ACCEPT, VERSION, STAGE_START, GRANTS, ENCODE, JOB]) {
      expect(read(path).length).toBeGreaterThan(100);
    }
    expect(read(ACCEPT)).toMatch(/export async function POST/);
    expect(read(ACCEPT)).toMatch(/acceptSfmVersionFor/);
    expect(read(ACCEPT)).toMatch(/requireUser/);
    expect(read(VERSION)).toMatch(/export async function GET/);
    expect(read(VERSION)).toMatch(/getOwnSfmVersionStatus/);
    expect(read(STAGE_START)).toMatch(/startSfmStageFor/);
    expect(read(STAGE_START)).toMatch(/kind/);
    expect(read(GRANTS)).toMatch(/claimSfmVersionGrantFor/);
    expect(read(GRANTS)).toMatch(/clientBody/);
    expect(read(ENCODE)).toMatch(/enqueueSfmQualityEncodeFor/);
    expect(read(ENCODE)).toMatch(/idempotencyKey/);
    expect(read(JOB)).toMatch(/getOwnSfmJobStatus/);
  });

  it("routes use sfmApiErrorResponse (safe codes; no raw catch echo)", () => {
    for (const path of [ACCEPT, VERSION, STAGE_START, GRANTS, ENCODE, JOB]) {
      const src = read(path);
      expect(src).toMatch(/sfmApiErrorResponse/);
      expect(src).not.toMatch(/error\.message :/);
    }
  });

  it("download route keeps OD-SFM-ID-01 path and sanitizes unknown errors", () => {
    const src = read(SFM_DL);
    expect(src).toMatch(/createOwnSfmArtifactDownloadSignedUrl/);
    expect(src).toMatch(/rejectClientRenderSourceClaims/);
    expect(src).toMatch(/Pobranie artefaktu Studio Final Mix nie powiodło się/);
    expect(src).not.toMatch(/error instanceof Error \? error\.message/);
  });

  it("does not invent a Recovery HTTP endpoint (RECOVERY_REQUIRED via stage start 409)", () => {
    const start = read(STAGE_START);
    expect(start).toMatch(/RECOVERY_REQUIRED/);
    // No dedicated recovery route under final/
    expect(() =>
      read(
        "src/app/api/studio/final/versions/[versionId]/recovery/route.ts",
      ),
    ).toThrow();
  });

  it("does not touch Sacred WIP eligibility service", () => {
    const eligibility = read(ELIGIBILITY);
    expect(eligibility.length).toBeGreaterThan(0);
    for (const path of [
      ACCEPT,
      VERSION,
      STAGE_START,
      GRANTS,
      ENCODE,
      JOB,
      SFM_DL,
      API_ERROR,
      READ_SVC,
    ]) {
      expect(read(path)).not.toMatch(/recording-eligibility-service/);
    }
  });

  it("status/read service binds owner server-side (no client ownerId trust)", () => {
    const src = read(READ_SVC);
    expect(src).toMatch(/owner_id.*context\.userId|context\.userId.*owner_id/);
    expect(src).toMatch(/requireUser/);
    expect(src).not.toMatch(/input\.ownerId|body\.ownerId/);
  });

  it("legacy mix download route still present; OD-SFM-ID-06 gate lives in artifact-download service", () => {
    expect(read(MIX_DL)).toMatch(/createOwnArtifactDownloadSignedUrl/);
    const mixSvc = read("src/lib/audio/artifact-download.ts");
    expect(mixSvc).toMatch(
      /assertMixRouteAllowsArtifactDomain|assertOwnedThenMixRouteDomain/,
    );
  });
});

describe("GO-SFM-HTTP-SURFACE — sfmApiErrorResponse mapping", () => {
  it("maps AuthError UNAUTHENTICATED → 401", async () => {
    const res = sfmApiErrorResponse(
      new AuthError("UNAUTHENTICATED", "Wymagane logowanie."),
    );
    expect(res.status).toBe(401);
    const body = await res.json();
    expect(body.code).toBe("UNAUTHENTICATED");
  });

  it("maps NOT_OWNER / NO_GRANT / QUALITY_DENIED → 403", () => {
    expect(sfmHttpStatusForDomainCode("NOT_OWNER")).toBe(403);
    expect(sfmHttpStatusForDomainCode("NO_GRANT")).toBe(403);
    expect(sfmHttpStatusForDomainCode("QUALITY_DENIED")).toBe(403);
    expect(sfmHttpStatusForDomainCode("FREE_NO_DOWNLOAD")).toBe(403);
  });

  it("maps ILLEGAL_TRANSITION / RECOVERY_REQUIRED / VERSION_CONFLICT → 409", () => {
    expect(sfmHttpStatusForDomainCode("ILLEGAL_TRANSITION")).toBe(409);
    expect(sfmHttpStatusForDomainCode("RECOVERY_REQUIRED")).toBe(409);
    expect(sfmHttpStatusForDomainCode("VERSION_CONFLICT")).toBe(409);
    expect(sfmHttpStatusForDomainCode("LIMIT_EXCEEDED")).toBe(409);
  });

  it("maps DISABLED → 503 and INVALID → 400", () => {
    expect(sfmHttpStatusForDomainCode("DISABLED")).toBe(503);
    expect(sfmHttpStatusForDomainCode("INVALID")).toBe(400);
  });

  it("never leaks raw Error.message for unknown failures", async () => {
    const res = sfmApiErrorResponse(
      new Error("relation studio_final_versions does not exist DETAIL: xyz"),
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(body.code).toBe("INVALID");
    expect(JSON.stringify(body)).not.toMatch(/relation|DETAIL|xyz/i);
  });
});

vi.mock("@/lib/auth/session", async () => {
  const actual = await vi.importActual<typeof import("@/lib/auth/session")>(
    "@/lib/auth/session",
  );
  return {
    ...actual,
    requireUser: vi.fn(),
  };
});

vi.mock("@/lib/sfm/sfm-foundation-service", () => ({
  acceptSfmVersionFor: vi.fn(),
  startSfmStageFor: vi.fn(),
}));

vi.mock("@/lib/sfm/sfm-grant-service", () => ({
  claimSfmVersionGrantFor: vi.fn(),
}));

vi.mock("@/lib/sfm/sfm-executor-service", () => ({
  enqueueSfmQualityEncodeFor: vi.fn(),
}));

vi.mock("@/lib/sfm/sfm-version-read-service", () => ({
  getOwnSfmVersionStatus: vi.fn(),
  getOwnSfmJobStatus: vi.fn(),
}));

vi.mock("@/lib/sfm/sfm-artifact-download", async () => {
  const actual = await vi.importActual<
    typeof import("@/lib/sfm/sfm-artifact-download")
  >("@/lib/sfm/sfm-artifact-download");
  return {
    ...actual,
    createOwnSfmArtifactDownloadSignedUrl: vi.fn(),
  };
});

describe("GO-SFM-HTTP-SURFACE — route handlers (mocked domain)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  async function requireUserMock() {
    const session = await import("@/lib/auth/session");
    return session.requireUser as unknown as ReturnType<typeof vi.fn>;
  }

  it("Accept: 401 without session", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockRejectedValue(
      new AuthError("UNAUTHENTICATED", "Wymagane logowanie."),
    );
    const { POST } = await import(
      "@/app/api/studio/projects/[projectId]/final/accept/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ expectedDocumentVersion: 1 }),
      }),
      { params: Promise.resolve({ projectId: PROJECT }) },
    );
    expect(res.status).toBe(401);
  });

  it("Accept: 403 for non-owner (service AuthZ)", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.acceptSfmVersionFor).mockRejectedValue(
      new AuthError("FORBIDDEN", "Brak dostępu do tego projektu."),
    );
    const { POST } = await import(
      "@/app/api/studio/projects/[projectId]/final/accept/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ expectedDocumentVersion: 1 }),
      }),
      { params: Promise.resolve({ projectId: PROJECT }) },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("FORBIDDEN");
  });

  it("Accept: 409 VERSION_CONFLICT on repeated/stale document version", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.acceptSfmVersionFor).mockRejectedValue(
      new SfmDomainError("Document version conflict", "VERSION_CONFLICT"),
    );
    const { POST } = await import(
      "@/app/api/studio/projects/[projectId]/final/accept/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ expectedDocumentVersion: 1 }),
      }),
      { params: Promise.resolve({ projectId: PROJECT }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("VERSION_CONFLICT");
  });

  it("Accept: 400 on invalid expectedDocumentVersion (domain INVALID)", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.acceptSfmVersionFor).mockRejectedValue(
      new SfmDomainError(
        "expectedDocumentVersion is required (positive integer).",
        "INVALID",
      ),
    );
    const { POST } = await import(
      "@/app/api/studio/projects/[projectId]/final/accept/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ expectedDocumentVersion: "nope" }),
      }),
      { params: Promise.resolve({ projectId: PROJECT }) },
    );
    expect(res.status).toBe(400);
  });

  it("Accept: success returns versionId without leaking internals", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.acceptSfmVersionFor).mockResolvedValue({
      versionId: VERSION_ID,
      projectId: PROJECT,
      ownerId: OWNER,
      sourceDocumentVersion: 3,
      contentDigest: "abc",
      status: "ACCEPTED",
      acceptedAt: "2026-10-15T00:00:00.000Z",
      mixStageStatus: "PENDING",
      masterStageStatus: "PENDING",
    });
    const { POST } = await import(
      "@/app/api/studio/projects/[projectId]/final/accept/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ expectedDocumentVersion: 3 }),
      }),
      { params: Promise.resolve({ projectId: PROJECT }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.success).toBe(true);
    expect(body.versionId).toBe(VERSION_ID);
    expect(body).not.toHaveProperty("content_snapshot");
  });

  it("Stage start: ILLEGAL_TRANSITION → 409 (MASTER before MIX)", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.startSfmStageFor).mockRejectedValue(
      new SfmDomainError(
        "SFM_MASTER cannot start before SFM_MIX SUCCEEDED.",
        "ILLEGAL_TRANSITION",
      ),
    );
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/stages/start/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ kind: "SFM_MASTER" }),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("ILLEGAL_TRANSITION");
  });

  it("Stage start: RECOVERY_REQUIRED → 409 (no auto-requeue)", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.startSfmStageFor).mockRejectedValue(
      new SfmDomainError("Bound job FAILED — recovery required.", "RECOVERY_REQUIRED"),
    );
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/stages/start/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ kind: "SFM_MIX" }),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(409);
    expect((await res.json()).code).toBe("RECOVERY_REQUIRED");
  });

  it("Stage start: success for SFM_MIX", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.startSfmStageFor).mockResolvedValue({
      stageId: "stage-1",
      versionId: VERSION_ID,
      kind: "SFM_MIX",
      status: "RUNNING",
      startedAt: "2026-10-15T00:00:00.000Z",
      jobId: JOB_ID,
    });
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/stages/start/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ kind: "SFM_MIX" }),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.kind).toBe("SFM_MIX");
    expect(body.jobId).toBe(JOB_ID);
  });

  it("Grant: rejects client premiumTier via domain FORBIDDEN", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const grantSvc = await import("@/lib/sfm/sfm-grant-service");
    vi.mocked(grantSvc.claimSfmVersionGrantFor).mockRejectedValue(
      new SfmDomainError(
        "Client must not supply premiumTier for SFM grant claim.",
        "FORBIDDEN",
      ),
    );
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/grants/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ premiumTier: "GOLD" }),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(403);
    expect(grantSvc.claimSfmVersionGrantFor).toHaveBeenCalledWith(
      expect.anything(),
      expect.objectContaining({
        versionId: VERSION_ID,
        clientBody: expect.objectContaining({ premiumTier: "GOLD" }),
      }),
    );
  });

  it("Grant: idempotent reuse returns reused=true", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const grantSvc = await import("@/lib/sfm/sfm-grant-service");
    vi.mocked(grantSvc.claimSfmVersionGrantFor).mockResolvedValue({
      grantId: "grant-1",
      versionId: VERSION_ID,
      userId: OWNER,
      source: "DAILY",
      grantedAt: "2026-10-15T00:00:00.000Z",
      grantedQualities: ["MP3_128"],
      dayBucket: "2026-10-15",
      reused: true,
    });
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/grants/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({}),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(200);
    expect((await res.json()).reused).toBe(true);
  });

  it("Encode: QUALITY_DENIED / NO_GRANT → 403", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const exec = await import("@/lib/sfm/sfm-executor-service");
    vi.mocked(exec.enqueueSfmQualityEncodeFor).mockRejectedValue(
      new SfmDomainError("SFM quality enqueue denied (NO_GRANT).", "NO_GRANT"),
    );
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/encode/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({
          quality: "WAV",
          idempotencyKey: "k1",
        }),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(403);
    expect((await res.json()).code).toBe("NO_GRANT");
  });

  it("Encode: invalid quality → 400", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const exec = await import("@/lib/sfm/sfm-executor-service");
    vi.mocked(exec.enqueueSfmQualityEncodeFor).mockRejectedValue(
      new SfmDomainError("Invalid SFM quality.", "INVALID"),
    );
    const { POST } = await import(
      "@/app/api/studio/final/versions/[versionId]/encode/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({
          quality: "FLAC_9000",
          idempotencyKey: "k1",
        }),
      }),
      { params: Promise.resolve({ versionId: VERSION_ID }) },
    );
    expect(res.status).toBe(400);
  });

  it("Version status: foreign version → 403", async () => {
    const readSvc = await import("@/lib/sfm/sfm-version-read-service");
    vi.mocked(readSvc.getOwnSfmVersionStatus).mockRejectedValue(
      new AuthError("FORBIDDEN", "Brak dostępu do tej wersji."),
    );
    const { GET } = await import(
      "@/app/api/studio/final/versions/[versionId]/route"
    );
    const res = await GET(new Request("http://local/test"), {
      params: Promise.resolve({ versionId: VERSION_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("Job status: job not bound to version → 403", async () => {
    const readSvc = await import("@/lib/sfm/sfm-version-read-service");
    vi.mocked(readSvc.getOwnSfmJobStatus).mockRejectedValue(
      new AuthError("FORBIDDEN", "Zadanie nie należy do tej wersji."),
    );
    const { GET } = await import(
      "@/app/api/studio/final/versions/[versionId]/jobs/[jobId]/route"
    );
    const res = await GET(new Request("http://local/test"), {
      params: Promise.resolve({ versionId: VERSION_ID, jobId: JOB_ID }),
    });
    expect(res.status).toBe(403);
  });

  it("Download: READY without grant → 403 NO_GRANT (mocked)", async () => {
    const dl = await import("@/lib/sfm/sfm-artifact-download");
    vi.mocked(dl.createOwnSfmArtifactDownloadSignedUrl).mockRejectedValue(
      new SfmDomainError("No version grant.", "NO_GRANT"),
    );
    const { GET } = await import(
      "@/app/api/studio/artifacts/[artifactId]/download/route"
    );
    const res = await GET(
      new Request("http://local/test/api/studio/artifacts/x/download"),
      { params: Promise.resolve({ artifactId: "cccccccc-cccc-cccc-cccc-cccccccccccc" }) },
    );
    expect(res.status).toBe(403);
    const body = await res.json();
    expect(body.code).toBe("NO_GRANT");
    expect(JSON.stringify(body)).not.toMatch(/signedUrl|token|secret/i);
  });

  it("Download: unknown Error does not leak SQL detail", async () => {
    const dl = await import("@/lib/sfm/sfm-artifact-download");
    vi.mocked(dl.createOwnSfmArtifactDownloadSignedUrl).mockRejectedValue(
      new Error("permission denied for table audio_artifacts"),
    );
    const { GET } = await import(
      "@/app/api/studio/artifacts/[artifactId]/download/route"
    );
    const res = await GET(
      new Request("http://local/test/api/studio/artifacts/x/download"),
      { params: Promise.resolve({ artifactId: "cccccccc-cccc-cccc-cccc-cccccccccccc" }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/permission denied|audio_artifacts/i);
  });

  it("RPC-style unknown failure on Accept does not leak DETAIL", async () => {
    const requireUser = await requireUserMock();
    requireUser.mockResolvedValue(ownerCtx());
    const foundation = await import("@/lib/sfm/sfm-foundation-service");
    vi.mocked(foundation.acceptSfmVersionFor).mockRejectedValue(
      new Error("RPC sfm_accept_version failed: DETAIL: secret_schema"),
    );
    const { POST } = await import(
      "@/app/api/studio/projects/[projectId]/final/accept/route"
    );
    const res = await POST(
      new Request("http://local/test", {
        method: "POST",
        body: JSON.stringify({ expectedDocumentVersion: 1 }),
      }),
      { params: Promise.resolve({ projectId: PROJECT }) },
    );
    expect(res.status).toBe(400);
    const body = await res.json();
    expect(JSON.stringify(body)).not.toMatch(/DETAIL|secret_schema|sfm_accept/i);
  });
});
