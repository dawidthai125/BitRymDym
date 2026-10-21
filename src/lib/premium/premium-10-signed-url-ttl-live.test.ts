/**
 * PREMIUM-10 — Real HTTP proof that local Storage signed URLs expire after TTL.
 *
 * Gate: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* (loopback only).
 * Does NOT change app default TTL (AUDIO_ARTIFACT_DOWNLOAD_TTL_SECONDS=300).
 * Signs via admin createSignedUrl(expiresIn) with short TTL for this test only.
 */
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";

import { AUDIO_ARTIFACTS_BUCKET } from "@/config/audio-render";
import {
  applyIntegrationEnv,
  resolveIntegrationEnv,
} from "@/test/integration-env";

const TTL_SECONDS = 3;
const WAIT_MARGIN_MS = 2500;
const integration = resolveIntegrationEnv({});
const live = integration.enabled;

if (live) {
  applyIntegrationEnv(integration);
}

function assertLoopbackUrl(raw: string, label: string): URL {
  const u = new URL(raw);
  const host = u.hostname.toLowerCase();
  if (!["127.0.0.1", "localhost", "::1"].includes(host)) {
    throw new Error(`${label} must be loopback, got ${host}`);
  }
  if (
    host.endsWith(".supabase.co") ||
    host.endsWith(".supabase.in") ||
    raw.includes("rzzxrgcdogkybkiidqgw")
  ) {
    throw new Error(`${label} looks remote/production`);
  }
  return u;
}

function redactSignedUrl(raw: string): string {
  try {
    const u = new URL(raw);
    return `${u.protocol}//${u.host}${u.pathname}?…(token redacted)`;
  } catch {
    return "(unparseable url redacted)";
  }
}

describe.runIf(live)("PREMIUM-10 signed URL TTL — local Storage HTTP", () => {
  const testId = randomUUID().slice(0, 8);
  // audio-artifacts bucket rejects non-audio MIME; use tiny .mp3-shaped payload
  const objectKey = `premium10-ttl/${testId}/probe.mp3`;
  const marker = `PREMIUM10-TTL-FIXTURE-${testId}`;
  const payloadBytes = Buffer.concat([
    Buffer.from([0xff, 0xfb, 0x90, 0x00]),
    Buffer.from(marker, "utf8"),
    Buffer.from([0x00, 0x00, 0x00, 0x00]),
  ]);

  let sentinelKey = "";
  let cleaned = false;

  afterAll(async () => {
    if (!live || cleaned) return;
    const admin = createClient(integration.url, integration.serviceKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const keys = [objectKey, sentinelKey].filter(Boolean);
    if (keys.length) {
      await admin.storage.from(AUDIO_ARTIFACTS_BUCKET).remove(keys);
    }
    cleaned = true;
  });

  it(
    "signed URL succeeds before TTL and is rejected after TTL (same URL)",
    async () => {
      assertLoopbackUrl(integration.url, "LOCAL_SUPABASE_URL");

      const admin = createClient(integration.url, integration.serviceKey, {
        auth: { persistSession: false, autoRefreshToken: false },
      });

      // Sentinel stays for "other object untouched" proof
      sentinelKey = `premium10-ttl/${testId}/sentinel-keep.mp3`;
      const sentinelPayload = Buffer.concat([
        Buffer.from([0xff, 0xfb, 0x90, 0x00]),
        Buffer.from(`SENTINEL-${testId}`, "utf8"),
      ]);
      const upSentinel = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .upload(sentinelKey, sentinelPayload, {
          contentType: "audio/mpeg",
          upsert: false,
        });
      expect(upSentinel.error).toBeNull();

      const up = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .upload(objectKey, payloadBytes, {
          contentType: "audio/mpeg",
          upsert: false,
        });
      expect(up.error).toBeNull();

      const signed = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .createSignedUrl(objectKey, TTL_SECONDS, { download: true });
      expect(signed.error).toBeNull();
      const signedUrl = signed.data?.signedUrl;
      expect(typeof signedUrl).toBe("string");
      assertLoopbackUrl(signedUrl!, "signedUrl");

      // --- BEFORE TTL ---
      const t0 = Date.now();
      const before = await fetch(signedUrl!, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
      });
      const beforeMs = Date.now() - t0;
      expect(
        before.status,
        `before-TTL status; url=${redactSignedUrl(signedUrl!)}`,
      ).toBe(200);
      const beforeBody = Buffer.from(await before.arrayBuffer());
      expect(beforeBody.equals(payloadBytes)).toBe(true);

      // Wait past TTL + clock/processing margin
      const waitMs = TTL_SECONDS * 1000 + WAIT_MARGIN_MS;
      await new Promise((r) => setTimeout(r, waitMs));

      // --- AFTER TTL ---
      const after = await fetch(signedUrl!, {
        method: "GET",
        cache: "no-store",
        redirect: "manual",
      });
      const afterBody = Buffer.from(await after.arrayBuffer());
      const afterText = afterBody.toString("utf8").slice(0, 200);

      // Must not return the fixture payload as a successful download
      expect(after.status).not.toBe(200);
      expect(afterBody.equals(payloadBytes)).toBe(false);
      expect(afterText).not.toContain(marker);

      // Local Storage typically returns 400 with expired / invalid JWT style body
      expect([400, 401, 403, 410]).toContain(after.status);

      // Sentinel still present (we did not delete foreign/other objects)
      const sentinelDl = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .download(sentinelKey);
      expect(sentinelDl.error).toBeNull();
      const sentinelGot = Buffer.from(await sentinelDl.data!.arrayBuffer());
      expect(sentinelGot.equals(sentinelPayload)).toBe(true);

      // Cleanup probe only; leave sentinel for afterAll batch remove of our keys
      const rm = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .remove([objectKey]);
      expect(rm.error).toBeNull();
      const gone = await admin.storage
        .from(AUDIO_ARTIFACTS_BUCKET)
        .download(objectKey);
      expect(gone.error).not.toBeNull();

      // Evidence (no token)
      // eslint-disable-next-line no-console
      console.log(
        JSON.stringify({
          gate: "PREMIUM-10",
          bucket: AUDIO_ARTIFACTS_BUCKET,
          objectKey,
          ttlSeconds: TTL_SECONDS,
          waitMs,
          beforeStatus: before.status,
          beforeMs,
          afterStatus: after.status,
          afterBodyPrefix: afterText.slice(0, 80).replace(/token|sig=/gi, "…"),
          signedHost: new URL(signedUrl!).host,
        }),
      );
    },
    30_000,
  );
});
