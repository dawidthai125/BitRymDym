"use client";

import { useTranslations } from "next-intl";
import { startTransition, useActionState, type FormEvent } from "react";

import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";
import { SignupConsentCheckbox } from "@/components/legal/consent-checkbox";
import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { signOutAction, type AuthActionState } from "@/lib/auth/actions";
import { finishSocialSignupAction } from "@/lib/auth/social-actions";

const initialState: AuthActionState = { error: null, success: false };

export function FinishSocialSignupForm({ next = null }: { next?: string | null }) {
  const tl = useLibText();
  const t = useTranslations("auth.finishPage");
  const tf = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(finishSocialSignupAction, initialState);

  // Submit without React's automatic form reset: an error must not clear what was typed.
  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  }

  return (
    <div className="flex w-full max-w-sm flex-col gap-3">
      <form action={action} onSubmit={onSubmit} className="flex flex-col gap-3">
        {next ? <input type="hidden" name="next" value={next} /> : null}
        <label className="flex flex-col gap-1 text-sm">
          {tf("ksywka")}
          <input name="displayName" type="text" required minLength={3} maxLength={30} autoComplete="nickname" className={AUTH_FIELD_CLASS} />
        </label>
        <SignupConsentCheckbox />
        {state.error ? <p className="text-sm text-destructive" role="alert">{tl(state.error)}</p> : null}
        <Button type="submit" disabled={pending} className="min-h-11 w-full">
          {pending ? tf("tworzenieKonta") : tf("zalozKonto")}
        </Button>
      </form>
      <form action={signOutAction}>
        <button type="submit" className="min-h-11 text-sm text-muted-foreground underline underline-offset-4">
          {t("wyloguj")}
        </button>
      </form>
    </div>
  );
}
