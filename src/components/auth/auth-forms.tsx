"use client";

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
import { Button } from "@/components/ui/button";

const initialState: AuthActionState = { error: null, success: false };

export function SignInForm() {
  const [state, action, pending] = useActionState(signInAction, initialState);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <PasswordFieldWithToggle
        label="Hasło"
        name="password"
        required
        autoComplete="current-password"
      />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Logowanie…" : "Zaloguj się"}
      </Button>
      <p className="text-sm text-muted-foreground">
        <Link
          href="/forgot-password"
          className="inline-flex min-h-11 items-center underline underline-offset-4"
        >
          Nie pamiętam hasła
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm() {
  const [state, action, pending] = useActionState(signUpAction, initialState);

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Ksywka
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
        E-mail
        <input
          name="email"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <PasswordFieldWithToggle
        label="Hasło"
        name="password"
        required
        minLength={8}
        autoComplete="new-password"
      />
      <PasswordFieldWithToggle
        label="Powtórz hasło"
        name="confirmPassword"
        required
        minLength={8}
        autoComplete="new-password"
        showLabel="Pokaż powtórzone hasło"
        hideLabel="Ukryj powtórzone hasło"
      />
      {state.error ? (
        <p className="text-sm text-destructive" role="alert">
          {state.error}
        </p>
      ) : null}
      {state.message && !state.error ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Tworzenie konta…" : "Załóż konto"}
      </Button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(
    changePasswordAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Aktualne hasło
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Nowe hasło
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
        Potwierdź nowe hasło
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
          {state.error}
        </p>
      ) : null}
      {state.success && state.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Zapisywanie…" : "Zmień hasło"}
      </Button>
    </form>
  );
}

export function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(
    requestPasswordResetAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        E-mail
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
          {state.error}
        </p>
      ) : null}
      {state.success && state.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Wysyłanie…" : "Wyślij link resetu"}
      </Button>
    </form>
  );
}

export function ResetPasswordForm() {
  const [state, action, pending] = useActionState(
    updatePasswordAfterResetAction,
    initialState,
  );

  if (state.success) {
    return (
      <div className="flex w-full max-w-sm flex-col gap-3">
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
        <Link
          href="/sign-in"
          className="inline-flex min-h-11 items-center justify-center rounded-lg border border-border px-4 text-sm underline-offset-4 hover:underline"
        >
          Zaloguj się
        </Link>
      </div>
    );
  }

  return (
    <form action={action} className="flex w-full max-w-sm flex-col gap-3">
      <label className="flex flex-col gap-1 text-sm">
        Nowe hasło
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
        Potwierdź hasło
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
          {state.error}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Zapisywanie…" : "Ustaw nowe hasło"}
      </Button>
    </form>
  );
}

export function ChangeEmailForm({ currentEmail }: { currentEmail: string }) {
  const [state, action, pending] = useActionState(
    requestEmailChangeAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <p className="text-sm text-[var(--brd-ink-soft)]">
        Obecny adres: <span className="break-all">{currentEmail || "—"}</span>
      </p>
      <p className="text-sm text-[var(--brd-mute)]">
        Zmiana zaczyna się po haśle. Adres logowania zostaje dotychczasowy,
        dopóki nie potwierdzisz wiadomości na obecnej i nowej skrzynce.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Nowy e-mail
        <input
          name="newEmail"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Powtórz nowy e-mail
        <input
          name="confirmEmail"
          type="email"
          required
          autoComplete="email"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Aktualne hasło
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
          {state.error}
        </p>
      ) : null}
      {state.pendingConfirmation && state.message ? (
        <p className="text-sm text-muted-foreground" role="status">
          {state.message}
        </p>
      ) : null}
      <Button type="submit" disabled={pending} className="min-h-11 w-full">
        {pending ? "Wysyłanie…" : "Rozpocznij zmianę e-mail"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(
    deleteAccountAction,
    initialState,
  );

  return (
    <form action={action} className="flex w-full flex-col gap-3">
      <p className="text-sm text-[var(--brd-ink-soft)]">
        Usunięcie konta jest nieodwracalne. Publiczne utwory mogą pozostać z
        anonimową ksywką. Dane prywatne (nagrania, miksy, pobrania) zostaną
        usunięte. Numer ID użytkownika nie wraca do puli.
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Aktualne hasło
        <input
          name="currentPassword"
          type="password"
          required
          autoComplete="current-password"
          className={AUTH_FIELD_CLASS}
        />
      </label>
      <label className="flex flex-col gap-1 text-sm">
        Wpisz USUŃ aby potwierdzić
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
          {state.error}
        </p>
      ) : null}
      <Button
        type="submit"
        disabled={pending}
        variant="destructive"
        className="min-h-11 w-full"
      >
        {pending ? "Usuwanie…" : "Usuń konto"}
      </Button>
    </form>
  );
}
