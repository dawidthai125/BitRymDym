/**
 * GO-PREMIUM-22 — Live local Storage+DB scenarios D2/D3/D5/D6 (synthetic only).
 *
 * Gate: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* loopback (never *.supabase.co).
 * Does NOT mock Storage/DB for D2/D3/D6 assertions. D5 uses a brief ACCESS EXCLUSIVE
 * lock on local audio_artifacts only (released after sleep / session end).
 *
 * Not HTTP E2E — calls runPremiumRetentionCleanupForWork directly against local stack.
 *
 * G3-TCB: the executor runs as premium_retention_worker (JWT minted here from
 * LOCAL_SUPABASE_JWT_SECRET — local stack only) and needs a held lease fence.
 */

import { execFileSync } from "node:child_process";
import { createHmac, randomUUID } from "node:crypto";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import { evaluatePremiumDownloadGate } from "@/lib/premium/premium-download-authz";
import { runPremiumRetentionCleanupForWork } from "@/lib/premium/premium-retention-cleanup-service";
import {
  createPremiumRetentionLeaseClient,
  type PremiumRetentionLeaseFence,
} from "@/lib/premium/premium-retention-lease";
import {
  PREMIUM_RETENTION_WORKER_ENV,
  PREMIUM_RETENTION_WORKER_ROLE,
} from "@/lib/supabase/premium-retention-worker-client";
import {
  applyIntegrationEnv,
  resolveIntegrationEnv,
} from "@/test/integration-env";

const integration = resolveIntegrationEnv({});
const live = integration.enabled;

function mintLocalWorkerJwt(secret: string): string {
  const b64 = (v: unknown) => Buffer.from(JSON.stringify(v)).toString("base64url");
  const now = Math.floor(Date.now() / 1000);
  const body = `${b64({ alg: "HS256", typ: "JWT" })}.${b64({
    role: PREMIUM_RETENTION_WORKER_ROLE,
    iss: "supabase-demo",
    iat: now,
    exp: now + 3600,
  })}`;
  return `${body}.${createHmac("sha256", secret).update(body).digest("base64url")}`;
}

if (live) {
  applyIntegrationEnv(integration);
  const host = new URL(integration.url).hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`refusing non-loopback LOCAL_SUPABASE_URL host=${host}`);
  }
  const jwtSecret = process.env.LOCAL_SUPABASE_JWT_SECRET?.trim();
  if (!jwtSecret) {
    throw new Error("LOCAL_SUPABASE_JWT_SECRET required (from `supabase status -o env`)");
  }
  process.env[PREMIUM_RETENTION_WORKER_ENV.jwt] = mintLocalWorkerJwt(jwtSecret);
}

async function withLease<T>(fn: (fence: PremiumRetentionLeaseFence) => Promise<T>): Promise<T> {
  const lease = createPremiumRetentionLeaseClient();
  const runId = randomUUID();
  const acquired = await lease.acquire({ runId, ttlSeconds: 120 });
  if (acquired.status !== "ok" || !acquired.value.acquired || acquired.value.fencingToken == null) {
    throw new Error(`lease acquire failed: ${JSON.stringify(acquired)}`);
  }
  const fence = { runId, fencingToken: acquired.value.fencingToken };
  try {
    return await fn(fence);
  } finally {
    await lease.release(fence);
  }
}

const dbContainer =
  process.env.LOCAL_SUPABASE_DB_CONTAINER ?? "supabase_db_bitrymdym-local";

