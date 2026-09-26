import { createHash } from "node:crypto";

/** SHA-256 hex of opaque anonymous download token. Never store the raw token. */
export function hashAnonymousDownloadToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
