"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useLocale, useTranslations } from "next-intl";

import { DELETE_CONFIRM_WORD, resolveLocale } from "@/i18n/config";

import Link from "next/link";
import { useActionState } from "react";

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
import { AUTH_FIELD_CLASS } from "@/components/auth/auth-field-class";
import { PasswordFieldWithToggle } from "@/components/auth/password-field-with-toggle";
import { SignupConsentCheckbox } from "@/components/legal/consent-checkbox";
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null, success: false };

export function SignInForm({ next = null }: { next?: string | null } = {}) {
  const tl = useLibText();
  const t = useTranslations("auth.authForms");
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
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

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
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
      <PasswordFieldWithToggle
        label={t("haslo")}
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <PasswordFieldWithToggle
        label={t("powtorzHaslo")}
        name="confirmPassword"
        required
        minLength={8}
        autoComplete="new-password"
        showLabel={t("pokazPowtorzoneHaslo")}
        hideLabel={t("ukryjPowtorzoneHaslo")}
      />
      <SignupConsentCheckbox />
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

  return (
    <form action={action} className="flex w-full flex-col gap-3">
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
        {t("noweHaslo")}
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("potwierdzNoweHaslo")}
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
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
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
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
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        {t("noweHaslo")}
        <input
          name="newPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        {t("potwierdzHaslo")}
        <input
          name="confirmPassword"
          type="password"
          required
          minLength={8}
          autoComplete="new-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
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
