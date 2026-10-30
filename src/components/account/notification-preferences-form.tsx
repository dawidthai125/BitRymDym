"use client";

import { useTranslations } from "next-intl";
import { useActionState } from "react";

import { Button } from "@/components/ui/button";
import { saveNotificationPreferencesAction, type NotificationPrefsState } from "@/lib/email/notify/actions";

const initial: NotificationPrefsState = { error: null, success: false };
const ROWS = [
  { name: "email_account", label: "kontoEtykieta", hint: "kontoOpis" },
  { name: "email_moderation", label: "moderacjaEtykieta", hint: "moderacjaOpis" },
  { name: "email_studio", label: "studioEtykieta", hint: "studioOpis" },
] as const;

export function NotificationPreferencesForm({ initialPrefs, active }: { initialPrefs: Record<(typeof ROWS)[number]["name"], boolean>; active: boolean }) {
  const t = useTranslations("account.notifications");
  const [state, action, pending] = useActionState(saveNotificationPreferencesAction, initial);
  return (
    <form action={action} className="flex flex-col gap-3" data-testid="notification-prefs">
      {!active ? <p className="text-sm text-[var(--brd-mute)]" role="note">{t("nieaktywne")}</p> : null}
      {ROWS.map((r) => (
        <label key={r.name} className="flex min-h-11 items-start gap-3 text-sm">
          <input type="checkbox" name={r.name} defaultChecked={initialPrefs[r.name]} className="mt-1 size-4 accent-[var(--brd-ink)]" />
          <span>
            <span className="block font-medium">{t(r.label)}</span>
            <span className="block text-[var(--brd-mute)]">{t(r.hint)}</span>
          </span>
        </label>
      ))}
      {state.error ? <p className="text-sm text-destructive" role="alert">{t(state.error)}</p> : null}
      {state.success ? <p className="text-sm text-[var(--brd-mute)]" role="status">{t("zapisano")}</p> : null}
      <Button type="submit" disabled={pending} className="min-h-11 self-start">{pending ? t("zapisywanie") : t("zapisz")}</Button>
    </form>
  );
}
