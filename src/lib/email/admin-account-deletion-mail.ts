import { escapeHtml } from "@/lib/email/html-escape";

export const ADMIN_ACCOUNT_DELETION_SUBJECT =
  "Konto w BitRymDym zostało usunięte";

function deletionReason(reason: string): string {
  return reason.trim();
}

export function buildAdminAccountDeletionText(reason: string): string {
  const why = deletionReason(reason);
  const lines = [
    "Administrator usunął Twoje konto w BitRymDym.",
    "To już jest zrobione: nie zalogujesz się na nie ponownie.",
    "Ta wiadomość niczego nie cofa.",
  ];
  if (why) {
    lines.push("", `Powód: ${why}`);
  }
  lines.push(
    "",
    "Dane prywatne zostały usunięte według zasad serwisu. Opublikowane utwory mogą zostać w zanonimizowanej formie.",
  );
  return lines.join("\n");
}

export function buildAdminAccountDeletionHtml(reason: string): string {
  const why = deletionReason(reason);
  const parts = [
    "<p>Administrator usunął Twoje konto w BitRymDym.</p>",
    "<p>To już jest zrobione: nie zalogujesz się na nie ponownie.</p>",
    "<p>Ta wiadomość niczego nie cofa.</p>",
  ];
  if (why) {
    parts.push(`<p>Powód: ${escapeHtml(why)}</p>`);
  }
  parts.push(
    "<p>Dane prywatne zostały usunięte według zasad serwisu. Opublikowane utwory mogą zostać w zanonimizowanej formie.</p>",
  );
  return parts.join("");
}

export function adminDeletionMailContainsForbidden(payload: string): boolean {
  return (
    /service_role/i.test(payload) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      payload,
    )
  );
}
