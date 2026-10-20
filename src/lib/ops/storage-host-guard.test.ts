import { describe, expect, it } from "vitest";

import {
  assertScriptStorageTarget,
  classifyStorageUrl,
  describeStorageHost,
  PROD_STORAGE_ALLOW_ENV,
  PROD_STORAGE_SCRIPT_ENV,
  StorageHostGuardError,
} from "@/lib/ops/storage-host-guard";

const PROD = "https://rzzxrgcdogkybkiidqgw.supabase.co";
const LOCAL = "http://127.0.0.1:54321";

describe("storage-host-guard", () => {
  it("allows loopback", () => {
    expect(classifyStorageUrl(LOCAL).ok).toBe(true);
    expect(classifyStorageUrl(LOCAL).kind).toBe("loopback");
    expect(
      assertScriptStorageTarget({
        scriptId: "unit",
        supabaseUrl: LOCAL,
        env: {},
      }).kind,
    ).toBe("loopback");
  });

  it("refuses production without flags", () => {
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "live_verify_phase15_audio",
        supabaseUrl: PROD,
        env: {},
      }),
    ).toThrow(StorageHostGuardError);
  });

  it("refuses production with only global allow flag", () => {
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "live_verify_phase15_audio",
        supabaseUrl: PROD,
        env: { [PROD_STORAGE_ALLOW_ENV]: "1" },
      }),
    ).toThrow(/BRD_PROD_STORAGE_SCRIPT/);
  });

  it("refuses production when script id mismatches", () => {
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "live_verify_phase15_audio",
        supabaseUrl: PROD,
        env: {
          [PROD_STORAGE_ALLOW_ENV]: "1",
          [PROD_STORAGE_SCRIPT_ENV]: "other_script",
        },
      }),
    ).toThrow(/different script id/);
  });

  it("allows production only with matching script id", () => {
    const result = assertScriptStorageTarget({
      scriptId: "live_verify_phase15_audio",
      supabaseUrl: PROD,
      env: {
        [PROD_STORAGE_ALLOW_ENV]: "1",
        [PROD_STORAGE_SCRIPT_ENV]: "live_verify_phase15_audio",
      },
    });
    expect(result.kind).toBe("prod_explicit");
  });

  it("allows staging host on explicit allowlist", () => {
    const result = assertScriptStorageTarget({
      scriptId: "unit",
      supabaseUrl: "https://staging.example.test",
      env: {},
      stagingHosts: ["staging.example.test"],
    });
    expect(result.kind).toBe("staging");
  });

  it("refuses unknown remote and lookalike hosts", () => {
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "unit",
        supabaseUrl: "https://evil.example.com",
        env: {},
      }),
    ).toThrow(StorageHostGuardError);
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "unit",
        supabaseUrl: "https://rzzxrgcdogkybkiidqgw.supabase.co.evil.com",
        env: {},
      }),
    ).toThrow(StorageHostGuardError);
  });

  it("refuses missing URL and invalid URL", () => {
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "unit",
        supabaseUrl: "",
        env: {},
      }),
    ).toThrow(/missing Supabase URL/);
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "unit",
        supabaseUrl: "not-a-url",
        env: {},
      }),
    ).toThrow(/invalid/);
  });

  it("refuses empty scriptId", () => {
    expect(() =>
      assertScriptStorageTarget({
        scriptId: "  ",
        supabaseUrl: LOCAL,
        env: {},
      }),
    ).toThrow(/scriptId/);
  });

  it("describeStorageHost never returns credentials", () => {
    expect(describeStorageHost("https://user:pass@127.0.0.1:54321")).toBe(
      "127.0.0.1",
    );
  });

  it("runs before any network — pure sync throw", () => {
    const started = Date.now();
    try {
      assertScriptStorageTarget({
        scriptId: "unit",
        supabaseUrl: PROD,
        env: {},
      });
    } catch {
      /* expected */
    }
    expect(Date.now() - started).toBeLessThan(50);
  });
});
