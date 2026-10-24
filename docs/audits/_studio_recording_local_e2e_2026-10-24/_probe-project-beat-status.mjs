/**
 * Read local projects for fixture owner — titles/status kinds only.
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
const admin = createClient(st.API_URL.replace(/\/$/, ""), st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

const beat = await admin
  .from("beats")
  .select("id,status,owner_id,title")
  .eq("title", "Visual Fixture — Local Only")
  .maybeSingle();

const projects = await admin
  .from("studio_projects")
  .select("id,title,beat_id,owner_user_id,user_id,owner_id,updated_at")
  .limit(1);

// discover owner column by error
let ownerCol = null;
for (const col of ["owner_user_id", "user_id", "owner_id"]) {
  const r = await admin
    .from("studio_projects")
    .select(`id,beat_id,${col},updated_at`)
    .eq(col, beat.data.owner_id)
    .order("updated_at", { ascending: false })
    .limit(5);
  if (!r.error) {
    ownerCol = col;
    const rows = [];
    for (const p of r.data || []) {
      let beatInfo = null;
      if (p.beat_id) {
        const b = await admin
          .from("beats")
          .select("title,status")
          .eq("id", p.beat_id)
          .maybeSingle();
        beatInfo = b.data
          ? {
              isVisualFixture: b.data.title === "Visual Fixture — Local Only",
              status: b.data.status,
            }
          : { missing: true };
      }
      rows.push({ hasBeat: Boolean(p.beat_id), beat: beatInfo });
    }
    console.log(
      JSON.stringify(
        {
          fixtureStatus: beat.data.status,
          ownerCol,
          projectCount: rows.length,
          projects: rows,
        },
        null,
        2,
      ),
    );
    process.exit(0);
  }
}
console.log(
  JSON.stringify({
    fixtureStatus: beat.data?.status,
    projectProbeError: projects.error?.message?.slice(0, 120),
    ownerCol: null,
  }),
);
