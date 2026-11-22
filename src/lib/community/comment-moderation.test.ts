import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, requireRole } from "@/lib/auth/session";
import type { AuthContext } from "@/lib/auth/types";
import {
  deleteOwnComment,
  hideComment,
  listOpenCommentReports,
  reportComment,
  resolveCommentReports,
} from "@/lib/community/comment-moderation";
import { findWork } from "@/lib/community/community-service";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireRole: vi.fn() };
});
vi.mock("@/lib/supabase/admin", () => ({ createSupabaseAdminClient: vi.fn() }));
vi.mock("@/lib/community/community-service", () => ({ findWork: vi.fn() }));

const adminMock = vi.mocked(createSupabaseAdminClient);
const findWorkMock = vi.mocked(findWork);
const requireRoleMock = vi.mocked(requireRole);

const COMMENT_ID = "11111111-2222-4333-8444-555555555555";
const WORK_ID = "22222222-3333-4444-8555-666666666666";

type Call = { table: string; op: string; payload?: unknown; filters: [string, string, unknown][] };
type Result = { data?: unknown; error?: unknown; count?: number };

function fakeAdmin(resolve: (call: Call) => Result) {
  const calls: Call[] = [];
  function from(table: string) {
    const call: Call = { table, op: "select", filters: [] };
    calls.push(call);
    const done = () => {
      const out = resolve(call);
      return { data: out.data ?? null, error: out.error ?? null, count: out.count ?? null };
    };
    const builder: Record<string, unknown> = {
      select: () => builder,
      insert: (payload: unknown) => {
        call.op = "insert";
        call.payload = payload;
        return builder;
      },
      update: (payload: unknown) => {
        call.op = "update";
        call.payload = payload;
        return builder;
      },
      eq: (column: string, value: unknown) => {
        call.filters.push(["eq", column, value]);
        return builder;
      },
      is: (column: string, value: unknown) => {
        call.filters.push(["is", column, value]);
        return builder;
      },
      in: (column: string, value: unknown) => {
        call.filters.push(["in", column, value]);
        return builder;
      },
      gte: (column: string, value: unknown) => {
        call.filters.push(["gte", column, value]);
        return builder;
      },
      order: () => builder,
      limit: () => builder,
      maybeSingle: () => Promise.resolve(done()),
      then: (ok: (value: unknown) => unknown, fail: (reason: unknown) => unknown) => Promise.resolve(done()).then(ok, fail),
    };
    return builder;
  }
  adminMock.mockReturnValue({ from } as never);
  return calls;
}

function comment(overrides: Record<string, unknown> = {}) {
  return {
    id: COMMENT_ID,
    user_id: "author-1",
    target_kind: "work",
    target_id: WORK_ID,
    body: "siema",
    created_at: "2026-11-22T10:00:00.000Z",
    deleted_at: null,
    hidden_at: null,
    hidden_reason: null,
    ...overrides,
  };
}

