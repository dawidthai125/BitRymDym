/**
 * READ-ONLY: count local Auth roles by kind. No mutations. No emails/ids printed.
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

const st = parseStatusEnv();
const api = (st.API_URL || "").replace(/\/$/, "");
if (!/^https?:\/\/(127\.0\.0\.1|localhost)(:\d+)?$/i.test(api)) {
  console.log(JSON.stringify({ ok: false, reason: "NON_LOOPBACK" }));
  process.exit(2);
}
const admin = createClient(api, st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const byRole = {};
let localAdmin = 0;
let localMod = 0;
let localUser = 0;
for (const u of listed.data?.users || []) {
  if (!u.email?.endsWith("@localhost.local")) continue;
  const prof = await admin.from("profiles").select("role").eq("id", u.id).maybeSingle();
  const role = prof.data?.role ?? "UNKNOWN";
  byRole[role] = (byRole[role] || 0) + 1;
  if (role === "ADMIN") localAdmin += 1;
  if (role === "MODERATOR") localMod += 1;
  if (role === "USER") localUser += 1;
}
const beat = await admin
  .from("beats")
  .select("status,ownership_type")
  .eq("title", "Visual Fixture — Local Only")
  .maybeSingle();
const basis = await admin
  .from("beat_rights_basis")
  .select("basis_kind")
  .eq("beat_id", (await admin.from("beats").select("id").eq("title", "Visual Fixture — Local Only").maybeSingle()).data?.id);
const masters = await admin
  .from("beat_audio_assets")
  .select("purpose,status,is_active")
  .eq("beat_id", (await admin.from("beats").select("id").eq("title", "Visual Fixture — Local Only").maybeSingle()).data?.id)
  .eq("purpose", "MASTER")
  .eq("is_active", true);

console.log(
  JSON.stringify(
    {
      apiHostKind: "LOOPBACK",
      localRoleCounts: byRole,
      localAdminCount: localAdmin,
      localModeratorCount: localMod,
      localUserCount: localUser,
      fixture: beat.data
        ? {
            status: beat.data.status,
            ownership: beat.data.ownership_type,
            rightsBasisKinds: (basis.data || []).map((r) => r.basis_kind),
            rightsBasisCount: basis.data?.length ?? 0,
            activeMasterReady: (masters.data || []).some((m) => m.status === "READY"),
          }
        : { missing: true },
      mutations: "NONE",
    },
    null,
    2,
  ),
);
