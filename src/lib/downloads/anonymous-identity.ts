import "server-only";

import { randomUUID } from "node:crypto";
import { cookies } from "next/headers";

import {
  ANON_DOWNLOAD_COOKIE_MAX_AGE_SECONDS,
  ANON_DOWNLOAD_COOKIE_NAME,
} from "@/config/downloads";
import { hashAnonymousDownloadToken } from "@/lib/downloads/token-hash";

/**
 * Ensures httpOnly opaque anonymous download cookie; returns server-side hash only.
 * Raw token never persisted to DB.
 */
export async function ensureAnonymousDownloadIdentity(): Promise<{
  tokenHash: string;
}> {
  const jar = await cookies();
  const existing = jar.get(ANON_DOWNLOAD_COOKIE_NAME)?.value;
  const token =
    existing && existing.length >= 32 ? existing : randomUUID();

  if (!existing || existing !== token) {
    jar.set(ANON_DOWNLOAD_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ANON_DOWNLOAD_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return { tokenHash: hashAnonymousDownloadToken(token) };
}