function staffContext(role: "ADMIN" | "MODERATOR" = "MODERATOR"): AuthContext {
  return {
    userId: "staff-1",
    email: "staff@example.com",
    profile: {
      id: "staff-1",
      displayName: "Staff",
      userNumber: 7,
      role,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions: [],
  };
}

const isCommentRead = (call: Call) => call.table === "community_comments" && call.op === "select";

beforeEach(() => {
  vi.clearAllMocks();
});

describe("deleteOwnComment", () => {
  it("refuses someone else's comment", async () => {
    const calls = fakeAdmin((call) => (isCommentRead(call) ? { data: comment() } : {}));
    expect(await deleteOwnComment("intruder", COMMENT_ID)).toBe("forbidden");
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });

  it("soft-deletes the author's own comment, scoped to the author", async () => {
    const calls = fakeAdmin((call) => (isCommentRead(call) ? { data: comment() } : {}));
    expect(await deleteOwnComment("author-1", COMMENT_ID)).toBe("ok");
    const update = calls.find((call) => call.op === "update");
    expect(update?.payload).toMatchObject({ deleted_at: expect.any(String) });
    expect(update?.filters).toContainEqual(["eq", "user_id", "author-1"]);
  });

  it("rejects a non-uuid and reports a missing comment", async () => {
    expect(await deleteOwnComment("author-1", "nope")).toBe("invalid");
    fakeAdmin(() => ({ data: null }));
    expect(await deleteOwnComment("author-1", COMMENT_ID)).toBe("missing");
  });
});

describe("hideComment", () => {
  it("refuses a member who neither owns the work nor is staff", async () => {
    const calls = fakeAdmin((call) => (isCommentRead(call) ? { data: comment() } : {}));
    findWorkMock.mockResolvedValue({ id: WORK_ID, ownerId: "owner-1" } as never);
    expect(await hideComment({ userId: "random", role: "USER" }, COMMENT_ID)).toBe("forbidden");
    expect(calls.some((call) => call.op === "update")).toBe(false);
  });

  it("lets the work owner hide without an audit entry", async () => {
    const calls = fakeAdmin((call) => (isCommentRead(call) ? { data: comment() } : {}));
    findWorkMock.mockResolvedValue({ id: WORK_ID, ownerId: "owner-1" } as never);
    expect(await hideComment({ userId: "owner-1", role: "USER" }, COMMENT_ID)).toBe("ok");
    expect(calls.find((call) => call.op === "update")?.payload).toMatchObject({ hidden_by: "owner-1", hidden_reason: "owner" });
    expect(calls.some((call) => call.table === "admin_audit_events")).toBe(false);
  });

  it("lets staff hide, closes open reports and audits", async () => {
    const calls = fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment() };
      if (call.table === "community_comment_reports" && call.op === "update") return { data: [{ id: "r1" }] };
      return {};
    });
    expect(await hideComment({ userId: "staff-1", role: "MODERATOR" }, COMMENT_ID)).toBe("ok");
    expect(findWorkMock).not.toHaveBeenCalled();
    const audit = calls.find((call) => call.table === "admin_audit_events");
    expect(audit?.payload).toMatchObject({ action: "COMMUNITY_COMMENT_HIDE", actor_user_id: "staff-1", target_user_id: "author-1" });
  });
});

describe("reportComment", () => {
  it("validates reason and details", async () => {
    expect(await reportComment("u1", COMMENT_ID, "bad", null)).toBe("invalid");
    expect(await reportComment("u1", COMMENT_ID, "spam", "x".repeat(501))).toBe("invalid");
  });

  it("is idempotent for a second report from the same member", async () => {
    const calls = fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment() };
      if (call.table === "community_comment_reports" && call.op === "select") return { data: { id: "r1" } };
      return {};
    });
    expect(await reportComment("u1", COMMENT_ID, "spam", null)).toBe("already");
    expect(calls.some((call) => call.op === "insert")).toBe(false);
  });

  it("maps a unique-violation race to already", async () => {
    fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment() };
      if (call.op === "insert") return { error: { code: "23505", message: "duplicate key" } };
      return { count: 0 };
    });
    expect(await reportComment("u1", COMMENT_ID, "abuse", "  nęka  ")).toBe("already");
  });

  it("refuses own comments and enforces the hourly limit", async () => {
    fakeAdmin((call) => (isCommentRead(call) ? { data: comment() } : {}));
    expect(await reportComment("author-1", COMMENT_ID, "spam", null)).toBe("own");
    fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment() };
      if (call.filters.some(([, column]) => column === "created_at")) return { count: 10 };
      return {};
    });
    expect(await reportComment("u1", COMMENT_ID, "spam", null)).toBe("limit");
  });

  it("auto-hides after three distinct open reports", async () => {
    const calls = fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment() };
      if (call.table === "community_comment_reports" && call.filters.some(([, column]) => column === "status")) return { count: 3 };
      return { count: 0 };
    });
    expect(await reportComment("u3", COMMENT_ID, "illegal", null)).toBe("ok");
    const insert = calls.find((call) => call.op === "insert");
    expect(insert?.payload).toEqual({ comment_id: COMMENT_ID, reporter_id: "u3", reason: "illegal", details: null });
    const hide = calls.find((call) => call.table === "community_comments" && call.op === "update");
    expect(hide?.payload).toMatchObject({ hidden_reason: "reports", hidden_by: null });
    expect(hide?.filters).toContainEqual(["is", "hidden_at", null]);
  });

  it("does not take reports on hidden or deleted comments", async () => {
    fakeAdmin((call) => (isCommentRead(call) ? { data: comment({ hidden_at: "2026-11-22T11:00:00.000Z" }) } : {}));
    expect(await reportComment("u1", COMMENT_ID, "spam", null)).toBe("missing");
  });

  it("reads off when the migration is not applied", async () => {
    fakeAdmin(() => ({ error: { code: "42703", message: "column community_comments.deleted_at does not exist" } }));
    expect(await reportComment("u1", COMMENT_ID, "spam", null)).toBe("off");
  });
});

