/**
 * Rights statement before outside audio (owner decision 2026-11-26): the server refuses a stem /
 * "Sam mastering" upload session without it, and the hidden file inputs stay disabled until it is ticked.
 */
import { readFileSync } from "node:fs";

import { beforeEach, describe, expect, it, vi } from "vitest";

const createStemUploadSession = vi.fn();
vi.mock("@/lib/takes/take-transport", () => ({ createStemUploadSession: (...a: unknown[]) => createStemUploadSession(...a) }));

const read = (p: string) => readFileSync(p, "utf8");

async function post(query: string) {
  const { POST } = await import("@/app/api/studio/projects/[projectId]/stems/session/route");
  const request = new Request(`http://localhost/api/studio/projects/p1/stems/session${query}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ contentType: "audio/wav", byteSize: 1000 }),
  });
  return POST(request, { params: Promise.resolve({ projectId: "p1" }) });
}

describe("stem upload session — rights statement on the server", () => {
  beforeEach(() => {
    createStemUploadSession.mockReset();
    createStemUploadSession.mockResolvedValue({ takeId: "t1", path: "x", token: "y" });
  });

  it("refuses without ?rights=1 and opens no session", async () => {
    for (const q of ["", "?masterOnly=1", "?rights=0", "?rights=true"]) {
      const res = await post(q);
      expect(res.status).toBe(400);
      const json = (await res.json()) as { code?: string; error?: string };
      expect(json.code).toBe("RIGHTS_REQUIRED");
      expect(json.error).toMatch(/prawa/);
    }
    expect(createStemUploadSession).not.toHaveBeenCalled();
  });

  it("opens a session with ?rights=1 (Studio stems and Sam mastering)", async () => {
    expect((await post("?rights=1")).status).toBe(200);
    expect((await post("?masterOnly=1&rights=1")).status).toBe(200);
    expect(createStemUploadSession).toHaveBeenCalledTimes(2);
    expect(createStemUploadSession.mock.calls[1][0]).toMatchObject({ projectId: "p1", masterOnly: true });
  });

  it("the client sends the statement only when ticked", () => {
    const src = read("src/lib/takes/client-upload.ts");
    expect(src).toContain('if (params.rightsAccepted) query.set("rights", "1");');
    expect(read("src/lib/studio/master/master-only-bootstrap.ts")).toContain("masterOnly: true, rightsAccepted: true");
  });
});

describe("hidden file inputs are disabled until the rights box is ticked", () => {
  it("Studio stem import", () => {
    const src = read("src/components/studio/studio-stem-import.tsx");
    const input = src.slice(src.indexOf('type="file"'), src.indexOf('data-testid="studio-stem-input"'));
    expect(input).toContain("disabled={disabled || busy || freeSlots < 1 || !rights}");
  });
  it("/mastering (Sam mastering)", () => {
    const src = read("src/components/mastering/master-only-panel.tsx");
    const input = src.slice(src.indexOf('type="file"'), src.indexOf('data-testid="master-only-file"'));
    expect(input).toContain('disabled={working || dl === "working" || !rights}');
  });
});
