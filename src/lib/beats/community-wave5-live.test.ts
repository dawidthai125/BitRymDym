/**
 * Live E2E — Community Wave 5: submit cooldown + full community loop closeout.
 */
import { randomUUID } from "crypto";
import { readFileSync } from "fs";
import { resolve } from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import { applyIntegrationEnv, resolveIntegrationEnv } from "@/test/integration-env";
import {
  createIntegrationFixtures,
  type IntegrationFixtures,
} from "@/test/integration-fixtures";

import type { AuthContext } from "@/lib/auth/types";
import {
  analyzeUserBeatPendingUploadFor,
  createUserBeatSignedUploadSessionFor,
  finalizeUserBeatAfterUploadFor,
} from "@/lib/beats/audio-transport";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";

const fixturePath = resolve(
  process.cwd(),
  "../bitrymdym-fixtures/bpm-120-steady.wav",
);
const integration = resolveIntegrationEnv({ fixturePath });
const live = integration.enabled;
const url = integration.enabled ? integration.url : undefined;
const serviceKey = integration.enabled ? integration.serviceKey : undefined;
const anonKey = integration.enabled ? integration.anonKey : undefined;

if (integration.enabled) applyIntegrationEnv(integration);

async function makeUser(
  admin: SupabaseClient,
  fixtures: IntegrationFixtures,
  role: "USER" | "MODERATOR",
  label: string,
) {
  const email = `wave5-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave5-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  // Tracked before anything below can throw, so a failed sign-in never leaks the user.
  const userId = fixtures.trackUser(data.user!.id);
  await admin.from("profiles").upsert({
    id: userId,
    role,
    account_level: "BEGINNER_RAPPER",
    display_name: label,
  });
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  expect(
    (await client.auth.signInWithPassword({ email, password })).error,
  ).toBeNull();
  return { userId, email, client };
}

function userContext(userId: string, email: string): AuthContext {
  return {
    userId,
    email,
    profile: {
      id: userId,
      displayName: "Wave5",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: ["beats.create"],
  };
}

describe.runIf(live)("Community Wave 5 live closeout E2E", () => {
  it(
    "cooldown DENY + reject/rework resubmit + approve + publish public; archive cleanup",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      const fixtures = createIntegrationFixtures(admin);
      const beatId = fixtures.trackBeat(randomUUID());
      const platformBeatId = fixtures.trackBeat(randomUUID());
      try {
      const owner = await makeUser(admin, fixtures, "USER", "owner");
      const mod = await makeUser(admin, fixtures, "MODERATOR", "mod");
      const other = await makeUser(admin, fixtures, "USER", "other");

      // Own PLATFORM catalog fixture (service role passes prevent_beat_privilege_escalation).
      expect(
        (
          await admin.from("beats").insert({
            id: platformBeatId,
            ownership_type: "PLATFORM",
            owner_id: null,
            title: "Wave5 Platform Fixture",
            bpm: 120,
            duration_seconds: 1,
            status: "DRAFT",
            tags: [],
          })
        ).error,
      ).toBeNull();
      expect(
        (
          await admin
            .from("beats")
            .update({ status: "PUBLISHED" })
            .eq("id", platformBeatId)
        ).error,
      ).toBeNull();

      expect(
        (
          await admin.from("beats").insert({
            id: beatId,
            ownership_type: "USER",
            owner_id: owner.userId,
            title: "Wave5 Closeout",
            bpm: 1,
            duration_seconds: 1,
            status: "DRAFT",
            tags: [],
          })
        ).error,
      ).toBeNull();

      const ctx = userContext(owner.userId, owner.email);
      const session = await createUserBeatSignedUploadSessionFor(ctx, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
        originalFilename: "bpm-120-steady.wav",
      });
      expect(
        (
          await fetch(session.signedUrl, {
            method: "PUT",
            headers: { "Content-Type": "audio/wav" },
            body: bytes,
          })
        ).ok,
      ).toBe(true);
      await analyzeUserBeatPendingUploadFor(ctx, {
        beatId,
        assetId: session.assetId,
      });
      await finalizeUserBeatAfterUploadFor(ctx, {
        beatId,
        assetId: session.assetId,
        title: "Wave5 Closeout",
        bpm: 120,
        bpmManualOverride: false,
      });

      // foreign submit DENY (RLS: 0 rows / status unchanged)
      await other.client
        .from("beats")
        .update({ status: "PENDING_REVIEW" })
        .eq("id", beatId);
      const { data: stillDraft } = await admin
        .from("beats")
        .select("status")
        .eq("id", beatId)
        .single();
      expect(stillDraft?.status).toBe("DRAFT");

      // first submit PASS
      expect(
        (
          await owner.client
            .from("beats")
            .update({ status: "PENDING_REVIEW", rejection_reason: null })
            .eq("id", beatId)
            .eq("status", "DRAFT")
        ).error,
      ).toBeNull();

      const { data: afterSubmit } = await admin
        .from("beats")
        .select("status, last_submitted_at")
        .eq("id", beatId)
        .single();
      expect(afterSubmit?.status).toBe("PENDING_REVIEW");
      expect(afterSubmit?.last_submitted_at).toBeTruthy();

      // force back to DRAFT with last_submitted_at still set (simulate cooldown window)
      await admin
        .from("beats")
        .update({
          status: "DRAFT",
          last_submitted_at: new Date().toISOString(),
        })
        .eq("id", beatId);

      // rapid resubmit DENY (cooldown)
      const { error: cooldownErr } = await owner.client
        .from("beats")
        .update({ status: "PENDING_REVIEW", rejection_reason: null })
        .eq("id", beatId)
        .eq("status", "DRAFT");
      expect(cooldownErr).not.toBeNull();
      expect(cooldownErr!.message).toMatch(/cooldown/i);

      // Clear cooldown cursor (service), then PENDING for reject path
      expect(
        (
          await admin
            .from("beats")
            .update({ last_submitted_at: null })
            .eq("id", beatId)
            .eq("status", "DRAFT")
        ).error,
      ).toBeNull();
      expect(
        (
          await admin
            .from("beats")
            .update({ status: "PENDING_REVIEW", rejection_reason: null })
            .eq("id", beatId)
        ).error,
      ).toBeNull();

      expect(
        (
          await mod.client
            .from("beats")
            .update({
              status: "REJECTED",
              rejection_reason: "Popraw master",
            })
            .eq("id", beatId)
        ).error,
      ).toBeNull();

      const { data: rejected } = await owner.client
        .from("beats")
        .select("status, rejection_reason")
        .eq("id", beatId)
        .single();
      expect(rejected?.status).toBe("REJECTED");
      expect(rejected?.rejection_reason).toBe("Popraw master");

      expect(
        (
          await owner.client
            .from("beats")
            .update({ status: "DRAFT", rejection_reason: null })
            .eq("id", beatId)
        ).error,
      ).toBeNull();

      const { data: rework } = await admin
        .from("beats")
        .select("last_submitted_at, status")
        .eq("id", beatId)
        .single();
      expect(rework?.status).toBe("DRAFT");
      expect(rework?.last_submitted_at).toBeNull();

      // legitimate resubmit PASS
      expect(
        (
          await owner.client
            .from("beats")
            .update({ status: "PENDING_REVIEW", rejection_reason: null })
            .eq("id", beatId)
        ).error,
      ).toBeNull();

      expect(
        (
          await mod.client
            .from("beats")
            .update({ status: "APPROVED", rejection_reason: null })
            .eq("id", beatId)
        ).error,
      ).toBeNull();

      const anon = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      expect(
        (
          await anon.from("beats").select("id").eq("id", beatId).maybeSingle()
        ).data,
      ).toBeNull();

      expect(
        (
          await mod.client
            .from("beats")
            .update({ status: "PUBLISHED", rejection_reason: null })
            .eq("id", beatId)
        ).error,
      ).toBeNull();

      const { data: pub } = await anon
        .from("beats")
        .select("id, title, status, rejection_reason")
        .eq("id", beatId)
        .maybeSingle();
      expect(pub?.status).toBe("PUBLISHED");
      expect(pub?.title).toBe("Wave5 Closeout");
      expect(pub?.rejection_reason ?? null).toBeNull();

      const { data: asset } = await admin
        .from("beat_audio_assets")
        .select("object_key")
        .eq("beat_id", beatId)
        .eq("is_active", true)
        .eq("status", "READY")
        .maybeSingle();
      const signed = await admin.storage
        .from(BEAT_AUDIO_BUCKET)
        .createSignedUrl(asset!.object_key as string, 60);
      expect(signed.error).toBeNull();
      expect(signed.data?.signedUrl).toMatch(/^https?:\/\//);

      // PLATFORM published still present (own fixture, visible to anon)
      const { data: platformPubs } = await anon
        .from("beats")
        .select("id")
        .eq("status", "PUBLISHED")
        .eq("ownership_type", "PLATFORM");
      expect((platformPubs ?? []).length).toBeGreaterThanOrEqual(1);
      expect((platformPubs ?? []).map((row) => row.id)).toContain(
        platformBeatId,
      );
      } finally {
        // Only what this test created: archive first (published beats), then the
        // shared registry removes assets + objects, beats and users and throws
        // with the ids of anything left behind.
        await admin
          .from("beats")
          .update({ status: "ARCHIVED" })
          .in("id", [beatId, platformBeatId]);
        await fixtures.cleanup();
      }

      const { data: leftoverBeats } = await admin
        .from("beats")
        .select("id")
        .in("id", [beatId, platformBeatId]);
      expect(leftoverBeats ?? []).toEqual([]);
      const { data: leftoverAssets } = await admin
        .from("beat_audio_assets")
        .select("id")
        .eq("beat_id", beatId);
      expect(leftoverAssets ?? []).toEqual([]);
    },
    180_000,
  );
});
