/**
 * Local RLS: beat owner SELECT on own beat_audio_assets (incl. DRAFT).
 * Opt-in: BRD_INTEGRATION_TESTS=1 + LOCAL_SUPABASE_* + BEAT_AUDIO_OWNER_SELECT_LOCAL_TEST=1.
 * Never reads .env.local. Aborts on non-loopback URL.
 */
import { execFileSync } from "child_process";
import { randomUUID } from "node:crypto";

import { describe, expect, it } from "vitest";

import { resolveIntegrationEnv } from "@/test/integration-env";

const integration =
  process.env.BEAT_AUDIO_OWNER_SELECT_LOCAL_TEST === "1"
    ? resolveIntegrationEnv()
    : ({ enabled: false, reason: "BEAT_AUDIO_OWNER_SELECT_LOCAL_TEST=1 not set" } as const);

const enabled = integration.enabled;
const dbContainer =
  process.env.BRD_LOCAL_DB_CONTAINER ?? "supabase_db_bitrymdym-local";

function psql(sql: string, user: "postgres" | "authenticator" = "postgres") {
  return execFileSync(
    "docker",
    [
      "exec",
      "-i",
      "-e",
      "PGPASSWORD=postgres",
      dbContainer,
      "psql",
      "-X",
      "-q",
      "-At",
      "-v",
      "ON_ERROR_STOP=1",
      "-h",
      "127.0.0.1",
      "-U",
      user,
      "-d",
      "postgres",
    ],
    { input: sql, encoding: "utf8", stdio: ["pipe", "pipe", "pipe"] },
  ).trim();
}

