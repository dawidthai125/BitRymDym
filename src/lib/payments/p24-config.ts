import "server-only";

/**
 * Przelewy24 REST credentials. Missing or partial env → checkout stays off.
 * P24_SANDBOX must be explicit (`true`/`false`) so production is never the default.
 * Never log the CRC or the API key.
 */

export type P24Config = {
  merchantId: number;
  posId: number;
  crc: string;
  apiKey: string;
  sandbox: boolean;
};

function positiveInt(value: string | undefined): number | null {
  if (!value || !/^[0-9]+$/.test(value.trim())) return null;
  const n = Number(value.trim());
  if (!Number.isSafeInteger(n) || n <= 0) return null;
  return n;
}

export function readP24Config(env: Record<string, string | undefined> = process.env): P24Config | null {
  const merchantId = positiveInt(env.P24_MERCHANT_ID);
  const posId = positiveInt(env.P24_POS_ID);
  const crc = env.P24_CRC?.trim() ?? "";
  const apiKey = env.P24_API_KEY?.trim() ?? "";
  const sandboxRaw = env.P24_SANDBOX?.trim().toLowerCase() ?? "";
  if (!merchantId || !posId || !crc || !apiKey) return null;
  if (sandboxRaw !== "true" && sandboxRaw !== "false" && sandboxRaw !== "1" && sandboxRaw !== "0") return null;
  return {
    merchantId,
    posId,
    crc,
    apiKey,
    sandbox: sandboxRaw === "true" || sandboxRaw === "1",
  };
}

export function isP24Configured(env: Record<string, string | undefined> = process.env): boolean {
  return readP24Config(env) !== null;
}

export function p24Origin(sandbox: boolean): string {
  return sandbox ? "https://sandbox.przelewy24.pl" : "https://secure.przelewy24.pl";
}

export function p24BasicAuth(config: P24Config): string {
  return `Basic ${Buffer.from(`${config.posId}:${config.apiKey}`).toString("base64")}`;
}
