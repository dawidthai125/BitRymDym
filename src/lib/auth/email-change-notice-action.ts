"use server";

import { cookies } from "next/headers";

import { EMAIL_CHANGE_NOTICE_COOKIE } from "@/lib/auth/email-change";
import { emailChangeNoticeClearOptions } from "@/lib/auth/email-change-notice";

/** Drops the one-time notice. Does not accept a status from the client. */
export async function clearEmailChangeNotice(): Promise<void> {
  const jar = await cookies();
  jar.set(EMAIL_CHANGE_NOTICE_COOKIE, "", emailChangeNoticeClearOptions());
}