describe("staff queue", () => {
  it("requires moderation access", async () => {
    requireRoleMock.mockRejectedValue(new AuthError("FORBIDDEN", "no"));
    await expect(listOpenCommentReports()).rejects.toThrow(AuthError);
    expect(await resolveCommentReports(COMMENT_ID, "hide")).toEqual({ ok: false, code: "FORBIDDEN" });
  });

  it("groups open reports per comment", async () => {
    requireRoleMock.mockResolvedValue(staffContext());
    fakeAdmin((call) => {
      if (call.table === "community_comment_reports") {
        return {
          data: [
            { comment_id: COMMENT_ID, reason: "spam", details: null, created_at: "2026-11-22T10:00:00.000Z" },
            { comment_id: COMMENT_ID, reason: "spam", details: "reklama", created_at: "2026-11-22T10:05:00.000Z" },
            { comment_id: COMMENT_ID, reason: "abuse", details: null, created_at: "2026-11-22T10:06:00.000Z" },
          ],
        };
      }
      return { data: [comment({ hidden_at: "2026-11-22T10:06:00.000Z", hidden_reason: "reports" })] };
    });
    const queue = await listOpenCommentReports();
    expect(queue.enabled).toBe(true);
    expect(queue.items).toHaveLength(1);
    expect(queue.items[0]).toMatchObject({
      reporters: 3,
      reasons: { spam: 2, abuse: 1 },
      details: ["reklama"],
      state: "reports",
      threadHref: `/utwor/${WORK_ID}`,
    });
  });

  it("dismiss closes reports, restores an auto-hidden comment and audits", async () => {
    requireRoleMock.mockResolvedValue(staffContext("ADMIN"));
    const calls = fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment({ hidden_at: "2026-11-22T10:06:00.000Z", hidden_reason: "reports" }) };
      if (call.table === "community_comment_reports") return { data: [{ id: "r1" }, { id: "r2" }, { id: "r3" }] };
      return {};
    });
    expect(await resolveCommentReports(COMMENT_ID, "dismiss")).toEqual({ ok: true });
    expect(calls.find((call) => call.table === "community_comment_reports")?.payload).toMatchObject({ status: "dismissed", resolved_by: "staff-1" });
    expect(calls.find((call) => call.table === "community_comments" && call.op === "update")?.payload).toEqual({
      hidden_at: null,
      hidden_by: null,
      hidden_reason: null,
    });
    expect(calls.find((call) => call.table === "admin_audit_events")?.payload).toMatchObject({
      action: "COMMUNITY_REPORT_DISMISS",
      actor_user_number: 7,
      new_value: { restored: true },
    });
  });

  it("hide marks reports actioned and audits", async () => {
    requireRoleMock.mockResolvedValue(staffContext());
    const calls = fakeAdmin((call) => {
      if (isCommentRead(call)) return { data: comment() };
      if (call.table === "community_comment_reports") return { data: [{ id: "r1" }] };
      return {};
    });
    expect(await resolveCommentReports(COMMENT_ID, "hide")).toEqual({ ok: true });
    expect(calls.find((call) => call.table === "community_comments" && call.op === "update")?.payload).toMatchObject({ hidden_reason: "staff" });
    expect(calls.find((call) => call.table === "community_comment_reports")?.payload).toMatchObject({ status: "actioned" });
    expect(calls.find((call) => call.table === "admin_audit_events")?.payload).toMatchObject({ action: "COMMUNITY_COMMENT_HIDE" });
  });

  it("rejects bad input", async () => {
    requireRoleMock.mockResolvedValue(staffContext());
    expect(await resolveCommentReports(COMMENT_ID, "nuke")).toEqual({ ok: false, code: "INVALID_INPUT" });
  });
});
