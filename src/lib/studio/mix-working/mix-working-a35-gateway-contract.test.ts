/**
 * A3.5 — gateway cutover + parent-in-TX + migration UX contracts (source).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

const ROOT = process.cwd();

function read(rel: string): string {
  return readFileSync(join(ROOT, rel), "utf8");
}

describe("A3.5 Mix Working complete history — gateway contracts", () => {
  const applyService = read("src/lib/studio/mix-working-apply-service.ts");
  const studioService = read("src/lib/studio/studio-service.ts");
  const migration = read(
    "supabase/migrations/20261028070155_studio_mix_working_parent_in_tx.sql",
  );
  const control = read(
    "src/components/studio/studio-mix-revision-history-control.tsx",
  );

  it("apply service does not pre-read parentRevisionId before RPC", () => {
    expect(applyService).not.toMatch(/loadLatestRevisionId/);
    expect(applyService).toMatch(/do not pre-read or pass parentRevisionId/);
    expect(applyService).toMatch(/studio_cas_apply_mix_working_ops/);
  });

  it("RPC resolves parent from source_document_version = p_expected under lock", () => {
    expect(migration).toMatch(/pg_advisory_xact_lock/);
    expect(migration).toMatch(/FOR UPDATE/);
    expect(migration).toMatch(/source_document_version = p_expected/);
    expect(migration).toMatch(
      /parentRevisionId from client\/service is NOT authoritative/,
    );
    expect(migration).toMatch(
      /studio_mix_working_revisions_project_source_version_uidx/,
    );
  });

  it("master mix / track FX / master FX / track controls allowlist delegate to gateway", () => {
    expect(studioService).toMatch(/set_master_mix/);
    expect(studioService).toMatch(/set_track_fx/);
    expect(studioService).toMatch(/set_master_fx/);
    expect(studioService).toMatch(/set_track_controls/);
    expect(studioService).toMatch(/applyStudioMixWorkingOpsFor/);
    expect(studioService).toMatch(/applyStudioFxChainViaMixWorking/);
    // Legacy FX RPC must not be the editor write path anymore.
    expect(studioService).not.toMatch(
      /admin\.rpc\(\s*["']studio_cas_apply_fx_chain["']/,
    );
  });

  it("structural track fields still use legacy CAS (outside Mix Working allowlist)", () => {
    expect(studioService).toMatch(/studio_cas_update_track_controls/);
    expect(studioService).toMatch(/recordArmed/);
  });

  it("migration UX notice is always rendered in open history dialog", () => {
    expect(control).toMatch(
      /data-testid="studio-mix-history-migration-notice"/,
    );
    expect(control).toMatch(/data-brd-mix-history-migration-notice="a35"/);
    expect(control).toMatch(/parametry miksu/);
  });
});
