/**
 * Identify fixture owner kind vs moderators — no emails/ids printed.
 */
import { createClient } from "@supabase/supabase-js";
import { execSync } from "node:child_process";

function parseStatusEnv() {
  const raw = execSync("npx.cmd --yes supabase status -o env", {
    encoding: "utf8",
    env: {
      ...process.env,
      Path:
        "C:\\Program Files\\Docker\\Docker\\resources\\bin;" +
        (process.env.Path || process.env.PATH || ""),
    },
  });
  const out = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!m) continue;
    let v = m[2];
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    )
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

function kindOf(email) {
  if (!email?.endsWith("@localhost.local")) return "remote";
  if (email.startsWith("theme-visual-")) return "theme-visual";
  if (email.startsWith("theme-mod-")) return "theme-mod";
  return "other-local";
}

const st = parseStatusEnv();
const api = (st.API_URL || "").replace(/\/$/, "");
const admin = createClient(api, st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const beat = await admin
  .from("beats")
  .select("id,status,owner_id,ownership_type")
  .eq("title", "Visual Fixture — Local Only")
  .maybeSingle();
if (!beat.data) {
  console.log(JSON.stringify({ missing: true }));
  process.exit(1);
}
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const owner = (listed.data?.users || []).find((u) => u.id === beat.data.owner_id);
const mods = [];
for (const u of listed.data?.users || []) {
  if (!u.email?.endsWith("@localhost.local")) continue;
  const prof = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
  if (prof.data?.role === "MODERATOR" || prof.data?.role === "ADMIN") {
    mods.push({
      kind: kindOf(u.email),
      role: prof.data.role,
      isOwner: u.id === beat.data.owner_id,
    });
  }
}
const assets = await admin
  .from("beat_audio_assets")
  .select("purpose,status,is_active")
  .eq("beat_id", beat.data.id)
  .eq("purpose", "MASTER");
console.log(
  JSON.stringify(
    {
      fixtureStatus: beat.data.status,
      ownership: beat.data.ownership_type,
      ownerKind: kindOf(owner?.email),
      masterAssets: assets.data || [],
      staff: mods,
      publishableByNonOwnerStaff: mods.some((m) => !m.isOwner),
    },
    null,
    2,
  ),
);
