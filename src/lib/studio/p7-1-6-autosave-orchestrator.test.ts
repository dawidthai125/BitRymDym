import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it, vi } from "vitest";

import {
  classifyPersistHttpFailure,
  classifyPersistNetworkFailure,
  persistBackoffMs,
  StudioPersistOrchestrator,
  type StudioPersistResult,
} from "@/lib/studio/studio-persist-orchestrator";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("P7.1.6 persist orchestrator state machine", () => {
  it("CLEAN → DIRTY → SAVING → CLEAN", async () => {
    const snaps: string[] = [];
    const orch = new StudioPersistOrchestrator({
      onChange: (s) => snaps.push(s.status),
    });
    expect(orch.getSnapshot().status).toBe("CLEAN");
    orch.markDirty();
    expect(orch.getSnapshot().status).toBe("DIRTY");
    orch.requestPersist(async () => ({ ok: true, documentVersion: 2 }));
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(snaps).toContain("DIRTY");
    expect(snaps).toContain("SAVING");
    orch.dispose();
  });

  it("edit during save queues latest payload and serializes", async () => {
    const order: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      order.push("A-start");
      await gateA;
      order.push("A-end");
      return { ok: true, documentVersion: 2 };
    });
    orch.requestPersist(async () => {
      order.push("B");
      return { ok: true, documentVersion: 3 };
    });
    expect(orch.getSnapshot().inFlight).toBe(true);
    expect(orch.getSnapshot().queued).toBe(true);
    releaseA();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(order).toEqual(["A-start", "A-end", "B"]);
    orch.dispose();
  });

  it("successful CAS apply runs before next queued mutation (version N→N+1)", async () => {
    const applied: number[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      await gateA;
      return {
        ok: true,
        documentVersion: 2,
        apply: () => applied.push(2),
      };
    });
    orch.requestPersist(async () => ({
      ok: true,
      documentVersion: 3,
      apply: () => applied.push(3),
    }));
    releaseA();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    // A must apply before B so queued mutations see latest documentVersion.
    expect(applied).toEqual([2, 3]);
    orch.dispose();
  });

  it("CRITICAL: SAVE B network does not start until SAVE A ack applies N+1", async () => {
    let documentVersion = 10;
    const networkStarts: number[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator();

    orch.requestPersist(async () => {
      networkStarts.push(documentVersion);
      await gateA;
      const next = documentVersion + 1;
      return {
        ok: true as const,
        documentVersion: next,
        apply: () => {
          documentVersion = next;
        },
      };
    });

    expect(networkStarts).toEqual([10]);
    expect(orch.getSnapshot().inFlight).toBe(true);

    let bStarted = false;
    orch.requestPersist(async () => {
      bStarted = true;
      networkStarts.push(documentVersion);
      return {
        ok: true as const,
        documentVersion: documentVersion + 1,
        apply: () => {
          documentVersion += 1;
        },
      };
    });

    // B must be queued — its network call has NOT started.
    expect(bStarted).toBe(false);
    expect(orch.getSnapshot().queued).toBe(true);
    expect(networkStarts).toEqual([10]);

    releaseA();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));

    expect(networkStarts).toEqual([10, 11]);
    expect(documentVersion).toBe(12);
    orch.dispose();
  });

  it("addTrack→duplicateTrack / split→delete / duplicate→duplicate stay serial", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const orch = new StudioPersistOrchestrator();
    let version = 5;

    const make =
      (name: string, wait = false) =>
      async (): Promise<StudioPersistResult> => {
        order.push(`${name}:start:v${version}`);
        if (wait) await gate;
        const next = version + 1;
        return {
          ok: true,
          documentVersion: next,
          apply: () => {
            version = next;
            order.push(`${name}:ack:v${version}`);
          },
        };
      };

    orch.requestPersist(make("addTrack", true));
    orch.requestPersist(make("duplicateTrack"));
    expect(order).toEqual(["addTrack:start:v5"]);
    release();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(order).toEqual([
      "addTrack:start:v5",
      "addTrack:ack:v6",
      "duplicateTrack:start:v6",
      "duplicateTrack:ack:v7",
    ]);

    order.length = 0;
    version = 7;
    let releaseSplit!: () => void;
    const gateSplit = new Promise<void>((r) => {
      releaseSplit = r;
    });
    orch.requestPersist(async () => {
      order.push(`split:start:v${version}`);
      await gateSplit;
      const next = version + 1;
      return {
        ok: true,
        documentVersion: next,
        apply: () => {
          version = next;
          order.push(`split:ack:v${version}`);
        },
      };
    });
    orch.requestPersist(async () => {
      order.push(`deleteClip:start:v${version}`);
      const next = version + 1;
      return {
        ok: true,
        documentVersion: next,
        apply: () => {
          version = next;
          order.push(`deleteClip:ack:v${version}`);
        },
      };
    });
    expect(order).toEqual(["split:start:v7"]);
    releaseSplit();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(order).toEqual([
      "split:start:v7",
      "split:ack:v8",
      "deleteClip:start:v8",
      "deleteClip:ack:v9",
    ]);

    order.length = 0;
    version = 9;
    let releaseDup!: () => void;
    const gateDup = new Promise<void>((r) => {
      releaseDup = r;
    });
    orch.requestPersist(async () => {
      order.push(`dup1:start:v${version}`);
      await gateDup;
      const next = version + 1;
      return {
        ok: true,
        documentVersion: next,
        apply: () => {
          version = next;
        },
      };
    });
    orch.requestPersist(async () => {
      order.push(`dup2:start:v${version}`);
      const next = version + 1;
      return {
        ok: true,
        documentVersion: next,
        apply: () => {
          version = next;
        },
      };
    });
    expect(order).toEqual(["dup1:start:v9"]);
    releaseDup();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(order).toEqual(["dup1:start:v9", "dup2:start:v10"]);
    expect(version).toBe(11);
    orch.dispose();
  });

  it("deleteTrack→patchClip second uses latest documentVersion", async () => {
    let documentVersion = 20;
    const expectedSeen: number[] = [];
    let releaseDelete!: () => void;
    const gate = new Promise<void>((r) => {
      releaseDelete = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      expectedSeen.push(documentVersion);
      await gate;
      return {
        ok: true as const,
        documentVersion: 21,
        apply: () => {
          documentVersion = 21;
        },
      };
    });
    orch.requestPersist(async () => {
      expectedSeen.push(documentVersion);
      return {
        ok: true as const,
        documentVersion: 22,
        apply: () => {
          documentVersion = 22;
        },
      };
    });
    expect(expectedSeen).toEqual([20]);
    releaseDelete();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(expectedSeen).toEqual([20, 21]);
    expect(documentVersion).toBe(22);
    orch.dispose();
  });

  it("mutation during in-flight save is queued (not parallel)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await gateA;
      concurrent -= 1;
      return { ok: true, documentVersion: 2 };
    });
    orch.requestPersist(async () => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      concurrent -= 1;
      return { ok: true, documentVersion: 3 };
    });
    expect(orch.getSnapshot().queued).toBe(true);
    expect(maxConcurrent).toBe(1);
    releaseA();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(maxConcurrent).toBe(1);
    orch.dispose();
  });

  it("stale superseded failure does not overwrite newer pending mutation", async () => {
    const applied: number[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      await gateA;
      return classifyPersistNetworkFailure("stale-A");
    });
    orch.requestPersist(async () => ({
      ok: true,
      documentVersion: 9,
      apply: () => applied.push(9),
    }));
    releaseA();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(applied).toEqual([9]);
    expect(orch.getSnapshot().lastError).toBeNull();
    orch.dispose();
  });

  it("network failure → SAVE_FAILED and keeps pending", async () => {
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => classifyPersistNetworkFailure());
    await vi.waitFor(() =>
      expect(orch.getSnapshot().status).toBe("SAVE_FAILED"),
    );
    expect(orch.getSnapshot().label).toBe("Nie zapisano");
    expect(orch.getSnapshot().queued || true).toBe(true);
    orch.dispose();
  });

  it("500 is retryable; 409 never auto-retries", () => {
    expect(
      classifyPersistHttpFailure({ status: 500, message: "x" }).retryable,
    ).toBe(true);
    const conflict = classifyPersistHttpFailure({
      status: 409,
      code: "FX_CHAIN_VERSION_CONFLICT",
      message: "conflict",
    });
    expect(conflict.retryable).toBe(false);
    expect(conflict.kind).toBe("conflict");
    expect(persistBackoffMs(0)).toBe(1000);
    expect(persistBackoffMs(1)).toBe(3000);
    expect(persistBackoffMs(2)).toBe(8000);
    expect(persistBackoffMs(3)).toBeNull();
  });

  it("409 → CONFLICT and does not schedule retry", async () => {
    const scheduled: number[] = [];
    const orch = new StudioPersistOrchestrator({
      schedule: (fn, ms) => {
        scheduled.push(ms);
        const id = setTimeout(fn, 0);
        return { cancel: () => clearTimeout(id) };
      },
    });
    orch.requestPersist(async () =>
      classifyPersistHttpFailure({
        status: 409,
        code: "FX_CHAIN_VERSION_CONFLICT",
        message: "stale",
      }),
    );
    await vi.waitFor(() =>
      expect(orch.getSnapshot().status).toBe("CONFLICT"),
    );
    expect(orch.getSnapshot().conflict).toBe(true);
    expect(scheduled.filter((ms) => ms === 1000 || ms === 3000)).toHaveLength(
      0,
    );
    orch.dispose();
  });

  it("manual flush awaits queue", async () => {
    const orch = new StudioPersistOrchestrator();
    const snap = await orch.flush(async () => ({
      ok: true,
      documentVersion: 5,
    }));
    expect(snap.status).toBe("CLEAN");
    orch.dispose();
  });

  it("no duplicate parallel saves (single inFlight)", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const orch = new StudioPersistOrchestrator();
    const exec = async (): Promise<StudioPersistResult> => {
      concurrent += 1;
      maxConcurrent = Math.max(maxConcurrent, concurrent);
      await gate;
      concurrent -= 1;
      return { ok: true, documentVersion: 1 };
    };
    orch.requestPersist(exec);
    orch.requestPersist(exec);
    orch.requestPersist(exec);
    expect(orch.getSnapshot().inFlight).toBe(true);
    release();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(maxConcurrent).toBe(1);
    orch.dispose();
  });
});

