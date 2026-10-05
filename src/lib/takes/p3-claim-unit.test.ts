import { readFileSync } from "fs";
import { resolve } from "path";
import { describe, expect, it } from "vitest";

import { SAMPLE_POLICY_DEFAULTS } from "@/config/recording";
import {
  getSamplePolicy,
  sampleActorFromPremiumTier,
} from "@/lib/takes/entitlement";
import {
  TAKE_CLAIM_CODES,
  messageForTakeClaimCode,
  parseTakeClaimCodeFromRpc,
} from "@/lib/takes/claim-errors";
import {
  buildAnonTakeObjectKey,
  buildUserTakeObjectKey,
  expectedAnonTakeObjectKey,
  expectedUserTakeObjectKey,
} from "@/lib/takes/object-key";
import {
  anonymousTakeTokenHashPrefix,
  hashAnonymousTakeToken,
} from "@/lib/takes/token-hash";
import { accountClaimRedirectPath } from "@/lib/takes/anon-account-claim-ux";

const TOKEN = "c".repeat(64);
const HASH = hashAnonymousTakeToken(TOKEN);
const OWNER = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa";
const TAKE = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb";

describe("P3 — claim codes and policy axis", () => {
  it("includes P3 claim codes", () => {
    expect(TAKE_CLAIM_CODES).toContain("CLAIM_OK");
    expect(TAKE_CLAIM_CODES).toContain("CLAIM_CAP_REACHED");
    expect(TAKE_CLAIM_CODES).toContain("CLAIM_NO_ELIGIBLE");
    expect(TAKE_CLAIM_CODES).toContain("CLAIM_IDEMPOTENT_REPLAY");
    expect(TAKE_CLAIM_CODES).toContain("CLAIM_STORAGE_FAILED");
  });

  it("parses RPC claim exceptions", () => {
    expect(parseTakeClaimCodeFromRpc("CLAIM_CAP_REACHED")).toBe(
      "CLAIM_CAP_REACHED",
    );
    expect(parseTakeClaimCodeFromRpc("xx CLAIM_NO_ELIGIBLE yy")).toBe(
      "CLAIM_NO_ELIGIBLE",
    );
    expect(messageForTakeClaimCode("CLAIM_CAP_REACHED")).toMatch(/limit/i);
  });

  it("TTL/cap come from Premium Tier via getSamplePolicy — not Account Level", () => {
    const free = getSamplePolicy({
      actor: sampleActorFromPremiumTier("FREE"),
      beatDurationSeconds: 180,
    });
    expect(free.actor).toBe("FREE");
    expect(free.ttlSeconds).toBe(SAMPLE_POLICY_DEFAULTS.FREE.ttlSeconds);
    expect(free.activeReadyCap).toBe(
      SAMPLE_POLICY_DEFAULTS.FREE.maxActiveReady,
    );

    const gold = getSamplePolicy({
      actor: sampleActorFromPremiumTier("GOLD"),
      beatDurationSeconds: 180,
    });
    expect(gold.ttlSeconds).toBe(SAMPLE_POLICY_DEFAULTS.GOLD.ttlSeconds);
    expect(gold.activeReadyCap).toBe(
      SAMPLE_POLICY_DEFAULTS.GOLD.maxActiveReady,
    );
  });

  it("anonymous defaults remain 15s / 2h / cap 1", () => {
    expect(SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxRecordingSeconds).toBe(15);
    expect(SAMPLE_POLICY_DEFAULTS.ANONYMOUS.ttlSeconds).toBe(7200);
    expect(SAMPLE_POLICY_DEFAULTS.ANONYMOUS.maxActiveReady).toBe(1);
  });
});

