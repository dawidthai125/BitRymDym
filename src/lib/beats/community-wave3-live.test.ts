/**
 * Live RLS + workflow — Community Wave 3 submit / moderation.
 * Requires .env.local service role + bpm fixture.
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
  const email = `wave3-${label}-${randomUUID().slice(0, 8)}@bitrymdym.test`;
  const password = `Wave3-${randomUUID()}`;
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
      displayName: "Wave3",
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

describe.runIf(live)("Community Wave 3 live RLS + E2E", () => {
  it(
    "submit → reject → rework → resubmit → approve; APPROVED not public; PLATFORM ok",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);

      const owner = await makeUser(admin, "USER", "owner");
      const other = await makeUser(admin, "USER", "other");
      const mod = await makeUser(admin, "MODERATOR", "mod");

      const beatId = randomUUID();
      const { error: beatErr } = await admin.from("beats").insert({
        id: beatId,
        ownership_type: "USER",
        owner_id: owner.userId,
        title: "Wave3 E2E",
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
        title: "Wave3 E2E",
        bpm: 120,
        bpmManualOverride: false,
      });

      // USER own DRAFT select
      const { data: ownDraft, error: ownDraftErr } = await owner.client
        .from("beats")
        .select("id, status")
        .eq("id", beatId)
        .maybeSingle();
      expect(ownDraftErr).toBeNull();
      expect(ownDraft?.status).toBe("DRAFT");

      // foreign DRAFT deny
      const { data: foreign } = await other.client
        .from("beats")
        .select("id")
        .eq("id", beatId)
        .maybeSingle();
      expect(foreign).toBeNull();

      // submit DRAFT → PENDING_REVIEW
      const { error: submitErr } = await owner.client
        .from("beats")
        .update({ status: "PENDING_REVIEW", rejection_reason: null })
        .eq("id", beatId)
        .eq("status", "DRAFT");
      expect(submitErr).toBeNull();

      const { data: pending } = await owner.client
        .from("beats")
        .select("status")
        .eq("id", beatId)
        .single();
      expect(pending?.status).toBe("PENDING_REVIEW");

      // PENDING edit deny (metadata)
      const { error: pendingEditErr } = await owner.client
        .from("beats")
        .update({ title: "Hacked" })
        .eq("id", beatId);
      expect(pendingEditErr).not.toBeNull();

      // MOD select PENDING
      const { data: modSees, error: modSeeErr } = await mod.client
        .from("beats")
        .select("id, status, title")
        .eq("id", beatId)
        .maybeSingle();
      expect(modSeeErr).toBeNull();
      expect(modSees?.status).toBe("PENDING_REVIEW");

      // MOD metadata edit deny
      const { error: modMetaErr } = await mod.client
        .from("beats")
        .update({ title: "Mod hack" })
        .eq("id", beatId);
      expect(modMetaErr).not.toBeNull();

      // MOD reject without reason deny
      const { error: rejectEmptyErr } = await mod.client
        .from("beats")
        .update({ status: "REJECTED", rejection_reason: "" })
        .eq("id", beatId);
      expect(rejectEmptyErr).not.toBeNull();

      // MOD reject with reason
      const { error: rejectErr } = await mod.client
        .from("beats")
        .update({
          status: "REJECTED",
          rejection_reason: "Popraw jakość mastera",
        })
        .eq("id", beatId);
      expect(rejectErr).toBeNull();

      const { data: rejected } = await owner.client
        .from("beats")
        .select("status, rejection_reason")
        .eq("id", beatId)
        .single();
      expect(rejected?.status).toBe("REJECTED");
      expect(rejected?.rejection_reason).toBe("Popraw jakość mastera");

      // REJECTED → DRAFT (clears reason)
      const { error: toDraftErr } = await owner.client
        .from("beats")
        .update({ status: "DRAFT", rejection_reason: null })
        .eq("id", beatId);
      expect(toDraftErr).toBeNull();

      // resubmit
      const { error: resubmitErr } = await owner.client
        .from("beats")
        .update({ status: "PENDING_REVIEW", rejection_reason: null })
        .eq("id", beatId);
      expect(resubmitErr).toBeNull();

      // MOD approve
      const { error: approveErr } = await mod.client
        .from("beats")
        .update({ status: "APPROVED", rejection_reason: null })
        .eq("id", beatId);
      expect(approveErr).toBeNull();

      const { data: approved } = await owner.client
        .from("beats")
        .select("status")
        .eq("id", beatId)
        .single();
      expect(approved?.status).toBe("APPROVED");

      // public APPROVED deny (anon catalog)
      const anon = createClient(url!, anonKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const { data: publicRow } = await anon
        .from("beats")
        .select("id")
        .eq("id", beatId)
        .eq("status", "PUBLISHED")
        .maybeSingle();
      expect(publicRow).toBeNull();

      const { data: anonDirect } = await anon
        .from("beats")
        .select("id")
        .eq("id", beatId)
        .maybeSingle();
      expect(anonDirect).toBeNull();

      // USER cannot approve/publish via transition
      const { error: userApproveErr } = await owner.client
        .from("beats")
        .update({ status: "PUBLISHED" })
        .eq("id", beatId);
      expect(userApproveErr).not.toBeNull();

      // MOD publish deny in Wave 3 surface: still allowed by RLS for Wave 4 —
      // verify MOD cannot edit metadata on APPROVED
      const { error: modEditApprovedErr } = await mod.client
        .from("beats")
        .update({ title: "Nope" })
        .eq("id", beatId);
      expect(modEditApprovedErr).not.toBeNull();

      // PLATFORM regression: ADMIN can still insert PLATFORM DRAFT
      const platformId = randomUUID();
      const adminUser = await makeUser(admin, "ADMIN", "admin");
      const { error: platformErr } = await adminUser.client.from("beats").insert({
        id: platformId,
        ownership_type: "PLATFORM",
        owner_id: null,
        title: "Platform Wave3 Regression",
        bpm: 140,
        duration_seconds: 60,
        status: "DRAFT",
        tags: [],
      });
      expect(platformErr).toBeNull();

      // cleanup storage assets for owner beat
      const { data: assets } = await admin
        .from("beat_audio_assets")
        .select("object_key")
        .eq("beat_id", beatId);
      for (const row of assets ?? []) {
        await admin.storage
          .from(BEAT_AUDIO_BUCKET)
          .remove([row.object_key as string]);
      }
      await admin.from("beat_audio_assets").delete().eq("beat_id", beatId);
      await admin.from("beats").delete().eq("id", beatId);
      await admin.from("beats").delete().eq("id", platformId);
      await admin.auth.admin.deleteUser(owner.userId);
      await admin.auth.admin.deleteUser(other.userId);
      await admin.auth.admin.deleteUser(mod.userId);
      await admin.auth.admin.deleteUser(adminUser.userId);
    },
    180_000,
  );
});
