import { describe, expect, it, vi } from "vitest";

import { checkAccess } from "@/lib/auth/access-denial";
import { AuthError } from "@/lib/auth/session";

describe("checkAccess", () => {
  it("returns null and runs the guard once when access is granted", async () => {
    const guard = vi.fn().mockResolvedValue({ userId: "u1" });
    await expect(checkAccess(guard)).resolves.toBeNull();
    expect(guard).toHaveBeenCalledTimes(1);
  });

  it("returns UNAUTHENTICATED instead of throwing for an anonymous viewer", async () => {
    const guard = () =>
      Promise.reject(new AuthError("UNAUTHENTICATED", "Authentication required."));
    await expect(checkAccess(guard)).resolves.toBe("UNAUTHENTICATED");
  });

  it("returns FORBIDDEN instead of throwing for a viewer without access", async () => {
    const guard = () => Promise.reject(new AuthError("FORBIDDEN", "Insufficient role."));
    await expect(checkAccess(guard)).resolves.toBe("FORBIDDEN");
  });

  it("propagates other AuthError codes unchanged", async () => {
    for (const code of ["NOT_FOUND", "CONFLICT"] as const) {
      const failure = new AuthError(code, "x");
      await expect(checkAccess(() => Promise.reject(failure))).rejects.toBe(failure);
    }
  });

  it("propagates unexpected errors, even with auth-like messages", async () => {
    const dbFailure = new Error("Failed to load profile: connection refused");
    await expect(checkAccess(() => Promise.reject(dbFailure))).rejects.toBe(dbFailure);

    const lookalike = new Error("Authentication required.");
    await expect(checkAccess(() => Promise.reject(lookalike))).rejects.toBe(lookalike);

    const shaped = { name: "AuthError", code: "FORBIDDEN" };
    await expect(checkAccess(() => Promise.reject(shaped))).rejects.toBe(shaped);
  });
});
