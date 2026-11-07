import "server-only";

/**
 * PayU REST (Checkout) credentials. Missing or partial env → PayU stays off.
 * PAYU_SANDBOX must be explicit (`true`/`false`) so production is never the default.
 * Never log the OAuth client secret or the MD5 key.
 */

export type PayuConfig = {
  posId: string;
  clientSecret: string;
  md5Key: string;
  sandbox: boolean;
};

const POS_ID = /^[0-9]{1,12}$/;

export function readPayuConfig(env: Record<string, string | undefined> = process.env): PayuConfig | null {
  const posId = env.PAYU_POS_ID?.trim() ?? "";
  const clientSecret = env.PAYU_CLIENT_SECRET?.trim() ?? "";
  const md5Key = env.PAYU_MD5_KEY?.trim() ?? "";
  const sandboxRaw = env.PAYU_SANDBOX?.trim().toLowerCase() ?? "";
  if (!POS_ID.test(posId) || posId === "0" || !clientSecret || !md5Key) return null;
  if (clientSecret.length > 512 || md5Key.length > 256) return null;
  if (sandboxRaw !== "true" && sandboxRaw !== "false" && sandboxRaw !== "1" && sandboxRaw !== "0") return null;
  return {
    posId,
    clientSecret,
    md5Key,
    sandbox: sandboxRaw === "true" || sandboxRaw === "1",
  };
}

export function isPayuConfigured(env: Record<string, string | undefined> = process.env): boolean {
  return readPayuConfig(env) !== null;
}

export function payuOrigin(sandbox: boolean): string {
  return sandbox ? "https://secure.snd.payu.com" : "https://secure.payu.com";
}
