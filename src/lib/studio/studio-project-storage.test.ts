import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { removeStudioProjectFiles } from "./studio-project-storage";

const O = "11111111-1111-4111-8111-111111111111";
const P = "22222222-2222-4222-8222-222222222222";

function admin(tree: Record<string, { name: string; id: string | null }[]>) {
  const removed: string[] = [];
  const client = { storage: { from: () => ({ list: async (dir: string) => ({ data: tree[dir] ?? [], error: null }), remove: async (keys: string[]) => (removed.push(...keys), { error: null }) }) } };
  return { removed, client: client as unknown as Parameters<typeof removeStudioProjectFiles>[0] };
}

describe("removeStudioProjectFiles", () => {
  it("removes only files of this owner's project, folders included", async () => {
    const root = `studio-master/${O}/${P}`;
    const a = admin({ [root]: [{ name: "job", id: null }], [`${root}/job`]: [{ name: "out", id: null }], [`${root}/job/out`]: [{ name: "master.flac", id: "f" }], [`studio-video/${O}/${P}`]: [{ name: "a.jpg", id: "g" }] });
    await removeStudioProjectFiles(a.client, O, P);
    expect(a.removed).toEqual([`${root}/job/out/master.flac`, `studio-video/${O}/${P}/a.jpg`]);
  });

  it("never walks a prefix built from something that is not an id, and never throws", async () => {
    const a = admin({ "studio-master//": [{ name: "x", id: "1" }] });
    await removeStudioProjectFiles(a.client, "", P);
    await removeStudioProjectFiles(a.client, O, "..");
    expect(a.removed).toEqual([]);
    const log = vi.spyOn(console, "error").mockImplementation(() => {});
    await expect(removeStudioProjectFiles({} as never, O, P)).resolves.toBeUndefined();
    log.mockRestore();
  });
});
