import "server-only";

import { createHmac } from "node:crypto";

import { cookies } from "next/headers";

import {
  EMAIL_CHANGE_NOTICE_COOKIE,
  EMAIL_CHANGE_NOTICE_MAX_AGE_SECONDS,
  emailChangeNoticeCookieOptions,
  openEmailChangeNotice,
  sealEmailChangeNotice,
  type EmailChangeNoticeStatus,
} from "@/lib/auth/email-change";
import { getSupabaseServiceRoleKey } from "@/lib/supabase/env";

function signNotice(secret: string, body: string): string {
  return createHmac("sha256", secret).update(body).digest("base64url");
}

export async function readEmailChangeNotice(): Promise<EmailChangeNoticeStatus | null> {
  const secret = getSupabaseServiceRoleKey();
  if (!secret) return null;
  const token = (await cookies()).get(EMAIL_CHANGE_NOTICE_COOKIE)?.value;
  if (!token) return null;
  return openEmailChangeNotice(token, Date.now(), (body) => signNotice(secret, body));
}

export function noticeCookieValue(
  status: EmailChangeNoticeStatus,
): string | null {
  const secret = getSupabaseServiceRoleKey();
  if (!secret) return null;
  return sealEmailChangeNotice(status, Date.now(), (body) =>
    signNotice(secret, body),
  );
}

export function emailChangeNoticeSetOptions() {
  return emailChangeNoticeCookieOptions(
    process.env.NODE_ENV === "production",
    EMAIL_CHANGE_NOTICE_MAX_AGE_SECONDS,
  );
}

export function emailChangeNoticeClearOptions() {
  return emailChangeNoticeCookieOptions(
    process.env.NODE_ENV === "production",
    0,
  );
}
