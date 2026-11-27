import { generateKeyPairSync, verify } from "node:crypto";
import { afterEach, describe, expect, it, vi } from "vitest";

const maybeSingle = vi.hoisted(() => vi.fn());

vi.mock("server-only", () => ({}));
vi.mock("@/lib/supabase/admin", () => ({
  createSupabaseAdminClient: () => ({ from: () => ({ select: () => ({ eq: () => ({ maybeSingle }) }) }) }),
}));

import { appleClientSecret, revokeAppleSignIn } from "@/lib/auth/apple-tokens";

const { privateKey, publicKey } = generateKeyPairSync("ec", { namedCurve: "P-256" });
const pem = privateKey.export({ type: "pkcs8", format: "pem" }).toString();

afterEach(() => vi.unstubAllEnvs());

describe("Sign in with Apple revoke", () => {
  it("signs a short-lived ES256 client secret", () => {
    const jwt = appleClientSecret({ keyId: "K", teamId: "T", clientId: "web.id", privateKey: pem }, 1_000_000);
    const [head, body, signature] = jwt.split(".");
    expect(JSON.parse(Buffer.from(body, "base64url").toString())).toMatchObject({ iss: "T", sub: "web.id", exp: 1300 });
    expect(
      verify("sha256", Buffer.from(`${head}.${body}`), { key: publicKey, dsaEncoding: "ieee-p1363" }, Buffer.from(signature, "base64url")),
    ).toBe(true);
  });
  it("revokes the stored token; accounts without one call nothing", async () => {
    vi.stubEnv("APPLE_SIGNIN_KEY_ID", "K");
    vi.stubEnv("APPLE_TEAM_ID", "T");
    vi.stubEnv("APPLE_SERVICES_ID", "web.id");
    vi.stubEnv("APPLE_SIGNIN_PRIVATE_KEY", pem);
    const fetcher = vi.fn().mockResolvedValue({ ok: true });
    maybeSingle.mockResolvedValue({ data: null });
    await revokeAppleSignIn("u1", fetcher);
    expect(fetcher).not.toHaveBeenCalled();
    maybeSingle.mockResolvedValue({ data: { refresh_token: "rt" } });
    await revokeAppleSignIn("u1", fetcher);
    expect(fetcher.mock.calls[0][0]).toBe("https://appleid.apple.com/auth/revoke");
    expect(String(fetcher.mock.calls[0][1].body)).toContain("token=rt");
  });
  it("never throws, so account deletion goes on", async () => {
    maybeSingle.mockRejectedValue(new Error("db"));
    await expect(revokeAppleSignIn("u1")).resolves.toBeUndefined();
  });
});
