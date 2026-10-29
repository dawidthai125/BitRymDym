/**
 * Security Audit Wave 2 — `/admin/moderation/[id]` error classification.
 * Viewer denial (guard) → redirect / layout denial; hidden content → 404;
 * anything else must propagate (never a silent 404).
 */

import type { ReactElement } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const BEAT_ID = "33333333-3333-4333-8333-333333333333";

class RedirectSignal extends Error {
  constructor(readonly url: string) {
    super(`NEXT_REDIRECT ${url}`);
  }
}
class NotFoundSignal extends Error {
  constructor() {
    super("NEXT_NOT_FOUND");
  }
}

const state = vi.hoisted(() => ({
  guard: async (): Promise<void> => {},
  loader: async (): Promise<unknown> => ({}),
  loaderCalls: 0,
  viewerRole: "MODERATOR" as string,
  identities: async (): Promise<
    Map<string, { id: string; displayName: string | null; userNumber: number | null }>
  > => new Map(),
  identityCalls: 0,
}));

vi.mock("next/navigation", () => ({
  redirect: (url: string) => {
    throw new RedirectSignal(url);
  },
  notFound: () => {
    throw new NotFoundSignal();
  },
}));

vi.mock("next/link", () => ({ default: () => null }));
vi.mock("@/components/beats/moderation-decision-controls", () => ({
  ModerationDecisionControls: () => null,
}));
vi.mock("@/components/beats/auto-check-card", () => ({ AutoCheckCard: () => null }));
vi.mock("@/components/beats/auto-check-override-controls", () => ({
  AutoCheckOverrideControls: () => null,
}));
vi.mock("@/lib/beats/auto-check/records", () => ({
  loadLatestAutoChecks: async () => new Map(),
}));
vi.mock("@/components/player/playback-shell", () => ({
  PlaybackShell: () => null,
}));
vi.mock("@/lib/auth/user-number", () => ({
  loadAdminProfileIdentities: () => {
    state.identityCalls += 1;
    return state.identities();
  },
}));

vi.mock("@/lib/beats/service", () => ({
  requireModerationAccess: () => state.guard(),
  getStaffCommunityBeatForModeration: () => {
    state.loaderCalls += 1;
    return state.loader();
  },
}));

vi.mock("@/lib/auth/session", async () => {
  const actual =
    await vi.importActual<typeof import("@/lib/auth/session")>(
      "@/lib/auth/session",
    );
  return {
    ...actual,
    getCurrentProfile: async () => ({ profile: { role: state.viewerRole } }),
  };
});

const { renderToStaticMarkup } = await import("react-dom/server");
const { AuthError } = await import("@/lib/auth/session");
const { default: AdminModerationDetailPage } = await import(
  "@/app/admin/moderation/[id]/page"
);

function renderPage(id = BEAT_ID) {
  return AdminModerationDetailPage({ params: Promise.resolve({ id }) });
}

const OWNER_ID = "11111111-1111-4111-8111-111111111111";

function moderationBeat() {
  return {
    id: BEAT_ID,
    ownerId: OWNER_ID,
    ownershipType: "USER",
    title: "Queued beat",
    producer: null,
    bpm: 120,
    durationSeconds: 120,
    status: "PENDING_REVIEW",
    activeMasterReady: true,
  };
}

beforeEach(() => {
  state.guard = async () => {};
  state.loader = async () => moderationBeat();
  state.loaderCalls = 0;
  state.viewerRole = "MODERATOR";
  state.identities = async () =>
    new Map([
      [
        OWNER_ID,
        { id: OWNER_ID, displayName: "Producer Jan", userNumber: 42 },
      ],
    ]);
  state.identityCalls = 0;
});

async function renderHtml() {
  const element = await renderPage();
  return renderToStaticMarkup(element as ReactElement);
}