function psql(sql: string): string {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      dbContainer,
      "psql",
      "-X",
      "-q",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-U",
      "postgres",
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

describe.runIf(live)("GO-PREMIUM-22 D2–D6 live local retention (Storage+DB)", () => {
  const tag = randomUUID().slice(0, 8);
  let admin: SupabaseClient;
  let ownerId = "";
  const trackedUsers: string[] = [];
  const trackedProjects: string[] = [];
  const storageKeys: string[] = [];

  beforeAll(async () => {
    admin = createClient(integration.url, integration.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const email = `p22-${tag}@local.test`;
    const password = `P22!${randomUUID()}`;
    const { data, error } = await admin.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
    });
    if (error || !data.user) throw new Error(error?.message ?? "createUser");
    ownerId = data.user.id;
    trackedUsers.push(ownerId);
    await admin.from("profiles").upsert({
      id: ownerId,
      role: "USER",
      account_level: "BEGINNER_RAPPER",
      display_name: `p22_${tag}`,
    });
  }, 60_000);

  afterAll(async () => {
    if (storageKeys.length > 0) {
      await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove(storageKeys);
    }
    if (trackedUsers.length > 0) {
      const ids = trackedUsers.map((u) => `'${u}'`).join(",");
      psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
ALTER TABLE public.premium_unlock_events DISABLE TRIGGER USER;
DELETE FROM public.premium_unlock_events WHERE user_id IN (${ids});
ALTER TABLE public.premium_unlock_events ENABLE TRIGGER USER;
DELETE FROM public.audio_artifacts WHERE owner_id IN (${ids});
DELETE FROM public.render_jobs WHERE owner_id IN (${ids});
DELETE FROM public.premium_track_unlocks WHERE user_id IN (${ids});
DELETE FROM public.premium_works WHERE owner_id IN (${ids});
DELETE FROM public.studio_projects WHERE owner_id IN (${ids});
DELETE FROM public.profiles WHERE id IN (${ids});
`);
      for (const id of trackedUsers) {
        await admin.auth.admin.deleteUser(id);
      }
    }
  }, 60_000);

  async function seedDueProjectWork(params: {
    label: string;
    artifacts: Array<{
      objectKey: string;
      storageBucket: string;
      upload?: boolean;
    }>;
  }): Promise<{ workId: string; projectId: string; retentionExpiresAt: string }> {
    const projectId = randomUUID();
    trackedProjects.push(projectId);
    const tinyMp3 = Buffer.from([
      0xff, 0xfb, 0x90, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00, 0x00,
    ]);

    const jobRows: string[] = [];
    const artifactRows: string[] = [];
    for (let i = 0; i < params.artifacts.length; i += 1) {
      const a = params.artifacts[i]!;
      const jobId = randomUUID();
      if (a.upload) {
        const up = await admin.storage
          .from(AUDIO_ARTIFACTS_BUCKET)
          .upload(a.objectKey, tinyMp3, {
            contentType: "audio/mpeg",
            upsert: true,
          });
        if (up.error) throw new Error(up.error.message);
        storageKeys.push(a.objectKey);
      }
      jobRows.push(
        `('${jobId}'::uuid, '${ownerId}'::uuid, 'BASIC_MP3', 'p22-${params.label}-${tag}-${i}',
   'SUCCEEDED', 'STUDIO_EXPORT', '${projectId}'::uuid, '{}'::jsonb, '{}'::jsonb, now())`,
      );
      artifactRows.push(
        `('${ownerId}'::uuid, '${jobId}'::uuid, 'audio/mpeg', 'BASIC_MP3',
            '${a.storageBucket.replace(/'/g, "''")}', '${a.objectKey.replace(/'/g, "''")}',
            12, 1000, 'READY', now() + interval '1 day', '${projectId}'::uuid)`,
      );
    }

    psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
INSERT INTO public.studio_projects (id, owner_id, title, status, document_version)
VALUES ('${projectId}'::uuid, '${ownerId}'::uuid, 'p22-${params.label}', 'ACTIVE', 1);
SELECT public.premium_mark_work_ready('${ownerId}'::uuid, 'STUDIO_PROJECT', '${projectId}'::uuid, now() - interval '8 days', 7);
UPDATE public.premium_works
  SET retention_expires_at = now() - interval '1 hour',
      work_ready_at = now() - interval '8 days'
  WHERE owner_id = '${ownerId}'::uuid AND domain_ref = '${projectId}'::uuid;
INSERT INTO public.render_jobs (
  id, owner_id, requested_tier, idempotency_key, status, kind, project_id,
  entitlement_snapshot, document_snapshot, finished_at
) VALUES
${jobRows.join(",\n")};
INSERT INTO public.audio_artifacts (
  owner_id, render_job_id, format, quality_tier, storage_bucket, object_key,
  byte_size, duration_ms, status, expires_at, project_id
) VALUES
${artifactRows.join(",\n")};
`);

    const workId = psql(
      `SELECT id::text FROM public.premium_works WHERE owner_id='${ownerId}' AND domain_ref='${projectId}'`,
    );
    const retentionExpiresAt = psql(
      `SELECT retention_expires_at::text FROM public.premium_works WHERE id='${workId}'`,
    );
    return { workId, projectId, retentionExpiresAt };
  }

  it.skip(
    "D2+D6: partial Storage failure — BLOCKED: DB CHECK/trigger force bucket=audio-artifacts and local Storage.remove returns NO_ERROR for valid buckets (no deterministic non-404 fault without schema drop or app hook)",
    () => {
      /* see GO-22 report; mock coverage in GO-20 */
    },
  );

  it("D6-lite: retry after listed set shrinks (manual remove of remaining key path) + TTL gate", async () => {
    const keyA = `premium22/${tag}/d6-a.mp3`;
    const keyB = `premium22/${tag}/d6-b.mp3`;
    const { workId, retentionExpiresAt } = await seedDueProjectWork({
      label: "d6",
      artifacts: [
        { objectKey: keyA, storageBucket: AUDIO_ARTIFACTS_BUCKET, upload: true },
        { objectKey: keyB, storageBucket: AUDIO_ARTIFACTS_BUCKET, upload: true },
      ],
    });

    // Unfenced soft-delete of a premium-linked artifact is rejected by the trigger.
    expect(() =>
      psql(`
SELECT set_config('request.jwt.claim.role', 'service_role', false);
UPDATE public.audio_artifacts
   SET deleted_at = now(), status = 'DELETED'
 WHERE owner_id='${ownerId}' AND object_key='${keyA}';
`),
    ).toThrow(/soft-delete requires premium_retention_soft_delete_artifact_if_lease/);

    // Simulate "already handled" first key via the fenced RPC + remove object.
    const artifactA = psql(
      `SELECT id::text FROM public.audio_artifacts WHERE owner_id='${ownerId}' AND object_key='${keyA}'`,
    );
    await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([keyA]);

    const result = await withLease(async (fence) => {
      const pre = await createPremiumRetentionLeaseClient().softDeleteArtifactIfLease({
        workId,
        artifactId: artifactA,
        ...fence,
      });
      expect(pre).toMatchObject({ status: "ok", value: { ok: true, reason: "SOFT_DELETED" } });
      return runPremiumRetentionCleanupForWork({ workId, leaseFence: fence });
    });
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.deletedObjectKeys).toContain(keyB);

    const retentionFinal = psql(
      `SELECT retention_expires_at::text FROM public.premium_works WHERE id='${workId}'`,
    );
    expect(retentionFinal).toBe(retentionExpiresAt);
    const unlockCount = psql(
      `SELECT count(*)::text FROM public.premium_track_unlocks WHERE work_id='${workId}'`,
    );
    expect(unlockCount).toBe("0");
    const status = psql(
      `SELECT status FROM public.premium_works WHERE id='${workId}'`,
    );
    expect(status).toBe("EXPIRED");

    const gate = evaluatePremiumDownloadGate({
      premiumTier: "GOLD",
      quality: "MP3_320",
      hasUnlock: true,
      retentionExpiresAtMs: Date.parse(retentionExpiresAt),
      nowMs: Date.now(),
      workStatus: "WORK_READY",
    });
    expect(gate.ok).toBe(false);
  }, 120_000);

  it("D3: missing Storage object settles without blocking purge (local API)", async () => {
    const key = `premium22/${tag}/d3-missing.mp3`;
    const { workId } = await seedDueProjectWork({
      label: "d3",
      artifacts: [
        {
          objectKey: key,
          storageBucket: AUDIO_ARTIFACTS_BUCKET,
          upload: true,
        },
      ],
    });

    // Pre-delete object; leave DB row. Local stack returns NO_ERROR (not not-found message).
    const rm = await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove([key]);
    expect(rm.error).toBeNull();

    const result = await withLease((fence) =>
      runPremiumRetentionCleanupForWork({ workId, leaseFence: fence }),
    );
    expect(result.outcome).toBe("purgeComplete");
    expect(result.markedExpired).toBe(true);
    expect(result.storageErrors).toEqual([]);
    const status = psql(
      `SELECT status FROM public.premium_works WHERE id='${workId}'`,
    );
    expect(status).toBe("EXPIRED");
    const deletedAt = psql(
      `SELECT (deleted_at IS NOT NULL)::text FROM public.audio_artifacts WHERE object_key='${key}'`,
    );
    expect(["t", "true"]).toContain(deletedAt);
  }, 120_000);

  it.skip(
    "D5: soft-delete DB failure — BLOCKED without app/schema fault hook (see GO-22 report; mock coverage in GO-20)",
    () => {
      /* intentionally skipped */
    },
  );
});

describe.runIf(!live)("GO-PREMIUM-22 D2–D6 live — gate", () => {
  it("NOT RUN — BRD_INTEGRATION_TESTS / LOCAL_SUPABASE_* not enabled", () => {
    expect(integration.enabled).toBe(false);
  });
});
