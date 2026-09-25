/**
 * Phase 1.5 live Storage + Access Gate verification.
 * Reads .env.local; never prints secrets. Cleans up created test data.
 */
import { createClient } from "@supabase/supabase-js";
import { createHash, randomUUID } from "crypto";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, "..");

function loadEnvLocal() {
  const env = {};
  for (const line of fs.readFileSync(path.join(root, ".env.local"), "utf8").split(/\r?\n/)) {
    if (!line || line.startsWith("#") || !line.includes("=")) continue;
    const i = line.indexOf("=");
    env[line.slice(0, i).trim()] = line.slice(i + 1).trim();
  }
  return env;
}

function redact(msg, secrets) {
  let s = String(msg ?? "");
  for (const secret of secrets) {
    if (secret) s = s.split(secret).join("[REDACTED]");
  }
  return s;
}

function pass(name) {
  console.log(`PASS ${name}`);
}
function fail(name, detail) {
  console.log(`FAIL ${name} :: ${detail}`);
}

const env = loadEnvLocal();
const url = env.NEXT_PUBLIC_SUPABASE_URL;
const anon = env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
const service = env.SUPABASE_SERVICE_ROLE_KEY;
const secrets = [anon, service].filter(Boolean);

if (!url || !anon || !service) {
  console.log("FAIL ENV :: missing keys");
  process.exit(2);
}

const admin = createClient(url, service, {
  auth: { autoRefreshToken: false, persistSession: false },
});

const stamp = Date.now();
const createdUserIds = [];
const createdBeatIds = [];
const createdAssetIds = [];
const createdObjectKeys = [];
let failures = 0;

async function createAuthUser(label, role) {
  const email = `brd.phase15.${label}.${stamp}@gmail.com`;
  const password = `Test_${label}_${stamp}_!xY9`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `BRD15_${label}` },
  });
  if (error) throw new Error(redact(error.message, secrets));
  createdUserIds.push(data.user.id);
  if (role && role !== "USER") {
    const { error: roleErr } = await admin
      .from("profiles")
      .update({ role })
      .eq("id", data.user.id);
    if (roleErr) throw new Error(redact(roleErr.message, secrets));
  }
  return { id: data.user.id, email, password };
}

async function clientAs(creds) {
  const client = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });
  const { error } = await client.auth.signInWithPassword({
    email: creds.email,
    password: creds.password,
  });
  if (error) throw new Error(redact(error.message, secrets));
  return client;
}

function tinyMpegLikeBytes() {
  // Not a real MPEG frame — used only as storage payload under interim MIME.
  return Buffer.from("ID3BRD15TESTAUDIO" + "0".repeat(64));
}

