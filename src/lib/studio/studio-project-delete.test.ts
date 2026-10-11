/**
 * I.45CM — Studio project delete export-history conflict (unit).
 * No live Postgres / production DB.
 */

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  isStudioProjectExportHistoryFkViolation,
  STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL,
} from "@/lib/studio/studio-project-delete";

const ownerCtx: AuthContext = {
  userId: "owner-1",
  email: "owner@example.com",
  permissions: [],
  profile: {
    id: "owner-1",
    displayName: "Owner",
    userNumber: 1,
    role: "USER",
    accountLevel: "BEGINNER_RAPPER",
    experienceTotal: 0,
    createdAt: "2026-01-01T00:00:00Z",
    updatedAt: "2026-01-01T00:00:00Z",
  },
};

const ownedProjectRow = {
  id: "proj-1",
  owner_id: ownerCtx.userId,
  title: "P",
  status: "ACTIVE",
  tempo_bpm: 120,
  time_signature_num: 4,
  time_signature_den: 4,
  beat_id: null,
  timeline_length_ms: 60_000,
  master_gain_db: 0,
  master_pan: 0,
  document_version: 1,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
};

type QueryResult = {
  data?: unknown;
  error?: { code?: string; message: string } | null;
  count?: number | null;
};

function createChain(result: QueryResult) {
  const chain: Record<string, unknown> = {};
  const self = () => chain;
  chain.select = vi.fn(self);
  chain.delete = vi.fn(self);
  chain.eq = vi.fn(self);
  chain.maybeSingle = vi.fn(async () => ({
    data: result.data ?? null,
    error: result.error ?? null,
  }));
  chain.then = (
    resolve: (value: {
      data: unknown;
      error: QueryResult["error"];
      count: number | null;
    }) => unknown,
  ) =>
    Promise.resolve(
      resolve({
        data: result.data ?? null,
        error: result.error ?? null,
        count: result.count ?? null,
      }),
    );
  return chain;
}

const fromMock = vi.hoisted(() => vi.fn());

vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: fromMock }),
}));

describe("isStudioProjectExportHistoryFkViolation", () => {
  it("detects render_jobs_project_id_fkey (23503)", () => {
    expect(
      isStudioProjectExportHistoryFkViolation({
        code: "23503",
        message:
          'update or delete on table "studio_projects" violates foreign key constraint "render_jobs_project_id_fkey" on table "render_jobs"',
      }),
    ).toBe(true);
  });

  it("detects audio_artifacts_project_id_fkey (message-only)", () => {
    expect(
      isStudioProjectExportHistoryFkViolation({
        message:
          'violates foreign key constraint "audio_artifacts_project_id_fkey"',
      }),
    ).toBe(true);
  });

  it("rejects unrelated errors", () => {
    expect(
      isStudioProjectExportHistoryFkViolation({
        code: "23503",
        message: 'violates foreign key constraint "other_fkey"',
      }),
    ).toBe(false);
    expect(
      isStudioProjectExportHistoryFkViolation({
        code: "42501",
        message: 'violates foreign key constraint "render_jobs_project_id_fkey"',
      }),
    ).toBe(false);
    expect(isStudioProjectExportHistoryFkViolation(null)).toBe(false);
  });
});