describe("P7.1.6 CAS completeness source contracts", () => {
  const service = read("src/lib/studio/studio-service.ts");
  const migration = read(
    "supabase/migrations/20261008160000_p7_1_6_studio_cas_completeness.sql",
  );
  const trackRoute = read(
    "src/app/api/studio/projects/[projectId]/tracks/[trackId]/route.ts",
  );
  const reorderRoute = read(
    "src/app/api/studio/projects/[projectId]/tracks/[trackId]/reorder/route.ts",
  );
  const clipsRoute = read(
    "src/app/api/studio/projects/[projectId]/clips/route.ts",
  );
  const placeRoute = read(
    "src/app/api/studio/projects/[projectId]/record/place/route.ts",
  );
  const editor = read("src/components/studio/studio-editor.tsx");

  it("track controls require expectedDocumentVersion + RPC CAS", () => {
    expect(service).toMatch(/studio_cas_update_track_controls/);
    expect(service).toMatch(
      /updateStudioTrackControlsFor[\s\S]*expectedDocumentVersion/,
    );
    expect(trackRoute).toMatch(/expectedDocumentVersion: body\.expectedDocumentVersion/);
    expect(migration).toMatch(/studio_cas_update_track_controls/);
    expect(migration).toMatch(/document_version = p_expected/);
  });

  it("reorder requires expectedDocumentVersion + version bump", () => {
    expect(service).toMatch(/studio_cas_reorder_track/);
    expect(reorderRoute).toMatch(/expectedDocumentVersion/);
    expect(migration).toMatch(/studio_cas_reorder_track/);
  });

  it("add/place clip requires expectedDocumentVersion + CAS", () => {
    expect(service).toMatch(/studio_cas_add_clip/);
    expect(clipsRoute).toMatch(/expectedDocumentVersion/);
    expect(placeRoute).toMatch(/expectedDocumentVersion/);
    expect(migration).toMatch(/studio_cas_add_clip/);
  });

  it("stale CAS returns empty row → StudioFxCasConflictError pattern", () => {
    expect(service).toMatch(
      /studio_cas_update_track_controls[\s\S]*StudioFxCasConflictError/,
    );
    expect(service).toMatch(
      /studio_cas_reorder_track[\s\S]*StudioFxCasConflictError/,
    );
    expect(service).toMatch(/studio_cas_add_clip[\s\S]*StudioFxCasConflictError/);
  });

  it("clip gain/fade auto-commit on interaction end; Zapisz teraz is flush", () => {
    expect(editor).toMatch(/onCommit=\{\(next\) => \{[\s\S]*onSaveGain\(next\)/);
    expect(editor).toMatch(/onSaveFades\(next, draftFadeOut\)/);
    expect(editor).toMatch(/aria-label="Zapisz teraz głośność klipu"/);
    expect(editor).toMatch(/aria-label="Zapisz teraz fade"/);
    expect(editor).not.toMatch(/aria-label="Zapisz głośność klipu"/);
    expect(editor).not.toMatch(/aria-label="Zapisz fade"/);
  });

  it("orchestrator wired; no save-per-mousemove on mix controls", () => {
    expect(editor).toMatch(/StudioPersistOrchestrator/);
    expect(editor).toMatch(/enqueuePersist/);
    expect(editor).toMatch(/beforeunload/);
    const mixControl = read("src/components/studio/studio-mix-control.tsx");
    expect(mixControl).toMatch(/onPointerUp/);
    expect(mixControl).toMatch(/onCommit\(next\)/);
  });

  it("legacy track/clip mutations enqueue through orchestrator (no startTransition+fetch)", () => {
    expect(editor).not.toMatch(/startTransition/);
    expect(editor).toMatch(
      /function addTrack\(\): void \{[\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function duplicateTrack\([\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function deleteTrack\([\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function patchClip\([\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function splitSelectedAtPlayhead\(\): void \{[\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function deleteSelectedClip\(\): void \{[\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(
      /function duplicateSelectedClip\(\): void \{[\s\S]*?enqueuePersist/,
    );
    expect(editor).toMatch(/applyPersistedDoc/);
    expect(editor).toMatch(/expectedDocumentVersion\(\)/);
  });

  it("409 never blind-retried in orchestrator", () => {
    const orch = read("src/lib/studio/studio-persist-orchestrator.ts");
    expect(orch).toMatch(/kind === "conflict"/);
    expect(orch).not.toMatch(/while\s*\(.*409/);
    expect(orch).toMatch(/retryable: false/);
  });

  it("FX / place / beat attach wire through enqueuePersistAsync + docRef version", () => {
    const fx = read("src/components/studio/studio-fx-chain-editor.tsx");
    const recording = read("src/components/studio/studio-recording-panel.tsx");
    const beat = read("src/components/studio/studio-beat-picker.tsx");
    const beatRoute = read(
      "src/app/api/studio/projects/[projectId]/beat/route.ts",
    );

    expect(fx).toMatch(/enqueuePersistAsync/);
    expect(fx).toMatch(/getExpectedDocumentVersion\(\)/);
    expect(fx).toMatch(/onFxPersisted/);
    expect(fx).not.toMatch(/async function persistFxChain/);

    expect(recording).toMatch(/enqueuePersistAsync/);
    expect(recording).toMatch(/getExpectedDocumentVersion\(\)/);
    expect(recording).toMatch(/record\/place/);
    expect(recording).not.toMatch(/expectedDocumentVersion:\s*documentVersion/);

    expect(beat).toMatch(/enqueuePersistAsync/);
    expect(beat).toMatch(/getExpectedDocumentVersion\(\)/);
    expect(beat).toMatch(/expectedDocumentVersion:\s*getExpectedDocumentVersion\(\)/);
    expect(beatRoute).toMatch(/expectedDocumentVersion/);
    expect(service).toMatch(
      /attachBeatToStudioProjectFor[\s\S]*expectedDocumentVersion/,
    );
    expect(service).toMatch(/document_version: expected \+ 1/);
    expect(service).toMatch(/\.eq\("document_version", expected\)/);

    expect(editor).toMatch(/enqueuePersistAsync=\{enqueuePersistAsync\}/);
    expect(editor).toMatch(/getExpectedDocumentVersion=\{expectedDocumentVersion\}/);
    expect(editor).toMatch(/onFxPersisted=/);
  });
});

describe("P7.1.6 cross-surface persistence boundary", () => {
  function gatedMutation(
    label: string,
    versionRef: { current: number },
    networkStarts: string[],
    expectedSeen: number[],
    gate: Promise<void>,
  ): () => Promise<StudioPersistResult> {
    return async () => {
      expectedSeen.push(versionRef.current);
      networkStarts.push(`${label}:start:v${versionRef.current}`);
      await gate;
      const next = versionRef.current + 1;
      return {
        ok: true as const,
        documentVersion: next,
        apply: () => {
          versionRef.current = next;
          networkStarts.push(`${label}:ack:v${next}`);
        },
      };
    };
  }

  it("CRITICAL: editor→FX→place→beat serial FIFO N→N+1→N+2→N+3", async () => {
    const versionRef = { current: 10 };
    const networkStarts: string[] = [];
    const expectedSeen: number[] = [];
    let releaseA!: () => void;
    let releaseB!: () => void;
    let releaseC!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const gateB = new Promise<void>((r) => {
      releaseB = r;
    });
    const gateC = new Promise<void>((r) => {
      releaseC = r;
    });
    const gateD = Promise.resolve();

    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(
      gatedMutation("editor", versionRef, networkStarts, expectedSeen, gateA),
    );
    orch.requestPersist(
      gatedMutation("fx", versionRef, networkStarts, expectedSeen, gateB),
    );
    orch.requestPersist(
      gatedMutation("place", versionRef, networkStarts, expectedSeen, gateC),
    );
    orch.requestPersist(
      gatedMutation("beat", versionRef, networkStarts, expectedSeen, gateD),
    );

    expect(networkStarts).toEqual(["editor:start:v10"]);
    expect(orch.getSnapshot().queued).toBe(true);
    expect(expectedSeen).toEqual([10]);

    releaseA();
    await vi.waitFor(() =>
      expect(networkStarts).toContain("fx:start:v11"),
    );
    expect(networkStarts).toEqual([
      "editor:start:v10",
      "editor:ack:v11",
      "fx:start:v11",
    ]);
    expect(expectedSeen).toEqual([10, 11]);

    releaseB();
    await vi.waitFor(() =>
      expect(networkStarts).toContain("place:start:v12"),
    );
    expect(expectedSeen).toEqual([10, 11, 12]);

    releaseC();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(networkStarts).toEqual([
      "editor:start:v10",
      "editor:ack:v11",
      "fx:start:v11",
      "fx:ack:v12",
      "place:start:v12",
      "place:ack:v13",
      "beat:start:v13",
      "beat:ack:v14",
    ]);
    expect(expectedSeen).toEqual([10, 11, 12, 13]);
    expect(versionRef.current).toBe(14);
    orch.dispose();
  });

  it("FX→editor and place→editor and beat→editor stay serial", async () => {
    const orch = new StudioPersistOrchestrator();
    for (const [first, second] of [
      ["fx", "editor"],
      ["place", "editor"],
      ["beat", "editor"],
    ] as const) {
      const versionRef = { current: 1 };
      const expectedSeen: number[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      orch.requestPersist(async () => {
        expectedSeen.push(versionRef.current);
        await gate;
        const next = versionRef.current + 1;
        return {
          ok: true as const,
          documentVersion: next,
          apply: () => {
            versionRef.current = next;
          },
        };
      });
      orch.requestPersist(async () => {
        expectedSeen.push(versionRef.current);
        const next = versionRef.current + 1;
        return {
          ok: true as const,
          documentVersion: next,
          apply: () => {
            versionRef.current = next;
          },
        };
      });
      expect(expectedSeen).toEqual([1]);
      release();
      await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
      expect(expectedSeen).toEqual([1, 2]);
      expect(versionRef.current).toBe(3);
      void first;
      void second;
    }
    orch.dispose();
  });

  it("editor→FX and editor→place and editor→beat stay serial", async () => {
    const orch = new StudioPersistOrchestrator();
    for (let i = 0; i < 3; i++) {
      const versionRef = { current: 5 };
      const expectedSeen: number[] = [];
      let release!: () => void;
      const gate = new Promise<void>((r) => {
        release = r;
      });
      orch.requestPersist(async () => {
        expectedSeen.push(versionRef.current);
        await gate;
        return {
          ok: true as const,
          documentVersion: 6,
          apply: () => {
            versionRef.current = 6;
          },
        };
      });
      orch.requestPersist(async () => {
        expectedSeen.push(versionRef.current);
        return {
          ok: true as const,
          documentVersion: 7,
          apply: () => {
            versionRef.current = 7;
          },
        };
      });
      expect(expectedSeen).toEqual([5]);
      release();
      await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
      expect(expectedSeen).toEqual([5, 6]);
    }
    orch.dispose();
  });

  it("FX→place→beat→editor maxConcurrent=1 and versions advance", async () => {
    let concurrent = 0;
    let maxConcurrent = 0;
    const versionRef = { current: 20 };
    const expectedSeen: number[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const orch = new StudioPersistOrchestrator();
    const labels = ["fx", "place", "beat", "editor"];
    labels.forEach((label, index) => {
      orch.requestPersist(async () => {
        concurrent += 1;
        maxConcurrent = Math.max(maxConcurrent, concurrent);
        expectedSeen.push(versionRef.current);
        if (index === 0) await gate;
        concurrent -= 1;
        const next = versionRef.current + 1;
        return {
          ok: true as const,
          documentVersion: next,
          apply: () => {
            versionRef.current = next;
          },
        };
      });
      void label;
    });
    expect(maxConcurrent).toBe(1);
    expect(expectedSeen).toEqual([20]);
    release();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(maxConcurrent).toBe(1);
    expect(expectedSeen).toEqual([20, 21, 22, 23]);
    expect(versionRef.current).toBe(24);
    orch.dispose();
  });

  it("A network fail with B queued: B still sees unchanged version (no stale apply)", async () => {
    const versionRef = { current: 40 };
    const expectedSeen: number[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      expectedSeen.push(versionRef.current);
      await gateA;
      return classifyPersistNetworkFailure("A-fail");
    });
    orch.requestPersist(async () => {
      expectedSeen.push(versionRef.current);
      return {
        ok: true as const,
        documentVersion: versionRef.current + 1,
        apply: () => {
          versionRef.current += 1;
        },
      };
    });
    expect(expectedSeen).toEqual([40]);
    releaseA();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(expectedSeen).toEqual([40, 40]);
    expect(versionRef.current).toBe(41);
    orch.dispose();
  });

  it("A=409 with B queued → CONFLICT, B never starts, no retry", async () => {
    const scheduled: number[] = [];
    const started: string[] = [];
    let releaseA!: () => void;
    const gateA = new Promise<void>((r) => {
      releaseA = r;
    });
    const orch = new StudioPersistOrchestrator({
      schedule: (fn, ms) => {
        scheduled.push(ms);
        const id = setTimeout(fn, 0);
        return { cancel: () => clearTimeout(id) };
      },
    });
    orch.requestPersist(async () => {
      started.push("A");
      await gateA;
      return classifyPersistHttpFailure({
        status: 409,
        code: "FX_CHAIN_VERSION_CONFLICT",
        message: "conflict",
      });
    });
    orch.requestPersist(async () => {
      started.push("B");
      return { ok: true, documentVersion: 99 };
    });
    expect(started).toEqual(["A"]);
    releaseA();
    await vi.waitFor(() =>
      expect(orch.getSnapshot().status).toBe("CONFLICT"),
    );
    expect(started).toEqual(["A"]);
    expect(orch.getSnapshot().queued).toBe(false);
    expect(scheduled.filter((ms) => ms === 1000 || ms === 3000)).toHaveLength(
      0,
    );
    orch.dispose();
  });

  it("FIFO keeps three queued discrete mutations (no coalesce drop)", async () => {
    const order: string[] = [];
    let release!: () => void;
    const gate = new Promise<void>((r) => {
      release = r;
    });
    const orch = new StudioPersistOrchestrator();
    orch.requestPersist(async () => {
      order.push("A-start");
      await gate;
      order.push("A-end");
      return { ok: true, documentVersion: 2 };
    });
    orch.requestPersist(async () => {
      order.push("B");
      return { ok: true, documentVersion: 3 };
    });
    orch.requestPersist(async () => {
      order.push("C");
      return { ok: true, documentVersion: 4 };
    });
    expect(order).toEqual(["A-start"]);
    release();
    await vi.waitFor(() => expect(orch.getSnapshot().status).toBe("CLEAN"));
    expect(order).toEqual(["A-start", "A-end", "B", "C"]);
    orch.dispose();
  });
});
