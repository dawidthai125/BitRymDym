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
const admin = createClient(st.API_URL.replace(/\/$/, ""), st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const beat = await admin
  .from("beats")
  .select("id,status")
  .eq("title", "Visual Fixture — Local Only")
  .maybeSingle();
const basis = await admin
  .from("beat_rights_basis")
  .select("basis_kind,statement_version,accepted_at")
  .eq("beat_id", beat.data.id);
const master = await admin
  .from("beat_audio_assets")
  .select("status,is_active,checksum_sha256")
  .eq("beat_id", beat.data.id)
  .eq("purpose", "MASTER")
  .eq("is_active", true);
console.log(
  JSON.stringify(
    {
      status: beat.data.status,
      basisKinds: (basis.data || []).map((r) => r.basis_kind),
      basisCount: basis.data?.length ?? 0,
      basisError: basis.error?.message?.slice(0, 80) || null,
      masterReady: (master.data || []).some((m) => m.status === "READY"),
      masterHasChecksum: (master.data || []).some(
        (m) => typeof m.checksum_sha256 === "string" && m.checksum_sha256.length > 10,
      ),
    },
    null,
    2,
  ),
);
