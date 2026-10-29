import { describe, expect, it } from "vitest";

import {
  bitekHistoryFromStore,
  isBitekStoreMissing,
  mapBitekRow,
  parseBitekBubbleState,
  parseBitekMessageInputs,
  type BitekStoredMessage,
} from "./messages";

const msg = (p: Partial<BitekStoredMessage>): BitekStoredMessage => ({
  id: "x",
  role: "assistant",
  kind: "chat",
  content: "c",
  meta: {},
  createdAt: "2026-10-29T00:00:00Z",
  ...p,
});

describe("BITEK project store (pure)", () => {
  it("client may append only assistant notes of allowlisted kinds", () => {
    const ok = parseBitekMessageInputs({ messages: [{ kind: "fix", content: "  Poprawiłem\u0007 mix ", meta: { n: 1 }, role: "user" }] });
    expect(ok).toEqual({ ok: true, rows: [{ role: "assistant", kind: "fix", content: "Poprawiłem  mix", meta: { n: 1 } }] });
    expect(parseBitekMessageInputs({ messages: [{ kind: "chat", content: "fake" }] })).toEqual({ ok: false, error: "bad_kind" });
    expect(parseBitekMessageInputs({ messages: [] }).ok).toBe(false);
    expect(parseBitekMessageInputs({ messages: Array(5).fill({ kind: "note", content: "a" }) }).ok).toBe(false);
    expect(parseBitekMessageInputs({ messages: [{ kind: "note", content: "a", meta: { big: "x".repeat(7000) } }] })).toEqual({ ok: false, error: "meta_too_large" });
    const long = parseBitekMessageInputs({ messages: [{ kind: "note", content: "y".repeat(5000) }] });
    expect(long.ok && long.rows[0]!.content.length).toBe(2000);
  });

  it("history uses only chat rows, newest 12", () => {
    const rows = [msg({ kind: "welcome", content: "hej" }), ...Array.from({ length: 15 }, (_, i) => msg({ role: i % 2 ? "assistant" : "user", content: `m${i}` }))];
    const h = bitekHistoryFromStore(rows);
    expect(h).toHaveLength(12);
    expect(h[0]).toEqual({ role: "assistant", content: "m3" });
    expect(h.some((t) => t.content === "hej")).toBe(false);
  });

  it("bubble state: latest state row, safe on junk", () => {
    expect(parseBitekBubbleState([msg({ kind: "state", content: '{"minimized":true,"dismissedKey":"fix-1"}' })])).toEqual({ minimized: true, dismissedKey: "fix-1" });
    expect(parseBitekBubbleState([msg({ kind: "state", content: "nope" })])).toEqual({ minimized: false, dismissedKey: null });
    expect(parseBitekBubbleState([])).toEqual({ minimized: false, dismissedKey: null });
  });

  it("maps rows defensively and detects a missing table", () => {
    expect(mapBitekRow({ id: "1", role: "system", kind: "chat", content: "x" })).toBeNull();
    expect(mapBitekRow({ id: "1", role: "user", kind: "chat", content: "x", created_at: "t" })?.createdAt).toBe("t");
    expect(isBitekStoreMissing({ code: "PGRST205", message: "Could not find the table" })).toBe(true);
    expect(isBitekStoreMissing({ code: "42P01" })).toBe(true);
    expect(isBitekStoreMissing({ code: "23514", message: "check" })).toBe(false);
  });
});