describe("P3 — object keys for claim", () => {
  it("builds canonical anon and user paths", () => {
    const anonKey = buildAnonTakeObjectKey({
      tokenHashPrefix: anonymousTakeTokenHashPrefix(HASH),
      takeId: TAKE,
    });
    const userKey = buildUserTakeObjectKey({ ownerId: OWNER, takeId: TAKE });
    expect(anonKey).toBe(
      `anon/${anonymousTakeTokenHashPrefix(HASH)}/takes/${TAKE}/mic.bin`,
    );
    expect(userKey).toBe(`user/${OWNER}/takes/${TAKE}/mic.bin`);
    expect(
      expectedAnonTakeObjectKey({
        tokenHashPrefix: anonymousTakeTokenHashPrefix(HASH),
        takeId: TAKE,
        objectKey: anonKey,
      }),
    ).toBe(true);
    expect(
      expectedUserTakeObjectKey({
        ownerId: OWNER,
        takeId: TAKE,
        objectKey: userKey,
      }),
    ).toBe(true);
    expect(
      expectedUserTakeObjectKey({
        ownerId: OWNER,
        takeId: TAKE,
        objectKey: anonKey,
      }),
    ).toBe(false);
  });

  it("rejects path injection shapes", () => {
    expect(
      expectedUserTakeObjectKey({
        ownerId: OWNER,
        takeId: TAKE,
        objectKey: `user/${OWNER}/takes/${TAKE}/../../evil.bin`,
      }),
    ).toBe(false);
    expect(
      expectedUserTakeObjectKey({
        ownerId: OWNER,
        takeId: TAKE,
        objectKey: `user/other-user/takes/${TAKE}/mic.bin`,
      }),
    ).toBe(false);
  });
});

describe("P3 — redirect UX mapping", () => {
  it("maps claim results to account query", () => {
    expect(accountClaimRedirectPath({ ux: "ok" })).toBe("/account?claim=ok");
    expect(accountClaimRedirectPath({ ux: "cap" })).toBe("/account?claim=cap");
    expect(accountClaimRedirectPath({ ux: "error" })).toBe(
      "/account?claim=error",
    );
    expect(accountClaimRedirectPath({ ux: "none" })).toBe("/account");
  });
});

describe("P3 — migration / source contracts", () => {
  it("RPC migration is service_role only with frozen lock order", () => {
    const sql = readFileSync(
      resolve(
        process.cwd(),
        "supabase/migrations/20261005211153_p3_claim_anon_take_to_account.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/claim_anon_take_to_account/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/search_path = public/);
    expect(sql).toMatch(
      /pg_advisory_xact_lock\(87245104, hashtext\(p_anonymous_token_hash\)\)/,
    );
    expect(sql).toMatch(
      /pg_advisory_xact_lock\(hashtextextended\(p_owner_id::text, 0\)\)/,
    );
    expect(sql).toMatch(/CLAIM_CAP_REACHED/);
    expect(sql).toMatch(/CLAIM_NO_ELIGIBLE/);
    expect(sql).toMatch(/CLAIM_IDEMPOTENT_REPLAY/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).not.toMatch(/claim_take_recording_session/);
    expect(sql).not.toMatch(/finalize_take_ready_swap/);
  });

  it("auth hooks wire claim before redirect; middleware untouched", () => {
    const actions = readFileSync(
      resolve(process.cwd(), "src/lib/auth/actions.ts"),
      "utf8",
    );
    const middleware = readFileSync(
      resolve(process.cwd(), "src/middleware.ts"),
      "utf8",
    );
    const panel = readFileSync(
      resolve(process.cwd(), "src/components/takes/recording-panel.tsx"),
      "utf8",
    );
    expect(actions).toMatch(/tryClaimAnonTakeAfterAuth/);
    expect(actions).toMatch(/accountClaimRedirectPath/);
    expect(middleware).not.toMatch(/claimAnon|brd_tk_aid|anon-account-claim/);
    expect(panel).not.toMatch(/bez transferu/);
    expect(panel).toMatch(/zapisane na Twoim koncie|zapisane na koncie/i);
  });

  it("orchestrator reuses Premium Tier SSOT and Storage copy protocol", () => {
    const orch = readFileSync(
      resolve(process.cwd(), "src/lib/takes/anon-account-claim.ts"),
      "utf8",
    );
    expect(orch).toMatch(/resolveProductEntitlementForAuthContext/);
    expect(orch).toMatch(/sampleActorFromPremiumTier/);
    expect(orch).toMatch(/getSamplePolicy/);
    expect(orch).toMatch(/claim_anon_take_to_account/);
    expect(orch).not.toMatch(/claim_take_recording_session/);
    expect(orch).not.toMatch(/claim_anon_take_recording_session/);
    expect(orch).not.toMatch(/finalize_take_ready_swap/);
    expect(orch).not.toMatch(/accountLevel/);
    expect(orch).toMatch(/\.copy\(/);
    expect(orch).toMatch(/clearAnonymousTakeIdentity/);
  });
});
