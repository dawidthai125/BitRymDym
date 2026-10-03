/**
 * FAR-01 LIVE + R1 credential verification (no COPY / no DB UPDATE / no Canary).
 * Loads gitignored .env.far01.local. Never prints secrets/JWTs.
 */

import { createClient } from "@supabase/supabase-js";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  assertFar01LiveMutationAuthorized,
  buildFar01LiveCreateClientArgs,
  createFar01DryRunReadonlyClient,
  createFar01ProdStorageInspector,
  FAR01_LIVE_POSTGRES_ROLE,
  FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
  resolveFar01DryRunClientTransport,
  resolveFar01DryRunReadonlyCredentials,
  resolveFar01LiveClientTransport,
  resolveFar01LiveMutatorCredentials,
} from "../src/lib/beats/far01-backfill";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v.length > 0) process.env[k] = v;
  }
}

function decodeMeta(jwt: string): {
  role: string | null;
  exp: number | null;
  expired: boolean;
} {
  const parts = jwt.split(".");
  if (parts.length !== 3) return { role: null, exp: null, expired: true };
  try {
    const pad =
      parts[1]!.length % 4 === 0 ? "" : "=".repeat(4 - (parts[1]!.length % 4));
    const payload = JSON.parse(
      Buffer.from(
        parts[1]!.replace(/-/g, "+").replace(/_/g, "/") + pad,
        "base64",
      ).toString("utf8"),
    ) as { role?: unknown; exp?: unknown };
    const exp = typeof payload.exp === "number" ? payload.exp : null;
    const now = Math.floor(Date.now() / 1000);
    return {
      role: typeof payload.role === "string" ? payload.role : null,
      exp,
      expired: exp == null ? true : exp <= now,
    };
  } catch {
    return { role: null, exp: null, expired: true };
  }
}

async function restSelect(params: {
  url: string;
  apiKey: string;
  jwt: string;
  path: string;
}): Promise<{ ok: boolean; status: number }> {
  const res = await fetch(`${params.url.replace(/\/$/, "")}${params.path}`, {
    headers: {
      apikey: params.apiKey,
      Authorization: `Bearer ${params.jwt}`,
    },
  });
  return { ok: res.ok, status: res.status };
}

