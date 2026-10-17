/**
 * Security Audit Wave 2 — HTTP error contract of `/api/admin/beats/**`.
 * Real route handlers + real error mapper; only the transport service is faked.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BEAT_ID = "33333333-3333-4333-8333-333333333333";
const ASSET_ID = "44444444-4444-4444-8444-444444444444";
const DB_MESSAGE =
  'duplicate key value violates unique constraint "beat_audio_assets_pkey"';

type Outcome = () => Promise<unknown>;

const transport = vi.hoisted(() => ({
  calls: [] as string[],
  outcome: (async () => ({})) as () => Promise<unknown>,
}));

function run(name: string) {
  return () => {
    transport.calls.push(name);
    return transport.outcome();
  };
}

vi.mock("@/lib/beats/audio-transport", () => ({
  analyzePlatformBeatPendingUpload: run("analyze"),
  createPlatformBeatSignedUploadSession: run("session"),
  createMasterReplaceSignedUploadSession: run("masterSession"),
  completeMasterReplaceUpload: run("masterComplete"),
}));

const { AuthError } = await import("@/lib/auth/session");
const { BeatRequestError } = await import("@/lib/beats/request-error");
const { BEAT_AUDIO_INTERNAL_ERROR } = await import(
  "@/lib/beats/beat-operation-error"
);
const analyzeRoute = await import("@/app/api/admin/beats/audio/analyze/route");
const sessionRoute = await import("@/app/api/admin/beats/audio/session/route");
const masterRoute = await import("@/app/api/admin/beats/[id]/master/route");

function post(body: unknown) {
  return new Request("http://localhost/api", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: typeof body === "string" ? body : JSON.stringify(body),
  });
}

const masterParams = (id = BEAT_ID) => ({ params: Promise.resolve({ id }) });

type RouteCase = {
  name: string;
  call: () => Promise<Response>;
};

const validCalls: RouteCase[] = [
  {
    name: "analyze",
    call: () =>
      analyzeRoute.POST(post({ beatId: BEAT_ID, assetId: ASSET_ID })),
  },
  {
    name: "session",
    call: () =>
      sessionRoute.POST(post({ contentType: "audio/wav", byteSize: 1000 })),
  },
  {
    name: "master session",
    call: () =>
      masterRoute.POST(
        post({ action: "session", contentType: "audio/wav", byteSize: 1000 }),
        masterParams(),
      ),
  },
  {
    name: "master complete",
    call: () =>
      masterRoute.POST(
        post({ action: "complete", assetId: ASSET_ID }),
        masterParams(),
      ),
  },
];

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  transport.calls = [];
  transport.outcome = async () => ({ id: ASSET_ID, status: "READY" });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

function failWith(error: unknown): Outcome {
  return async () => {
    throw error;
  };
}

describe.each(validCalls)("$name route", ({ call }) => {
  it.each([
    ["UNAUTHENTICATED", 401],
    ["FORBIDDEN", 403],
    ["NOT_FOUND", 404],
    ["CONFLICT", 409],
  ] as const)("maps AuthError %s to %i without logging", async (code, status) => {
    transport.outcome = failWith(new AuthError(code, `auth ${code}`));
    const response = await call();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: `auth ${code}`, code });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it.each([
    ["INVALID", 400],
    ["CONFLICT", 409],
  ] as const)("maps BeatRequestError %s to %i", async (code, status) => {
    transport.outcome = failWith(new BeatRequestError("bad request", code));
    const response = await call();
    expect(response.status).toBe(status);
    expect(await response.json()).toEqual({ error: "bad request", code });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("answers an unexpected error with a logged generic 500 and no internals", async () => {
    transport.outcome = failWith(new Error(DB_MESSAGE));
    const response = await call();
    expect(response.status).toBe(500);
    const text = await response.text();
    expect(text).not.toContain("duplicate key");
    expect(text).not.toContain("beat_audio_assets");
    expect(JSON.parse(text)).toEqual({
      error: BEAT_AUDIO_INTERNAL_ERROR,
      code: "INTERNAL",
    });
    expect(consoleError).toHaveBeenCalledTimes(1);
  });

  it("treats a non-Error throw as internal", async () => {
    transport.outcome = failWith("boom");
    const response = await call();
    expect(response.status).toBe(500);
    expect(consoleError).toHaveBeenCalledTimes(1);
  });
});

describe("input validation happens before the service", () => {
  it.each([
    ["analyze: malformed JSON", () => analyzeRoute.POST(post("{not json"))],
    ["analyze: missing ids", () => analyzeRoute.POST(post({}))],
    [
      "analyze: non-uuid beatId",
      () => analyzeRoute.POST(post({ beatId: "abc", assetId: ASSET_ID })),
    ],
    [
      "analyze: non-uuid assetId",
      () => analyzeRoute.POST(post({ beatId: BEAT_ID, assetId: "abc" })),
    ],
    ["session: malformed JSON", () => sessionRoute.POST(post("{"))],
    [
      "session: fractional byteSize",
      () =>
        sessionRoute.POST(post({ contentType: "audio/wav", byteSize: 1.5 })),
    ],
    [
      "master: non-uuid path id",
      () =>
        masterRoute.POST(
          post({ action: "complete", assetId: ASSET_ID }),
          masterParams("not-a-uuid"),
        ),
    ],
    [
      "master: malformed JSON",
      () => masterRoute.POST(post("nope"), masterParams()),
    ],
    [
      "master: unknown action",
      () => masterRoute.POST(post({ action: "delete" }), masterParams()),
    ],
    [
      "master: complete without uuid assetId",
      () =>
        masterRoute.POST(
          post({ action: "complete", assetId: "1" }),
          masterParams(),
        ),
    ],
    [
      "master: session without byteSize",
      () =>
        masterRoute.POST(
          post({ action: "session", contentType: "audio/wav" }),
          masterParams(),
        ),
    ],
  ])("%s → 400", async (_label, call) => {
    const response = await call();
    expect(response.status).toBe(400);
    expect((await response.json()).code).toBe("INVALID");
    expect(transport.calls).toHaveLength(0);
    expect(consoleError).not.toHaveBeenCalled();
  });
});

describe("success responses", () => {
  it("master complete returns only id and status", async () => {
    transport.outcome = async () => ({
      id: ASSET_ID,
      status: "READY",
      objectKey: "platform/secret/key.bin",
    });
    const response = await masterRoute.POST(
      post({ action: "complete", assetId: ASSET_ID }),
      masterParams(),
    );
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      success: true,
      assetId: ASSET_ID,
      status: "READY",
    });
  });
});
