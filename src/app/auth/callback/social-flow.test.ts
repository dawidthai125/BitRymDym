import { NextRequest } from "next/server";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { exchangeCodeForSession, signOut, maintenance } = vi.hoisted(() => ({
  exchangeCodeForSession: vi.fn(),
  signOut: vi.fn(),
  maintenance: vi.fn(),
}));

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/server", () => ({
  createSupabaseServerClient: async () => ({ auth: { exchangeCodeForSession, signOut } }),
}));
vi.mock("@/lib/auth/session", () => ({ getCurrentProfile: async () => null }));
vi.mock("@/lib/site/maintenance-settings", () => ({ readSiteMaintenanceForViewer: maintenance }));
vi.mock("@/lib/email/notify/server", () => ({ sendWelcomeOnce: vi.fn() }));
vi.mock("@/lib/takes/anon-account-claim", () => ({ tryClaimAnonTakeAfterAuth: vi.fn() }));
vi.mock("@/lib/site-url", () => ({ getSiteUrl: () => "https://www.bitrymdym.pl" }));

import { GET } from "./route";

const go = (query: string) => GET(new NextRequest(`https://www.bitrymdym.pl/auth/callback?${query}`));
const signedIn = (providers: string[], meta: Record<string, unknown> = {}) =>
  exchangeCodeForSession.mockResolvedValue({
    data: { session: {}, user: { id: "u1", app_metadata: { providers }, user_metadata: meta } },
    error: null,
  });

beforeEach(() => {
  vi.clearAllMocks();
  maintenance.mockResolvedValue({ enabled: false, viewerIsAdmin: false });
});

describe("/auth/callback?flow=oauth", () => {
  it("a new Google account goes to the finish form and keeps the return path", async () => {
    signedIn(["google"]);
    const res = await go("flow=oauth&code=c1&next=%2Fstudio");
    expect(res.headers.get("location")).toBe("https://www.bitrymdym.pl/auth/finish?next=%2Fstudio");
    expect(signOut).not.toHaveBeenCalled();
  });
  it("a linked e-mail account stays signed in and goes back", async () => {
    signedIn(["email", "google"]);
    const res = await go("flow=oauth&code=c1&next=%2Fstudio");
    expect(res.headers.get("location")).toBe("https://www.bitrymdym.pl/studio");
    expect(signOut).not.toHaveBeenCalled();
  });
  it("never follows a foreign return address", async () => {
    signedIn(["email", "google"]);
    const res = await go("flow=oauth&code=c1&next=https%3A%2F%2Fevil.example");
    expect(res.headers.get("location")).toBe("https://www.bitrymdym.pl/account");
  });
  it("cancel or a failed exchange returns to sign-in with a message", async () => {
    expect((await go("flow=oauth&error=access_denied")).headers.get("location")).toContain("/sign-in?social=error");
    exchangeCodeForSession.mockResolvedValue({ data: { session: null, user: null }, error: { message: "bad" } });
    expect((await go("flow=oauth&code=c1")).headers.get("location")).toContain("/sign-in?social=error");
  });
  it("maintenance drops a non-admin session", async () => {
    signedIn(["email", "google"]);
    maintenance.mockResolvedValue({ enabled: true, viewerIsAdmin: false });
    await go("flow=oauth&code=c1");
    expect(signOut).toHaveBeenCalled();
  });
});
