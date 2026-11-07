import "server-only";

import { createHash } from "node:crypto";

import { signEquals } from "@/lib/payments/p24-sign";

/**
 * OpenPayU signature: MD5 hex of the raw notification body concatenated with
 * the second key (Drugi klucz MD5). The header must say algorithm=MD5 and
 * content=DOCUMENT. Any other algorithm is rejected.
 */

export function payuBodyMd5(rawBody: string, md5Key: string): string {
  return createHash("md5").update(rawBody, "utf8").update(md5Key, "utf8").digest("hex");
}

export function parseOpenPayuSignature(header: string): { algorithm: string; signature: string; content: string } | null {
  const parts = new Map<string, string>();
  for (const piece of header.split(";")) {
    const eq = piece.indexOf("=");
    if (eq <= 0) continue;
    parts.set(piece.slice(0, eq).trim().toLowerCase(), piece.slice(eq + 1).trim());
  }
  const algorithm = parts.get("algorithm") ?? "";
  const signature = parts.get("signature") ?? "";
  const content = parts.get("content") ?? "";
  if (!algorithm || !signature || !content) return null;
  return { algorithm, signature, content };
}

export function payuSignatureValid(rawBody: string, header: string | null, md5Key: string): boolean {
  if (!header || !md5Key || rawBody.length === 0) return false;
  const parsed = parseOpenPayuSignature(header);
  if (!parsed) return false;
  if (parsed.algorithm.toUpperCase() !== "MD5") return false;
  if (parsed.content.toUpperCase() !== "DOCUMENT") return false;
  if (!/^[0-9a-fA-F]{32}$/.test(parsed.signature)) return false;
  return signEquals(payuBodyMd5(rawBody, md5Key), parsed.signature.toLowerCase());
}