describe("deleteStudioProjectFor — export history conflict", () => {
  beforeEach(() => {
    fromMock.mockReset();
  });

  async function loadDelete() {
    const mod = await import("@/lib/studio/studio-service");
    return mod.deleteStudioProjectFor;
  }

  it("blocks when render_jobs exist (no project delete)", async () => {
    const deleteStudioProjectFor = await loadDelete();
    const tables: string[] = [];
    let projectDeleteCalls = 0;
    fromMock.mockImplementation((table: string) => {
      tables.push(table);
      if (table === "studio_projects") {
        const chain = createChain({ data: ownedProjectRow });
        const originalDelete = chain.delete as () => unknown;
        chain.delete = vi.fn(() => {
          projectDeleteCalls += 1;
          return originalDelete();
        });
        return chain;
      }
      if (table === "render_jobs") return createChain({ count: 1 });
      return createChain({ count: 0 });
    });

    await expect(
      deleteStudioProjectFor(ownerCtx, "proj-1"),
    ).rejects.toMatchObject({
      name: "AuthError",
      code: "CONFLICT",
      message: STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL,
    });
    expect(tables).toContain("render_jobs");
    expect(projectDeleteCalls).toBe(0);
    expect(tables).not.toContain("takes");
    expect(tables).not.toContain("beats");
  });

  it("blocks when audio_artifacts exist (no project delete)", async () => {
    const deleteStudioProjectFor = await loadDelete();
    let projectDeleteCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "studio_projects") {
        const chain = createChain({ data: ownedProjectRow });
        const originalDelete = chain.delete as () => unknown;
        chain.delete = vi.fn(() => {
          projectDeleteCalls += 1;
          return originalDelete();
        });
        return chain;
      }
      if (table === "render_jobs") return createChain({ count: 0 });
      if (table === "audio_artifacts") return createChain({ count: 2 });
      return createChain({ count: 0 });
    });

    await expect(
      deleteStudioProjectFor(ownerCtx, "proj-1"),
    ).rejects.toMatchObject({
      code: "CONFLICT",
      message: STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL,
    });
    expect(projectDeleteCalls).toBe(0);
  });

  it("deletes project when no export history", async () => {
    const deleteStudioProjectFor = await loadDelete();
    let projectCalls = 0;
    let sawDelete = false;
    fromMock.mockImplementation((table: string) => {
      if (table === "studio_projects") {
        projectCalls += 1;
        if (projectCalls === 1) {
          return createChain({ data: ownedProjectRow });
        }
        const chain = createChain({ data: { id: "proj-1" } });
        const originalDelete = chain.delete as () => unknown;
        chain.delete = vi.fn(() => {
          sawDelete = true;
          return originalDelete();
        });
        return chain;
      }
      return createChain({ count: 0 });
    });

    const result = await deleteStudioProjectFor(ownerCtx, "proj-1");
    expect(result).toEqual({ id: "proj-1" });
    expect(sawDelete).toBe(true);
  });

  it("maps FK race on DELETE to controlled CONFLICT (no raw Postgres text)", async () => {
    const deleteStudioProjectFor = await loadDelete();
    let projectCalls = 0;
    fromMock.mockImplementation((table: string) => {
      if (table === "studio_projects") {
        projectCalls += 1;
        if (projectCalls === 1) {
          return createChain({ data: ownedProjectRow });
        }
        return createChain({
          error: {
            code: "23503",
            message:
              'update or delete on table "studio_projects" violates foreign key constraint "render_jobs_project_id_fkey" on table "render_jobs"',
          },
        });
      }
      return createChain({ count: 0 });
    });

    try {
      await deleteStudioProjectFor(ownerCtx, "proj-1");
      expect.fail("expected conflict");
    } catch (e) {
      expect(e).toBeInstanceOf(AuthError);
      expect((e as AuthError).code).toBe("CONFLICT");
      expect((e as AuthError).message).toBe(
        STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL,
      );
      expect((e as Error).message).not.toMatch(/violates foreign key/i);
      const res = studioApiErrorResponse(e);
      expect(res.status).toBe(409);
      const body = (await res.json()) as { error: string };
      expect(body.error).toBe(STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL);
      expect(body.error).not.toMatch(/PostgreSQL|23503|fkey/i);
    }
  });

  it("non-owner cannot delete", async () => {
    const deleteStudioProjectFor = await loadDelete();
    fromMock.mockImplementation((table: string) => {
      if (table === "studio_projects") {
        return createChain({
          data: { ...ownedProjectRow, owner_id: "other-user" },
        });
      }
      return createChain({ count: 0 });
    });

    await expect(
      deleteStudioProjectFor(ownerCtx, "proj-1"),
    ).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: "Brak dostępu do tego projektu.",
    });
  });

  it("existence checks never delete render_jobs / audio_artifacts / takes", async () => {
    const deleteStudioProjectFor = await loadDelete();
    const ops: Array<{ table: string; op: string }> = [];
    fromMock.mockImplementation((table: string) => {
      const chain = createChain(
        table === "studio_projects"
          ? { data: ownedProjectRow }
          : { count: 1 },
      );
      chain.select = vi.fn(() => {
        ops.push({ table, op: "select" });
        return chain;
      });
      chain.delete = vi.fn(() => {
        ops.push({ table, op: "delete" });
        return chain;
      });
      return chain;
    });

    await expect(
      deleteStudioProjectFor(ownerCtx, "proj-1"),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    expect(
      ops.filter(
        (o) =>
          (o.table === "render_jobs" ||
            o.table === "audio_artifacts" ||
            o.table === "takes") &&
          o.op === "delete",
      ),
    ).toHaveLength(0);
  });
});

describe("AuthError CONFLICT → HTTP 409", () => {
  it("maps export-history conflict", () => {
    const res = studioApiErrorResponse(
      new AuthError("CONFLICT", STUDIO_PROJECT_DELETE_EXPORT_HISTORY_CONFLICT_PL),
    );
    expect(res.status).toBe(409);
  });
});
