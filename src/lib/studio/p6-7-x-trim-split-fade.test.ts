/**
 * P6.7.x — Trim/Split fade semantics + CAS contract (DF §14 / §15 / §17.2).
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import { studioApiErrorResponse } from "@/lib/studio/studio-api-error";
import {
  normalizeFades,
  resolveFadesAfterSplit,
  resolveFadesAfterTrim,
} from "@/lib/studio/studio-clip-fade";
import {
  applyStudioFxCasToState,
  parseExpectedDocumentVersion,
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";

const fadeSrc = readFileSync(
  join(process.cwd(), "src/lib/studio/studio-clip-fade.ts"),
  "utf8",
);
const service = readFileSync(
  join(process.cwd(), "src/lib/studio/studio-service.ts"),
  "utf8",
);
const patchRoute = readFileSync(
  join(
    process.cwd(),
    "src/app/api/studio/projects/[projectId]/clips/[clipId]/route.ts",
  ),
  "utf8",
);
const splitRoute = readFileSync(
  join(
    process.cwd(),
    "src/app/api/studio/projects/[projectId]/clips/[clipId]/split/route.ts",
  ),
  "utf8",
);
const casSql = readFileSync(
  join(
    process.cwd(),
    "supabase/migrations/20261007130000_p6_7_x_studio_cas_trim_split.sql",
  ),
  "utf8",
);
const editor = readFileSync(
  join(process.cwd(), "src/components/studio/studio-editor.tsx"),
  "utf8",
);

describe("P6.7.x resolveFadesAfterTrim (§14)", () => {
  it("leaves fades when D > Fi + Fo", () => {
    expect(
      resolveFadesAfterTrim({
        fadeInMs: 1000,
        fadeOutMs: 2000,
        newDurationMs: 10_000,
      }),
    ).toEqual({ fadeInMs: 1000, fadeOutMs: 2000 });
  });

  it("accepts D == Fi + Fo", () => {
    expect(
      resolveFadesAfterTrim({
        fadeInMs: 4000,
        fadeOutMs: 6000,
        newDurationMs: 10_000,
      }),
    ).toEqual({ fadeInMs: 4000, fadeOutMs: 6000 });
  });

  it("normalizes when D < Fi + Fo after clamp", () => {
    const n = resolveFadesAfterTrim({
      fadeInMs: 6000,
      fadeOutMs: 6000,
      newDurationMs: 8000,
    });
    expect(n).toEqual(normalizeFades(6000, 6000, 8000));
    expect(n.fadeInMs + n.fadeOutMs).toBe(8000);
  });

  it("clamps Fi when Fi > newD", () => {
    expect(
      resolveFadesAfterTrim({
        fadeInMs: 5000,
        fadeOutMs: 0,
        newDurationMs: 2000,
      }),
    ).toEqual({ fadeInMs: 2000, fadeOutMs: 0 });
  });

  it("clamps Fo when Fo > newD", () => {
    expect(
      resolveFadesAfterTrim({
        fadeInMs: 0,
        fadeOutMs: 9000,
        newDurationMs: 3000,
      }),
    ).toEqual({ fadeInMs: 0, fadeOutMs: 3000 });
  });

  it("keeps zeros", () => {
    expect(
      resolveFadesAfterTrim({
        fadeInMs: 0,
        fadeOutMs: 0,
        newDurationMs: 5000,
      }),
    ).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
  });

  it("returns zeros when D = 0", () => {
    expect(
      resolveFadesAfterTrim({
        fadeInMs: 100,
        fadeOutMs: 100,
        newDurationMs: 0,
      }),
    ).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
  });

  it("reuses normalizeFades (single export)", () => {
    expect(fadeSrc.match(/export function normalizeFades/g)).toHaveLength(1);
    expect(fadeSrc).toMatch(/return normalizeFades\(Fi2, Fo2, D2\)/);
  });
});

describe("P6.7.x resolveFadesAfterSplit (§15)", () => {
  const D = 10_000;
  const Fi = 2000;
  const Fo = 3000;

  it("preserves left fade-in; cut before fade-out → left Fo=0", () => {
    // fade-out starts at 7000; cut at 5000
    const { left, right } = resolveFadesAfterSplit({
      fadeInMs: Fi,
      fadeOutMs: Fo,
      durationMs: D,
      splitLocalMs: 5000,
    });
    expect(left.fadeInMs).toBe(2000);
    expect(left.fadeOutMs).toBe(0);
    expect(right.fadeInMs).toBe(0);
    expect(right.fadeOutMs).toBe(3000);
  });

  it("cut exactly at fade-out start → left Fo=0", () => {
    const { left, right } = resolveFadesAfterSplit({
      fadeInMs: Fi,
      fadeOutMs: Fo,
      durationMs: D,
      splitLocalMs: D - Fo, // 7000
    });
    expect(left.fadeOutMs).toBe(0);
    expect(right.fadeInMs).toBe(0);
    expect(right.fadeOutMs).toBe(3000);
  });

  it("cut in middle of fade-out → left gets partial Fo", () => {
    // cut at 8500 → S - (D-Fo) = 8500 - 7000 = 1500
    const { left, right } = resolveFadesAfterSplit({
      fadeInMs: Fi,
      fadeOutMs: Fo,
      durationMs: D,
      splitLocalMs: 8500,
    });
    expect(left.fadeInMs).toBe(2000);
    expect(left.fadeOutMs).toBe(1500);
    expect(right.fadeInMs).toBe(0);
    expect(right.fadeOutMs).toBe(Math.min(Fo, 1500)); // Dr=1500
    expect(right.fadeOutMs).toBe(1500);
  });

  it("cut after fade-out start near end", () => {
    const { left, right } = resolveFadesAfterSplit({
      fadeInMs: Fi,
      fadeOutMs: Fo,
      durationMs: D,
      splitLocalMs: 9500,
    });
    expect(left.fadeOutMs).toBe(2500); // 9500 - 7000
    expect(right.fadeInMs).toBe(0);
    expect(right.fadeOutMs).toBe(500); // min(3000, 500)
  });

  it("right fadeIn is always 0", () => {
    for (const S of [1000, 5000, 7000, 8500, 9900]) {
      const { right } = resolveFadesAfterSplit({
        fadeInMs: Fi,
        fadeOutMs: Fo,
        durationMs: D,
        splitLocalMs: S,
      });
      expect(right.fadeInMs).toBe(0);
    }
  });

  it("right Fo = min(originalFo, rightDuration)", () => {
    const { right } = resolveFadesAfterSplit({
      fadeInMs: 0,
      fadeOutMs: 4000,
      durationMs: 10_000,
      splitLocalMs: 8500,
    });
    expect(right.fadeOutMs).toBe(1500);
  });

  it("Fi=0 Fo=0 → both zero", () => {
    const r = resolveFadesAfterSplit({
      fadeInMs: 0,
      fadeOutMs: 0,
      durationMs: 8000,
      splitLocalMs: 3000,
    });
    expect(r.left).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
    expect(r.right).toEqual({ fadeInMs: 0, fadeOutMs: 0 });
  });

  it("normalizes original before inheritance", () => {
    // Overlapping input against D — first normalize, then split
    const r = resolveFadesAfterSplit({
      fadeInMs: 7000,
      fadeOutMs: 7000,
      durationMs: 10_000,
      splitLocalMs: 5000,
    });
    const orig = normalizeFades(7000, 7000, 10_000);
    expect(orig.fadeInMs + orig.fadeOutMs).toBe(10_000);
    expect(r.left.fadeInMs).toBe(Math.min(orig.fadeInMs, 5000));
    expect(r.right.fadeInMs).toBe(0);
  });

  it("reuses normalizeFades for left and right", () => {
    expect(fadeSrc).toMatch(/resolveFadesAfterSplit/);
    expect(fadeSrc).toMatch(/normalizeFades\(fadeInL, fadeOutL, S\)/);
    expect(fadeSrc).toMatch(/normalizeFades\(fadeInR, fadeOutR, Dr\)/);
  });
});

describe("P6.7.x Trim CAS / service contract", () => {
  it("wires geometry+fades RPC for duration-changing ops", () => {
    expect(service).toMatch(/studio_cas_apply_clip_geometry_fades/);
    expect(service).toMatch(/resolveFadesAfterTrim/);
    expect(service).toMatch(/durationChanged/);
    expect(service).toMatch(/parseExpectedDocumentVersion/);
    expect(service).toMatch(/StudioFxCasConflictError/);
  });

  it("move-only path stays non-CAS (DF §17.3)", () => {
    expect(service).toMatch(/pre-P6\.7 non-CAS path/);
    expect(service).toMatch(/if \(!durationChanged\)/);
  });

  it("CAS SQL is atomic + service_role only", () => {
    expect(casSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.studio_cas_apply_clip_geometry_fades/,
    );
    expect(casSql).toMatch(
      /document_version = studio_projects\.document_version \+ 1/,
    );
    expect(casSql).toMatch(/AND studio_projects\.document_version = p_expected/);
    expect(casSql).toMatch(/fade_in_ms = p_fade_in_ms/);
    expect(casSql).toMatch(/timeline_start_ms = p_timeline_start_ms/);
    expect(casSql).toMatch(/CLIP_NOT_FOUND/);
    expect(casSql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(casSql).not.toMatch(/CREATE TABLE/);
  });

  it("in-memory stale CAS leaves fades + version unchanged", () => {
    const state = {
      documentVersion: 7,
      fadeInMs: 100,
      fadeOutMs: 200,
      durationMs: 5000,
    };
    expect(() =>
      applyStudioFxCasToState(state, 6, (next) => {
        const fades = resolveFadesAfterTrim({
          fadeInMs: 999,
          fadeOutMs: 888,
          newDurationMs: 2000,
        });
        next.fadeInMs = fades.fadeInMs;
        next.fadeOutMs = fades.fadeOutMs;
        next.durationMs = 2000;
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(7);
    expect(state.fadeInMs).toBe(100);
    expect(state.fadeOutMs).toBe(200);
    expect(state.durationMs).toBe(5000);
  });

  it("success bumps documentVersion exactly +1 with adjusted fades", () => {
    let state = {
      documentVersion: 3,
      fadeInMs: 5000,
      fadeOutMs: 0,
      durationMs: 10_000,
    };
    state = applyStudioFxCasToState(state, 3, (next) => {
      next.durationMs = 2000;
      const fades = resolveFadesAfterTrim({
        fadeInMs: next.fadeInMs,
        fadeOutMs: next.fadeOutMs,
        newDurationMs: 2000,
      });
      next.fadeInMs = fades.fadeInMs;
      next.fadeOutMs = fades.fadeOutMs;
    });
    expect(state.documentVersion).toBe(4);
    expect(state.fadeInMs).toBe(2000);
    expect(state.fadeOutMs).toBe(0);
  });

  it("route passes expectedDocumentVersion and returns documentVersion", () => {
    expect(patchRoute).toMatch(/expectedDocumentVersion: body\.expectedDocumentVersion/);
    expect(patchRoute).toMatch(/documentVersion: result\.documentVersion/);
  });

  it("authz vocabulary for trim CAS path", () => {
    expect(studioApiErrorResponse(new AuthError("UNAUTHENTICATED", "x")).status).toBe(
      401,
    );
    expect(studioApiErrorResponse(new AuthError("FORBIDDEN", "x")).status).toBe(
      403,
    );
    expect(studioApiErrorResponse(new StudioFxCasConflictError()).status).toBe(
      409,
    );
    expect(() => parseExpectedDocumentVersion(undefined)).toThrow(
      StudioFxChainError,
    );
  });
});

describe("P6.7.x Split CAS / service contract", () => {
  it("wires atomic split RPC + resolveFadesAfterSplit", () => {
    expect(service).toMatch(/studio_cas_apply_clip_split/);
    expect(service).toMatch(/resolveFadesAfterSplit/);
    expect(service).toMatch(/p_left_fade_in_ms/);
    expect(service).toMatch(/p_right_fade_in_ms/);
    expect(service).toMatch(/p_right_fade_out_ms/);
  });

  it("split SQL is atomic (version → left update → right insert)", () => {
    expect(casSql).toMatch(
      /CREATE OR REPLACE FUNCTION public\.studio_cas_apply_clip_split/,
    );
    expect(casSql).toMatch(/INSERT INTO public\.studio_clips/);
    expect(casSql).toMatch(/source_take_id/);
    expect(casSql).toMatch(/source_beat_id/);
    expect(casSql).toMatch(/source_artifact_id/);
    expect(casSql).toMatch(/fade_in_ms,\s*\n\s*fade_out_ms/);
    expect(casSql).toMatch(/GRANT EXECUTE[\s\S]*studio_cas_apply_clip_split[\s\S]*TO service_role/);
    expect(casSql).not.toMatch(/CREATE TABLE/);
    expect(casSql).not.toMatch(/ALTER TABLE/);
  });

  it("split route requires expectedDocumentVersion and returns documentVersion", () => {
    expect(splitRoute).toMatch(/expectedDocumentVersion/);
    expect(splitRoute).toMatch(/documentVersion: result\.documentVersion/);
    expect(splitRoute).toMatch(/atTimelineMs/);
  });

  it("stale split CAS model: no mutation of source state", () => {
    const source = {
      documentVersion: 5,
      leftFadeIn: 1000,
      leftFadeOut: 0,
      rightExists: false,
    };
    expect(() =>
      applyStudioFxCasToState(source, 4, (next) => {
        next.leftFadeOut = 500;
        next.rightExists = true;
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(source.documentVersion).toBe(5);
    expect(source.leftFadeOut).toBe(0);
    expect(source.rightExists).toBe(false);
  });

  it("successful split model bumps version once", () => {
    let state = { documentVersion: 2, parts: 1 };
    state = applyStudioFxCasToState(state, 2, (next) => {
      next.parts = 2;
    });
    expect(state.documentVersion).toBe(3);
    expect(state.parts).toBe(2);
  });

  it("editor sends expectedDocumentVersion on trim + split", () => {
    expect(editor).toMatch(
      /op: "trim_left_to_playhead"[\s\S]*expectedDocumentVersion: doc\.project\.documentVersion/,
    );
    expect(editor).toMatch(
      /op: "trim_right_to_playhead"[\s\S]*expectedDocumentVersion: doc\.project\.documentVersion/,
    );
    expect(editor).toMatch(
      /expectedDocumentVersion: doc\.project\.documentVersion/,
    );
    expect(editor).toMatch(/\/split/);
  });
});

describe("P6.7.x architecture guards", () => {
  it("no FadeEngine / second engine / PlayerProvider / mix-graph / new endpoint", () => {
    for (const src of [fadeSrc, service, patchRoute, splitRoute, editor]) {
      expect(src).not.toMatch(/FadeEngine/);
      expect(src).not.toMatch(/AutomationEngine/);
      expect(src).not.toMatch(/PlayerProvider/);
      expect(src).not.toMatch(/mix-graph/);
    }
    expect(patchRoute).not.toMatch(/\/fade"/);
    expect(splitRoute).not.toMatch(/\/fade"/);
  });
});
