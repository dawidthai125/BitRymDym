import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import {
  advanceStudioPersistDocumentVersion,
  createStudioPersistVersionTip,
  resolveStudioPersistDocumentVersion,
  StudioPersistOrchestrator,
} from "@/lib/studio/studio-persist-orchestrator";

const root = process.cwd();
const migration = readFileSync(
  join(root, "supabase/migrations/20261028140000_studio_markers_cas.sql"),
  "utf8",
);
const persist = readFileSync(
  join(root, "src/lib/studio/studio-markers-persist.ts"),
  "utf8",
);
const route = readFileSync(
  join(
    root,
    "src/app/api/studio/projects/[projectId]/markers/route.ts",
  ),
  "utf8",
);
const panel = readFileSync(
  join(root, "src/components/studio/studio-markers-panel.tsx"),
  "utf8",
);
const recording = readFileSync(
  join(root, "src/components/studio/studio-recording-panel.tsx"),
  "utf8",
);
const editor = readFileSync(
  join(root, "src/components/studio/studio-editor.tsx"),
  "utf8",
);
const types = readFileSync(
  join(root, "src/lib/studio/studio-types.ts"),
  "utf8",
);
const freeze = readFileSync(
  join(root, "docs/decisions/STUDIO_MARKERS_DESIGN_FREEZE.md"),
  "utf8",
);

describe("Studio markers CAS + Inspector slice", () => {
  it("migration is additive jsonb + service_role CAS with empty-row conflict", () => {
    expect(migration).toMatch(/ADD COLUMN IF NOT EXISTS markers jsonb/);
    expect(migration).toMatch(/studio_cas_apply_markers/);
    expect(migration).toMatch(/p_op IS DISTINCT FROM 'add'/);
    expect(migration).toMatch(/p_kind IS DISTINCT FROM 'verse'/);
    expect(migration).toMatch(/p_kind IS DISTINCT FROM 'hook'/);
    expect(migration).toMatch(/positionMs/);
    expect(migration).toMatch(/SET search_path = ''/);
    expect(migration).toMatch(
      /GRANT EXECUTE[\s\S]*studio_cas_apply_markers[\s\S]*TO service_role/,
    );
    expect(migration).toMatch(
      /REVOKE ALL ON FUNCTION public\.studio_cas_apply_markers[\s\S]*FROM anon, authenticated/,
    );
    expect(migration).toMatch(/Do not db push/);
    expect(migration).not.toMatch(/supabase db push/);
  });

  it("persist owns CAS write and list; ignores client ownerId at the route", () => {
    expect(persist).toMatch(/studio_cas_apply_markers/);
    expect(persist).toMatch(/parseExpectedDocumentVersion/);
    expect(persist).toMatch(/StudioFxCasConflictError/);
    expect(persist).toMatch(/listStudioProjectMarkersCas/);
    expect(persist).not.toMatch(/mix-working-apply-service/);
    expect(route).toMatch(/requireUser/);
    expect(route).toMatch(/void body\.ownerId/);
    expect(route).toMatch(/applyStudioMarkersCas/);
  });

  it("document model and Inspector panel are wired without a second persist engine", () => {
    expect(types).toMatch(/markers\?: StudioMarkerDto\[\]/);
    expect(panel).toMatch(/data-testid="studio-markers-panel"/);
    expect(panel).toMatch(/min-h-11/);
    expect(panel).toMatch(/enqueuePersistAsync/);
    expect(panel).toMatch(/Dodaj zwrotkę/);
    expect(panel).toMatch(/Dodaj refren/);
    expect(recording).toMatch(/StudioMarkersPanel/);
    expect(freeze).toMatch(/A3 \/ P7 lite/);
    expect(freeze).toMatch(/OD-15:\*\* OPEN/);
  });

  it("panel and recording chrome ack PATCH documentVersion into the persist tip", () => {
    expect(panel).toMatch(/createStudioPersistVersionTip/);
    expect(panel).toMatch(/versionTip\.expected\(\)/);
    expect(panel).toMatch(/ackDocumentVersion\(body\.documentVersion\)/);
    expect(panel).not.toMatch(
      /expectedDocumentVersion:\s*getExpectedDocumentVersion\(\)/,
    );
    expect(recording).toMatch(/createStudioPersistVersionTip/);
    expect(recording).toMatch(/persistVersionTip\.expected/);
    expect(recording).toMatch(/const next = persistVersionTip\.applyAck\(ack\)/);
    expect(recording).toMatch(/onDocumentVersionAck\?\.\(next\)/);
    expect(recording).toMatch(/onDocumentVersionAck=\{ackDocumentVersion\}/);
    expect(editor).toMatch(/onDocumentVersionAck=\{applyAckedDocumentVersion\}/);
    expect(editor).toMatch(/advanceStudioPersistDocumentVersion/);
    expect(editor).toMatch(
      /function applyAckedDocumentVersion\(ack: unknown\): number/,
    );
  });
});

describe("Studio markers persist version tip — stale CAS regression", () => {
  it("resolveStudioPersistDocumentVersion prefers integer ack over fallback", () => {
    expect(resolveStudioPersistDocumentVersion(11, 10)).toBe(11);
    expect(resolveStudioPersistDocumentVersion("11", 10)).toBe(10);
    expect(resolveStudioPersistDocumentVersion(undefined, 10)).toBe(10);
    expect(resolveStudioPersistDocumentVersion(0, 10)).toBe(10);
  });

  it("two mutations in one session send N then N+1 without reload", async () => {
    const baseRef = { current: 10 };
    const tip = createStudioPersistVersionTip(() => baseRef.current);
    const seenExpected: number[] = [];
    const orch = new StudioPersistOrchestrator();
    const persist = (ack: number) =>
      orch.requestPersistAsync(async () => {
        const expected = tip.expected();
        seenExpected.push(expected);
        const documentVersion = tip.applyAck(ack);
        return {
          ok: true as const,
          documentVersion,
        };
      });

    const first = await persist(11);
    const second = await persist(12);

    expect(first).toMatchObject({ ok: true, documentVersion: 11 });
    expect(second).toMatchObject({ ok: true, documentVersion: 12 });
    expect(seenExpected).toEqual([10, 11]);
    expect(tip.expected()).toBe(12);
    expect(baseRef.current).toBe(10);
    orch.dispose();
  });

  it("advanceStudioPersistDocumentVersion never goes backwards", () => {
    expect(advanceStudioPersistDocumentVersion(10, 11)).toBe(11);
    expect(advanceStudioPersistDocumentVersion(11, 11)).toBe(11);
    expect(advanceStudioPersistDocumentVersion(11, 9)).toBe(11);
    expect(advanceStudioPersistDocumentVersion(10, "11")).toBe(10);
  });

  it("marker ack updates docRef so clip-move getter sees N+1", () => {
    const docRef = { current: { project: { documentVersion: 10 } } };
    const tip = createStudioPersistVersionTip(
      () => docRef.current.project.documentVersion,
    );
    const applyAckedDocumentVersion = (ack: unknown): number => {
      const next = advanceStudioPersistDocumentVersion(
        docRef.current.project.documentVersion,
        tip.applyAck(ack),
      );
      if (next > docRef.current.project.documentVersion) {
        docRef.current = { project: { documentVersion: next } };
      }
      return next;
    };
    const expectedDocumentVersion = () =>
      docRef.current.project.documentVersion;

    applyAckedDocumentVersion(11);

    expect(tip.expected()).toBe(11);
    expect(expectedDocumentVersion()).toBe(11);
    expect(docRef.current.project.documentVersion).toBe(11);
  });
});
