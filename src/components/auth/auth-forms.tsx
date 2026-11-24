"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useLocale, useTranslations } from "next-intl";

import { DELETE_CONFIRM_WORD, resolveLocale } from "@/i18n/config";

import { trackEvent } from "@/lib/analytics/ga";
import Link from "@/components/ui/app-link";
import { startTransition, useActionState, useEffect, useRef, type FormEvent } from "react";

import {
  changePasswordAction,
  deleteAccountAction,
  requestEmailChangeAction,
  requestPasswordResetAction,
  signInAction,
  signUpAction,
  updatePasswordAfterResetAction,
  type AuthActionState,
} from "@/lib/auth/actions";
import { TurnstileWidget } from "@/lib/auth/turnstile-widget";
import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";
import { NewPasswordFields } from "@/components/auth/new-password-fields";
import { BrdCheckbox } from "@/components/brand/brd-checkbox";
import { KEEP_SIGNED_IN_FIELD, KEEP_SIGNED_IN_SHOWN_FIELD } from "@/lib/auth/keep-signed-in";
import { PasswordFieldWithToggle } from "@/components/auth/password-field-with-toggle";
import { SignupConsentCheckbox } from "@/components/legal/consent-checkbox";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null, success: false };

/** Submit without React's automatic form reset: an error must not clear what was typed. */
function keepValues(action: (data: FormData) => void) {
  return (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const data = new FormData(event.currentTarget);
    startTransition(() => action(data));
  };
}

export function SignInForm({ next = null }: { next?: string | null } = {}) {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex w-full max-w-sm flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        {t("eMail")}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <PasswordFieldWithToggle
        label={t("haslo")}
        name="password"
        required
        autoComplete="current-password"
      />
      <input type="hidden" name={KEEP_SIGNED_IN_SHOWN_FIELD} value="1" />
      <label className="-ml-3 flex min-h-11 cursor-pointer items-center text-sm" data-testid="keep-signed-in">
        <BrdCheckbox name={KEEP_SIGNED_IN_FIELD} defaultChecked />
        <span>{t("nieWylogowujMnie")}</span>
      </label>
      <TurnstileWidget />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {tl(pending ? t("logowanie") : t("zalogujSie"))}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          {t("niePamietamHasla")}
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next = null }: { next?: string | null } = {}) {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(signUpAction, initialState);

  useEffect(() => {
    if (state.success) trackEvent({ name: "sign_up", params: { method: "email" } });
  }, [state]);

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex w-full max-w-sm flex-col gap-3">
      {next ? <input type="hidden" name="next" value={next} /> : null}
      <label className="flex flex-col gap-1 text-sm">
        {t("ksywka")}
        <input
          name="displayName"
          type="text"
          required
          minLength={3}
          maxLength={30}
          autoComplete="nickname"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("eMail")}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <NewPasswordFields
        name="password"
        label={t("haslo")}
        confirmLabel={t("powtorzHaslo")}
      />
      <SignupConsentCheckbox />
      <TurnstileWidget />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
      {state.message && !state.error ? (
        <p className="text-sm text-muted-foreground" role="status">
          {tl(state.message)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {tl(pending ? t("tworzenieKonta") : t("zalozKonto"))}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initialState,
  );

  const formRef = useRef<HTMLFormElement>(null);

  useEffect(() => {
    if (state.success) formRef.current?.reset();
  }, [state]);

  return (
    <form ref={formRef} action={action} onSubmit={keepValues(action)} className="flex w-full flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("aktualneHaslo")}
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <NewPasswordFields
        name="newPassword"
        label={t("noweHaslo")}
        confirmLabel={t("potwierdzNoweHaslo")}
      />
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
        {tl(pending ? t("zapisywanie") : t("zmienHaslo"))}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("eMail")}
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
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
        {tl(pending ? t("wysylanie") : t("wyslijLinkResetu"))}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(
    updatePasswordAfterResetAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {tl(state.message)}
        </p>
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm underline-offset-4 hover:underline"
        >
          {t("zalogujSie")}
        </Link>
      </div>
    );
  }

  return (
    <form action={action} onSubmit={keepValues(action)} className="flex w-full max-w-sm flex-col gap-3">
      <NewPasswordFields
        name="newPassword"
        label={t("noweHaslo")}
        confirmLabel={t("potwierdzHaslo")}
      />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {tl(pending ? t("zapisywanie") : t("ustawNoweHaslo"))}
      </Button>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(
    requestEmailChangeAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <p className="text-sm text-[var(--brd-ink-soft)]">
        {t("obecnyAdres")}{" "}<span className="break-all">{tl(currentEmail || "—")}</span>
      </p>
      <p className="text-sm text-[var(--brd-mute)]">
        {t("zmianaZaczynaSiePo")}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        {t("nowyEMail")}
        <input
          name="newEmail"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("powtorzNowyEMail")}
        <input
          name="confirmEmail"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("aktualneHaslo")}
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
      {state.pendingConfirmation && state.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {tl(state.message)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {tl(pending ? t("wysylanie") : t("rozpocznijZmianeEMail"))}
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const locale = useLocale();
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(
    deleteAccountAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <p className="text-sm text-[var(--brd-ink-soft)]">
        {t("usuniecieKontaJestNieodwracalne")}
      </p>
      <label className="flex flex-col gap-1 text-sm">
        {t("aktualneHaslo")}
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("wpiszUsunAbyPotwierdzic", { word: DELETE_CONFIRM_WORD[resolveLocale(locale)] })}
        <input
          name="confirmText"
          type="text"
          required
          autoComplete="off"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(state.error)}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        variant="destructive"
        className="min-h-11 w-full"
      >
        {tl(pending ? t("usuwanie") : t("usunKonto"))}
      </Button>
    </form>
  );
}
