import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  assertMixRouteAllowsArtifactDomain,
  assertOwnedThenMixRouteDomain,
  classifyAudioArtifactDomain,
  isSfmDownloadDomain,
} from "@/lib/sfm/sfm-artifact-domain";
import {
  createOwnSfmArtifactDownloadSignedUrlFor,
} from "@/lib/sfm/sfm-artifact-download";
import { SfmDomainError } from "@/lib/sfm/sfm-domain";
import {
  resolveSfmQualityEntitlement,
  sfmArtifactReadyIsNotEntitlement,
} from "@/lib/sfm/sfm-quality-entitlement";

const ROOT = process.cwd();
function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

const DOMAIN = "src/lib/sfm/sfm-artifact-domain.ts";
const SFM_DL = "src/lib/sfm/sfm-artifact-download.ts";
const MIX_DL = "src/lib/audio/artifact-download.ts";
const MIX_ROUTE = "src/app/api/mix/artifacts/[id]/download/route.ts";
const SFM_ROUTE =
  "src/app/api/studio/artifacts/[artifactId]/download/route.ts";
const TAKE_DOWNLOAD = "src/app/api/takes/download/route.ts";
const ELIGIBILITY = "src/lib/takes/recording-eligibility-service.ts";
const STUDIO_CLIENT = "src/lib/studio/studio-export-client.ts";

const OWNER = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const OTHER = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const ARTIFACT = "cccccccc-cccc-cccc-cccc-cccccccccccc";
const VERSION = "dddddddd-dddd-dddd-dddd-dddddddddddd";
const PROJECT = "eeeeeeee-eeee-eeee-eeee-eeeeeeeeeeee";
const JOB = "ffffffff-ffff-ffff-ffff-ffffffffffff";
const OTHER_VERSION = "11111111-1111-1111-1111-111111111111";
const OTHER_PROJECT = "22222222-2222-2222-2222-222222222222";

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

type Fixture = {
  artifact?: Record<string, unknown> | null;
  version?: Record<string, unknown> | null;
  job?: Record<string, unknown> | null;
  grant?: Record<string, unknown> | null;
};

function baseSfmArtifact(
  overrides: Record<string, unknown> = {},
): Record<string, unknown> {
  return {
    id: ARTIFACT,
    owner_id: OWNER,
    project_id: PROJECT,
    mix_session_id: null,
    take_id: null,
    sfm_version_id: VERSION,
    sfm_quality: "WAV",
    is_current: true,
    render_job_id: JOB,
    format: "audio/wav",
    quality_tier: "WAV",
    storage_bucket: "audio-artifacts",
    object_key: `user/${OWNER}/studio-export/${PROJECT}/versions/${VERSION}/qualities/WAV.wav`,
    byte_size: 1000,
    duration_ms: 1000,
    status: "READY",
    expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    deleted_at: null,
    ...overrides,
  };
}

function createMockAdmin(fixture: Fixture) {
  const sign = vi.fn(async () => ({
    data: { signedUrl: "https://signed.example/sfm.wav" },
    error: null,
  }));

  function tableChain(table: string) {
    const api = {
      select: () => api,
      eq: () => api,
      maybeSingle: async () => {
        if (table === "audio_artifacts") {
          return { data: fixture.artifact ?? null, error: null };
        }
        if (table === "studio_final_versions") {
          return { data: fixture.version ?? null, error: null };
        }
        if (table === "render_jobs") {
          return { data: fixture.job ?? null, error: null };
        }
        if (table === "studio_final_version_grants") {
          return { data: fixture.grant ?? null, error: null };
        }
        return { data: null, error: null };
      },
    };
    return api;
  }

  return {
    admin: {
      from: (table: string) => tableChain(table),
      storage: {
        from: () => ({
          createSignedUrl: sign,
        }),
      },
    } as unknown as ReturnType<
      typeof import("@/lib/supabase/admin").createSupabaseAdminClient
    >,
    sign,
  };
}

const goldProduct = async () =>
  ({
    premiumTier: "GOLD" as const,
  }) as Awaited<
    ReturnType<
      typeof import("@/lib/audio/load-premium-entitlement").resolveProductEntitlementForAuthContext
    >
  >;

