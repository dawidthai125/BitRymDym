/**
 * P6.1 — Studio FX JSONB contract, registry, CAS algorithm, isolation.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { AuthError } from "@/lib/auth/session";
import {
  applyStudioFxCasToState,
  assertStudioFxCasMatch,
  defaultStudioFxParams,
  emptyStudioFxChain,
  parseExpectedDocumentVersion,
  parseStudioFxChainForWrite,
  readStudioFxChain,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  STUDIO_FX_DEFAULTS,
  STUDIO_FX_REGISTRY,
  STUDIO_FX_TYPES,
  StudioFxCasConflictError,
  StudioFxChainError,
} from "@/lib/studio/studio-fx-chain";

const ID_A = "aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaa1";
const ID_B = "bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbb2";

function createId(): string {
  return ID_A;
}

function eqEffect(overrides: Record<string, unknown> = {}) {
  return {
    id: ID_A,
    type: "eq",
    enabled: true,
    params: defaultStudioFxParams("eq"),
    ...overrides,
  };
}

describe("P6.1 registry", () => {
  it("lists five Studio-owned types with Track+Master support", () => {
    expect([...STUDIO_FX_TYPES]).toEqual([
      "eq",
      "compressor",
      "limiter",
      "reverb",
      "delay",
    ]);
    for (const type of STUDIO_FX_TYPES) {
      expect(STUDIO_FX_REGISTRY[type]).toEqual({ track: true, master: true });
    }
  });
});

describe("P6.1 NULL / empty", () => {
  it("NULL and missing become empty v1", () => {
    expect(readStudioFxChain(null)).toEqual(emptyStudioFxChain());
    expect(readStudioFxChain(undefined)).toEqual(emptyStudioFxChain());
    expect(emptyStudioFxChain()).toEqual({ schemaVersion: 1, effects: [] });
  });

  it("accepts empty effects array on write", () => {
    expect(
      parseStudioFxChainForWrite(
        { schemaVersion: 1, effects: [] },
        { role: "track" },
      ),
    ).toEqual(emptyStudioFxChain());
  });
});

describe("P6.1 schemaVersion", () => {
  it("rejects missing or unsupported schemaVersion on write", () => {
    expect(() =>
      parseStudioFxChainForWrite({ effects: [] }, { role: "track" }),
    ).toThrow(StudioFxChainError);
    try {
      parseStudioFxChainForWrite(
        { schemaVersion: 2, effects: [] },
        { role: "track" },
      );
    } catch (error) {
      expect(error).toBeInstanceOf(StudioFxChainError);
      expect((error as StudioFxChainError).code).toBe("FX_CHAIN_UNSUPPORTED");
    }
  });

  it("read of unsupported schema is empty, not throw", () => {
    expect(readStudioFxChain({ schemaVersion: 2, effects: [] })).toEqual(
      emptyStudioFxChain(),
    );
  });
});

describe("P6.1 effect types and defaults", () => {
  it("fills missing params with defaults", () => {
    const chain = parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [{ type: "compressor", enabled: true }],
      },
      { role: "track", createId },
    );
    expect(chain.effects[0]?.params).toEqual(STUDIO_FX_DEFAULTS.compressor);
    expect(chain.effects[0]?.id).toBe(ID_A);
  });

  it("roundtrips each type with valid params", () => {
    for (const type of STUDIO_FX_TYPES) {
      const chain = parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [
            {
              id: ID_A,
              type,
              enabled: true,
              params: defaultStudioFxParams(type),
            },
          ],
        },
        { role: "track" },
      );
      expect(chain.effects[0]?.type).toBe(type);
    }
  });

  it("persists enabled false (bypass) without dropping the effect", () => {
    const chain = parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [eqEffect({ enabled: false })],
      },
      { role: "track" },
    );
    expect(chain.effects).toHaveLength(1);
    expect(chain.effects[0]?.enabled).toBe(false);
  });
});

describe("P6.1 invalid payloads", () => {
  it("rejects unknown type", () => {
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [{ id: ID_A, type: "chorus", enabled: true, params: {} }],
        },
        { role: "track" },
      ),
    ).toThrow(StudioFxChainError);
  });

  it("rejects unknown param keys and out-of-range values", () => {
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [
            eqEffect({
              params: { ...defaultStudioFxParams("eq"), extra: 1 },
            }),
          ],
        },
        { role: "track" },
      ),
    ).toThrow(/params\.extra|FX/);
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [
            {
              id: ID_A,
              type: "delay",
              enabled: true,
              params: { mix: 2, timeMs: 250, feedback: 0.2 },
            },
          ],
        },
        { role: "track" },
      ),
    ).toThrow(StudioFxChainError);
  });

  it("rejects malformed chain and non-boolean enabled", () => {
    expect(() =>
      parseStudioFxChainForWrite("nope", { role: "track" }),
    ).toThrow(StudioFxChainError);
    expect(() =>
      parseStudioFxChainForWrite(
        { schemaVersion: 1, effects: [eqEffect({ enabled: "yes" })] },
        { role: "track" },
      ),
    ).toThrow(StudioFxChainError);
  });

  it("rejects more than 8 effects without partial accept", () => {
    const effects = Array.from({ length: 9 }, (_, i) =>
      eqEffect({
        id: `aaaaaaaa-aaaa-4aaa-8aaa-${String(i + 1).padStart(12, "0")}`,
      }),
    );
    expect(effects).toHaveLength(STUDIO_FX_CHAIN_MAX_EFFECTS + 1);
    expect(() =>
      parseStudioFxChainForWrite({ schemaVersion: 1, effects }, { role: "track" }),
    ).toThrow(/max 8/);
  });

  it("rejects extra top-level keys and duplicate ids", () => {
    expect(() =>
      parseStudioFxChainForWrite(
        { schemaVersion: 1, effects: [], order: 1 },
        { role: "track" },
      ),
    ).toThrow(StudioFxChainError);
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [
            eqEffect(),
            {
              id: ID_A,
              type: "delay",
              enabled: true,
              params: defaultStudioFxParams("delay"),
            },
          ],
        },
        { role: "track" },
      ),
    ).toThrow(/duplicate/);
  });
});

describe("P6.1 ordering", () => {
  it("array index is SSOT", () => {
    const chain = parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [
          eqEffect({ id: ID_A }),
          {
            id: ID_B,
            type: "delay",
            enabled: true,
            params: defaultStudioFxParams("delay"),
          },
        ],
      },
      { role: "track" },
    );
    expect(chain.effects.map((e) => e.type)).toEqual(["eq", "delay"]);
  });
});

describe("P6.1 master limiter last", () => {
  it("allows missing limiter and limiter as last enabled", () => {
    parseStudioFxChainForWrite(
      { schemaVersion: 1, effects: [eqEffect()] },
      { role: "master" },
    );
    parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [
          eqEffect(),
          {
            id: ID_B,
            type: "limiter",
            enabled: true,
            params: defaultStudioFxParams("limiter"),
          },
        ],
      },
      { role: "master" },
    );
  });

  it("rejects enabled limiter before another enabled master effect", () => {
    expect(() =>
      parseStudioFxChainForWrite(
        {
          schemaVersion: 1,
          effects: [
            {
              id: ID_A,
              type: "limiter",
              enabled: true,
              params: defaultStudioFxParams("limiter"),
            },
            eqEffect({ id: ID_B }),
          ],
        },
        { role: "master" },
      ),
    ).toThrow(/limiter/);
  });

  it("allows disabled limiter before enabled master effects", () => {
    parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [
          {
            id: ID_A,
            type: "limiter",
            enabled: false,
            params: defaultStudioFxParams("limiter"),
          },
          eqEffect({ id: ID_B }),
        ],
      },
      { role: "master" },
    );
  });

  it("does not apply limiter-last on track chains", () => {
    parseStudioFxChainForWrite(
      {
        schemaVersion: 1,
        effects: [
          {
            id: ID_A,
            type: "limiter",
            enabled: true,
            params: defaultStudioFxParams("limiter"),
          },
          eqEffect({ id: ID_B }),
        ],
      },
      { role: "track" },
    );
  });
});

describe("P6.1 CAS", () => {
  it("valid expected version bumps exactly once", () => {
    expect(
      assertStudioFxCasMatch({
        currentVersion: 7,
        expectedDocumentVersion: 7,
      }),
    ).toEqual({ nextVersion: 8 });
  });

  it("stale CAS throws conflict and mutate is not applied", () => {
    const state = {
      documentVersion: 7,
      master: emptyStudioFxChain(),
    };
    expect(() =>
      applyStudioFxCasToState(state, 6, (next) => {
        next.master = parseStudioFxChainForWrite(
          { schemaVersion: 1, effects: [eqEffect()] },
          { role: "master" },
        );
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(7);
    expect(state.master.effects).toHaveLength(0);
  });

  it("successful in-memory apply is atomic (version + chain)", () => {
    let state = {
      documentVersion: 7,
      master: emptyStudioFxChain(),
    };
    const chain = parseStudioFxChainForWrite(
      { schemaVersion: 1, effects: [eqEffect()] },
      { role: "master" },
    );
    state = applyStudioFxCasToState(state, 7, (next) => {
      next.master = chain;
    });
    expect(state.documentVersion).toBe(8);
    expect(state.master.effects).toHaveLength(1);
  });

  it("second writer with stale expected fails without overwrite", () => {
    let state = { documentVersion: 7, track: emptyStudioFxChain() };
    const first = parseStudioFxChainForWrite(
      { schemaVersion: 1, effects: [eqEffect()] },
      { role: "track" },
    );
    state = applyStudioFxCasToState(state, 7, (next) => {
      next.track = first;
    });
    expect(() =>
      applyStudioFxCasToState(state, 7, (next) => {
        next.track = emptyStudioFxChain();
      }),
    ).toThrow(StudioFxCasConflictError);
    expect(state.documentVersion).toBe(8);
    expect(state.track.effects).toHaveLength(1);
  });

  it("rejects non-integer expectedDocumentVersion", () => {
    expect(() => parseExpectedDocumentVersion(1.5)).toThrow(StudioFxChainError);
    expect(() => parseExpectedDocumentVersion("7")).toThrow(StudioFxChainError);
  });
});

describe("P6.1 AuthZ mapping", () => {
  it("AuthError CONFLICT remains 409 vocabulary", () => {
    const error = new AuthError(
      "CONFLICT",
      "Projekt został zmieniony. Odśwież Studio i spróbuj ponownie.",
    );
    expect(error.code).toBe("CONFLICT");
  });
});

describe("P6.1 isolation / engine untouched", () => {
  it("fx modules do not import Mix, PlayerProvider, or audio engine", () => {
    const files = [
      "src/lib/studio/studio-fx-chain.ts",
      "src/app/api/studio/projects/[projectId]/tracks/[trackId]/effects/route.ts",
      "src/app/api/studio/projects/[projectId]/master-fx/route.ts",
    ];
    for (const rel of files) {
      const src = readFileSync(join(process.cwd(), rel), "utf8");
      expect(src).not.toMatch(/mix-graph/);
      expect(src).not.toMatch(/MixPanel/);
      expect(src).not.toMatch(/player-provider/);
      expect(src).not.toMatch(/PlayerProvider/);
      expect(src).not.toMatch(/studio-audio-engine/);
      expect(src).not.toMatch(/getUserMedia/);
    }
  });

  it("studio-service FX persist does not import Mix or PlayerProvider", () => {
    const service = readFileSync(
      join(process.cwd(), "src/lib/studio/studio-service.ts"),
      "utf8",
    );
    expect(service).toMatch(/studio_cas_apply_fx_chain/);
    expect(service).not.toMatch(/mix-graph/);
    expect(service).not.toMatch(/MixPanel/);
    expect(service).not.toMatch(/player-provider/);
    expect(service).not.toMatch(/studio-audio-engine/);
  });

  it("CAS SQL is service_role only and uses existing jsonb columns", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261006121600_p6_1_studio_fx_cas.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/studio_cas_apply_fx_chain/);
    expect(sql).toMatch(/master_fx_chain/);
    expect(sql).toMatch(/effects_chain/);
    expect(sql).toMatch(/document_version = document_version \+ 1/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC/);
    expect(sql).not.toMatch(/CREATE TABLE/);
  });

  it("hotfix qualifies document_version against RETURNS TABLE ambiguity", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261006190900_p6_1_fx_cas_document_version_qualify.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/CREATE OR REPLACE FUNCTION public\.studio_cas_apply_fx_chain/);
    expect(sql).toMatch(/RETURNS TABLE \(document_version integer, chain jsonb\)/);
    expect(sql).toMatch(
      /document_version = studio_projects\.document_version \+ 1/,
    );
    expect(sql).toMatch(
      /AND studio_projects\.document_version = p_expected/,
    );
    expect(sql).not.toMatch(/SET[\s\S]*document_version = document_version \+ 1/);
    expect(sql).toMatch(/GRANT EXECUTE[\s\S]*TO service_role/);
    expect(sql).toMatch(/REVOKE ALL[\s\S]*FROM PUBLIC/);
    expect(sql).not.toMatch(/CREATE TABLE/);
    expect(sql).not.toMatch(/ALTER TABLE/);
  });

  it("P5.1 jsonb stubs still exist (no column migration)", () => {
    const sql = readFileSync(
      join(
        process.cwd(),
        "supabase/migrations/20261006051500_p5_1_studio_project_track_clip_foundation.sql",
      ),
      "utf8",
    );
    expect(sql).toMatch(/master_fx_chain jsonb NULL/);
    expect(sql).toMatch(/effects_chain jsonb NULL/);
  });
});
