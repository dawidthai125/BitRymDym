import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { cleanReport, hashReporterIp } from "@/lib/rights/content-reports";

const ok = {
  kind: "work", id: "3F2504E0-4F89-11D3-9A0C-0305E82C3301", reason: "copyright",
  details: "To mój utwór z 2024, link do oryginału.", name: "Jan Kowalski", email: "jan@example.com", goodFaith: true,
};

describe("cleanReport", () => {
  it("accepts a complete report and lower-cases the id", () => {
    expect(cleanReport(ok)).toMatchObject({ kind: "work", id: "3f2504e0-4f89-11d3-9a0c-0305e82c3301", reason: "copyright" });
  });
  it("needs the good-faith statement, a real e-mail, a name and 10+ characters", () => {
    expect(cleanReport({ ...ok, goodFaith: false })).toBeNull();
    expect(cleanReport({ ...ok, email: "jan@" })).toBeNull();
    expect(cleanReport({ ...ok, name: "J" })).toBeNull();
    expect(cleanReport({ ...ok, details: "krótko" })).toBeNull();
  });
  it("rejects unknown kinds, reasons and ids", () => {
    expect(cleanReport({ ...ok, kind: "comment" })).toBeNull();
    expect(cleanReport({ ...ok, reason: "spam" })).toBeNull();
    expect(cleanReport({ ...ok, id: "x" })).toBeNull();
  });
  it("hashes the connection, never stores the IP", () => {
    const h = hashReporterIp("1.2.3.4");
    expect(h).toHaveLength(32);
    expect(h).not.toContain("1.2.3.4");
  });
});
