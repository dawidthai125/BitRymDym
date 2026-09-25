/**
 * Phase 1.4 live Beats RLS verification.
 * Reads .env.local; never prints secrets. Cleans up only created test data.
 */
import { createClient } from "@supabase/supabase-js";
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
let failures = 0;

async function createAuthUser(label, role) {
  const email = `brd.phase14.${label}.${stamp}@gmail.com`;
  const password = `Test_${label}_${stamp}_!xY9`;
  const { data, error } = await admin.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    user_metadata: { display_name: `BRD14_${label}` },
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

try {
  const adminUser = await createAuthUser("admin", "ADMIN");
  const modUser = await createAuthUser("mod", "MODERATOR");
  const plainUser = await createAuthUser("user", "USER");

  const adminClient = await clientAs(adminUser);
  const modClient = await clientAs(modUser);
  const userClient = await clientAs(plainUser);
  const anonClient = createClient(url, anon, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // Admin insert DRAFT
  {
    const { data, error } = await adminClient
      .from("beats")
      .insert({
        ownership_type: "PLATFORM",
        owner_id: null,
        title: `BRD14 Draft ${stamp}`,
        bpm: 140,
        duration_seconds: 90,
        status: "DRAFT",
        tags: ["test"],
      })
      .select("id, status")
      .single();
    if (error || !data) {
      fail("admin_insert", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      pass("admin_insert");
      createdBeatIds.push(data.id);
    }
  }

  const draftId = createdBeatIds[0];

  // Anon cannot see DRAFT
  {
    const { data, error } = await anonClient
      .from("beats")
      .select("id")
      .eq("id", draftId)
      .maybeSingle();
    if (data) {
      fail("anon_draft_select", "VISIBLE");
      failures++;
    } else {
      pass("anon_draft_select");
      if (error) {
        /* expected empty */
      }
    }
  }

  // User cannot see foreign DRAFT
  {
    const { data } = await userClient
      .from("beats")
      .select("id")
      .eq("id", draftId)
      .maybeSingle();
    if (data) {
      fail("user_foreign_draft_select", "VISIBLE");
      failures++;
    } else pass("user_foreign_draft_select");
  }

  // Moderator can see DRAFT (staff)
  {
    const { data } = await modClient
      .from("beats")
      .select("id, status")
      .eq("id", draftId)
      .maybeSingle();
    if (!data) {
      fail("moderator_draft_select", "NOT VISIBLE");
      failures++;
    } else pass("moderator_draft_select");
  }

  // Non-admin insert DENY
  {
    const { error } = await userClient.from("beats").insert({
      ownership_type: "PLATFORM",
      owner_id: null,
      title: "Hacked",
      bpm: 100,
      duration_seconds: 60,
      status: "DRAFT",
    });
    if (!error) {
      fail("user_insert", "ALLOWED");
      failures++;
    } else pass("user_insert");
  }

  // User status escalation DENY
  {
    const { error } = await userClient
      .from("beats")
      .update({ status: "PUBLISHED" })
      .eq("id", draftId);
    const { data } = await admin
      .from("beats")
      .select("status")
      .eq("id", draftId)
      .single();
    if (data?.status === "PUBLISHED") {
      fail("user_status_escalation", "CHANGED");
      failures++;
    } else {
      pass("user_status_escalation");
      if (error) {
        /* ok */
      }
    }
  }

  // User ownership manipulation DENY
  {
    const { error } = await userClient
      .from("beats")
      .update({ ownership_type: "USER", owner_id: plainUser.id })
      .eq("id", draftId);
    const { data } = await admin
      .from("beats")
      .select("ownership_type, owner_id")
      .eq("id", draftId)
      .single();
    if (data?.ownership_type === "USER") {
      fail("user_ownership_manipulation", "CHANGED");
      failures++;
    } else {
      pass("user_ownership_manipulation");
      if (error) {
        /* ok */
      }
    }
  }

  // Moderator metadata edit DENY
  {
    const { error } = await modClient
      .from("beats")
      .update({ title: "ModHack" })
      .eq("id", draftId);
    const { data } = await admin
      .from("beats")
      .select("title")
      .eq("id", draftId)
      .single();
    if (data?.title === "ModHack") {
      fail("moderator_metadata_edit", "CHANGED");
      failures++;
    } else {
      pass("moderator_metadata_edit");
      if (error) {
        /* ok */
      }
    }
  }

  // Admin publish
  {
    const { error } = await adminClient
      .from("beats")
      .update({ status: "PUBLISHED" })
      .eq("id", draftId);
    if (error) {
      fail("admin_publish", redact(error.message, secrets));
      failures++;
    } else pass("admin_publish");
  }

  // Anon published SELECT ALLOW
  {
    const { data } = await anonClient
      .from("beats")
      .select("id, status")
      .eq("id", draftId)
      .maybeSingle();
    if (!data || data.status !== "PUBLISHED") {
      fail("anon_published_select", "NOT VISIBLE");
      failures++;
    } else pass("anon_published_select");
  }

  // Auth published SELECT ALLOW
  {
    const { data } = await userClient
      .from("beats")
      .select("id")
      .eq("id", draftId)
      .maybeSingle();
    if (!data) {
      fail("auth_published_select", "NOT VISIBLE");
      failures++;
    } else pass("auth_published_select");
  }

  // Forbid PUBLISHED → DRAFT
  {
    const { error } = await adminClient
      .from("beats")
      .update({ status: "DRAFT" })
      .eq("id", draftId);
    const { data } = await admin
      .from("beats")
      .select("status")
      .eq("id", draftId)
      .single();
    if (data?.status === "DRAFT") {
      fail("published_to_draft_forbidden", "CHANGED");
      failures++;
    } else {
      pass("published_to_draft_forbidden");
      if (error) {
        /* expected */
      }
    }
  }

  // Admin archive
  {
    const { error } = await adminClient
      .from("beats")
      .update({ status: "ARCHIVED" })
      .eq("id", draftId);
    if (error) {
      fail("admin_archive", redact(error.message, secrets));
      failures++;
    } else pass("admin_archive");
  }

  // Moderator approve path: create PENDING_REVIEW via service, then mod approve
  {
    const { data: pending, error } = await admin
      .from("beats")
      .insert({
        ownership_type: "PLATFORM",
        owner_id: null,
        title: `BRD14 Pending ${stamp}`,
        bpm: 128,
        duration_seconds: 80,
        status: "PENDING_REVIEW",
        tags: ["mod"],
      })
      .select("id")
      .single();
    if (error || !pending) {
      fail("seed_pending_review", redact(error?.message || "empty", secrets));
      failures++;
    } else {
      createdBeatIds.push(pending.id);
      const { error: modErr } = await modClient
        .from("beats")
        .update({ status: "APPROVED" })
        .eq("id", pending.id);
      if (modErr) {
        fail("moderator_approve", redact(modErr.message, secrets));
        failures++;
      } else pass("moderator_approve");
    }
  }

  // Admin delete
  {
    const target = createdBeatIds[createdBeatIds.length - 1];
    const { error } = await adminClient.from("beats").delete().eq("id", target);
    if (error) {
      fail("admin_delete", redact(error.message, secrets));
      failures++;
    } else {
      pass("admin_delete");
      // remove from cleanup list
      const idx = createdBeatIds.indexOf(target);
      if (idx >= 0) createdBeatIds.splice(idx, 1);
    }
  }

  // Unauthorized delete
  {
    const { error } = await userClient.from("beats").delete().eq("id", draftId);
    const { data } = await admin
      .from("beats")
      .select("id")
      .eq("id", draftId)
      .maybeSingle();
    if (!data) {
      fail("user_delete", "ROW REMOVED");
      failures++;
    } else {
      pass("user_delete");
      if (error) {
        /* ok */
      }
    }
  }
} catch (e) {
  fail("fatal", redact(e.message || e, secrets));
  failures++;
} finally {
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
