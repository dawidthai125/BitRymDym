import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

const root = process.cwd();

function read(path: string) {
  return readFileSync(join(root, path), "utf8");
}

describe("beat favorites", () => {
  it("stores one row per account and beat, with own-row policies only", () => {
    const sql = read("supabase/migrations/20261108173000_beat_favorites.sql");
    expect(sql).toContain("primary key (user_id, beat_id)");
    expect(sql).toContain("for select to authenticated");
    expect(sql).toContain("for insert to authenticated");
    expect(sql).toContain("for delete to authenticated");
    expect(sql).not.toMatch(/for update/i);
    expect(sql).toContain("revoke all on public.beat_favorites from anon");
  });

  it("lists saved beats on the account tab and no longer says the list is coming later", () => {
    const page = read("src/app/account/favorites/page.tsx");
    expect(page).toContain("listFavoriteBeats");
    expect(page).not.toContain("listaUlubionychBitowPojawi");
    expect(read("src/app/library/favorites/page.tsx")).toContain('redirect("/account/favorites")');
    expect(read("src/components/brand/beat-catalog-row.tsx")).toContain("toggleBeatFavoriteAction");
  });
});

describe("admin beat delete", () => {
  it("refuses a beat that is already used and asks to archive it", () => {
    expect(read("src/lib/beats/service.ts")).toMatch(/Zarchiwizuj go, zamiast kasować/);
    const ui = read("src/components/admin/admin-beat-delete.tsx");
    expect(ui).toContain("deleteBeatAction");
    expect(ui).toContain('type="checkbox"');
  });
});
