import { describe, expect, it, vi } from "vitest";

const redirect = vi.fn((url: string) => {
  throw Object.assign(new Error("NEXT_REDIRECT"), { url });
});

vi.mock("next/navigation", () => ({ redirect: (url: string) => redirect(url) }));
vi.mock("@/lib/auth/session", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/auth/session")>();
  return {
    ...actual,
    requireUser: async () => {
      throw new actual.AuthError("UNAUTHENTICATED", "unauthenticated");
    },
  };
});
vi.mock("@/lib/studio/studio-service", () => ({ listStudioProjects: async () => [] }));
vi.mock("@/lib/audio/load-premium-entitlement", () => ({
  resolveProductEntitlementForAuthContext: async () => ({ premiumTier: "FREE" }),
}));
vi.mock("@/components/studio/recorder-session-card", () => ({ RecorderSessionCard: () => null }));
vi.mock("@/components/studio/studio-first-steps-card", () => ({ StudioFirstStepsCard: () => null }));
vi.mock("@/components/studio/studio-project-list", () => ({ StudioProjectList: () => null }));
vi.mock("@/components/site/app-shell", () => ({ AppShell: () => null }));

import StudioProjectsPage from "@/app/studio/page";

async function guestRedirect(params: Record<string, string>): Promise<string> {
  try {
    await StudioProjectsPage({ searchParams: Promise.resolve(params) });
  } catch (error) {
    return (error as { url: string }).url;
  }
  throw new Error("expected redirect");
}

describe("/studio guest redirect", () => {
  it("keeps beatId in sign-in next", async () => {
    expect(await guestRedirect({ beatId: "b-123" })).toBe(
      "/sign-in?next=%2Fstudio%3FbeatId%3Db-123",
    );
  });

  it("drops unrelated params and stays /studio without beatId", async () => {
    expect(await guestRedirect({ notice: "project-missing" })).toBe("/sign-in?next=%2Fstudio");
    expect(await guestRedirect({})).toBe("/sign-in?next=%2Fstudio");
  });
});
