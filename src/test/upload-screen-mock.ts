/**
 * Test double for src/lib/rights/upload-screen.ts (server IO of the 2026-11-26 upload screen).
 * Use in unit tests whose admin double does not know the new RPCs:
 *   vi.mock("@/lib/rights/upload-screen", async () => (await import("@/test/upload-screen-mock")).uploadScreenMock());
 * Every call is a pass (no block, no gate); behaviour of the real module is covered by
 * upload-screen-policy.test.ts, upload-screen.media.test.ts and the PGlite DB test.
 */
export function uploadScreenMock() {
  return {
    sha256Hex: () => "0".repeat(64),
    assertUploadNotBlocked: async () => "0".repeat(64),
    queueTakeScreening: async () => undefined,
    recordUploadRightsStatement: async () => undefined,
    attachStatementFileHash: async () => undefined,
    blockTakenDownAudio: async () => ({ ok: true as const, added: 0 }),
    hashSampleBeforeRemoval: async () => undefined,
    projectUploadGate: async () => null,
    uploadGateCode: (e: { message?: string } | null) => {
      const m = e?.message ?? "";
      return m.includes("UPLOAD_BLOCKED") ? "upload_blocked" : m.includes("UPLOAD_SCREENING_PENDING") ? "upload_screening" : null;
    },
  };
}
