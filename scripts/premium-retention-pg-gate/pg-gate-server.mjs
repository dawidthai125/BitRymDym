/**
 * Throwaway PostgreSQL 17 cluster for the Premium Retention pre-deploy gate.
 *
 * - Binaries + `pg` client come from BRD_PG_GATE_DEPS (default %TEMP%\brd-pg-gate,
 *   `npm i embedded-postgres@17.10.0-beta.17 pg@8.16.3` there) — nothing is added to the repo.
 * - Fresh cluster per run under the OS temp dir; listens on 127.0.0.1 only; trust auth.
 * - Never reads .env files and never accepts a connection string from the environment.
 */
import { execFileSync } from "node:child_process";
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));
export const repoRoot = path.resolve(here, "..", "..");
const depsDir = process.env.BRD_PG_GATE_DEPS ?? path.join(os.tmpdir(), "brd-pg-gate");
const requireDeps = createRequire(path.join(depsDir, "package.json"));

export const pg = requireDeps("pg");
const binDir = path.join(
  depsDir, "node_modules", "@embedded-postgres", `${process.platform === "win32" ? "windows" : process.platform}-x64`,
  "native", "bin",
);

export const HOST = "127.0.0.1";
export const DATABASE = "brd_gate";
const BOOTSTRAP = "supabase_admin";

function bin(name) {
  return path.join(binDir, process.platform === "win32" ? `${name}.exe` : name);
}

export function client(port, user) {
  return new pg.Client({ host: HOST, port, user, database: DATABASE, application_name: "brd-pg-gate" });
}

async function runAs(port, user, database, sql) {
  const c = new pg.Client({ host: HOST, port, user, database });
  await c.connect();
  try {
    await c.query(sql);
  } finally {
    await c.end();
  }
}

export async function startGateServer({ port = 55432 } = {}) {
  const tmpRoot = path.resolve(os.tmpdir());
  const dataDir = mkdtempSync(path.join(tmpRoot, "brd-pg-gate-data-"));
  if (!dataDir.startsWith(tmpRoot)) throw new Error("data dir must live under the OS temp dir");
  const pwFile = path.join(dataDir, "..", `${path.basename(dataDir)}.pw`);
  writeFileSync(pwFile, "unused-local-trust\n");

  execFileSync(bin("initdb"), [
    "-D", dataDir, "-U", BOOTSTRAP, "-A", "trust", "-E", "UTF8", "--no-locale", "--pwfile", pwFile,
  ], { stdio: "pipe" });
  rmSync(pwFile, { force: true });

  execFileSync(bin("pg_ctl"), [
    "-D", dataDir, "-w", "-l", path.join(dataDir, "server.log"),
    "-o", `-p ${port} -c listen_addresses=${HOST} -c max_connections=40 -c fsync=off`,
    "start",
  ], { stdio: "ignore" });

  const stop = () => {
    try {
      execFileSync(bin("pg_ctl"), ["-D", dataDir, "-m", "fast", "-w", "stop"], { stdio: "pipe" });
    } finally {
      rmSync(dataDir, { recursive: true, force: true });
    }
  };

  try {
    await runAs(port, BOOTSTRAP, "postgres", `CREATE ROLE postgres LOGIN NOSUPERUSER CREATEROLE CREATEDB REPLICATION BYPASSRLS;`);
    await runAs(port, BOOTSTRAP, "postgres", `CREATE DATABASE ${DATABASE} OWNER postgres;`);
    const shim = readFileSync(path.join(here, "supabase-platform-shim.sql"), "utf8")
      .replace(/^CREATE ROLE postgres .*$/m, "");
    await runAs(port, BOOTSTRAP, DATABASE, shim);
    await runAs(port, BOOTSTRAP, DATABASE,
      `ALTER DATABASE ${DATABASE} SET search_path = "$user", public, extensions;`);

    const migrationsDir = path.join(repoRoot, "supabase", "migrations");
    const files = readdirSync(migrationsDir).filter((f) => f.endsWith(".sql")).sort();
    const applied = [];
    for (const f of files) {
      const sql = readFileSync(path.join(migrationsDir, f), "utf8");
      try {
        await runAs(port, "postgres", DATABASE, `BEGIN;\n${sql}\nCOMMIT;`);
        applied.push(f);
      } catch (e) {
        throw new Error(`migration ${f} failed: ${e.message}`);
      }
    }
    if (process.env.BRD_PG_GATE_NEGATIVE_CONTROL === "1") {
      await runAs(port, BOOTSTRAP, DATABASE, readFileSync(path.join(here, "negative-control.sql"), "utf8"));
    }
    return { port, dataDir, applied, stop };
  } catch (e) {
    stop();
    throw e;
  }
}