describe("owner identity (USER-ID-01: user_number for ADMIN only)", () => {
  it("MODERATOR sees only a masked owner id; identity lookup is not called", async () => {
    const html = await renderHtml();
    expect(state.identityCalls).toBe(0);
    expect(html).toContain("11111111…");
    expect(html).not.toContain("Producer Jan");
    expect(html).not.toContain("42");
  });

  it("ADMIN sees display name with user number", async () => {
    state.viewerRole = "ADMIN";
    const html = await renderHtml();
    expect(state.identityCalls).toBe(1);
    expect(html).toContain("Producer Jan (ID: 42)");
  });

  it("ADMIN whose identity access is denied keeps the masked id (no error page)", async () => {
    state.viewerRole = "ADMIN";
    state.identities = async () => {
      throw new AuthError("FORBIDDEN", "Admin identity lookup required.");
    };
    const html = await renderHtml();
    expect(html).toContain("11111111…");
    expect(html).not.toContain("Producer Jan");
  });

  it("ADMIN identity infrastructure failure propagates", async () => {
    state.viewerRole = "ADMIN";
    state.identities = async () => {
      throw new Error("Failed to load profile identities: timeout");
    };
    await expect(renderPage()).rejects.toThrow("timeout");
  });
});

describe("audio readiness", () => {
  it("no READY active MASTER → warning instead of the player", async () => {
    state.loader = async () => ({ ...moderationBeat(), activeMasterReady: false });
    const html = await renderHtml();
    expect(html).toContain("Brak gotowego audio");
    expect(html).toContain("nie zatwierdzaj.");
  });

  it("APPROVED without READY MASTER warns against publishing", async () => {
    state.loader = async () => ({
      ...moderationBeat(),
      status: "APPROVED",
      activeMasterReady: false,
    });
    const html = await renderHtml();
    expect(html).toContain("nie publikuj.");
  });
});

describe("viewer denial is resolved before loading the beat", () => {
  it("anonymous → redirect to /sign-in", async () => {
    state.guard = async () => {
      throw new AuthError("UNAUTHENTICATED", "Authentication required.");
    };
    const error = await renderPage().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(RedirectSignal);
    expect((error as RedirectSignal).url).toBe("/sign-in");
    expect(state.loaderCalls).toBe(0);
  });

  it("signed-in user without a staff role → null (layout shows the denial), not 404", async () => {
    state.guard = async () => {
      throw new AuthError("FORBIDDEN", "Insufficient role.");
    };
    await expect(renderPage()).resolves.toBeNull();
    expect(state.loaderCalls).toBe(0);
  });

  it("guard infrastructure failure propagates (not a 404)", async () => {
    state.guard = async () => {
      throw new Error("profile load failed");
    };
    await expect(renderPage()).rejects.toThrow("profile load failed");
    expect(state.loaderCalls).toBe(0);
  });
});

describe("staff viewer", () => {
  it("renders the moderation detail", async () => {
    const element = await renderPage();
    expect(element).not.toBeNull();
    expect(state.loaderCalls).toBe(1);
  });

  it("missing beat → notFound()", async () => {
    state.loader = async () => {
      throw new AuthError("NOT_FOUND", "Beat not found.");
    };
    await expect(renderPage()).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("beat outside the moderation queue (content FORBIDDEN) → notFound()", async () => {
    state.loader = async () => {
      throw new AuthError("FORBIDDEN", "Moderation is for USER beats.");
    };
    await expect(renderPage()).rejects.toBeInstanceOf(NotFoundSignal);
  });

  it("other AuthError codes propagate instead of becoming 404", async () => {
    state.loader = async () => {
      throw new AuthError("CONFLICT", "conflict");
    };
    const error = await renderPage().catch((caught: unknown) => caught);
    expect(error).toBeInstanceOf(AuthError);
    expect(error).not.toBeInstanceOf(NotFoundSignal);
  });

  it("unexpected service error propagates instead of becoming 404", async () => {
    state.loader = async () => {
      throw new Error("database unavailable");
    };
    const error = await renderPage().catch((caught: unknown) => caught);
    expect(error).not.toBeInstanceOf(NotFoundSignal);
    expect((error as Error).message).toBe("database unavailable");
  });
});
