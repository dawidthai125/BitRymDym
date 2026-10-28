/**
 * A1 — source contracts for Mix Working atomic apply.
 * No production DB. SQL integration marked NOT RUN when local DB unavailable.
 */

import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

import {
  httpStatusForMixWorkingApplyError,
  MixWorkingApplyError,
} from "@/lib/studio/mix-working/mix-working-apply-errors";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import { classifyPersistHttpFailure } from "@/lib/studio/studio-persist-orchestrator";
import { StudioFxCasConflictError } from "@/lib/studio/studio-fx-chain";
import { AuthError } from "@/lib/auth/session";

function read(rel: string): string {
  return readFileSync(path.join(process.cwd(), rel), "utf8");
}

const MIGRATION =
  "supabase/migrations/20261020220000_studio_mix_working_apply.sql";
const SERVICE = "src/lib/studio/mix-working-apply-service.ts";
const ROUTE =
  "src/app/api/studio/projects/[projectId]/mix-working/apply/route.ts";

describe("A1 Mix Working — migration SQL contracts", () => {
  const sql = read(MIGRATION);

  it("defines idempotency table + unique key + succeeded-only status", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.studio_mix_working_idempotency/);
    expect(sql).toMatch(/UNIQUE \(owner_id, project_id, request_id\)/);
    expect(sql).toMatch(/CHECK \(status = 'succeeded'\)/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.studio_mix_working_idempotency/);
    expect(sql).toMatch(/FROM PUBLIC, anon, authenticated/);
    expect(sql).toMatch(
      /GRANT ALL ON TABLE public\.studio_mix_working_idempotency TO service_role/,
    );
  });

  it("defines SECURITY DEFINER RPC with safe search_path and service_role only", () => {
    expect(sql).toMatch(/studio_cas_apply_mix_working_ops/);
    expect(sql).toMatch(/SECURITY DEFINER/);
    expect(sql).toMatch(/SET search_path = public/);
    expect(sql).toMatch(
      /REVOKE ALL ON FUNCTION public\.studio_cas_apply_mix_working_ops/,
    );
    expect(sql).toMatch(/FROM anon, authenticated/);
    expect(sql).toMatch(
      /GRANT EXECUTE ON FUNCTION public\.studio_cas_apply_mix_working_ops/,
    );
    expect(sql).toMatch(/TO service_role/);
  });

  it("uses advisory 87245130 + CAS expected + single bump", () => {
    expect(sql).toMatch(
      /pg_advisory_xact_lock\(87245130, hashtext\(p_project_id::text\)\)/,
    );
    expect(sql).toMatch(/document_version = p_expected/);
    expect(sql).toMatch(/document_version = sp\.document_version \+ 1/);
    expect(sql).toMatch(/v_new <> p_expected \+ 1/);
  });

  it("enforces patch allowlist and idempotency reuse/replay", () => {
    expect(sql).toMatch(/IDEMPOTENCY_KEY_REUSE/);
    expect(sql).toMatch(/MIX_WORKING_PATCH_INVALID/);
    expect(sql).toMatch(/gain_db.*pan.*muted.*solo.*effects_chain/s);
    expect(sql).toMatch(/master_gain_db.*master_pan.*master_fx_chain/s);
    expect(sql).toMatch(/replay := true/);
    expect(sql).toMatch(/INSERT INTO public\.studio_mix_working_idempotency/);
  });

  it("does not accept whole client document parameters", () => {
    expect(sql).not.toMatch(/p_document\b/);
    expect(sql).not.toMatch(/p_owner_id_from_body/);
  });
});

describe("A2 Mix Working — revision migration contracts", () => {
  const sql = read(
    "supabase/migrations/20261020230000_studio_mix_working_revisions.sql",
  );

  it("defines append-only revisions table with service_role grants", () => {
    expect(sql).toMatch(/CREATE TABLE IF NOT EXISTS public\.studio_mix_working_revisions/);
    expect(sql).toMatch(/REVOKE ALL ON TABLE public\.studio_mix_working_revisions/);
    expect(sql).toMatch(
      /GRANT SELECT, INSERT ON TABLE public\.studio_mix_working_revisions TO service_role/,
    );
    expect(sql).toMatch(
      /REVOKE UPDATE, DELETE ON TABLE public\.studio_mix_working_revisions FROM service_role/,
    );
    expect(sql).toMatch(/idempotency_request_id/);
    expect(sql).toMatch(/tip_apply/);
  });

  it("extends apply RPC with optional p_revision and revision_id return", () => {
    expect(sql).toMatch(/p_revision jsonb DEFAULT NULL/);
    expect(sql).toMatch(/revision_id uuid/);
    expect(sql).toMatch(/INSERT INTO public\.studio_mix_working_revisions/);
    expect(sql).toMatch(/DROP FUNCTION IF EXISTS public\.studio_cas_apply_mix_working_ops/);
  });

  it("exposes revision list/detail/compare/restore routes", () => {
    const list = read(
      "src/app/api/studio/projects/[projectId]/mix-working/revisions/route.ts",
    );
    const detail = read(
      "src/app/api/studio/projects/[projectId]/mix-working/revisions/[revisionId]/route.ts",
    );
    const compare = read(
      "src/app/api/studio/projects/[projectId]/mix-working/revisions/compare/route.ts",
    );
    const restore = read(
      "src/app/api/studio/projects/[projectId]/mix-working/revisions/[revisionId]/restore/route.ts",
    );
    expect(list).toMatch(/listMixWorkingRevisions/);
    expect(detail).toMatch(/getMixWorkingRevision/);
    expect(compare).toMatch(/compareMixWorkingRevisions/);
    expect(compare).toMatch(/void body\.ownerId/);
    expect(restore).toMatch(/restoreMixWorkingRevision/);
    expect(restore).toMatch(/void body\.ownerId/);
  });
});

