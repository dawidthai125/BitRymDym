import { readFileSync } from "node:fs";
import { join } from "node:path";

import { beforeEach, describe, expect, it, vi } from "vitest";

import { AuthError, requireUser } from "@/lib/auth/session";
import {
  adminPaymentHistoryAccessDenial,
  requireAdminPaymentHistoryAccess,
} from "@/lib/admin/payment-history";
import {
  formatGroszPln,
  parsePaymentHistoryPage,
  paymentHistoryProduct,
} from "@/lib/admin/payment-history-present";
import type { AuthContext } from "@/lib/auth/types";
import type { PermissionKey } from "@/types/permissions";

vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return { ...actual, requireUser: vi.fn() };
});

const requireUserMock = vi.mocked(requireUser);

function context(role: AuthContext["profile"]["role"], permissions: PermissionKey[]): AuthContext {
  return {
    userId: "user-1",
    email: "user@example.com",
    profile: {
      id: "user-1",
      displayName: "User",
      userNumber: 1,
      role,
      accountLevel: "BEGINNER_RAPPER",
      experienceTotal: 0,
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-01T00:00:00.000Z",
    },
    permissions,
  };
}

const base = {
  product_kind: "plan",
  plan_tier: "SILVER",
  addon: null,
  pack: null,
  period: "month",
  amount_grosz: 2999,
  status: "paid",
  grant_status: "granted",
};

describe("payment history labels", () => {
  it("formats grosz as PLN and rejects a broken amount", () => {
    expect(formatGroszPln(2999, "pl")).toContain("29,99");
    expect(formatGroszPln(2999, "pl")).toContain("zł");
    expect(formatGroszPln(null, "pl")).toBe("—");
  });

  it("reads the page number and falls back to the first page", () => {
    expect(parsePaymentHistoryPage("3")).toBe(3);
    expect(parsePaymentHistoryPage(["4"])).toBe(4);
    expect(parsePaymentHistoryPage("0")).toBe(1);
    expect(parsePaymentHistoryPage(undefined)).toBe(1);
  });

  it("names a plan, the reference add-on, and a pack", () => {
    expect(paymentHistoryProduct(base)).toEqual({ kind: "plan", tier: "SILVER" });
    expect(paymentHistoryProduct({ ...base, product_kind: "addon", plan_tier: null, addon: "reference_mastering" })).toEqual({ kind: "addon" });
    expect(paymentHistoryProduct({ ...base, product_kind: "pack", plan_tier: null, pack: "youtube", period: "once" })).toEqual({ kind: "pack", pack: "youtube" });
    expect(paymentHistoryProduct({ ...base, product_kind: "plan", plan_tier: "FREE" }).kind).toBe("unknown");
  });
});

describe("payment history access", () => {
  beforeEach(() => {
    requireUserMock.mockReset();
  });

  it("allows only an administrator who can view payments", async () => {
    requireUserMock.mockResolvedValue(context("ADMIN", ["payments.view"]));
    await expect(requireAdminPaymentHistoryAccess()).resolves.toMatchObject({ userId: "user-1" });

    requireUserMock.mockResolvedValue(context("ADMIN", ["users.view"]));
    await expect(requireAdminPaymentHistoryAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });

    requireUserMock.mockResolvedValue(context("MODERATOR", ["payments.view"]));
    await expect(requireAdminPaymentHistoryAccess()).rejects.toMatchObject({ code: "FORBIDDEN" });

    requireUserMock.mockRejectedValue(new AuthError("UNAUTHENTICATED", "Authentication required."));
    await expect(requireAdminPaymentHistoryAccess()).rejects.toMatchObject({ code: "UNAUTHENTICATED" });
    expect(adminPaymentHistoryAccessDenial(new Error("db"))).toBeNull();
  });

  it("loads orders only after the access check", () => {
    const src = readFileSync(join(process.cwd(), "src/lib/admin/payment-history.ts"), "utf8");
    const page = readFileSync(join(process.cwd(), "src/app/admin/platnosci/page.tsx"), "utf8");
    expect(src.indexOf("await requireAdminPaymentHistoryAccess()")).toBeLessThan(src.indexOf('.from("payment_orders")'));
    expect(page).toContain('redirect("/admin")');
    expect(page).not.toContain("buyer_email");
  });
});
