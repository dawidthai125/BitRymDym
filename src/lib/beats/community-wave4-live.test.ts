/**
 * Live E2E — Community Wave 4 staff publish APPROVED → PUBLISHED.
 * Requires .env.local service role + bpm fixture (same Supabase as prod).
 */
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";

import type { AuthContext } from "@/lib/auth/types";
import {
  analyzeUserBeatPendingUploadFor,
  createUserBeatSignedUploadSessionFor,
  finalizeUserBeatAfterUploadFor,
} from "@/lib/beats/audio-transport";
import { BEAT_AUDIO_BUCKET } from "@/lib/beats/audio-validation";

function readEnvLocal(): Record<string, string> {
  const path = resolve(process.cwd(), ".env.local");
  if (!existsSync(path)) return {};
  const out: Record<string, string> = {};
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let val = m[2]!;
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    out[m[1]!] = val;
  }
  return out;
}

const env = { ...readEnvLocal(), ...process.env };
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const fixturePath = resolve(
  process.cwd(),
  "../bitrymdym-fixtures/bpm-120-steady.wav",
);
const live = Boolean(url && serviceKey && anonKey && existsSync(fixturePath));

if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
if (serviceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
if (anonKey) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;

async function makeUser(
  admin: SupabaseClient,
  role: "USER" | "MODERATOR" | "ADMIN",
  label: string,
) {
  const email = `wave4-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave4-${randomUUID()}`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
  });
  expect(error).toBeNull();
  const userId = data.user!.id;
  await admin.from("profiles").upsert({
    id: userId,
    role,
    account_level: "BEGINNER_RAPPER",
    display_name: label,
  });
  const client = createClient(url!, anonKey!, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const { error: signErr } = await client.auth.signInWithPassword({
    email,
    password,
  });
  expect(signErr).toBeNull();
  return { userId, email, password, client };
}

function userContext(userId: string, email: string): AuthContext {
  return {
    userId,
    email,
    profile: {
      id: userId,
      displayName: "Wave4",
      userNumber: null,
      role: "USER",
      accountLevel: "BEGINNER_RAPPER",
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    },
    permissions: ["beats.create"],
  };
}

describe.runIf(live)("Community Wave 4 live publish E2E", () => {
  it(
    "APPROVED invisible → MOD publish → PUBLISHED public; USER deny; PLATFORM ok",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);

      const owner = await makeUser(admin, "USER", "owner");
      const mod = await makeUser(admin, "MODERATOR", "mod");
      const adminUser = await makeUser(admin, "ADMIN", "admin");

      const beatId = randomUUID();
      const { error: beatErr } = await admin.from("beats").insert({
        id: beatId,
        ownership_type: "USER",
        owner_id: owner.userId,
        title: "Wave4 Publish E2E",
        bpm: 1,
        duration_seconds: 1,
        status: "DRAFT",
        tags: [],
      });
      expect(beatErr).toBeNull();

      const ctx = userContext(owner.userId, owner.email);
      const session = await createUserBeatSignedUploadSessionFor(ctx, {
        beatId,
        contentType: "audio/wav",
        byteSize: bytes.byteLength,
        originalFilename: "bpm-120-steady.wav",
      });
      const put = await fetch(session.signedUrl, {
        method: "PUT",
        headers: { "Content-Type": "audio/wav" },
        body: bytes,
      });
      expect(put.ok).toBe(true);

      await analyzeUserBeatPendingUploadFor(ctx, {
        beatId,
        assetId: session.assetId,
      });
      await finalizeUserBeatAfterUploadFor(ctx, {
        beatId,
        assetId: session.assetId,
        title: "Wave4 Publish E2E",
        bpm: 120,
        bpmManualOverride: false,
      });

      // submit → approve
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

      // APPROVED not public
      const anon = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: beforePublic } = await anon
        .from("beats")
        .select("id")
        .eq("id", beatId)
        .maybeSingle();
      expect(beforePublic).toBeNull();

      // USER publish DENY
      const { error: userPublishErr } = await owner.client
        .from("beats")
        .update({ status: "PUBLISHED" })
        .eq("id", beatId);
      expect(userPublishErr).not.toBeNull();

      // MOD metadata during APPROVED DENY
      const { error: modMetaErr } = await mod.client
        .from("beats")
        .update({ title: "Hacked title" })
        .eq("id", beatId);
      expect(modMetaErr).not.toBeNull();

      // MOD publish PASS
      const { error: publishErr } = await mod.client
        .from("beats")
        .update({ status: "PUBLISHED", rejection_reason: null })
        .eq("id", beatId);
      expect(publishErr).toBeNull();

      const { data: published } = await owner.client
        .from("beats")
        .select("status, rejection_reason")
        .eq("id", beatId)
        .single();
      expect(published?.status).toBe("PUBLISHED");
      expect(published?.rejection_reason).toBeNull();

      // public catalog sees PUBLISHED
      const { data: afterPublic } = await anon
        .from("beats")
        .select("id, title, status, rejection_reason")
        .eq("id", beatId)
        .maybeSingle();
      expect(afterPublic?.status).toBe("PUBLISHED");
      expect(afterPublic?.title).toBe("Wave4 Publish E2E");
      // rejection_reason may be omitted from select or null — never expose as active
      expect(afterPublic?.rejection_reason ?? null).toBeNull();

      // signed playback for PUBLISHED (service creates URL like Access Gate)
      const { data: assets } = await admin
        .from("beat_audio_assets")
        .select("id, object_key, status, is_active, purpose")
        .eq("beat_id", beatId)
        .eq("purpose", "MASTER")
        .eq("is_active", true)
        .eq("status", "READY")
        .maybeSingle();
      expect(assets).toBeTruthy();
      const { data: signed, error: signedErr } = await admin.storage
        .from(BEAT_AUDIO_BUCKET)
        .createSignedUrl(assets!.object_key as string, 60);
      expect(signedErr).toBeNull();
      expect(signed?.signedUrl).toMatch(/^https?:\/\//);

      // PLATFORM regression: ADMIN DRAFT insert still works
      const platformId = randomUUID();
      const { error: platformErr } = await adminUser.client.from("beats").insert({
        id: platformId,
        ownership_type: "PLATFORM",
        owner_id: null,
        title: "Platform Wave4 Regression",
        bpm: 140,
        duration_seconds: 60,
        status: "DRAFT",
        tags: [],
      });
      expect(platformErr).toBeNull();

      // cleanup
      for (const row of (
        await admin
          .from("beat_audio_assets")
          .select("object_key")
          .eq("beat_id", beatId)
      ).data ?? []) {
        await admin.storage
          .from(BEAT_AUDIO_BUCKET)
          .remove([row.object_key as string]);
      }
      await admin.from("beat_audio_assets").delete().eq("beat_id", beatId);
      await admin.from("beats").delete().eq("id", beatId);
      await admin.from("beats").delete().eq("id", platformId);
      await admin.auth.admin.deleteUser(owner.userId);
      await admin.auth.admin.deleteUser(mod.userId);
      await admin.auth.admin.deleteUser(adminUser.userId);
    },
    180_000,
  );
});