async function runDownload(
  fixture: Fixture,
  ctx: AuthContext = ownerCtx(),
) {
  const { admin, sign } = createMockAdmin(fixture);
  try {
    const result = await createOwnSfmArtifactDownloadSignedUrlFor(ctx, {
      artifactId: ARTIFACT,
      deps: {
        isEnabled: () => true,
        createAdmin: () => admin,
        resolveProduct: goldProduct,
      },
    });
    return { result, sign, error: null as null };
  } catch (error) {
    return { result: null, sign, error };
  }
}

describe("OD-SFM-ID-06 / ID-01 — domain classification (DB XOR)", () => {
  it("classifies SFM when sfm_version_id set (wins over project_id)", () => {
    expect(
      classifyAudioArtifactDomain({
        sfmVersionId: "ver-1",
        mixSessionId: null,
        takeId: null,
        projectId: "proj-1",
      }),
    ).toBe("SFM");
  });

  it("classifies E3_MIX / TAKE / LEGACY_STUDIO without heuristics on .wav", () => {
    expect(
      classifyAudioArtifactDomain({
        sfmVersionId: null,
        mixSessionId: "mix-1",
        takeId: null,
        projectId: null,
      }),
    ).toBe("E3_MIX");
    expect(
      classifyAudioArtifactDomain({
        sfmVersionId: null,
        mixSessionId: null,
        takeId: "take-1",
        projectId: null,
      }),
    ).toBe("TAKE");
    expect(
      classifyAudioArtifactDomain({
        sfmVersionId: null,
        mixSessionId: null,
        takeId: null,
        projectId: "proj-1",
      }),
    ).toBe("LEGACY_STUDIO");
  });

  it("legacy without sfm_version_id is not an SFM download domain", () => {
    expect(isSfmDownloadDomain("LEGACY_STUDIO")).toBe(false);
    expect(isSfmDownloadDomain("SFM")).toBe(true);
  });
});

describe("F-02 — ownership before domain-specific mix denial", () => {
  it("foreign SFM artifact does not disclose SFM domain message", () => {
    expect(() =>
      assertOwnedThenMixRouteDomain({
        artifactOwnerId: OWNER,
        userId: OTHER,
        domain: "SFM",
        sfmVersionsV1Enabled: true,
      }),
    ).toThrow(AuthError);
    try {
      assertOwnedThenMixRouteDomain({
        artifactOwnerId: OWNER,
        userId: OTHER,
        domain: "SFM",
        sfmVersionsV1Enabled: true,
      });
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).message).toBe("Not artifact owner.");
      expect((e as AuthError).message).not.toMatch(/SFM download route|OD-SFM-ID-06/);
    }
  });

  it("foreign legacy Studio does not disclose OD-06 message", () => {
    try {
      assertOwnedThenMixRouteDomain({
        artifactOwnerId: OWNER,
        userId: OTHER,
        domain: "LEGACY_STUDIO",
        sfmVersionsV1Enabled: true,
      });
      expect.unreachable();
    } catch (e) {
      expect((e as AuthError).message).toBe("Not artifact owner.");
      expect((e as AuthError).message).not.toMatch(/OD-SFM-ID-06|Legacy Studio/);
    }
  });

  it("owner still gets SFM-on-mix domain denial", () => {
    expect(() =>
      assertOwnedThenMixRouteDomain({
        artifactOwnerId: OWNER,
        userId: OWNER,
        domain: "SFM",
        sfmVersionsV1Enabled: false,
      }),
    ).toThrow(/SFM download route/);
  });

  it("owner E3_MIX / TAKE pass domain gate (flag on or off)", () => {
    for (const enabled of [false, true]) {
      expect(() =>
        assertOwnedThenMixRouteDomain({
          artifactOwnerId: OWNER,
          userId: OWNER,
          domain: "E3_MIX",
          sfmVersionsV1Enabled: enabled,
        }),
      ).not.toThrow();
      expect(() =>
        assertOwnedThenMixRouteDomain({
          artifactOwnerId: OWNER,
          userId: OWNER,
          domain: "TAKE",
          sfmVersionsV1Enabled: enabled,
        }),
      ).not.toThrow();
    }
  });

  it("mix download source uses ownership-before-domain helper", () => {
    const art = read(MIX_DL);
    expect(art).toMatch(/assertOwnedThenMixRouteDomain\(/);
    // Call-site order (ignore imports): ownership+domain gate before capability.
    expect(art.lastIndexOf("assertOwnedThenMixRouteDomain(")).toBeLessThan(
      art.lastIndexOf("assertAudioCapability("),
    );
  });
});

