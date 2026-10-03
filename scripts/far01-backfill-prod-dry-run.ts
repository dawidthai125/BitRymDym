/**
 * FAR-01 production READ-ONLY dry-run entrypoint (IA-6).
 *
 * Implementation GO: YES (capability).
 * Production Dry-Run Execution GO: NO — do not run against production
 * until a separate Owner ops GO.
 *
 * Backfill GO / OD-BF-08: NO
 * Canary / LIVE / retirement: REFUSED
 *
 * Usage (after credentials provisioned + Owner execution GO):
 *   npx tsx scripts/far01-backfill-prod-dry-run.ts \
 *     --operator-id=<id> \
 *     --git-sha=<sha> \
 *     [--out=docs/audits/evidence/<file>.json]
 *
 * Env (R1 — names only; values never in git):
 *   FAR01_DRYRUN_SUPABASE_URL
 *   FAR01_DRYRUN_READONLY_KEY
 *   FAR01_DRYRUN_CREDENTIAL_CLASS=readonly
 *
 * Fixture CLI remains: scripts/far01-backfill-dry-run.ts
 */

import { runFar01ProdDryRun } from "../src/lib/beats/far01-backfill/prod-dry-run";
import { Far01CredentialGateError } from "../src/lib/beats/far01-backfill/errors";

function argValue(name: string): string | undefined {
  const prefix = `${name}=`;
  for (const a of process.argv.slice(2)) {
    if (a.startsWith(prefix)) return a.slice(prefix.length);
    if (a === name) {
      const idx = process.argv.indexOf(a);
      return process.argv[idx + 1];
    }
  }
  return undefined;
}

function hasFlag(flag: string): boolean {
  return process.argv.includes(flag);
}

async function main(): Promise<void> {
  const liveRequested =
    hasFlag("--live") ||
    process.env.FAR01_BACKFILL_MODE === "LIVE" ||
    process.env.FAR01_DRYRUN_MODE === "LIVE";

  if (liveRequested) {
    console.error(
      JSON.stringify({
        error: "LIVE_REFUSED",
        message:
          "scripts/far01-backfill-prod-dry-run.ts refuses LIVE. OD-BF-08 BACKFILL GO = NO.",
        backfillGo: false,
        retirementGo: false,
      }),
    );
    process.exit(2);
  }

  const operatorId = argValue("--operator-id") ?? argValue("--operatorId");
  const gitSha =
    argValue("--git-sha") ??
    argValue("--gitSha") ??
    process.env.FAR01_DRYRUN_GIT_SHA;
  const outputPath = argValue("--out") ?? argValue("--output");

  if (!operatorId) {
    console.error(
      JSON.stringify({
        error: "OPERATOR_ID_REQUIRED",
        message: "--operator-id is required (fail closed)",
      }),
    );
    process.exit(2);
  }
  if (!gitSha) {
    console.error(
      JSON.stringify({
        error: "GIT_SHA_REQUIRED",
        message: "--git-sha or FAR01_DRYRUN_GIT_SHA is required (fail closed)",
      }),
    );
    process.exit(2);
  }

  try {
    const result = await runFar01ProdDryRun({
      operatorId,
      gitSha,
      liveRequested: false,
      outputPath,
    });

    console.log(
      JSON.stringify(
        {
          notice:
            "FAR-01 production read-only dry-run archive written. No Storage/DB mutation.",
          implementationGo: true,
          productionDryRunExecutionGo: "separate_owner_gate",
          backfillGo: false,
          retirementGo: false,
          archivePath: result.archivePath,
          batch_id: result.archive.batch_id,
          live_mutations_attempted: result.archive.live_mutations_attempted,
          inventory: result.archive.inventory,
          counts: result.archive.counts,
        },
        null,
        2,
      ),
    );
  } catch (err) {
    if (err instanceof Far01CredentialGateError) {
      console.error(
        JSON.stringify({
          error: "CREDENTIAL_GATE",
          message: err.message,
        }),
      );
      process.exit(2);
    }
    console.error(err);
    process.exit(1);
  }
}

main();
