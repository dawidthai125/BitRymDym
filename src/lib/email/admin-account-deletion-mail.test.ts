import { describe, expect, it } from "vitest";

import {
  ADMIN_ACCOUNT_DELETION_SUBJECT,
  adminDeletionMailContainsForbidden,
  buildAdminAccountDeletionHtml,
  buildAdminAccountDeletionText,
} from "@/lib/email/admin-account-deletion-mail";
import { escapeHtml } from "@/lib/email/html-escape";

describe("admin deletion email contract", () => {
  it("subject and body include reason without ids", () => {
    const reason = "Naruszenie regulaminu serwisu";
    const text = buildAdminAccountDeletionText(reason);
    const html = buildAdminAccountDeletionHtml(reason);
    expect(ADMIN_ACCOUNT_DELETION_SUBJECT).toBe(
      "Twoje konto w BitRymDym zostało usunięte",
    );
    expect(text).toContain(reason);
    expect(html).toContain(reason);
    expect(adminDeletionMailContainsForbidden(text)).toBe(false);
    expect(adminDeletionMailContainsForbidden(html)).toBe(false);
    expect(text).not.toMatch(/service_role/i);
    expect(html).not.toMatch(/user_number/i);
  });

  it("HTML-escapes reason", () => {
    const html = buildAdminAccountDeletionHtml('x & <y> "z"');
    expect(html).toContain(escapeHtml('x & <y> "z"'));
    expect(html).not.toContain("<y>");
  });
});