describe("OD-SFM-ID-01 / ID-06 — mix route domain gate (owner path)", () => {
  it("always DENY SFM on mix route", () => {
    expect(() =>
      assertMixRouteAllowsArtifactDomain({
        domain: "SFM",
        sfmVersionsV1Enabled: false,
      }),
    ).toThrow(/SFM download route/);
  });

  it("DENY legacy Studio when SFM_VERSIONS_V1 ON", () => {
    expect(() =>
      assertMixRouteAllowsArtifactDomain({
        domain: "LEGACY_STUDIO",
        sfmVersionsV1Enabled: true,
      }),
    ).toThrow(/OD-SFM-ID-06/);
  });

  it("allows legacy Studio on mix only while flag OFF", () => {
    expect(() =>
      assertMixRouteAllowsArtifactDomain({
        domain: "LEGACY_STUDIO",
        sfmVersionsV1Enabled: false,
      }),
    ).not.toThrow();
  });
});

describe("OD-SFM-ID-02 strict grant / quality (download mode)", () => {
  it("NO_GRANT when grant missing", () => {
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "GOLD",
        quality: "WAV",
        versionGrant: null,
        accessMode: "DOWNLOAD",
      }),
    ).toEqual({ allow: false, denyCode: "NO_GRANT" });
  });

  it("DENY quality outside granted_qualities", () => {
    const d = resolveSfmQualityEntitlement({
      premiumTier: "GOLD",
      quality: "WAV",
      versionGrant: { grantedQualities: ["MP3_128", "MP3_192"] },
      accessMode: "DOWNLOAD",
    });
    expect(d.allow).toBe(false);
  });

  it("ALLOW when quality ∈ granted_qualities", () => {
    expect(
      resolveSfmQualityEntitlement({
        premiumTier: "BRONZE",
        quality: "MP3_128",
        versionGrant: { grantedQualities: ["MP3_128"] },
        accessMode: "DOWNLOAD",
      }),
    ).toEqual({ allow: true });
  });

  it("READY alone is not entitlement", () => {
    expect(sfmArtifactReadyIsNotEntitlement()).toBe(true);
  });
});

describe("F-04 — createOwnSfmArtifactDownloadSignedUrlFor service AuthZ", () => {
  const happy = (): Fixture => ({
    artifact: baseSfmArtifact(),
    version: {
      id: VERSION,
      owner_id: OWNER,
      project_id: PROJECT,
      status: "EXPORTS_ELIGIBLE",
      expires_at: new Date(Date.now() + 86_400_000).toISOString(),
    },
    job: {
      id: JOB,
      owner_id: OWNER,
      status: "SUCCEEDED",
      sfm_version_id: VERSION,
      project_id: PROJECT,
    },
    grant: {
      id: "grant-1",
      user_id: OWNER,
      version_id: VERSION,
      granted_qualities: ["MP3_128", "MP3_192", "MP3_320", "WAV"],
    },
  });

  it("happy path: owner + current + grant → signed URL once", async () => {
    const { result, sign, error } = await runDownload(happy());
    expect(error).toBeNull();
    expect(result?.url).toBe("https://signed.example/sfm.wav");
    expect(result?.versionId).toBe(VERSION);
    expect(result?.quality).toBe("WAV");
    expect(sign).toHaveBeenCalledTimes(1);
  });

  it("wrong owner → FORBIDDEN before sign; no domain leak required", async () => {
    const { sign, error } = await runDownload(happy(), ownerCtx(OTHER));
    expect(error).toBeInstanceOf(AuthError);
    expect((error as AuthError).message).toBe("Not artifact owner.");
    expect(sign).not.toHaveBeenCalled();
  });

  it("non-SFM (legacy project) artifact → DENY; no sign", async () => {
    const fx = happy();
    fx.artifact = baseSfmArtifact({
      sfm_version_id: null,
      sfm_quality: null,
      is_current: false,
    });
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).code).toBe("NOT_ELIGIBLE");
    expect(sign).not.toHaveBeenCalled();
  });

  it("F-01: job.sfm_version_id NULL → CONFLICT; no sign", async () => {
    const fx = happy();
    fx.job = { ...fx.job!, sfm_version_id: null };
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).message).toMatch(/Job\/version bind/);
    expect(sign).not.toHaveBeenCalled();
  });

  it("F-01: job.sfm_version_id other version → CONFLICT; no sign", async () => {
    const fx = happy();
    fx.job = { ...fx.job!, sfm_version_id: OTHER_VERSION };
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).code).toBe("CONFLICT");
    expect(sign).not.toHaveBeenCalled();
  });

  it("F-01: missing artifact.project_id → CONFLICT; no sign", async () => {
    const fx = happy();
    fx.artifact = baseSfmArtifact({ project_id: null });
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).message).toMatch(/project_id/);
    expect(sign).not.toHaveBeenCalled();
  });

  it("F-01: inconsistent job.project_id → CONFLICT; no sign", async () => {
    const fx = happy();
    fx.job = { ...fx.job!, project_id: OTHER_PROJECT };
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).message).toMatch(/Job\/project bind/);
    expect(sign).not.toHaveBeenCalled();
  });

  it("is_current=false → DENY; no sign", async () => {
    const fx = happy();
    fx.artifact = baseSfmArtifact({ is_current: false });
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).message).toMatch(/current SFM final/);
    expect(sign).not.toHaveBeenCalled();
  });

  it("expired version → DENY; no sign", async () => {
    const fx = happy();
    fx.version = {
      ...fx.version!,
      expires_at: new Date(Date.now() - 1000).toISOString(),
    };
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).message).toMatch(/Version expired/);
    expect(sign).not.toHaveBeenCalled();
  });

  it("missing grant → NO_GRANT; no sign", async () => {
    const fx = happy();
    fx.grant = null;
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).code).toBe("NO_GRANT");
    expect(sign).not.toHaveBeenCalled();
  });

  it("quality not in granted_qualities → DENY; no sign", async () => {
    const fx = happy();
    fx.grant = {
      ...fx.grant!,
      granted_qualities: ["MP3_128"],
    };
    const { sign, error } = await runDownload(fx);
    expect(error).toBeInstanceOf(SfmDomainError);
    expect((error as SfmDomainError).code).toBe("QUALITY_DENIED");
    expect(sign).not.toHaveBeenCalled();
  });
});

