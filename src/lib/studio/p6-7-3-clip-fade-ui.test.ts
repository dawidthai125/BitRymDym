/**
 * P6.7.3 — Clip Fade UI + integration contract.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  buildStudioClipFadesPatchBody,
  interpretStudioClipFadesPersistResponse,
  studioClipFadesOverlapHint,
} from "@/lib/studio/studio-clip-fade";
import { FX_CHAIN_CONFLICT_UI_PL } from "@/lib/studio/studio-fx-chain";
import type { StudioClipDto } from "@/lib/studio/studio-types";

const clipFixture = (overrides: Partial<StudioClipDto> = {}): StudioClipDto => ({
  id: "11111111-1111-4111-8111-111111111111",
  trackId: "22222222-2222-4222-8222-222222222222",
  sourceKind: "BEAT_REF",
  sourceTakeId: null,
  sourceBeatId: "33333333-3333-4333-8333-333333333333",
  sourceArtifactId: null,
  timelineStartMs: 0,
  durationMs: 10_000,
  sourceOffsetMs: 0,
  gainDb: 0,
  muted: false,
  fadeInMs: 500,
  fadeOutMs: 800,
  ...overrides,
});

const editor = readFileSync(
  join(process.cwd(), "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const fadeSrc = readFileSync(
  join(process.cwd(), "src/lib/studio/studio-clip-fade.ts"),
  "utf8",
);
const mix = readFileSync(
  join(process.cwd(), "src/components/studio/studio-mix-control.tsx"),
  "utf8",
);

describe("P6.7.3 ClipEditPanel fade controls (source)", () => {
  it("renders Fade In and Fade Out in ClipEditPanel", () => {
    expect(editor).toMatch(/function ClipEditPanel/);
    expect(editor).toMatch(/ariaLabel="Fade In"/);
    expect(editor).toMatch(/ariaLabel="Fade Out"/);
    expect(editor).toMatch(/label="Fade In"/);
    expect(editor).toMatch(/label="Fade Out"/);
    expect(editor).toMatch(/aria-label="Fade klipu"/);
  });

  it("shows current fade values from clip DTO", () => {
    expect(editor).toMatch(/formatStudioTimeMs\(clip\.fadeInMs\)/);
    expect(editor).toMatch(/formatStudioTimeMs\(clip\.fadeOutMs\)/);
    expect(editor).toMatch(/Aktualnie: Fade In/);
  });

  it("allows changing Fade In / Fade Out via local drafts", () => {
    expect(editor).toMatch(/draftFadeIn/);
    expect(editor).toMatch(/draftFadeOut/);
    expect(editor).toMatch(/setDraftFadeIn/);
    expect(editor).toMatch(/setDraftFadeOut/);
    expect(editor).toMatch(/StudioMixControl/);
  });

  it("ClipEditPanel works without a selected clip (no fade section required)", () => {
    expect(editor).toMatch(
      /Wybierz klip, aby edytować: głośność, wyciszenie, fade/,
    );
    const emptyIdx = editor.indexOf("Wybierz klip, aby edytować");
    const fadeSectionIdx = editor.indexOf('aria-label="Fade klipu"');
    expect(emptyIdx).toBeGreaterThan(-1);
    expect(fadeSectionIdx).toBeGreaterThan(emptyIdx);
  });

  it("keeps existing ClipEditPanel operations", () => {
    for (const op of [
      "onMove",
      "onTrimLeftToPlayhead",
      "onTrimRightToPlayhead",
      "onSplit",
      "onDuplicate",
      "onDelete",
      "onSaveGain",
      "onSaveMute",
      "Przytnij początek",
      "Przytnij koniec",
      "Podziel",
      "Powiel",
      "Usuń",
    ]) {
      expect(editor).toContain(op);
    }
  });
});

describe("P6.7.3 save / CAS integration", () => {
  it("save builds set_fades body with expectedDocumentVersion", () => {
    const body = buildStudioClipFadesPatchBody({
      fadeInMs: 100,
      fadeOutMs: 200,
      expectedDocumentVersion: 7,
    });
    expect(body).toEqual({
      op: "set_fades",
      fadeInMs: 100,
      fadeOutMs: 200,
      expectedDocumentVersion: 7,
    });
    expect(editor).toMatch(/buildStudioClipFadesPatchBody/);
    expect(editor).toMatch(/saveClipFades/);
    expect(editor).toMatch(/expectedDocumentVersion: doc\.project\.documentVersion/);
  });

  it("success updates documentVersion and fade values from backend", () => {
    const next = clipFixture({ fadeInMs: 1200, fadeOutMs: 800 });
    const result = interpretStudioClipFadesPersistResponse(200, {
      success: true,
      clip: next,
      documentVersion: 8,
    });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.documentVersion).toBe(8);
      expect(result.clip.fadeInMs).toBe(1200);
      expect(result.clip.fadeOutMs).toBe(800);
    }
    expect(editor).toMatch(/documentVersion: result\.documentVersion/);
    expect(editor).toMatch(/result\.clip/);
  });

  it("400 validation shows error (no local apply)", () => {
    const result = interpretStudioClipFadesPersistResponse(400, {
      error: "Nie udało się zapisać fade. (fadeInMs negative)",
      code: "FX_CHAIN_INVALID",
    });
    expect(result).toEqual({
      ok: false,
      kind: "validation",
      status: 400,
      message: "Nie udało się zapisać fade. (fadeInMs negative)",
    });
  });

  it("409 conflict shows message and does not return ok payload", () => {
    const result = interpretStudioClipFadesPersistResponse(409, {
      code: "FX_CHAIN_VERSION_CONFLICT",
      error: FX_CHAIN_CONFLICT_UI_PL,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.kind).toBe("conflict");
      expect(result.message).toContain("zmieniony");
    }
  });

  it("409 does not blind-retry (no retry loop in save path)", () => {
    expect(editor).toMatch(/No blind retry/);
    expect(editor).not.toMatch(/while\s*\(.*409/);
    expect(editor).not.toMatch(/for\s*\(.*retry/);
    const saveIdx = editor.indexOf("async function saveClipFades");
    const saveChunk = editor.slice(saveIdx, saveIdx + 1200);
    expect(saveChunk).toMatch(/interpretStudioClipFadesPersistResponse/);
    // Single fetch; failure throws — no second PATCH attempt.
    expect(saveChunk.match(/await fetch\(/g)?.length).toBe(1);
    expect(saveChunk).toMatch(/throw new Error\(result\.message\)/);
    expect(saveChunk).not.toMatch(/await saveClipFades/);
  });

  it("recovery after conflict reuses Odśwież pattern", () => {
    expect(editor).toMatch(/conflictActive/);
    expect(editor).toMatch(/Odśwież/);
    expect(editor).toMatch(/window\.location\.reload/);
    expect(editor).toMatch(/FX_CHAIN_CONFLICT_UI_PL/);
  });

  it("401 unauthorized is handled", () => {
    const result = interpretStudioClipFadesPersistResponse(401, {
      error: "Wymagane logowanie.",
    });
    expect(result).toMatchObject({
      ok: false,
      kind: "unauthorized",
      status: 401,
    });
  });

  it("authorization denial (403) is handled", () => {
    const result = interpretStudioClipFadesPersistResponse(403, {});
    expect(result).toMatchObject({
      ok: false,
      kind: "forbidden",
      status: 403,
    });
    expect(result.ok === false && result.message).toMatch(/uprawnień/i);
  });

  it("explicit Zapisz fade — slider commit stays local only", () => {
    expect(editor).toMatch(/aria-label="Zapisz fade"/);
    expect(editor).toMatch(/Zapisz fade/);
    expect(editor).toMatch(/onSaveFades\(draftFadeIn, draftFadeOut\)/);
    // Fade StudioMixControl commits only update local draft — not saveClipFades
    expect(editor).toMatch(
      /ariaLabel="Fade In"[\s\S]*?onCommit=\{setDraftFadeIn\}/,
    );
    expect(editor).toMatch(
      /ariaLabel="Fade Out"[\s\S]*?onCommit=\{setDraftFadeOut\}/,
    );
    expect(editor).not.toMatch(/onCommit=\{.*saveClipFades/);
    // Save is button-gated (dirty), not pointerUp → PATCH.
    expect(editor).toMatch(/disabled=\{pending \|\| !fadeDirty\}/);
  });
});

describe("P6.7.3 UX helpers", () => {
  it("overlap hint is informational only (no local normalize)", () => {
    expect(studioClipFadesOverlapHint(6000, 6000, 10_000)).toBe(true);
    expect(studioClipFadesOverlapHint(1000, 2000, 10_000)).toBe(false);
    expect(fadeSrc).toMatch(/studioClipFadesOverlapHint/);
    expect(fadeSrc).not.toMatch(
      /function studioClipFadesOverlapHint[\s\S]*normalizeFades/,
    );
    expect(editor).toMatch(/studioClipFadesOverlapHint/);
    expect(editor).toMatch(/zostaną znormalizowane/);
  });
});

describe("P6.7.3 mobile + architecture guards", () => {
  it("transport remains reachable (sticky + labels)", () => {
    expect(editor).toMatch(/aria-label="Transport Studio"/);
    expect(editor).toMatch(/sticky top-14/);
    // Visual Parity V2 — Play label may include noBeat “wymaga bitu” suffix.
    expect(editor).toMatch(/aria-label=\{noBeat \? "Odtwórz — wymaga bitu" : "Odtwórz"\}/);
  });

  it("mobile layout guard: min-w-0, min-h-11 fade targets, safe-area", () => {
    expect(editor).toMatch(/min-w-0 space-y-3 rounded border/);
    expect(editor).toMatch(/aria-label="Zapisz fade"/);
    expect(editor).toMatch(/min-h-11 w-full min-w-0/);
    // Phase 1 DAW — safe-area clearance moved to project page shell.
    expect(editor).toMatch(/studio-daw-shell/);
    const page = readFileSync(
      join(process.cwd(), "src/app/studio/p/[projectId]/page.tsx"),
      "utf8",
    );
    expect(page).toMatch(/safe-area-inset-bottom/);
    expect(mix).toMatch(/h-11 w-full/);
  });

  it("does not invent FadeEngine / second engine / AudioContext / PlayerProvider / mix-graph", () => {
    expect(editor).not.toMatch(/FadeEngine/);
    expect(editor).not.toMatch(/AutomationEngine/);
    expect(editor).not.toMatch(/ClipFadeEngine/);
    expect(editor).not.toMatch(/new AudioContext/);
    expect(editor).not.toMatch(/new StudioAudioEngine/);
    expect(editor).not.toMatch(/PlayerProvider/);
    expect(editor).not.toMatch(/mix-graph/);
    expect(fadeSrc).not.toMatch(/FadeEngine/);
    expect(fadeSrc).not.toMatch(/PlayerProvider/);
    expect(fadeSrc).not.toMatch(/mix-graph/);
  });

  it("reuses existing Clip PATCH path — no /fade endpoint", () => {
    expect(editor).toMatch(
      /\/api\/studio\/projects\/\$\{doc\.project\.id\}\/clips\/\$\{selectedClip\.id\}/,
    );
    expect(editor).not.toMatch(/\/fade"/);
    expect(editor).not.toMatch(/\/fades"/);
  });
});
