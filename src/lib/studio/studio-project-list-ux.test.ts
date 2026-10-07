/**
 * Studio Project List UX + Delete Project — unit / architecture guards.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

import { STUDIO_PROJECT_LIST_PAGE_SIZE } from "@/config/studio";
import {
  formatStudioListDurationMs,
  formatStudioTimeMs,
} from "@/lib/studio/studio-time";

const root = process.cwd();

function read(rel: string): string {
  return readFileSync(join(root, rel), "utf8");
}

describe("formatStudioListDurationMs", () => {
  it("formats compact mm:ss without millis", () => {
    expect(formatStudioListDurationMs(0)).toBe("00:00");
    expect(formatStudioListDurationMs(60_000)).toBe("01:00");
    expect(formatStudioListDurationMs(84_500)).toBe("01:24");
  });

  it("formats hours when ≥ 1h", () => {
    expect(formatStudioListDurationMs(3_600_000)).toBe("1:00:00");
    expect(formatStudioListDurationMs(3_661_000)).toBe("1:01:01");
  });

  it("keeps playhead formatter separate (mm:ss.mmm)", () => {
    expect(formatStudioTimeMs(60_000)).toBe("01:00.000");
  });
});

describe("Studio project delete — service + route", () => {
  const service = read("src/lib/studio/studio-service.ts");
  const route = read(
    "src/app/api/studio/projects/[projectId]/route.ts",
  );
  const migration = read(
    "supabase/migrations/20261006051500_p5_1_studio_project_track_clip_foundation.sql",
  );

  it("exposes deleteStudioProjectFor with ownership + service_role delete", () => {
    expect(service).toMatch(/export async function deleteStudioProjectFor/);
    expect(service).toMatch(/await assertOwnsProject\(context, projectId\)/);
    expect(service).toMatch(/\.from\("studio_projects"\)[\s\S]*?\.delete\(\)/);
    expect(service).toMatch(/\.eq\("owner_id", context\.userId\)/);
  });

  it("DELETE route wires deleteStudioProject (not client DB)", () => {
    expect(route).toMatch(/export async function DELETE/);
    expect(route).toMatch(/deleteStudioProject/);
    expect(route).not.toMatch(/createSupabaseBrowser/);
  });

  it("schema cascades tracks/clips; Take FK is SET NULL (not CASCADE)", () => {
    expect(migration).toMatch(
      /project_id uuid NOT NULL REFERENCES public\.studio_projects \(id\) ON DELETE CASCADE/,
    );
    expect(migration).toMatch(
      /track_id uuid NOT NULL REFERENCES public\.studio_tracks \(id\) ON DELETE CASCADE/,
    );
    expect(migration).toMatch(
      /source_take_id uuid NULL REFERENCES public\.takes \(id\) ON DELETE SET NULL/,
    );
    expect(migration).not.toMatch(
      /source_take_id uuid NULL REFERENCES public\.takes \(id\) ON DELETE CASCADE/,
    );
  });

  it("delete path does not touch takes table or take storage", () => {
    const start = service.indexOf(
      "export async function deleteStudioProjectFor",
    );
    const end = service.indexOf(
      "export async function getStudioProjectDocumentFor",
    );
    expect(start).toBeGreaterThan(-1);
    expect(end).toBeGreaterThan(start);
    const deleteBlock = service.slice(start, end);
    expect(deleteBlock).not.toMatch(/\.from\("takes"\)/);
    expect(deleteBlock).not.toMatch(/storage/);
    expect(deleteBlock).not.toMatch(/audio_artifacts/);
  });
});

describe("Studio project list UX", () => {
  const list = read("src/components/studio/studio-project-list.tsx");
  const page = read("src/app/studio/page.tsx");

  it("shows Open + Delete with confirmation dialog (no window.confirm)", () => {
    expect(list).toMatch(/Otwórz/);
    expect(list).toMatch(/Usuń/);
    expect(list).toMatch(/Usuń projekt\?/);
    expect(list).toMatch(/role="dialog"/);
    expect(list).toMatch(/aria-modal="true"/);
    expect(list).toMatch(/method:\s*"DELETE"/);
    expect(list).not.toMatch(/window\.confirm/);
  });

  it("renders created/updated metadata and list duration formatter", () => {
    expect(list).toMatch(/Utworzono/);
    expect(list).toMatch(/Edytowano/);
    expect(list).toMatch(/createdAt/);
    expect(list).toMatch(/updatedAt/);
    expect(list).toMatch(/formatStudioListDurationMs/);
    expect(list).toMatch(/z bitem/);
  });

  it("has empty state + brand controls with min-h-11 touch targets", () => {
    expect(list).toMatch(/Nie masz jeszcze żadnego projektu Studio/);
    expect(list).toMatch(/Nowy projekt/);
    expect(list).toMatch(/BrdButton/);
    expect(list).toMatch(/BrdLink/);
    const brdButton = read("src/components/brand/brd-button.tsx");
    expect(brdButton).toMatch(/min-h-11/);
  });

  it("list page still requires auth via requireUser", () => {
    expect(page).toMatch(/requireUser/);
    expect(page).toMatch(/listStudioProjects/);
  });

  it("does not introduce second audio engine / transport", () => {
    expect(list).not.toMatch(/AudioContext/);
    expect(list).not.toMatch(/StudioAudioEngine/);
    expect(list).not.toMatch(/PlayerProvider/);
    expect(list).not.toMatch(/StudioTransport/);
  });

  it("supports multi-select, bulk delete, and pagination (~15)", () => {
    expect(STUDIO_PROJECT_LIST_PAGE_SIZE).toBe(15);
    expect(list).toMatch(/STUDIO_PROJECT_LIST_PAGE_SIZE/);
    expect(list).toMatch(/Zaznacz wszystko na stronie/);
    expect(list).toMatch(/Odznacz/);
    expect(list).toMatch(/Usuń zaznaczone/);
    expect(list).toMatch(/type="checkbox"/);
    expect(list).toMatch(/Następna/);
    expect(list).toMatch(/Poprzednia/);
    expect(list).toMatch(/deleteProjectRequest/);
  });
});
