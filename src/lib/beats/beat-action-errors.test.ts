/**
 * Security Audit Wave 3 — server action error contract (`catchAction`).
 * Real action modules + real classifier; the beats service is replaced by a
 * function that throws the error under test.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const BEAT_ID = "33333333-3333-4333-8333-333333333333";
const INFRA_MESSAGE =
  'duplicate key value violates unique constraint "beats_pkey" (SQLSTATE 23505) host=db.internal token=abc';

const state = vi.hoisted(() => ({
  outcome: (async () => ({ id: "33333333-3333-4333-8333-333333333333" })) as () => Promise<unknown>,
}));

const run = () => state.outcome();

vi.mock("next/cache", () => ({ revalidatePath: () => {} }));
vi.mock("@/lib/beats/service", () => ({
  approveUserBeat: run,
  archiveOwnUserBeat: run,
  createUserBeat: run,
  publishApprovedUserBeat: run,
  rejectUserBeat: run,
  returnRejectedUserBeatToDraft: run,
  submitUserBeat: run,
  updateOwnUserDraftMetadata: run,
  archiveBeat: run,
  deleteBeat: run,
  listPublishedBeats: run,
  transitionBeatStatus: run,
  updateBeatMetadata: run,
}));

const { AuthError } = await import("@/lib/auth/session");
const { BeatRequestError } = await import("@/lib/beats/request-error");
const { BEAT_ACTION_INTERNAL_ERROR } = await import(
  "@/lib/beats/beat-operation-error"
);
const community = await import("@/lib/beats/community-actions");
const admin = await import("@/lib/beats/actions");

const communityCalls = {
  submit: () => community.submitUserBeatAction(BEAT_ID),
  returnToDraft: () => community.returnRejectedToDraftAction(BEAT_ID),
  archive: () => community.archiveOwnUserBeatAction(BEAT_ID),
  approve: () => community.approveUserBeatAction(BEAT_ID),
  reject: () => community.rejectUserBeatAction(BEAT_ID, "Za głośny miks"),
  publish: () => community.publishApprovedUserBeatAction(BEAT_ID),
  createDraft: () => community.createUserDraftBeatAction({ title: "x" }),
  updateMetadata: () =>
    community.updateOwnUserBeatMetadataAction({ beatId: BEAT_ID, title: "x", bpm: 120 }),
};

let consoleError: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  state.outcome = async () => ({ id: BEAT_ID });
  consoleError = vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  consoleError.mockRestore();
});

describe.each(Object.keys(communityCalls) as (keyof typeof communityCalls)[])(
  "community action %s",
  (name) => {
    const call = communityCalls[name];

    it("success is reported only when the service succeeded", async () => {
      const result = await call();
      expect(result).toMatchObject({ error: null, success: true });
    });

    it("AuthError keeps its authored message, no error log", async () => {
      state.outcome = async () => {
        throw new AuthError("FORBIDDEN", "Not beat owner.");
      };
      expect(await call()).toEqual({ error: "Not beat owner.", success: false });
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("CONFLICT AuthError keeps its message", async () => {
      state.outcome = async () => {
        throw new AuthError("CONFLICT", "Beat changed during the metadata update. Reload and try again.");
      };
      expect((await call()).error).toBe(
        "Beat changed during the metadata update. Reload and try again.",
      );
    });

    it("domain validation error keeps its message", async () => {
      state.outcome = async () => {
        throw new BeatRequestError("bpm must be between 1 and 300");
      };
      expect(await call()).toEqual({
        error: "bpm must be between 1 and 300",
        success: false,
      });
      expect(consoleError).not.toHaveBeenCalled();
    });

    it("infrastructure error → generic message; details only in the server log", async () => {
      state.outcome = async () => {
        throw new Error(INFRA_MESSAGE);
      };
      const result = await call();
      expect(result).toEqual({ error: BEAT_ACTION_INTERNAL_ERROR, success: false });
      expect(JSON.stringify(result)).not.toMatch(/SQLSTATE|token|db\.internal/);
      expect(consoleError).toHaveBeenCalledTimes(1);
      expect(consoleError).toHaveBeenCalledWith(
        "[beats/community-actions] unexpected error",
        expect.objectContaining({ message: INFRA_MESSAGE }),
      );
    });

    it("non-Error throw → generic message", async () => {
      state.outcome = async () => {
        throw "boom";
      };
      expect((await call()).error).toBe(BEAT_ACTION_INTERNAL_ERROR);
    });
  },
);

describe("admin beat actions (actions.ts) keep the Polish mapping and log unexpected errors", () => {
  it("permission denial → Polish message, no log", async () => {
    state.outcome = async () => {
      throw new AuthError("FORBIDDEN", "Missing permission.");
    };
    expect(await admin.archiveBeatAction(BEAT_ID)).toEqual({
      error: "Nie masz uprawnień do tej operacji.",
      success: false,
    });
    expect(consoleError).not.toHaveBeenCalled();
  });

  it("infrastructure error → Polish generic message + server log, raw text hidden", async () => {
    state.outcome = async () => {
      throw new Error(INFRA_MESSAGE);
    };
    const result = await admin.publishBeatAction(BEAT_ID);
    expect(result.success).toBe(false);
    expect(result.error).toBe(BEAT_ACTION_INTERNAL_ERROR);
    expect(consoleError).toHaveBeenCalledWith(
      "[beats/actions] unexpected error",
      expect.any(Error),
    );
  });

  it("infrastructure 'not found' text is not misreported as a missing resource", async () => {
    state.outcome = async () => {
      throw new Error('relation "beats" not found in schema public');
    };
    expect((await admin.deleteBeatAction(BEAT_ID)).error).toBe(
      BEAT_ACTION_INTERNAL_ERROR,
    );
  });

  it("success unchanged", async () => {
    expect(await admin.archiveBeatAction(BEAT_ID)).toEqual({
      error: null,
      success: true,
      beatId: BEAT_ID,
    });
  });
});
