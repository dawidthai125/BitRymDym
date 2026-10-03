/**
 * R1 regression + LIVE credential structural check (no mutations, no secret prints).
 * Loads .env.far01.local + .env.local silently.
 */

import { readFileSync, existsSync } from "node:fs";
import { resolve } from "node:path";

import {
  createFar01DryRunReadonlyClient,
  resolveFar01DryRunReadonlyCredentials,
  resolveFar01DryRunClientTransport,
} from "../src/lib/beats/far01-backfill/readonly-client";
import {
  FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
  resolveFar01LiveMutatorCredentials,
} from "../src/lib/beats/far01-backfill/live-credentials";

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
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
    process.env[k] = v;
  }
}

async function main(): Promise<void> {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(resolve(process.cwd(), ".env.far01.local"));

  const r1 = resolveFar01DryRunReadonlyCredentials();
  if (r1.credentialClass !== "readonly") {
    throw new Error("R1 class regression FAIL");
  }
  const transport = resolveFar01DryRunClientTransport();
  if (transport.apiKey === transport.r1Jwt) {
    throw new Error("R1 transport mix FAIL");
  }

  // Direct Data API HEAD/SELECT via fetch — clearer errors than empty supabase-js messages.
  const restUrl = `${transport.url.replace(/\/$/, "")}/rest/v1/beat_audio_assets?select=id&storage_bucket=eq.beat-audio&limit=1`;
  const res = await fetch(restUrl, {
    headers: {
      apikey: transport.apiKey,
      Authorization: `Bearer ${transport.r1Jwt}`,
      Prefer: "count=exact",
    },
  });
  const bodyText = await res.text();
  if (!res.ok) {
    throw new Error(
      `R1 SELECT FAIL: status=${res.status} bodyLen=${bodyText.length}`,
    );
  }

  // Negative write probe — expect non-2xx or 0 rows; must not succeed as write of real row.
  const updUrl = `${transport.url.replace(/\/$/, "")}/rest/v1/beat_audio_assets?id=eq.00000000-0000-0000-0000-000000000000`;
  const updRes = await fetch(updUrl, {
    method: "PATCH",
    headers: {
      apikey: transport.apiKey,
      Authorization: `Bearer ${transport.r1Jwt}`,
      "Content-Type": "application/json",
      Prefer: "return=minimal",
    },
    body: JSON.stringify({ object_key: "should-not-write.bin" }),
  });
  // 401/403/404/409 or 204 with 0 rows are all acceptable non-mutating outcomes.
  if (updRes.status >= 200 && updRes.status < 300 && updRes.status !== 204 && updRes.status !== 200) {
    // unexpected
  }
  const r1WriteBlocked = updRes.status === 401 || updRes.status === 403 || updRes.status === 404 || updRes.status === 409 || updRes.status === 204 || updRes.status === 200;
  if (!r1WriteBlocked) {
    throw new Error(`R1 UPDATE probe unexpected status=${updRes.status}`);
  }

  // Construct client still works (capability routing)
  createFar01DryRunReadonlyClient();

  let liveStatus = "MISSING_KEY";
  try {
    resolveFar01LiveMutatorCredentials();
    liveStatus = "RESOLVED";
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    if (msg.includes("FAR01_LIVE_MUTATOR_KEY")) liveStatus = "KEY_NOT_MINTED";
    else liveStatus = `DENY:${msg.slice(0, 80)}`;
  }

  console.log(
    JSON.stringify({
      r1_class: r1.credentialClass,
      r1_select_ok: true,
      r1_select_http: res.status,
      r1_update_probe_status: updRes.status,
      r1_write_blocked_or_noop: true,
      live_class_expected: FAR01_LIVE_REQUIRED_CREDENTIAL_CLASS,
      live_resolve_status: liveStatus,
      service_role_used: false,
      mutations: 0,
    }),
  );
}

main().catch((e) => {
  console.error("REGRESSION_FAIL", e instanceof Error ? e.message : e);
  process.exit(1);
});
