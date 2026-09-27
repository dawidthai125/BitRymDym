/**
 * Live E2E — Community Wave 2 USER signed transport.
 * Runs against real Supabase when .env.local service role is available.
 */
import { randomUUID } from "crypto";
import { readFileSync, existsSync } from "fs";
import { resolve } from "path";

import { createClient } from "@supabase/supabase-js";
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
const fixturePath = resolve(
  process.cwd(),
  "../bitrymdym-fixtures/bpm-120-steady.wav",
);
const live = Boolean(url && serviceKey && existsSync(fixturePath));

// Ensure process.env for createSupabaseAdminClient inside transport
if (url) process.env.NEXT_PUBLIC_SUPABASE_URL = url;
if (serviceKey) process.env.SUPABASE_SERVICE_ROLE_KEY = serviceKey;
if (env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
}

describe.runIf(live)("Community Wave 2 live E2E transport", () => {
  it(
    "USER DRAFT → signed PUT → analyze BPM120/30s → finalize READY; replacement; stays DRAFT",
    async () => {
      const admin = createClient(url!, serviceKey!, {
        auth: { persistSession: false, autoRefreshToken: false },
      });
      const bytes = readFileSync(fixturePath);
      expect(bytes.byteLength).toBeGreaterThan(1_000_000);

      const email = `wave2-e2e-${randomUUID().slice(0, 8)}@bitrymdym.test`;
      const password = `Wave2-${randomUUID()}`;
      const { data: created, error: createErr } =
        await admin.auth.admin.createUser({
          email,
          password,
          email_confirm: true,
        });
      expect(createErr).toBeNull();
      const userId = created.user!.id;

      await admin.from("profiles").upsert({
        id: userId,
        role: "USER",
        account_level: "BEGINNER_RAPPER",
        display_name: "Wave2 E2E",
      });

      const context: AuthContext = {
        userId,
        email,
        profile: {
          id: userId,
          displayName: "Wave2 E2E",
          role: "USER",
          accountLevel: "BEGINNER_RAPPER",
          createdAt: new Date().toISOString(),
          updatedAt: new Date().toISOString(),
        },
        permissions: ["beats.create"],
      };

      const beatId = randomUUID();
      const { error: beatErr } = await admin.from("beats").insert({
        id: beatId,
        ownership_type: "USER",
        owner_id: userId,
        title: "wave2-e2e-draft",
        bpm: 1,
        duration_seconds: 1,
        status: "DRAFT",
        tags: [],
      });
      expect(beatErr).toBeNull();

      try {
        const session = await createUserBeatSignedUploadSessionFor(context, {
          beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
          originalFilename: "bpm-120-steady.wav",
        });
        expect(session.objectKey.startsWith(`user/${userId}/${beatId}/`)).toBe(
          true,
        );

        const { error: upErr } = await admin.storage
          .from(BEAT_AUDIO_BUCKET)
          .uploadToSignedUrl(session.path, session.token, bytes, {
            contentType: session.contentType,
            upsert: true,
          });
        expect(upErr).toBeNull();

        const analyzed = await analyzeUserBeatPendingUploadFor(context, {
          beatId,
          assetId: session.assetId,
        });
        expect(analyzed.durationSeconds).toBe(30);
        expect(analyzed.bpmDecision).toBe("AUTO_SUGGEST");
        expect(analyzed.bpm).toBe(120);

        await finalizeUserBeatAfterUploadFor(context, {
          beatId,
          assetId: session.assetId,
          title: "wave2-e2e-ready",
          bpm: 120,
          bpmManualOverride: false,
        });

        const { data: beatAfter } = await admin
          .from("beats")
          .select("status, bpm, duration_seconds")
          .eq("id", beatId)
          .single();
        expect(beatAfter?.status).toBe("DRAFT");
        expect(beatAfter?.bpm).toBe(120);
        expect(beatAfter?.duration_seconds).toBe(30);

        // Replacement
        const session2 = await createUserBeatSignedUploadSessionFor(context, {
          beatId,
          contentType: "audio/wav",
          byteSize: bytes.byteLength,
          originalFilename: "bpm-120-steady-replace.wav",
        });
        const { error: up2 } = await admin.storage
          .from(BEAT_AUDIO_BUCKET)
          .uploadToSignedUrl(session2.path, session2.token, bytes, {
            contentType: session2.contentType,
            upsert: true,
          });
        expect(up2).toBeNull();
        await analyzeUserBeatPendingUploadFor(context, {
          beatId,
          assetId: session2.assetId,
        });
        await finalizeUserBeatAfterUploadFor(context, {
          beatId,
          assetId: session2.assetId,
          title: "wave2-e2e-replaced",
          bpm: 120,
        });

        const { data: assets } = await admin
          .from("beat_audio_assets")
          .select("status, is_active, object_key")
          .eq("beat_id", beatId)
          .eq("purpose", "MASTER");
        const activeReady = (assets ?? []).filter(
          (a) => a.is_active && a.status === "READY",
        );
        expect(activeReady).toHaveLength(1);
        expect((assets ?? []).some((a) => a.status === "REPLACED")).toBe(true);

        // Foreign AuthZ
        const foreign: AuthContext = {
          ...context,
          userId: randomUUID(),
          profile: { ...context.profile, id: randomUUID() },
        };
        await expect(
          createUserBeatSignedUploadSessionFor(foreign, {
            beatId,
            contentType: "audio/wav",
            byteSize: 1000,
            originalFilename: "x.wav",
          }),
        ).rejects.toThrow(/owner|USER|DRAFT|Forbidden|Not beat/i);

        // Storage direct INSERT denied for authenticated role is policy-level;
        // object keys cleaned below.
        const paths = (assets ?? []).map((a) => a.object_key as string);
        if (paths.length) {
          await admin.storage.from(BEAT_AUDIO_BUCKET).remove(paths);
        }
      } finally {
        await admin.from("beat_audio_assets").delete().eq("beat_id", beatId);
        await admin.from("beats").delete().eq("id", beatId);
        await admin.auth.admin.deleteUser(userId);
      }
    },
    120_000,
  );
});

describe.runIf(!live)("Community Wave 2 live E2E (skipped)", () => {
  it("skips when fixture or service role missing", () => {
    expect(live).toBe(false);
  });
});
