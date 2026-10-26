/**
 * Real EmailChangeNotice mount — ARIA roles via props (no Auth / cookies).
 */
import { afterAll, describe, expect, it } from "vitest";

import {
  closeEmailChangeNoticeMountHost,
  invalidateEmailChangeNoticeMountBundle,
  probeEmailChangeNotice,
} from "@/components/auth/email-change-notice.mount-host";

describe("EmailChangeNotice — real mount (props)", () => {
  afterAll(async () => {
    await closeEmailChangeNoticeMountHost();
  });

  it("invalid: role=alert visible in DOM and AX; no status landmark", async () => {
    invalidateEmailChangeNoticeMountBundle();
    const p = await probeEmailChangeNotice("invalid");
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.titleMatch, JSON.stringify(p)).toBe(true);
    expect(p.roleVisible, JSON.stringify(p)).toBe(true);
    expect(p.roleInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.oppositeRoleVisible, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);

  it("one: role=status visible in DOM and AX; title matches copy", async () => {
    invalidateEmailChangeNoticeMountBundle();
    const p = await probeEmailChangeNotice("one");
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.titleMatch, JSON.stringify(p)).toBe(true);
    expect(p.roleVisible, JSON.stringify(p)).toBe(true);
    expect(p.roleInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.oppositeRoleVisible, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);

  it("both: role=status visible in DOM and AX; no alert landmark", async () => {
    invalidateEmailChangeNoticeMountBundle();
    const p = await probeEmailChangeNotice("both");
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.titleMatch, JSON.stringify(p)).toBe(true);
    expect(p.roleVisible, JSON.stringify(p)).toBe(true);
    expect(p.roleInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.oppositeRoleVisible, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);

  it("unknown: role=status visible in DOM and AX; no alert landmark", async () => {
    invalidateEmailChangeNoticeMountBundle();
    const p = await probeEmailChangeNotice("unknown");
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.titleMatch, JSON.stringify(p)).toBe(true);
    expect(p.roleVisible, JSON.stringify(p)).toBe(true);
    expect(p.roleInAxTree, JSON.stringify(p)).toBe(true);
    expect(p.oppositeRoleVisible, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);

  it("absent (null): no alert or status landmarks", async () => {
    invalidateEmailChangeNoticeMountBundle();
    const p = await probeEmailChangeNotice(null);
    expect(p.mounted, JSON.stringify(p)).toBe(true);
    expect(p.roleVisible, JSON.stringify(p)).toBe(false);
    expect(p.roleInAxTree, JSON.stringify(p)).toBe(false);
    expect(p.oppositeRoleVisible, JSON.stringify(p)).toBe(false);
    expect(p.titleMatch, JSON.stringify(p)).toBe(false);
    expect(p.authShapedAttempts, JSON.stringify(p)).toBe(0);
    expect(p.networkNonLocal, JSON.stringify(p)).toBe(0);
  }, 90_000);
});
