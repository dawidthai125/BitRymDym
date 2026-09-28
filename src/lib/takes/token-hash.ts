import { createHash } from "node:crypto";

/**
 * SHA-256 hex of opaque anonymous Take identity token.
 * Never store or log the raw token — only this hash.
 */
export function hashAnonymousTakeToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

/** First 32 hex chars of token hash — used in anon/… object key prefix only. */
export function anonymousTakeTokenHashPrefix(tokenHash: string): string {
  if (!/^[a-f0-9]{32,}$/i.test(tokenHash)) {
    throw new Error("tokenHash must be hex");
  }
  return tokenHash.slice(0, 32).toLowerCase();
}
