import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

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
});