try {
  // Bucket private
  {
    const { data: buckets, error } = await admin.storage.listBuckets();
    if (error) throw new Error(redact(error.message, secrets));
    const bucket = (buckets ?? []).find((b) => b.id === "beat-audio" || b.name === "beat-audio");
    if (!bucket) {
      fail("bucket_exists", "missing");
      failures++;
    } else if (bucket.public) {
      fail("bucket_private", "public=true");
      failures++;
    } else {
      pass("bucket_exists");
      pass("bucket_private");
    }
  }

  const adminUser = await createAuthUser("admin", "ADMIN");
  const modUser = await createAuthUser("mod", "MODERATOR");
  const plainUser = await createAuthUser("user", "USER");
  const adminClient = await clientAs(adminUser);
  const modClient = await clientAs(modUser);
  const userClient = await clientAs(plainUser);
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Create PLATFORM PUBLISHED beat + DRAFT beat via admin client
  let publishedId;
  let draftId;
  {
    const { data, error } = await adminClient
      .from("beats")
      .insert({
        ownership_type: "PLATFORM",
        owner_id: null,
        title: `BRD15 Pub ${stamp}`,
        bpm: 140,
        duration_seconds: 90,
        status: "PUBLISHED",
        tags: ["p15"],
      })
      .select("id")
      .single();
    if (error || !data) {
      fail("admin_beat_insert_published", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      pass("admin_beat_insert_published");
      publishedId = data.id;
      createdBeatIds.push(data.id);
    }
  }
  {
    const { data, error } = await adminClient
      .from("beats")
      .insert({
        ownership_type: "PLATFORM",
        owner_id: null,
        title: `BRD15 Draft ${stamp}`,
        bpm: 128,
        duration_seconds: 80,
        status: "DRAFT",
        tags: ["p15"],
      })
      .select("id")
      .single();
    if (error || !data) {
      fail("admin_beat_insert_draft", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      pass("admin_beat_insert_draft");
      draftId = data.id;
      createdBeatIds.push(data.id);
    }
  }

  // Upload MASTER asset via service role (mirrors server-mediated path)
  const assetId = randomUUID();
  const objectKey = `platform/${publishedId}/${assetId}/master.bin`;
  const bytes = tinyMpegLikeBytes();
  const checksum = createHash("sha256").update(bytes).digest("hex");
  {
    const { error: upErr } = await admin.storage
      .from("beat-audio")
      .upload(objectKey, bytes, { contentType: "audio/mpeg", upsert: false });
    if (upErr) {
      fail("storage_upload", redact(upErr.message, secrets));
      failures++;
    } else {
      pass("storage_upload");
      createdObjectKeys.push(objectKey);
    }

    const { data: asset, error: aErr } = await admin
      .from("beat_audio_assets")
      .insert({
        id: assetId,
        beat_id: publishedId,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: "beat-audio",
        object_key: objectKey,
        content_type: "audio/mpeg",
        byte_size: bytes.byteLength,
        checksum_sha256: checksum,
        is_active: true,
        created_by: adminUser.id,
      })
      .select("id")
      .single();
    if (aErr || !asset) {
      fail("asset_insert", redact(aErr?.message || "empty", secrets));
      failures++;
    } else {
      pass("asset_insert");
      createdAssetIds.push(asset.id);
    }
  }

  // Anon cannot download object directly
  {
    const { data, error } = await anonClient.storage
      .from("beat-audio")
      .download(objectKey);
    if (data && !error) {
      fail("anon_direct_storage_download", "ALLOWED");
      failures++;
    } else {
      pass("anon_direct_storage_download");
    }
  }

  // User cannot upload to storage
  {
    const { error } = await userClient.storage
      .from("beat-audio")
      .upload(`platform/${publishedId}/${randomUUID()}/master.bin`, bytes, {
        contentType: "audio/mpeg",
      });
    if (!error) {
      fail("user_storage_upload", "ALLOWED");
      failures++;
    } else {
      pass("user_storage_upload");
    }
  }

  // User cannot insert asset row
  {
    const { error } = await userClient.from("beat_audio_assets").insert({
      beat_id: publishedId,
      purpose: "MASTER",
      status: "PENDING_UPLOAD",
      storage_bucket: "beat-audio",
      object_key: `platform/${publishedId}/${randomUUID()}/master.bin`,
      is_active: false,
    });
    if (!error) {
      fail("user_asset_insert", "ALLOWED");
      failures++;
    } else {
      pass("user_asset_insert");
    }
  }

  // Signed URL PLAYBACK 120s via service (Access Gate equivalent)
  {
    const { data, error } = await admin.storage
      .from("beat-audio")
      .createSignedUrl(objectKey, 120);
    if (error || !data?.signedUrl) {
      fail("signed_playback", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      pass("signed_playback");
      const res = await fetch(data.signedUrl);
      if (!res.ok) {
        fail("signed_playback_fetch", String(res.status));
        failures++;
      } else {
        pass("signed_playback_fetch");
      }
    }
  }

  // Signed URL DOWNLOAD 300s
  {
    const { data, error } = await admin.storage
      .from("beat-audio")
      .createSignedUrl(objectKey, 300);
    if (error || !data?.signedUrl) {
      fail("signed_download", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      pass("signed_download");
    }
  }

  // Expired signed URL (1s TTL)
  {
    const { data, error } = await admin.storage
      .from("beat-audio")
      .createSignedUrl(objectKey, 1);
    if (error || !data?.signedUrl) {
      fail("signed_expiry_create", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      await new Promise((r) => setTimeout(r, 1500));
      const res = await fetch(data.signedUrl);
      if (res.ok) {
        fail("signed_expiry", "STILL_OK");
        failures++;
      } else {
        pass("signed_expiry");
      }
    }
  }

  // Anon can SELECT published asset metadata (RLS) but not draft-only assets
  {
    const { data: pubRows } = await anonClient
      .from("beat_audio_assets")
      .select("id")
      .eq("beat_id", publishedId);
    if (!pubRows || pubRows.length < 1) {
      fail("anon_select_published_asset", "EMPTY");
      failures++;
    } else {
      pass("anon_select_published_asset");
    }

    const draftAssetId = randomUUID();
    const draftKey = `platform/${draftId}/${draftAssetId}/master.bin`;
    await admin.storage.from("beat-audio").upload(draftKey, bytes, {
      contentType: "audio/mpeg",
      upsert: false,
    });
    createdObjectKeys.push(draftKey);
    const { data: draftAsset } = await admin
      .from("beat_audio_assets")
      .insert({
        id: draftAssetId,
        beat_id: draftId,
        purpose: "MASTER",
        status: "READY",
        storage_bucket: "beat-audio",
        object_key: draftKey,
        content_type: "audio/mpeg",
        byte_size: bytes.byteLength,
        checksum_sha256: checksum,
        is_active: true,
        created_by: adminUser.id,
      })
      .select("id")
      .single();
    if (draftAsset?.id) createdAssetIds.push(draftAsset.id);

    const { data: draftRows } = await anonClient
      .from("beat_audio_assets")
      .select("id")
      .eq("beat_id", draftId);
    if (draftRows && draftRows.length > 0) {
      fail("anon_select_draft_asset", "VISIBLE");
      failures++;
    } else {
      pass("anon_select_draft_asset");
    }
  }

  // Moderator cannot mutate assets
  {
    const { error } = await modClient
      .from("beat_audio_assets")
      .update({ original_filename: "hack.bin" })
      .eq("id", assetId);
    const { data } = await admin
      .from("beat_audio_assets")
      .select("original_filename")
      .eq("id", assetId)
      .single();
    if (data?.original_filename === "hack.bin") {
      fail("moderator_asset_edit", "CHANGED");
      failures++;
    } else {
      pass("moderator_asset_edit");
      if (error) {
        /* expected */
      }
    }
  }

  // Wrong beat relation guard (application-level mirrored by FK): orphan key guess
  {
    const fakeKey = `platform/${randomUUID()}/${randomUUID()}/master.bin`;
    const { data, error } = await anonClient.storage
      .from("beat-audio")
      .download(fakeKey);
    if (data && !error) {
      fail("guessed_path_download", "ALLOWED");
      failures++;
    } else {
      pass("guessed_path_download");
    }
  }
} catch (e) {
  fail("fatal", redact(e.message || e, secrets));
  failures++;
} finally {
  for (const key of createdObjectKeys) {
    await admin.storage.from("beat-audio").remove([key]);
  }
  for (const id of createdAssetIds) {
    await admin.from("beat_audio_assets").delete().eq("id", id);
  }
  for (const id of createdBeatIds) {
    await admin.from("beats").delete().eq("id", id);
  }
  for (const id of createdUserIds) {
    await admin.auth.admin.deleteUser(id);
  }
  console.log(
    failures === 0 ? "LIVE_RESULT=PASS" : `LIVE_RESULT=FAIL count=${failures}`,
  );
  process.exit(failures === 0 ? 0 : 1);
}
