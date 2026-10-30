/**
 * Signed one-click unsubscribe token: base64url("<userId>.<category|all>").base64url(hmac).
 * No expiry on purpose (an unsubscribe link must keep working); it can only turn mail OFF.
 */
import { createHmac, timingSafeEqual } from "node:crypto";

import type { NotifyCategory } from "./config";

export type UnsubScope = NotifyCategory | "all";
const SCOPES = new Set<UnsubScope>(["account", "moderation", "studio", "all"]);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const mac = (secret: string, payload: string) => createHmac("sha256", secret).update(`brd-unsub:${payload}`).digest("base64url");

export function signUnsubscribeToken(secret: string, userId: string, scope: UnsubScope): string {
  const payload = Buffer.from(`${userId}.${scope}`).toString("base64url");
  return `${payload}.${mac(secret, payload)}`;
}

export function verifyUnsubscribeToken(secret: string, token: string | null | undefined): { userId: string; scope: UnsubScope } | null {
  if (!token || token.length > 300) return null;
  const [payload, sig, extra] = token.split(".");
  if (!payload || !sig || extra !== undefined) return null;
  const want = Buffer.from(mac(secret, payload));
  const got = Buffer.from(sig);
  if (want.length !== got.length || !timingSafeEqual(want, got)) return null;
  const [userId, scope] = Buffer.from(payload, "base64url").toString("utf8").split(".");
  if (!userId || !UUID.test(userId) || !SCOPES.has(scope as UnsubScope)) return null;
  return { userId, scope: scope as UnsubScope };
}
