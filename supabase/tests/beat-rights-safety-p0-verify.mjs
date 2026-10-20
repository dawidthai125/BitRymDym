/**
 * Rights Safety P0 — real Postgres sessions through docker exec.
 *
 * Does nothing unless all of these are set:
 *   BEAT_RIGHTS_LOCAL_DB_TEST=1
 *   BEAT_RIGHTS_DB_DISPOSABLE=1
 *   BEAT_RIGHTS_DB_CONTAINER=<name>
 *
 * Refuses port 5432, refuses a container that is not running, and never reads
 * .env files. Migrations are not applied by this file.
 */
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";

const enabled =
  process.env.BEAT_RIGHTS_LOCAL_DB_TEST === "1" &&
  process.env.BEAT_RIGHTS_DB_DISPOSABLE === "1";
const container = process.env.BEAT_RIGHTS_DB_CONTAINER ?? "";

if (!enabled || !container) {
  console.log(
    "NOT RUN — isolated disposable database was not confirmed. Refusing to connect.",
  );
  process.exit(0);
}
if (container === "postgres" || /5432/.test(container)) {
  console.log("BLOCKED BY ENVIRONMENT — container name is not an isolated local database.");
  process.exit(2);
}

function docker(args) {
  return execFileSync("docker", args, { encoding: "utf8" }).trim();
}

let portLine = "";
try {
  portLine = docker(["port", container, "5432"]);
} catch (error) {
  console.log(`BLOCKED BY ENVIRONMENT — container ${container} is not running.`);
  process.exit(2);
}
if (/(^|:)5432->/.test(portLine) || portLine.endsWith(":5432")) {
  console.log("BLOCKED BY ENVIRONMENT — published port is 5432. Not connecting.");
  process.exit(2);
}

function psql(sql, user = "postgres") {
  return execFileSync(
    "docker",
    [
      "exec", "-i", "-e", "PGPASSWORD=postgres", container,
      "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
      "-h", "127.0.0.1", "-U", user, "-d", "postgres",
    ],
    { input: sql, encoding: "utf8" },
  ).trim();
}

function psqlResult(sql, user = "authenticator") {
  return new Promise((resolve) => {
    const child = spawn("docker", [
      "exec", "-i", "-e", "PGPASSWORD=postgres", container,
      "psql", "-X", "-q", "-At", "-v", "ON_ERROR_STOP=1",
      "-h", "127.0.0.1", "-U", user, "-d", "postgres",
    ], { stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (chunk) => (stdout += chunk));
    child.stderr.on("data", (chunk) => (stderr += chunk));
    child.on("close", (code) => resolve({ code: code ?? -1, stdout, stderr }));
    child.stdin.end(sql);
  });
}

const q = (value) => `'${String(value).replace(/'/g, "''")}'`;
const results = [];

function record(id, ok, detail) {
  results.push({ id, result: ok ? "PASS" : "FAIL", detail });
  console.log(`${ok ? "PASS" : "FAIL"} ${id} ${detail}`);
}

function claims(userId, role) {
  return `SET LOCAL ROLE ${role};
SET LOCAL request.jwt.claims = ${q(JSON.stringify({ sub: userId, role }))};`;
}

async function expectError(id, sql, token) {
  const outcome = await psqlResult(`BEGIN;\n${sql}\nCOMMIT;`);
  const blob = `${outcome.stdout}\n${outcome.stderr}`;
  record(id, outcome.code !== 0 && blob.includes(token), blob.slice(0, 400));
}

const owner = randomUUID();
const staff = randomUUID();
const outsider = randomUUID();
const beat = randomUUID();
const asset = randomUUID();
const hash = "ab".repeat(32);

psql(`
INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES
  (${q(owner)}, ${q(`${owner.slice(0, 8)}@rights.test`)}, 'authenticated', 'authenticated', '{}'::jsonb),
  (${q(staff)}, ${q(`${staff.slice(0, 8)}@rights.test`)}, 'authenticated', 'authenticated', '{}'::jsonb),
  (${q(outsider)}, ${q(`${outsider.slice(0, 8)}@rights.test`)}, 'authenticated', 'authenticated', '{}'::jsonb);
UPDATE public.profiles SET role = 'MODERATOR' WHERE id = ${q(staff)}::uuid;
`);

psql(`
INSERT INTO public.beats (
  id, ownership_type, owner_id, title, bpm, duration_seconds, status, tags
) VALUES (
  ${q(beat)}::uuid, 'USER', ${q(owner)}::uuid, 'Rights fixture', 120, 60, 'APPROVED', ARRAY[]::text[]
);
INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active
) VALUES (
  ${q(asset)}::uuid, ${q(beat)}::uuid, 'MASTER', 'READY', ${q(`${beat}.bin`)},
  'audio/wav', 4096, ${q(hash)}, true
);
`);

await expectError(
  "user-insert-published",
  `${claims(staff, "authenticated")}
   INSERT INTO public.beats (id, ownership_type, owner_id, title, bpm, duration_seconds, status, tags)
   VALUES (${q(randomUUID())}::uuid, 'USER', ${q(owner)}::uuid, 'Bad', 120, 60, 'PUBLISHED', ARRAY[]::text[]);`,
  "RIGHTS_PUBLISH_INSERT_FORBIDDEN",
);

await expectError(
  "service-insert-published",
  `${claims(null, "service_role").replace('"sub":null,', "")}
   INSERT INTO public.beats (id, ownership_type, owner_id, title, bpm, duration_seconds, status, tags)
   VALUES (${q(randomUUID())}::uuid, 'PLATFORM', NULL, 'Bad platform', 120, 60, 'PUBLISHED', ARRAY[]::text[]);`,
  "RIGHTS_PUBLISH_INSERT_FORBIDDEN",
);

await expectError(
  "user-publish-without-attestation",
  `${claims(staff, "authenticated")}
   UPDATE public.beats SET status = 'PUBLISHED' WHERE id = ${q(beat)}::uuid;`,
  "RIGHTS_ATTESTATION_REQUIRED",
);

const sessionA = psqlResult(`BEGIN;
${claims(staff, "authenticated")}
INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
VALUES (${q(hash)}, 'block', 'race A', ${q(staff)}::uuid);
SELECT pg_sleep(2);
COMMIT;`);
await new Promise((resolve) => setTimeout(resolve, 300));
const sessionB = await psqlResult(`BEGIN;
${claims(staff, "authenticated")}
INSERT INTO public.beat_blocked_audio_hashes (checksum_sha256, event_kind, reason, actor_id)
VALUES (${q(hash)}, 'lift', 'race B', ${q(staff)}::uuid);
COMMIT;`);
const sessionADone = await sessionA;
const seq = psql(
  `SELECT string_agg(event_seq::text || ':' || event_kind, ',' ORDER BY event_seq)
   FROM public.beat_blocked_audio_hashes WHERE checksum_sha256 = ${q(hash)};`,
);
record(
  "block-versus-lift",
  sessionADone.code === 0 && sessionB.code === 0 && seq === "1:block,2:lift",
  `seq=${seq} A=${sessionADone.code} B=${sessionB.code}`,
);

console.log(JSON.stringify(results, null, 2));
process.exit(results.some((row) => row.result === "FAIL") ? 1 : 0);
