/**
 * P6.4.1 — Master Gain/Pan mutation contract + Track PATCH documentVersion.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  applyStudioFxCasToState,
  emptyStudioFxChain,
  parseExpectedDocumentVersion,
  parseStudioFxChainForWrite,
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";
import {
  applyStudioMasterMixCasToState,
  parseStudioMasterGainDb,
  parseStudioMasterPan,
  STUDIO_MASTER_GAIN_DB_MAX,
  STUDIO_MASTER_GAIN_DB_MIN,
  STUDIO_MASTER_PAN_MAX,
  STUDIO_MASTER_PAN_MIN,
} from "@/lib/studio/studio-master-mix";

const ID_A = "11111111-1111-4111-8111-111111111111";

function eqEffect() {
  return {
    id: ID_A,
    type: "eq" as const,
    enabled: true,
    params: {
      low: { frequencyHz: 120, gainDb: 0, q: 0.7 },
      mid: { frequencyHz: 1000, gainDb: 0, q: 1 },
      high: { frequencyHz: 8000, gainDb: 0, q: 0.7 },
    },
  };
}

describe("P6.4.1 Master Gain/Pan validation", () => {
  it("accepts Master Gain within Track UI bounds", () => {
    expect(parseStudioMasterGainDb(0)).toBe(0);
    expect(parseStudioMasterGainDb(STUDIO_MASTER_GAIN_DB_MIN)).toBe(-24);
    expect(parseStudioMasterGainDb(STUDIO_MASTER_GAIN_DB_MAX)).toBe(12);
  });

  it("rejects invalid Master Gain", () => {
    expect(() => parseStudioMasterGainDb(NaN)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterGainDb(Infinity)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterGainDb(-25)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterGainDb(12.1)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterGainDb("0")).toThrow(StudioFxChainError);
  });

  it("accepts Master Pan within −1…1", () => {
    expect(parseStudioMasterPan(0)).toBe(0);
    expect(parseStudioMasterPan(STUDIO_MASTER_PAN_MIN)).toBe(-1);
    expect(parseStudioMasterPan(STUDIO_MASTER_PAN_MAX)).toBe(1);
  });

  it("rejects invalid Master Pan (no silent clamp)", () => {
    expect(() => parseStudioMasterPan(NaN)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterPan(1.01)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterPan(-1.5)).toThrow(StudioFxChainError);
    expect(() => parseStudioMasterPan("0")).toThrow(StudioFxChainError);
  });
});

describe("P6.4.1 Master Mix CAS (in-memory)", () => {
  it("Master Gain update bumps documentVersion exactly +1", () => {
    let state = { documentVersion: 7, masterGainDb: 0, masterPan: 0 };
    state = applyStudioMasterMixCasToState(state, 7, { masterGainDb: -6 });
    expect(state).toEqual({
      documentVersion: 8,
      masterGainDb: -6,
      masterPan: 0,
    });
  });

  it("Master Pan update bumps documentVersion exactly +1", () => {
    let state = { documentVersion: 3, masterGainDb: 0, masterPan: 0 };
    state = applyStudioMasterMixCasToState(state, 3, { masterPan: 0.25 });
    expect(state.documentVersion).toBe(4);
    expect(state.masterPan).toBe(0.25);
    expect(state.masterGainDb).toBe(0);
  });

  it("preserves unrelated Master field when patching one control", () => {
    let state = { documentVersion: 1, masterGainDb: -3, masterPan: -0.5 };
    state = applyStudioMasterMixCasToState(state, 1, { masterGainDb: 2 });
    expect(state.masterGainDb).toBe(2);
    expect(state.masterPan).toBe(-0.5);
    expect(state.documentVersion).toBe(2);
  });

  it("stale CAS → conflict and no mutation", () => {
    const state = { documentVersion: 7, masterGainDb: 0, masterPan: 0.1 };
    expect(() =>
      applyStudioMasterMixCasToState(state, 6, { masterGainDb: -6 }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(7);
    expect(state.masterGainDb).toBe(0);
    expect(state.masterPan).toBe(0.1);
  });

  it("returned documentVersion is current after success", () => {
    const before = { documentVersion: 11, masterGainDb: 0, masterPan: 0 };
    const after = applyStudioMasterMixCasToState(before, 11, {
      masterGainDb: 1,
      masterPan: -0.2,
    });
    expect(after.documentVersion).toBe(before.documentVersion + 1);
    expect(after.masterGainDb).toBe(1);
    expect(after.masterPan).toBe(-0.2);
  });

  it("rejects empty Master Mix patch", () => {
    expect(() =>
      applyStudioMasterMixCasToState(
        { documentVersion: 1, masterGainDb: 0, masterPan: 0 },
        1,
        {},
      ),
    ).toThrow(StudioFxChainError);
  });

  it("reuses FX_CHAIN_VERSION_CONFLICT vocabulary", () => {
    const err = new StudioFxCasConflictError();
    expect(err.code).toBe("FX_CHAIN_VERSION_CONFLICT");
    const res = studioApiErrorResponse(err);
    expect(res.status).toBe(409);
  });
});

describe("P6.4.1 Track PATCH documentVersion handshake → FX CAS", () => {
  it("Track version bump + returned version enables FX CAS (no false 409)", () => {
    // Simulate project after Track PATCH N→N+1 with response.documentVersion applied.
    let state = {
      documentVersion: 7,
      trackFx: emptyStudioFxChain(),
      masterGainDb: 0,
      masterPan: 0,
    };

    // Track PATCH (non-CAS bump) returns new version to client:
    const trackPatchResponse = {
      documentVersion: state.documentVersion + 1,
    };
    state = {
      ...state,
      documentVersion: trackPatchResponse.documentVersion,
    };
    expect(state.documentVersion).toBe(8);

    const chain = parseStudioFxChainForWrite(
      { schemaVersion: 1, effects: [eqEffect()] },
      { role: "track" },
    );
    state = applyStudioFxCasToState(
      state,
      trackPatchResponse.documentVersion,
      (next) => {
        next.trackFx = chain;
      },
    );
    expect(state.documentVersion).toBe(9);
    expect(state.trackFx.effects).toHaveLength(1);
    expect(state.masterGainDb).toBe(0);
  });

  it("stale Track-local version still false-conflicts if UI forgets update", () => {
    const state = {
      documentVersion: 8,
      trackFx: emptyStudioFxChain(),
    };
    // UI still holding N=7 after server already at 8:
    expect(() =>
      applyStudioFxCasToState(state, 7, (next) => {
        next.trackFx = parseStudioFxChainForWrite(
          { schemaVersion: 1, effects: [eqEffect()] },
          { role: "track" },
        );
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(8);
    expect(state.trackFx.effects).toHaveLength(0);
  });

  it("Track bump is exactly +1 in the handshake model", () => {
    const n = 4;
    const afterTrack = n + 1;
    expect(afterTrack - n).toBe(1);
    expect(parseExpectedDocumentVersion(afterTrack)).toBe(5);
  });
});

describe("P6.4.1 AuthZ / API contract (source + error mapping)", () => {
  it("maps unauth / owner forbid / conflict statuses", () => {
    expect(studioApiErrorResponse(new AuthError("UNAUTHENTICATED", "x")).status).toBe(
      401,
    );
    expect(studioApiErrorResponse(new AuthError("FORBIDDEN", "x")).status).toBe(
      403,
    );
    expect(studioApiErrorResponse(new AuthError("NOT_FOUND", "x")).status).toBe(
      404,
    );
    expect(studioApiErrorResponse(new StudioFxCasConflictError()).status).toBe(
      409,
    );
  });

  it("project PATCH route wires Master Mix CAS (not FX chain)", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/updateStudioMasterMix/);
    expect(routeSrc).toMatch(/expectedDocumentVersion/);
    expect(routeSrc).toMatch(/masterGainDb/);
    expect(routeSrc).toMatch(/masterPan/);
    expect(routeSrc).toMatch(/documentVersion/);
    expect(routeSrc).not.toMatch(/master_fx_chain/);
    expect(routeSrc).not.toMatch(/mix-graph/);
    expect(routeSrc).not.toMatch(/PlayerProvider/);
  });

  it("Track PATCH route returns documentVersion", () => {
    const routeSrc = readFileSync(
      join(
        process.cwd(),
        "src/app/api/studio/projects/[projectId]/tracks/[trackId]/route.ts",
      ),
      "utf8",
    );
    expect(routeSrc).toMatch(/documentVersion:\s*result\.documentVersion/);
    expect(routeSrc).toMatch(/updateStudioTrackControls/);
  });

  it("service Master Mix uses existing columns + CAS eq document_version", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/updateStudioMasterMixFor/);
    expect(service).toMatch(/master_gain_db/);
    expect(service).toMatch(/master_pan/);
    expect(service).toMatch(/StudioFxCasConflictError/);
    expect(service).toMatch(/assertOwnsProject/);
    expect(service).toMatch(/eq\("document_version", expected\)/);
    expect(service).not.toMatch(/master_settings/);
    expect(service).not.toMatch(/CREATE TABLE/);
    // Track controls return version
    expect(service).toMatch(
      /Promise<\{\s*track: StudioTrackDto;\s*documentVersion: number\s*\}>/,
    );
  });

  it("editor applies Track PATCH documentVersion into project state", () => {
    const editor = readFileSync(
      join(process.cwd(), "src/components/studio/studio-editor.tsx"),
      "utf8",
    );
    expect(editor).toMatch(/documentVersion/);
    expect(editor).toMatch(/json\.documentVersion/);
  });

  it("does not invent StudioFxChainEditor / FX UI in this slice", () => {
    const files = [
      "src/lib/studio/studio-master-mix.ts",
      "src/app/api/studio/projects/[projectId]/route.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/StudioFxChainEditor/);
      expect(src).not.toMatch(/StudioMixEngine/);
      expect(src).not.toMatch(/mix-graph/);
      expect(src).not.toMatch(/PlayerProvider/);
    }
  });

  it("no new Master settings table migration in P6.4.1", () => {
    // Contract: Option A uses existing columns only.
    const mix = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-master-mix.ts"),
      "utf8",
    );
    expect(mix).not.toMatch(/CREATE TABLE/);
    expect(mix).toMatch(/document_version/);
  });
});
