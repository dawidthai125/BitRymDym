"use client";

import { useId, useState, useTransition } from "react";
import { useRouter } from "next/navigation";

import { adminDeleteUserAction } from "@/app/admin/users/actions";

export function AdminUsersDeleteDialog({
  userId,
  displayName,
  email,
  userNumber,
  isSelf,
}: {
  userId: string;
  displayName: string | null;
  email: string | null;
  userNumber: number | null;
  isSelf: boolean;
}) {
  const titleId = useId();
  const reasonId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function close() {
    setOpen(false);
    setReason("");
    setError(null);
    setNotice(null);
  }

  function submit() {
    setError(null);
    setNotice(null);
    startTransition(async () => {
      const result = await adminDeleteUserAction({
        targetUserId: userId,
        reason,
      });
      if (!result.success) {
        setError(result.error ?? "Nie udało się usunąć konta.");
        return;
      }
      router.refresh();
      if (
        result.code === "EMAIL_NOTIFICATION_FAILED" ||
        result.code === "AUDIT_FAILED"
      ) {
        setNotice(result.error ?? "Konto zostało usunięte.");
        return;
      }
      close();
    });
  }

  if (isSelf) {
    return (
      <span className="text-sm text-[var(--brd-mute)]">
        Nie możesz usunąć własnego konta.
      </span>
    );
  }

  return (
    <>
      <button
        type="button"
        className="text-sm text-[var(--brd-danger,#b42318)] underline underline-offset-4"
        onClick={() => {
          setReason("");
          setError(null);
          setNotice(null);
          setOpen(true);
        }}
      >
        Usuń konto
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => {
            if (!pending) close();
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-md border border-[var(--brd-line)] bg-[var(--brd-paper)] p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="text-lg font-semibold">
              Usuń konto
            </h2>
            <p className="mt-3 text-sm">
              {displayName?.trim() || "Użytkownik"}
              {userNumber != null ? ` · #${userNumber}` : ""}
            </p>
            <p className="mt-1 text-sm text-[var(--brd-ink-soft)]">
              {email ?? "—"}
            </p>
            <p className="mt-4 text-sm font-medium" role="alert">
              Ta operacja jest nieodwracalna.
            </p>
            <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">
              Konto zostanie usunięte. Dane prywatne zostaną usunięte zgodnie z
              zasadami konta. Opublikowane utwory pozostaną zgodnie z
              ACCOUNT/PROFILE-01 i zostaną zanonimizowane.
            </p>
            <label className="mt-4 block text-sm" htmlFor={reasonId}>
              Powód usunięcia konta
            </label>
            <textarea
              id={reasonId}
              className="mt-1 min-h-24 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 text-sm"
              placeholder="Wpisz powód usunięcia konta…"
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              disabled={pending}
              required
            />
            {error ? (
              <p className="mt-3 text-sm text-[var(--brd-danger,#b42318)]" role="alert">
                {error}
              </p>
            ) : null}
            {notice ? (
              <p className="mt-3 text-sm" role="status">
                {notice}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
                onClick={close}
                disabled={pending}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center bg-[var(--brd-danger,#b42318)] px-4 text-sm text-[var(--brd-paper)] disabled:opacity-60"
                onClick={submit}
                disabled={pending}
              >
                {pending ? "Usuwanie…" : "Usuń konto"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
