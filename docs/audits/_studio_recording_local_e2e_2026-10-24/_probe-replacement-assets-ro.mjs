/** READ-ONLY asset status for replacement title — kinds only, no ids. */
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
    if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'")))
      v = v.slice(1, -1);
    out[m[1]] = v;
  }
  return out;
}

const st = parseStatusEnv();
const api = (st.API_URL || "").replace(/\/$/, "");
const admin = createClient(api, st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

for (const title of [
  "Visual Fixture — Published Local Only",
  "Visual Fixture — Local Only",
]) {
  const beat = await admin
    .from("beats")
    .select("status,ownership_type")
    .eq("title", title)
    .maybeSingle();
  if (!beat.data) {
    console.log(JSON.stringify({ title, missing: true }));
    continue;
  }
  const idq = await admin.from("beats").select("id").eq("title", title).maybeSingle();
  const assets = await admin
    .from("beat_audio_assets")
    .select("purpose,status,is_active")
    .eq("beat_id", idq.data.id);
  const basis = await admin
    .from("beat_rights_basis")
    .select("basis_kind")
    .eq("beat_id", idq.data.id);
  console.log(
    JSON.stringify({
      titleKind: title.includes("Published") ? "replacement" : "blocked-original",
      status: beat.data.status,
      ownership: beat.data.ownership_type,
      assets: assets.data || [],
      assetError: assets.error?.message?.slice(0, 80) || null,
      rightsBasisCount: basis.data?.length ?? 0,
    }),
  );
}
