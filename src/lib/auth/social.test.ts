import { describe, expect, it } from "vitest";

import {
  enabledSocialProviders,
  isFreshSignIn,
  isSocialOnlyUser,
  needsSocialProfileCompletion,
  pathAllowedBeforeCompletion,
} from "@/lib/auth/social";

const WEB = "Mozilla/5.0 (Linux; Android 16) Chrome/140";
const OLD_IOS = "Mozilla/5.0 (iPhone) BitRymDymApp/iOS";
const NEW_IOS = "Mozilla/5.0 (iPhone) BitRymDymApp/iOS BrdAuth/1";

describe("enabledSocialProviders", () => {
  it("nothing without the env flag", () => {
    expect(enabledSocialProviders({ configured: undefined, userAgent: WEB })).toEqual([]);
  });
  it("only known, listed providers", () => {
    expect(enabledSocialProviders({ configured: "google, github", userAgent: WEB })).toEqual(["google"]);
    expect(enabledSocialProviders({ configured: "apple,google", userAgent: NEW_IOS })).toEqual(["google", "apple"]);
  });
  it("hidden in the old iOS app", () => {
    expect(enabledSocialProviders({ configured: "google,apple", userAgent: OLD_IOS })).toEqual([]);
  });
});

describe("social accounts", () => {
  const social = { app_metadata: { provider: "google", providers: ["google"] }, user_metadata: { full_name: "X" } };
  const linked = { app_metadata: { provider: "email", providers: ["email", "google"] }, user_metadata: {} };

  it("a new social account must finish the profile", () => {
    expect(needsSocialProfileCompletion(social)).toBe(true);
    expect(needsSocialProfileCompletion({ ...social, user_metadata: { terms_version: "1" } })).toBe(false);
  });
  it("an e-mail account with Google linked is not gated and keeps password confirmation", () => {
    expect(needsSocialProfileCompletion(linked)).toBe(false);
    expect(isSocialOnlyUser(linked)).toBe(false);
    expect(isSocialOnlyUser({ app_metadata: { provider: "email" } })).toBe(false);
    expect(isSocialOnlyUser({})).toBe(false);
  });
  it("delete without a password needs a sign-in from the last 15 minutes", () => {
    const now = Date.parse("2026-11-27T10:00:00Z");
    expect(isFreshSignIn("2026-11-27T09:50:00Z", now)).toBe(true);
    expect(isFreshSignIn("2026-11-27T09:40:00Z", now)).toBe(false);
    expect(isFreshSignIn(null, now)).toBe(false);
  });
  it("before completion only auth pages and legal texts open", () => {
    expect(pathAllowedBeforeCompletion("/auth/finish")).toBe(true);
    expect(pathAllowedBeforeCompletion("/en/regulamin")).toBe(true);
    expect(pathAllowedBeforeCompletion("/studio")).toBe(false);
    expect(pathAllowedBeforeCompletion("/regulamin-fake")).toBe(false);
  });
});
