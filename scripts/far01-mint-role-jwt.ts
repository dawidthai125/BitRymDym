/**
 * Mint FAR-01 operator JWTs into gitignored .env.far01.local.
 *
 * Roles:
 *   live_mutator → FAR01_LIVE_MUTATOR_KEY (role=far01_live_mutator)
 *   readonly     → FAR01_DRYRUN_READONLY_KEY (role=far01_dryrun_readonly)
 *
 * Signing secret (never printed):
 *   SUPABASE_JWT_SECRET from process env or gitignored .env.far01.local
 *
 *   npx tsx scripts/far01-mint-role-jwt.ts live_mutator
 *   npx tsx scripts/far01-mint-role-jwt.ts readonly
 */

import { createHmac } from "node:crypto";
import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { resolve } from "node:path";

const ENV_FILE = resolve(process.cwd(), ".env.far01.local");
/** Short-lived operator JWT (Architect: short TTL). */
const TTL_SECONDS = 60 * 60 * 24; // 24h

type Target =
  | {
      kind: "live_mutator";
      pgRole: "far01_live_mutator";
      classKey: "FAR01_LIVE_CREDENTIAL_CLASS";
      classVal: "live_mutator";
      jwtKey: "FAR01_LIVE_MUTATOR_KEY";
      urlKey: "FAR01_LIVE_SUPABASE_URL";
    }
  | {
      kind: "readonly";
      pgRole: "far01_dryrun_readonly";
      classKey: "FAR01_DRYRUN_CREDENTIAL_CLASS";
      classVal: "readonly";
      jwtKey: "FAR01_DRYRUN_READONLY_KEY";
      urlKey: "FAR01_DRYRUN_SUPABASE_URL";
    };

function loadEnvFile(path: string): void {
  if (!existsSync(path)) return;
  for (const line of readFileSync(path, "utf8").split(/\r?\n/)) {
    if (!line || line.trimStart().startsWith("#")) continue;
    const i = line.indexOf("=");
    if (i <= 0) continue;
    const k = line.slice(0, i).trim();
    let v = line.slice(i + 1).trim();
    if (
      (v.startsWith('"') && v.endsWith('"')) ||
      (v.startsWith("'") && v.endsWith("'"))
    ) {
      v = v.slice(1, -1);
    }
    if (v.length > 0) process.env[k] = v;
  }
}

function targetFor(arg: string | undefined): Target {
  if (arg === "readonly" || arg === "r1") {
    return {
      kind: "readonly",
      pgRole: "far01_dryrun_readonly",
      classKey: "FAR01_DRYRUN_CREDENTIAL_CLASS",
      classVal: "readonly",
      jwtKey: "FAR01_DRYRUN_READONLY_KEY",
      urlKey: "FAR01_DRYRUN_SUPABASE_URL",
    };
  }
  if (arg === "live_mutator" || arg === "live" || arg == null) {
    return {
      kind: "live_mutator",
      pgRole: "far01_live_mutator",
      classKey: "FAR01_LIVE_CREDENTIAL_CLASS",
      classVal: "live_mutator",
      jwtKey: "FAR01_LIVE_MUTATOR_KEY",
      urlKey: "FAR01_LIVE_SUPABASE_URL",
    };
  }
  console.error(
    "FAIL: usage npx tsx scripts/far01-mint-role-jwt.ts [live_mutator|readonly]",
  );
  process.exit(2);
}

function b64url(buf: Buffer): string {
  return buf
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/g, "");
}

function mintHs256Jwt(secret: string, role: string): {
  jwt: string;
  iat: number;
  exp: number;
} {
  const now = Math.floor(Date.now() / 1000);
  const iat = now;
  const exp = now + TTL_SECONDS;
  const header = b64url(
    Buffer.from(JSON.stringify({ alg: "HS256", typ: "JWT" }), "utf8"),
  );
  const payload = b64url(
    Buffer.from(
      JSON.stringify({
        iss: "supabase",
        role,
        iat,
        exp,
      }),
      "utf8",
    ),
  );
  const data = `${header}.${payload}`;
  const sig = createHmac("sha256", secret).update(data).digest();
  return { jwt: `${data}.${b64url(sig)}`, iat, exp };
}

function upsertEnvLines(
  existing: string,
  updates: Record<string, string>,
): string {
  const keys = new Set(Object.keys(updates));
  const lines = existing.split(/\r?\n/);
  const out: string[] = [];
  const seen = new Set<string>();
  for (const line of lines) {
    const m = /^([A-Z0-9_]+)=(.*)$/.exec(line);
    if (m && keys.has(m[1]!)) {
      out.push(`${m[1]}=${updates[m[1]!]!}`);
      seen.add(m[1]!);
    } else {
      out.push(line);
    }
  }
  for (const [k, v] of Object.entries(updates)) {
    if (!seen.has(k)) out.push(`${k}=${v}`);
  }
  return `${out.filter((l, i) => !(i === out.length - 1 && l === "")).join("\n")}\n`;
}

function main(): void {
  loadEnvFile(resolve(process.cwd(), ".env.local"));
  loadEnvFile(ENV_FILE);

  const target = targetFor(process.argv[2]);
  const secret = process.env.SUPABASE_JWT_SECRET?.trim();
  if (!secret || secret.length < 16) {
    console.error(
      "FAIL: SUPABASE_JWT_SECRET missing/short. Place in gitignored .env.far01.local or process env (not chat). Exit 2.",
    );
    process.exit(2);
  }

  const url =
    process.env[target.urlKey]?.trim() ||
    process.env.FAR01_DRYRUN_SUPABASE_URL?.trim() ||
    process.env.FAR01_LIVE_SUPABASE_URL?.trim() ||
    process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    console.error(`FAIL: missing project URL for ${target.urlKey}`);
    process.exit(2);
  }

  const { jwt, iat, exp } = mintHs256Jwt(secret, target.pgRole);
  if (jwt.split(".").length !== 3) {
    console.error("FAIL: mint produced invalid JWT structure");
    process.exit(2);
  }

  const prior = existsSync(ENV_FILE) ? readFileSync(ENV_FILE, "utf8") : "";
  const next = upsertEnvLines(prior, {
    [target.urlKey]: url,
    [target.classKey]: target.classVal,
    [target.jwtKey]: jwt,
  });
  writeFileSync(ENV_FILE, next, "utf8");

  // Metadata only — never print jwt/secret
  console.log(
    JSON.stringify({
      status: "MINTED",
      created: true,
      kind: target.kind,
      role: target.pgRole,
      credential_class: target.classVal,
      env_key: target.jwtKey,
      iat_unix: iat,
      exp_unix: exp,
      expires_at: new Date(exp * 1000).toISOString(),
      ttl_seconds: TTL_SECONDS,
      store: ".env.far01.local",
      gitignored: true,
    }),
  );
}

main();