describe("A1 Mix Working — service/route contracts", () => {
  const service = read(SERVICE);
  const route = read(ROUTE);

  it("service derives owner from auth context and calls RPC", () => {
    expect(service).toMatch(/getStudioProjectDocumentFor/);
    expect(service).toMatch(/studio_cas_apply_mix_working_ops/);
    expect(service).toMatch(/p_owner_id: context\.userId/);
    expect(service).toMatch(/applyMixWorkingOpsInMemory/);
    expect(service).toMatch(/fingerprintMixWorkingRequest/);
    expect(service).not.toMatch(/input\.ownerId/);
  });

  it("route ignores body ownerId and uses apply service", () => {
    expect(route).toMatch(/applyStudioMixWorkingOps/);
    expect(route).toMatch(/void body\.ownerId/);
    expect(route).toMatch(/studioApiErrorResponse/);
  });
});

describe("A1 Mix Working — API error mapping", () => {
  it("maps Mix Working apply codes to HTTP statuses", () => {
    expect(httpStatusForMixWorkingApplyError("IDEMPOTENCY_KEY_REUSE")).toBe(409);
    expect(httpStatusForMixWorkingApplyError("FORBIDDEN_OP")).toBe(400);
    expect(httpStatusForMixWorkingApplyError("INVALID_DOCUMENT")).toBe(400);
    expect(httpStatusForMixWorkingApplyError("SNAPSHOT_TOO_LARGE")).toBe(400);
    expect(httpStatusForMixWorkingApplyError("REVISION_NOT_FOUND")).toBe(404);
    expect(httpStatusForMixWorkingApplyError("REVISION_INVALID")).toBe(400);

    const reuse = studioApiErrorResponse(
      new MixWorkingApplyError("IDEMPOTENCY_KEY_REUSE", "reuse"),
    );
    expect(reuse.status).toBe(409);

    const forbidden = studioApiErrorResponse(
      new MixWorkingApplyError("FORBIDDEN_OP", "bad op"),
    );
    expect(forbidden.status).toBe(400);

    const conflict = studioApiErrorResponse(new StudioFxCasConflictError());
    expect(conflict.status).toBe(409);

    expect(
      studioApiErrorResponse(new AuthError("UNAUTHENTICATED", "x")).status,
    ).toBe(401);
    expect(studioApiErrorResponse(new AuthError("NOT_FOUND", "x")).status).toBe(
      404,
    );
    expect(studioApiErrorResponse(new AuthError("FORBIDDEN", "x")).status).toBe(
      403,
    );
  });

  it("persist orchestrator never auto-retries IDEMPOTENCY_KEY_REUSE", () => {
    const classified = classifyPersistHttpFailure({
      status: 409,
      code: "IDEMPOTENCY_KEY_REUSE",
      message: "reuse",
    });
    expect(classified.ok).toBe(false);
    if (!classified.ok) {
      expect(classified.retryable).toBe(false);
      expect(classified.kind).toBe("conflict");
    }
  });
});

describe.skip("A1 Mix Working — SQL/RPC integration (local DB)", () => {
  // NOT RUN — LOCAL DB UNAVAILABLE (Supabase :54321 unreachable at implement time).
  // Required cases when a verified-local DB is available:
  // controls+FX+master atomicity; +1 bump; validation/rollback; foreign track;
  // dual requestId CAS; parallel vs track/FX/master CAS; parallel retry replay;
  // key reuse; idempotency rollback; deadlock-free track order;
  // anon/authenticated EXECUTE denied; client DML denied.
  it("placeholder — enable when local DB is proven safe", () => {
    expect(true).toBe(true);
  });
});
