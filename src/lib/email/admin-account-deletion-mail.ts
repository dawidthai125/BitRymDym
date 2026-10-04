import { escapeHtml } from "@/lib/email/html-escape";

export const ADMIN_ACCOUNT_DELETION_SUBJECT =
  "Twoje konto w BitRymDym zostało usunięte";

export function buildAdminAccountDeletionText(reason: string): string {
  return [
    "Konto w BitRymDym zostało usunięte przez administratora.",
    "",
    `Powód: ${reason}`,
    "",
    "Nie możesz już zalogować się na to konto. Dane prywatne zostały usunięte zgodnie z zasadami serwisu. Opublikowane utwory mogą pozostać w serwisie w zanonimizowanej formie.",
  ].join("\n");
}

export function buildAdminAccountDeletionHtml(reason: string): string {
  const safe = escapeHtml(reason);
  return [
    "<p>Konto w BitRymDym zostało usunięte przez administratora.</p>",
    `<p>Powód: ${safe}</p>`,
    "<p>Nie możesz już zalogować się na to konto. Dane prywatne zostały usunięte zgodnie z zasadami serwisu. Opublikowane utwory mogą pozostać w serwisie w zanonimizowanej formie.</p>",
  ].join("");
}

export function adminDeletionMailContainsForbidden(payload: string): boolean {
  return (
    /service_role/i.test(payload) ||
    /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i.test(
      payload,
    )
  );
}