describe.runIf(enabled)("beat_audio_assets owner SELECT RLS (local)", () => {
  it("policy beat_audio_assets_select_own exists for authenticated SELECT", () => {
    const name = psql(`
SELECT pol.polname
FROM pg_policy pol
WHERE pol.polrelid = 'public.beat_audio_assets'::regclass
  AND pol.polname = 'beat_audio_assets_select_own'
  AND pol.polcmd = 'r';
`);
    expect(name).toBe("beat_audio_assets_select_own");
  });

  it("private DRAFT+MASTER READY: owner sees beat+asset; peer/anon see neither (transactional fixture)", () => {
    // IDs stay in-process only — never logged or written to evidence files.
    const ownerId = randomUUID();
    const peerId = randomUUID();
    const beatId = randomUUID();
    const assetId = randomUUID();
    expect(ownerId).not.toBe(peerId);

    const raw = psql(`
BEGIN;

INSERT INTO auth.users (id, email, aud, role, raw_user_meta_data)
VALUES (
  ${psqlLiteral(ownerId)}::uuid,
  ${psqlLiteral(`rls-own-${ownerId.slice(0, 8)}@bitrymdym.test`)},
  'authenticated',
  'authenticated',
  '{"display_name":"RLS own"}'::jsonb
);

SET LOCAL ROLE service_role;
SELECT set_config('request.jwt.claims', '{"role":"service_role"}', true);

INSERT INTO public.beats (
  id, ownership_type, owner_id, title, bpm, duration_seconds, status, tags
)
VALUES (
  ${psqlLiteral(beatId)}::uuid,
  'USER',
  ${psqlLiteral(ownerId)}::uuid,
  ${psqlLiteral(`RLS DRAFT fixture ${beatId.slice(0, 8)}`)},
  120,
  30,
  'DRAFT',
  '{}'
);

INSERT INTO public.beat_audio_assets (
  id, beat_id, purpose, status, object_key, content_type, byte_size, checksum_sha256, is_active
)
VALUES (
  ${psqlLiteral(assetId)}::uuid,
  ${psqlLiteral(beatId)}::uuid,
  'MASTER',
  'READY',
  ${psqlLiteral(`user/${ownerId}/${beatId}/${assetId}.bin`)},
  'audio/wav',
  4096,
  repeat('a', 64),
  true
);

RESET ROLE;
SET LOCAL ROLE authenticated;
SELECT set_config(
  'request.jwt.claims',
  ${psqlLiteral(JSON.stringify({ sub: ownerId, role: "authenticated" }))},
  true
);
SELECT 'OWNER_BEAT=' || count(*)::text
FROM public.beats WHERE id = ${psqlLiteral(beatId)}::uuid;
SELECT 'OWNER_ASSET=' || count(*)::text
FROM public.beat_audio_assets
WHERE beat_id = ${psqlLiteral(beatId)}::uuid
  AND purpose = 'MASTER'
  AND is_active
  AND status = 'READY';

SELECT set_config(
  'request.jwt.claims',
  ${psqlLiteral(JSON.stringify({ sub: peerId, role: "authenticated" }))},
  true
);
SELECT 'PEER_BEAT=' || count(*)::text
FROM public.beats WHERE id = ${psqlLiteral(beatId)}::uuid;
SELECT 'PEER_ASSET=' || count(*)::text
FROM public.beat_audio_assets WHERE beat_id = ${psqlLiteral(beatId)}::uuid;

RESET ROLE;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT 'ANON_BEAT=' || count(*)::text
FROM public.beats WHERE id = ${psqlLiteral(beatId)}::uuid;
SELECT 'ANON_ASSET=' || count(*)::text
FROM public.beat_audio_assets WHERE beat_id = ${psqlLiteral(beatId)}::uuid;

ROLLBACK;
`);

    const counts = parseLabeledCounts(raw);
    expect(counts.OWNER_BEAT).toBe(1);
    expect(counts.OWNER_ASSET).toBe(1);
    expect(counts.PEER_BEAT).toBe(0);
    expect(counts.PEER_ASSET).toBe(0);
    expect(counts.ANON_BEAT).toBe(0);
    expect(counts.ANON_ASSET).toBe(0);

    // Fixture must not survive the rolled-back transaction.
    const leftover = lastNumeric(
      psql(`
SELECT count(*)::text
FROM public.beats
WHERE id = ${psqlLiteral(beatId)}::uuid;
`),
    );
    expect(leftover).toBe(0);
  });

  it("owner SELECT works; peer/anon isolated on non-PUBLISHED; PUBLISHED catalog intact", () => {
    const publishedTitle = "Visual Fixture — Published Local Only";
    const nonPublishedTitle = "Visual Fixture — Local Only";

    const pubRow = psql(`
SELECT b.id::text || '|' || b.owner_id::text || '|' || b.status::text
FROM public.beats b
WHERE b.title = ${psqlLiteral(publishedTitle)}
LIMIT 1;
`);
    expect(pubRow).toMatch(/\|/);
    const [pubBeatId, ownerId, pubStatus] = pubRow.split("|");
    expect(pubBeatId && ownerId).toBeTruthy();

    const nonPubMeta = psql(`
SELECT b.id::text || '|' || b.owner_id::text || '|' || b.status::text
FROM public.beats b
WHERE b.title = ${psqlLiteral(nonPublishedTitle)}
LIMIT 1;
`);
    expect(nonPubMeta).toMatch(/\|/);
    const [nonPubBeatIdEarly, nonPubOwnerId, nonPubStatusEarly] =
      nonPubMeta.split("|");
    expect(nonPubStatusEarly).not.toBe("PUBLISHED");

    const peerId = psql(`
SELECT p.id::text
FROM public.profiles p
WHERE p.role = 'USER'
  AND p.id IS DISTINCT FROM ${psqlLiteral(ownerId!)}
  AND p.id IS DISTINCT FROM ${psqlLiteral(nonPubOwnerId!)}
LIMIT 1;
`);
    expect(peerId.length).toBeGreaterThan(10);

    const ownerCount = lastNumeric(
      psql(
        `
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', ${psqlLiteral(
          JSON.stringify({ sub: ownerId, role: "authenticated" }),
        )}, true);
SELECT count(*)::text
FROM public.beat_audio_assets a
WHERE a.beat_id = ${psqlLiteral(pubBeatId!)}::uuid
  AND a.purpose = 'MASTER'
  AND a.is_active = true
  AND a.status = 'READY';
COMMIT;
`,
        "authenticator",
      ),
    );
    expect(ownerCount).toBeGreaterThanOrEqual(1);

    const peerOnPublished = lastNumeric(
      psql(
        `
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', ${psqlLiteral(
          JSON.stringify({ sub: peerId, role: "authenticated" }),
        )}, true);
SELECT count(*)::text
FROM public.beat_audio_assets a
WHERE a.beat_id = ${psqlLiteral(pubBeatId!)}::uuid;
COMMIT;
`,
        "authenticator",
      ),
    );
    // Owner SELECT must not weaken published catalog: peer may see PUBLISHED assets.
    if (pubStatus === "PUBLISHED") {
      expect(peerOnPublished).toBeGreaterThanOrEqual(1);
    } else {
      expect(peerOnPublished).toBe(0);
    }

    const peerOnNonPublished = lastNumeric(
      psql(
        `
BEGIN;
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claims', ${psqlLiteral(
          JSON.stringify({ sub: peerId, role: "authenticated" }),
        )}, true);
SELECT count(*)::text
FROM public.beat_audio_assets a
WHERE a.beat_id = ${psqlLiteral(nonPubBeatIdEarly!)}::uuid;
COMMIT;
`,
        "authenticator",
      ),
    );
    expect(peerOnNonPublished).toBe(0);

    const anonOnNonPublished = lastNumeric(
      psql(
        `
BEGIN;
SET LOCAL ROLE anon;
SELECT set_config('request.jwt.claims', '{"role":"anon"}', true);
SELECT count(*)::text
FROM public.beat_audio_assets a
WHERE a.beat_id = ${psqlLiteral(nonPubBeatIdEarly!)}::uuid
  AND a.is_active = true
  AND a.status = 'READY';
COMMIT;
`,
        "authenticator",
      ),
    );
    expect(anonOnNonPublished).toBe(0);
  });

  it("does not grant INSERT/UPDATE/DELETE via new policy (admin-only mutations unchanged)", () => {
    const cmds = psql(`
SELECT polcmd::text
FROM pg_policy
WHERE polrelid = 'public.beat_audio_assets'::regclass
  AND polname = 'beat_audio_assets_select_own';
`);
    expect(cmds).toBe("r");
  });
});

function psqlLiteral(value: string): string {
  return `'${value.replace(/'/g, "''")}'`;
}

/** set_config also emits a row under -At; take the last integer token. */
function lastNumeric(raw: string): number {
  const lines = raw
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  for (let i = lines.length - 1; i >= 0; i--) {
    if (/^\d+$/.test(lines[i]!)) return Number(lines[i]);
  }
  return Number.NaN;
}

function parseLabeledCounts(raw: string): Record<string, number> {
  const out: Record<string, number> = {};
  for (const line of raw.split(/\r?\n/)) {
    const m = line.trim().match(
      /^(OWNER_BEAT|OWNER_ASSET|PEER_BEAT|PEER_ASSET|ANON_BEAT|ANON_ASSET)=(\d+)$/,
    );
    if (m) out[m[1]!] = Number(m[2]);
  }
  return out;
}