describe("OD-SFM-ID-06 — source contracts + F-03 UI blocker docs", () => {
  it("SFM download: ownership before domain; fail-closed job bind; grant before sign", () => {
    const src = read(SFM_DL);
    expect(src).toMatch(/Not artifact owner/);
    expect(src.indexOf("(artifact.owner_id as string) !== context.userId")).toBeLessThan(
      src.indexOf("isSfmDownloadDomain(domain)"),
    );
    expect(src).toMatch(/Job\/version bind mismatch/);
    expect(src).toMatch(/typeof jobVersionId !== "string"/);
    expect(src).toMatch(/SFM artifact missing required project_id/);
    expect(src).toMatch(/Job\/project bind mismatch/);
    expect(src.indexOf('from("studio_final_version_grants")')).toBeLessThan(
      src.indexOf("createSignedUrl"),
    );
  });

  it("SFM route rejects client object_key", () => {
    const route = read(SFM_ROUTE);
    expect(route).toMatch(/createOwnSfmArtifactDownloadSignedUrl/);
    expect(route).toMatch(/rejectClientRenderSourceClaims/);
  });

  it("TAKE download and Sacred WIP unchanged", () => {
    expect(read(TAKE_DOWNLOAD)).not.toMatch(
      /createOwnSfmArtifactDownloadSignedUrl|assertOwnedThenMixRouteDomain/,
    );
    expect(read(ELIGIBILITY)).not.toMatch(
      /createOwnSfmArtifactDownloadSignedUrl|OD-SFM-ID-06/,
    );
  });

  it("F-03: studioExportArtifactDownloadUrl still points at mix route", () => {
    const client = read(STUDIO_CLIENT);
    expect(client).toMatch(
      /studioExportArtifactDownloadUrl[\s\S]*\/api\/mix\/artifacts\//,
    );
    expect(client).not.toMatch(
      /studioExportArtifactDownloadUrl[\s\S]*\/api\/studio\/artifacts\//,
    );
  });

  it("mix route still uses createOwnArtifactDownloadSignedUrl", () => {
    expect(read(MIX_ROUTE)).toMatch(/createOwnArtifactDownloadSignedUrl/);
  });

  it("domain module has no Storage sign / invent helpers", () => {
    const d = read(DOMAIN);
    expect(d).not.toMatch(/createSignedUrl/);
    expect(d).not.toMatch(/legacyBackfill|inventVersion|grandfatherDownload/);
  });
});
