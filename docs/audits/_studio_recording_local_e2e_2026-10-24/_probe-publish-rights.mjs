/**
 * Probe publish-rights facts for fixture — kinds only, no ids/checksums.
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
const admin = createClient(api, st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const beat = await admin
  .from("beats")
  .select("id,status")
  .eq("title", "Visual Fixture — Local Only")
  .maybeSingle();

const tables = [
  "beat_rights_attestations",
  "beat_rights_reviews",
  "beat_rights_statements",
  "rights_attestations",
  "rights_reviews",
];
const found = {};
for (const t of tables) {
  const r = await admin.from(t).select("*").eq("beat_id", beat.data.id).limit(5);
  found[t] = {
    exists: !r.error,
    error: r.error?.code || r.error?.message?.slice(0, 40) || null,
    count: r.data?.length ?? 0,
    sampleKeys: r.data?.[0] ? Object.keys(r.data[0]).filter((k) => !/id|hash|checksum|sha|email/i.test(k)) : [],
  };
}

// Also try common column patterns via information_schema-ish: just list related
const att = await admin
  .from("beat_user_rights_attestations")
  .select("statement_version,created_at")
  .eq("beat_id", beat.data.id)
  .limit(3);
found.beat_user_rights_attestations = {
  exists: !att.error,
  error: att.error?.code || att.error?.message?.slice(0, 60) || null,
  count: att.data?.length ?? 0,
};

console.log(
  JSON.stringify(
    {
      fixtureStatus: beat.data?.status,
      rightsTables: found,
    },
    null,
    2,
  ),
);