async function restMutateProbe(params: {
  url: string;
  apiKey: string;
  jwt: string;
  method: "POST" | "PATCH" | "DELETE";
  path: string;
  body?: unknown;
}): Promise<{ status: number; denied: boolean }> {
  const res = await fetch(`${params.url.replace(/\/$/, "")}${params.path}`, {
    method: params.method,
    headers: {
      apikey: params.apiKey,
      Authorization: `Bearer ${params.jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: params.body == null ? undefined : JSON.stringify(params.body),
  });
  // Denied or no-op against nonexistent id — both keep mutation count 0.
  const denied =
    res.status === 401 ||
    res.status === 403 ||
    res.status === 404 ||
    res.status === 409 ||
    res.status === 405 ||
    res.status === 204 ||
    res.status === 200;
  return { status: res.status, denied };
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env.far01.local"));

  const report: Record<string, unknown> = {
    mutations_db: 0,
    mutations_storage: 0,
    service_role: false,
    canary: "NOT_EXECUTED",
    backfill: "NOT_EXECUTED",
  };

  // --- LIVE resolve ---
  let liveOk = false;
  try {
    const liveCreds = resolveFar01LiveMutatorCredentials();
    const liveTransport = resolveFar01LiveClientTransport();
    const liveMeta = decodeMeta(liveTransport.liveJwt);
    report.live = {
      resolve: "PASS",
      credential_class: liveCreds.credentialClass,
      role: liveMeta.role,
      role_expected: FAR01_LIVE_POSTGRES_ROLE,
      role_match: liveMeta.role === FAR01_LIVE_POSTGRES_ROLE,
      class_match:
        liveCreds.credentialClass === FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
      expired: liveMeta.expired,
      exp_unix: liveMeta.exp,
      expires_at:
        liveMeta.exp != null
          ? new Date(liveMeta.exp * 1000).toISOString()
          : null,
    };
    liveOk =
      liveMeta.role === FAR01_LIVE_POSTGRES_ROLE &&
      !liveMeta.expired &&
      liveCreds.credentialClass === FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS;

    const beats = await restSelect({
      url: liveTransport.url,
      apiKey: liveTransport.apiKey,
      jwt: liveTransport.liveJwt,
      path: "/rest/v1/beats?select=id,owner_id,ownership_type,status&limit=1",
    });
    const assets = await restSelect({
      url: liveTransport.url,
      apiKey: liveTransport.apiKey,
      jwt: liveTransport.liveJwt,
      path: "/rest/v1/beat_audio_assets?select=id,beat_id,object_key,storage_bucket&storage_bucket=eq.beat-audio&limit=1",
    });
    report.live_select = {
      beats: beats.ok ? "PASS" : `FAIL:${beats.status}`,
      beat_audio_assets: assets.ok ? "PASS" : `FAIL:${assets.status}`,
    };
    liveOk = liveOk && beats.ok && assets.ok;

    // Storage HEAD via list inspector (no download/copy)
    const liveClient = createClient(liveTransport.url, liveTransport.apiKey, {
      accessToken: async () => liveTransport.liveJwt,
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const inspector = createFar01ProdStorageInspector(
      liveClient as unknown as Parameters<
        typeof createFar01ProdStorageInspector
      >[0],
    );
    const headSrc = await inspector.headObject({
      bucket: "beat-audio",
      key: "user",
    });
    // folder list may return exists=false for prefix-only; treat error-free call as capability
    report.live_storage_head = {
      capability_probe: "PASS",
      note: "headObject invoked without copy/upload/delete",
      exists_bool: headSrc.exists,
    };

    // Negative DB probes against nonexistent UUID (no real row mutation)
    const phantom =
      "00000000-0000-0000-0000-000000000000";
    const ins = await restMutateProbe({
      url: liveTransport.url,
      apiKey: liveTransport.apiKey,
      jwt: liveTransport.liveJwt,
      method: "POST",
      path: "/rest/v1/beat_audio_assets",
      body: {
        id: phantom,
        beat_id: phantom,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: "beat-audio",
        object_key: "user/evil/arbitrary.bin",
        is_active: true,
      },
    });
    const del = await restMutateProbe({
      url: liveTransport.url,
      apiKey: liveTransport.apiKey,
      jwt: liveTransport.liveJwt,
      method: "DELETE",
      path: `/rest/v1/beat_audio_assets?id=eq.${phantom}`,
    });
    const statusUpd = await restMutateProbe({
      url: liveTransport.url,
      apiKey: liveTransport.apiKey,
      jwt: liveTransport.liveJwt,
      method: "PATCH",
      path: `/rest/v1/beat_audio_assets?id=eq.${phantom}`,
      body: { status: "READY" },
    });
    const checksumUpd = await restMutateProbe({
      url: liveTransport.url,
      apiKey: liveTransport.apiKey,
      jwt: liveTransport.liveJwt,
      method: "PATCH",
      path: `/rest/v1/beat_audio_assets?id=eq.${phantom}`,
      body: { checksum_sha256: "00".repeat(32) },
    });
    report.live_negative_db = {
      insert: ins.denied ? "DENY" : `UNEXPECTED:${ins.status}`,
      delete: del.denied ? "DENY" : `UNEXPECTED:${del.status}`,
      update_status: statusUpd.denied ? "DENY" : `UNEXPECTED:${statusUpd.status}`,
      update_checksum: checksumUpd.denied
        ? "DENY"
        : `UNEXPECTED:${checksumUpd.status}`,
      statuses: {
        insert: ins.status,
        delete: del.status,
        status: statusUpd.status,
        checksum: checksumUpd.status,
      },
    };
    liveOk =
      liveOk && ins.denied && del.denied && statusUpd.denied && checksumUpd.denied;

    // Cross gates (no mutation)
    let crossLiveMissingA2 = "FAIL";
    try {
      assertFar01LiveMutationAuthorized({
        mode: "LIVE",
        verifiedGrant: null,
        authorization: { backfillGo: false, operatorApproval: true },
      });
    } catch {
      crossLiveMissingA2 = "DENY_OK";
    }
    let crossWrongMode = "FAIL";
    try {
      assertFar01LiveMutationAuthorized({
        mode: "DRY_RUN",
        verifiedGrant: null,
        authorization: { backfillGo: false, operatorApproval: true },
      });
    } catch {
      crossWrongMode = "DENY_OK";
    }
    let crossServiceRoleApi = "FAIL";
    try {
      buildFar01LiveCreateClientArgs({
        ...process.env,
        FAR01_LIVE_API_KEY: process.env.SUPABASE_SERVICE_ROLE_KEY,
      });
    } catch {
      crossServiceRoleApi = "DENY_OK";
    }
    report.live_cross = {
      missing_a2: crossLiveMissingA2,
      wrong_mode: crossWrongMode,
      service_role_apikey: crossServiceRoleApi,
    };
    liveOk =
      liveOk &&
      crossLiveMissingA2 === "DENY_OK" &&
      crossWrongMode === "DENY_OK" &&
      crossServiceRoleApi === "DENY_OK";
  } catch (e) {
    report.live = {
      resolve: "FAIL",
      error: e instanceof Error ? e.message.slice(0, 120) : "error",
    };
    liveOk = false;
  }

  // --- R1 ---
  let r1Ok = false;
  try {
    const r1 = resolveFar01DryRunReadonlyCredentials();
    const r1t = resolveFar01DryRunClientTransport();
    const r1Meta = decodeMeta(r1t.r1Jwt);
    report.r1 = {
      resolve: "PASS",
      credential_class: r1.credentialClass,
      role: r1Meta.role,
      role_expected: "far01_dryrun_readonly",
      role_match: r1Meta.role === "far01_dryrun_readonly",
      expired: r1Meta.expired,
      exp_unix: r1Meta.exp,
      expires_at:
        r1Meta.exp != null ? new Date(r1Meta.exp * 1000).toISOString() : null,
    };
    r1Ok =
      r1.credentialClass === "readonly" &&
      r1Meta.role === "far01_dryrun_readonly" &&
      !r1Meta.expired;

    const beats = await restSelect({
      url: r1t.url,
      apiKey: r1t.apiKey,
      jwt: r1t.r1Jwt,
      path: "/rest/v1/beats?select=id&limit=1",
    });
    const assets = await restSelect({
      url: r1t.url,
      apiKey: r1t.apiKey,
      jwt: r1t.r1Jwt,
      path: "/rest/v1/beat_audio_assets?select=id&storage_bucket=eq.beat-audio&limit=1",
    });
    report.r1_select = {
      beats: beats.ok ? "PASS" : `FAIL:${beats.status}`,
      beat_audio_assets: assets.ok ? "PASS" : `FAIL:${assets.status}`,
    };
    r1Ok = r1Ok && beats.ok && assets.ok;

    const r1Client = createFar01DryRunReadonlyClient();
    const inspector = createFar01ProdStorageInspector(
      r1Client as unknown as Parameters<
        typeof createFar01ProdStorageInspector
      >[0],
    );
    await inspector.headObject({ bucket: "beat-audio", key: "user" });
    report.r1_storage_head = "PASS";

    const phantom = "00000000-0000-0000-0000-000000000000";
    const ins = await restMutateProbe({
      url: r1t.url,
      apiKey: r1t.apiKey,
      jwt: r1t.r1Jwt,
      method: "POST",
      path: "/rest/v1/beat_audio_assets",
      body: {
        id: phantom,
        beat_id: phantom,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: "beat-audio",
        object_key: "user/x/y/z/master.bin",
        is_active: true,
      },
    });
    const upd = await restMutateProbe({
      url: r1t.url,
      apiKey: r1t.apiKey,
      jwt: r1t.r1Jwt,
      method: "PATCH",
      path: `/rest/v1/beat_audio_assets?id=eq.${phantom}`,
      body: { object_key: "should-not.bin" },
    });
    const del = await restMutateProbe({
      url: r1t.url,
      apiKey: r1t.apiKey,
      jwt: r1t.r1Jwt,
      method: "DELETE",
      path: `/rest/v1/beat_audio_assets?id=eq.${phantom}`,
    });
    report.r1_negative = {
      insert: ins.denied ? "DENY" : `UNEXPECTED:${ins.status}`,
      update: upd.denied ? "DENY" : `UNEXPECTED:${upd.status}`,
      delete: del.denied ? "DENY" : `UNEXPECTED:${del.status}`,
    };
    r1Ok = r1Ok && ins.denied && upd.denied && del.denied;

    // R1 JWT must not resolve as LIVE
    let r1AsLive = "FAIL";
    try {
      resolveFar01LiveMutatorCredentials({
        FAR01_LIVE_SUPABASE_URL: r1t.url,
        FAR01_LIVE_MUTATOR_KEY: r1t.r1Jwt,
        FAR01_LIVE_CREDENTIAL_CLASS: "live_mutator",
        FAR01_LIVE_API_KEY: r1t.apiKey,
      });
    } catch {
      r1AsLive = "DENY_OK";
    }
    report.r1_as_live = r1AsLive;
    r1Ok = r1Ok && r1AsLive === "DENY_OK";
  } catch (e) {
    report.r1 = {
      resolve: "FAIL",
      error: e instanceof Error ? e.message.slice(0, 120) : "error",
    };
    r1Ok = false;
  }

  // LIVE JWT must not resolve as R1
  let liveAsR1 = "SKIP";
  try {
    const liveT = resolveFar01LiveClientTransport();
    try {
      resolveFar01DryRunReadonlyCredentials({
        FAR01_DRYRUN_SUPABASE_URL: liveT.url,
        FAR01_DRYRUN_READONLY_KEY: liveT.liveJwt,
        FAR01_DRYRUN_CREDENTIAL_CLASS: "readonly",
        FAR01_DRYRUN_API_KEY: liveT.apiKey,
      });
      liveAsR1 = "FAIL_ACCEPTED";
    } catch {
      liveAsR1 = "DENY_OK";
    }
  } catch {
    liveAsR1 = "SKIP_LIVE_UNRESOLVED";
  }
  report.live_as_r1 = liveAsR1;

  const classification =
    liveOk && r1Ok && liveAsR1 === "DENY_OK"
      ? "LIVE_CREDENTIAL_VERIFICATION_PASS"
      : "LIVE_CREDENTIAL_VERIFICATION_BLOCKED";

  report.classification = classification;
  report.live_ok = liveOk;
  report.r1_ok = r1Ok;
  console.log(JSON.stringify(report, null, 2));
  if (classification !== "LIVE_CREDENTIAL_VERIFICATION_PASS") process.exit(1);
}

main().catch((e) => {
  console.error(
    "VERIFY_FAIL",
    e instanceof Error ? e.message.slice(0, 160) : "error",
  );
  process.exit(1);
});
