import "server-only";

import { Resend } from "resend";

import {
  ADMIN_ACCOUNT_DELETION_SUBJECT,
  buildAdminAccountDeletionHtml,
  buildAdminAccountDeletionText,
} from "@/lib/email/admin-account-deletion-mail";
import { getResendEnv } from "@/lib/email/resend-env";

export type SendAdminAccountDeletionEmailResult =
  | { ok: true }
  | { ok: false; code: "EMAIL_NOTIFICATION_FAILED" };

export async function sendAdminAccountDeletionEmail(params: {
  to: string;
  reason: string;
}): Promise<SendAdminAccountDeletionEmailResult> {
  const env = getResendEnv();
  if (!env.isConfigured || !env.apiKey || !env.from) {
    return { ok: false, code: "EMAIL_NOTIFICATION_FAILED" };
  }

  const to = params.to.trim();
  if (!to || !to.includes("@")) {
    return { ok: false, code: "EMAIL_NOTIFICATION_FAILED" };
  }

  try {
    const resend = new Resend(env.apiKey);
    const { error } = await resend.emails.send({
      from: env.from,
      to,
      subject: ADMIN_ACCOUNT_DELETION_SUBJECT,
      text: buildAdminAccountDeletionText(params.reason),
      html: buildAdminAccountDeletionHtml(params.reason),
    });
    if (error) {
      return { ok: false, code: "EMAIL_NOTIFICATION_FAILED" };
    }
    return { ok: true };
  } catch {
    return { ok: false, code: "EMAIL_NOTIFICATION_FAILED" };
  }
}
