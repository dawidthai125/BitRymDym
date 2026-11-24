"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, type FormEvent } from "react";

import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";
import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import type { AuthActionState } from "@/lib/auth/actions";
import { resendConfirmationAction } from "@/lib/auth/resend-confirmation-action";
import { TurnstileWidget } from "@/lib/auth/turnstile-widget";

const initialState: AuthActionState = { error: null, success: false };

export function ResendConfirmationForm() {
  const tl = useLibText();
  const t = useTranslations("auth.resendConfirmation");
  const [state, action, pending] = useActionState(resendConfirmationAction, initialState);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    // No automatic form reset: an error must not clear the address.
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <form action={action} onSubmit={onSubmit} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("eMail")}
        <input name="email" type="email" required autoComplete="email" className={AUTH_FIELD_CLASS} />
      </label>
      <TurnstileWidget />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
      {state.success && state.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {tl(state.message)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? t("wysylanie") : t("wyslijPonownie")}
      </Button>
    </form>
  );
}
