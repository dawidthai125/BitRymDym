"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

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
  const tl = useLibText();
  const t = useTranslations("admin.adminUsersDeleteDialog");
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
        setError(result.error ?? t("nieUdaloSieUsunac"));
        return;
      }
      router.refresh();
      if (
        result.code === "EMAIL_NOTIFICATION_FAILED" ||
        result.code === "AUDIT_FAILED"
      ) {
        setNotice(result.error ?? t("kontoZostaloUsuniete"));
        return;
      }
      close();
    });
  }

  if (isSelf) {
    return (
      <span className="text-sm text-[var(--brd-mute)]">
        {t("nieMozeszUsunacWlasnego")}
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
        {t("usunKonto")}
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
              {t("usunKonto")}
            </h2>
            <p className="mt-3 text-sm">
              {tl(displayName?.trim() || t("uzytkownik"))}
              {tl(userNumber != null ? ` · #${userNumber}` : "")}
            </p>
            <p className="mt-1 text-sm text-[var(--brd-ink-soft)]">
              {tl(email ?? "—")}
            </p>
            <p className="mt-4 text-sm font-medium" role="alert">
              {t("taOperacjaJestNieodwracalna")}
            </p>
            <p className="mt-2 text-sm text-[var(--brd-ink-soft)]">
              {t("kontoZostanieUsunieteDane")}
            </p>
            <label className="mt-4 block text-sm" htmlFor={reasonId}>
              {t("powodUsunieciaKonta")}
            </label>
            <textarea
              id={reasonId}
              className="mt-1 min-h-24 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] p-2 text-sm"
              placeholder={t("wpiszPowodUsunieciaKonta")}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              maxLength={500}
              disabled={pending}
              required
            />
            {error ? (
              <p className="mt-3 text-sm text-[var(--brd-danger,#b42318)]" role="alert">
                {tl(error)}
              </p>
            ) : null}
            {notice ? (
              <p className="mt-3 text-sm" role="status">
                {tl(notice)}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
                onClick={close}
                disabled={pending}
              >
                {t("anuluj")}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center bg-[var(--brd-danger,#b42318)] px-4 text-sm text-[var(--brd-paper)] disabled:opacity-60"
                onClick={submit}
                disabled={pending}
              >
                {tl(pending ? t("usuwanie") : t("usunKonto"))}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
