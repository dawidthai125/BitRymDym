/**
 * FAR-01 LIVE credential boundary tests (no Production mutation).
 */

import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";

import {
  assertCredentialClassIsDryRunReadonly,
  assertCredentialClassIsLiveMutator,
  assertDryRunEnvNotUsingLiveCredential,
  assertFar01LiveMutationAuthorized,
  assertFar01LiveNotUsingAdminClient,
  buildFar01LiveCreateClientArgs,
  FAR01_LIVE_POSTGRES_ROLE,
  FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
  Far01BackfillAuthorizationError,
  Far01CredentialGateError,
  resolveFar01DryRunReadonlyCredentials,
  resolveFar01LiveMutatorCredentials,
  createFar01ProdDbMutator,
  createFar01ProdStorageMutator,
} from "@/lib/beats/far01-backfill";

function b64url(obj: unknown): string {
  return Buffer.from(JSON.stringify(obj), "utf8")
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintJwt(role: string, secret = "test-secret-at-least-32-chars!!", expOffset = 3600): string {
  const header = b64url({ alg: "HS256", typ: "JWT" });
  const now = Math.floor(Date.now() / 1000);
  const payload = b64url({
    iss: "supabase",
    role,
    iat: now,
    exp: now + expOffset,
  });
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest("base64url");
  return `${data}.${sig}`;
}

const LIVE_JWT = mintJwt(FAR01_LIVE_POSTGRES_ROLE);
const R1_JWT = mintJwt("far01_dryrun_readonly");

describe("LIVE credential class + resolve", () => {
  it("credential class is live_mutator (not readonly/service_role)", () => {
    expect(FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS).toBe("live_mutator");
    expect(FAR01_LIVE_POSTGRES_ROLE).toBe("far01_live_mutator");
    expect(() => assertCredentialClassIsLiveMutator("readonly")).toThrow(
      /LIVE denied/,
    );
    expect(() => assertCredentialClassIsDryRunReadonly("live_mutator")).toThrow(
      /Dry-run denied/,
    );
  });

  it("missing LIVE env → DENY", () => {
    expect(() => resolveFar01LiveMutatorCredentials({})).toThrow(
      /FAR01_LIVE_SUPABASE_URL/,
    );
  });

  it("wrong credential class → DENY", () => {
    expect(() =>
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: LIVE_JWT,
        FAR01_LIVE_CREDENTIAL_CLASS: "readonly",
      }),
    ).toThrow(/live_mutator/);
  });

  it("R1 JWT as LIVE key → DENY", () => {
    expect(() =>
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: R1_JWT,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
      }),
    ).toThrow(/far01_live_mutator/);
  });

  it("service-role as LIVE key → DENY", () => {
    const sr = "service-role-secret-value";
    expect(() =>
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: sr,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
        SUPABASE_SERVICE_ROLE_KEY: sr,
      }),
    ).toThrow(/SERVICE_ROLE/);
  });

  it("expired LIVE JWT → DENY", () => {
    const expired = mintJwt(FAR01_LIVE_POSTGRES_ROLE, "sec", -10);
    expect(() =>
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: expired,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
      }),
    ).toThrow(/expired/);
  });

  it("valid LIVE resolve + transport (no network)", () => {
    const env = {
      FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
      FAR01_LIVE_MUTATOR_KEY: LIVE_JWT,
      FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
      FAR01_LIVE_API_KEY: "anon-publishable-key",
    };
    const creds = resolveFar01LiveMutatorCredentials(env);
    expect(creds.credentialClass).toBe("live_mutator");
    const args = buildFar01LiveCreateClientArgs(env);
    expect(args.apiKey).toBe("anon-publishable-key");
    expect(args.apiKey).not.toBe(args.liveJwt);
  });
});

describe("R1 / LIVE / mode separation", () => {
  it("R1 client + LIVE env class mix → DENY on dry-run", () => {
    expect(() =>
      resolveFar01DryRunReadonlyCredentials({
        FAR01_DRYRUN_SUPABASE_URL: "https://example.supabase.co",
        FAR01_DRYRUN_READONLY_KEY: LIVE_JWT,
        FAR01_DRYRUN_CREDENTIAL_CLASS: "readonly",
      }),
    ).toThrow(/far01_live_mutator/);
  });

  it("R1 + DRY_RUN class → PASS resolve", () => {
    const creds = resolveFar01DryRunReadonlyCredentials({
      FAR01_DRYRUN_SUPABASE_URL: "https://example.supabase.co",
      FAR01_DRYRUN_READONLY_KEY: R1_JWT,
      FAR01_DRYRUN_CREDENTIAL_CLASS: "readonly",
    });
    expect(creds.credentialClass).toBe("readonly");
  });

  it("LIVE key equals R1 key → DENY both ways", () => {
    expect(() =>
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: LIVE_JWT,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
        FAR01_DRYRUN_READONLY_KEY: LIVE_JWT,
      }),
    ).toThrow(/must not equal FAR01_DRYRUN/);

    expect(() =>
      assertDryRunEnvNotUsingLiveCredential({
        FAR01_DRYRUN_CREDENTIAL_CLASS: "readonly",
        FAR01_DRYRUN_READONLY_KEY: "same",
        FAR01_LIVE_MUTATOR_KEY: "same",
      }),
    ).toThrow(/must not equal LIVE/);
  });

  it("LIVE + missing A2 / authorization → DENY", () => {
    expect(() =>
      assertFar01LiveMutationAuthorized({
        mode: "LIVE",
        verifiedGrant: null,
        authorization: { backfillGo: false, operatorApproval: true },
      }),
    ).toThrow(Far01BackfillAuthorizationError);

    expect(() =>
      assertFar01LiveMutationAuthorized({
        mode: "DRY_RUN",
        verifiedGrant: null,
        authorization: { backfillGo: false, operatorApproval: true },
      }),
    ).toThrow(/mode must be LIVE/);
  });

  it("admin client / service-role apikey → DENY", () => {
    expect(() =>
      assertFar01LiveNotUsingAdminClient({ usingAdminClient: true }),
    ).toThrow(Far01CredentialGateError);

    expect(() =>
      buildFar01LiveCreateClientArgs({
        FAR01_LIVE_SUPABASE_URL: "https://example.supabase.co",
        FAR01_LIVE_MUTATOR_KEY: LIVE_JWT,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
        FAR01_LIVE_API_KEY: "sr-key",
        SUPABASE_SERVICE_ROLE_KEY: "sr-key",
      }),
    ).toThrow(/service-role|SERVICE_ROLE|sb_secret/i);
  });

  it("LIVE adapters construct from injected fakes only (no FromEnv auto-run)", () => {
    expect(() =>
      createFar01ProdStorageMutator({
        storage: {
          from: () => ({
            list: async () => ({ data: [], error: null }),
            copy: async () => ({ data: { path: "x" }, error: null }),
          }),
        },
      }),
    ).not.toThrow();
    expect(() =>
      createFar01ProdDbMutator({
        from: () => {
          throw new Error("should not be called on construct");
        },
      } as never),
    ).not.toThrow();
  });
});
