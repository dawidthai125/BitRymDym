/**
 * Probe local Auth users by role kind only — no emails/secrets printed.
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
  console.error("ABORT_NON_LOOPBACK");
  process.exit(2);
}
const admin = createClient(api, st.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const listed = await admin.auth.admin.listUsers({ page: 1, perPage: 200 });
const summary = { localTotal: 0, byRole: {}, kinds: [] };
for (const u of listed.data?.users || []) {
  const email = u.email || "";
  if (!email.endsWith("@localhost.local")) continue;
  summary.localTotal += 1;
  const kind = email.startsWith("theme-visual-")
    ? "theme-visual"
    : email.startsWith("theme-mod-")
      ? "theme-mod"
      : "other-local";
  const prof = await admin
    .from("profiles")
    .select("role")
    .eq("id", u.id)
    .maybeSingle();
  const role = prof.data?.role ?? "UNKNOWN";
  summary.byRole[role] = (summary.byRole[role] || 0) + 1;
  summary.kinds.push({ kind, role });
}
const beat = await admin
  .from("beats")
  .select("status,ownership_type")
  .eq("title", "Visual Fixture — Local Only")
  .maybeSingle();
const staffExists = summary.kinds.some(
  (k) =>
    (k.role === "ADMIN" || k.role === "MODERATOR") &&
    k.kind !== "theme-visual",
);
console.log(
  JSON.stringify(
    {
      apiHostKind: "LOOPBACK",
      localUsers: summary,
      staffNonOwnerExists: staffExists,
      fixture: beat.data
        ? { status: beat.data.status, ownership: beat.data.ownership_type }
        : { missing: true },
    },
    null,
    2,
  ),
);
