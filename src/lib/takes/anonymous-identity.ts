import "server-only";

import { randomBytes } from "node:crypto";
import { cookies } from "next/headers";

import {
  ANON_TAKE_COOKIE_MAX_AGE_SECONDS,
  ANON_TAKE_COOKIE_NAME,
} from "@/config/recording";
import { hashAnonymousTakeToken } from "@/lib/takes/token-hash";

/**
 * Ensures httpOnly opaque anonymous Take cookie; returns server-side hash only.
 * Dedicated from download identity (`brd_dl_aid`). Raw token never persisted.
 */
export async function ensureAnonymousTakeIdentity(): Promise<{
  tokenHash: string;
}> {
  const jar = await cookies();
  const existing = jar.get(ANON_TAKE_COOKIE_NAME)?.value;
  const token =
    existing && existing.length >= 32
      ? existing
      : randomBytes(32).toString("hex");

  if (!existing || existing !== token) {
    jar.set(ANON_TAKE_COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "lax",
      path: "/",
      maxAge: ANON_TAKE_COOKIE_MAX_AGE_SECONDS,
    });
  }

  return { tokenHash: hashAnonymousTakeToken(token) };
}

/**
 * Read existing anonymous Take cookie without creating/rotating one.
 * Returns null when missing or too short.
 */
export async function readAnonymousTakeIdentity(): Promise<{
  tokenHash: string;
  rawTokenPresent: true;
} | null> {
  const jar = await cookies();
  const existing = jar.get(ANON_TAKE_COOKIE_NAME)?.value;
  if (!existing || existing.length < 32) {
    return null;
  }
  return {
    tokenHash: hashAnonymousTakeToken(existing),
    rawTokenPresent: true,
  };
}

/**
 * Clear anonymous Take cookie. Call only after successful claim / idempotent replay.
 */
export async function clearAnonymousTakeIdentity(): Promise<void> {
  const jar = await cookies();
  jar.set(ANON_TAKE_COOKIE_NAME, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 0,
  });
}
