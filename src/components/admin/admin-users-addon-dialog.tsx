"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useId, useState, useTransition } from "react";

import { setAdminPlanAddonAction } from "@/app/admin/users/actions";
import { PLAN_ADDON_PRICE_PLN } from "@/config/plan-policy";
import { intlTag, resolveLocale } from "@/i18n/config";
import { useLibText } from "@/i18n/use-lib-text";
import {
  ADMIN_ADDON_NOTE_MAX,
  addonPlanFit,
  type AdminAddonStatus,
} from "@/lib/admin/users-addons";
import type { PremiumTier } from "@/types/premium";

function warsawYmd(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
}

function formatDate(iso: string, tag: string): string {
  return new Intl.DateTimeFormat(tag, { dateStyle: "medium", timeZone: "Europe/Warsaw" }).format(
    new Date(iso),
  );
}

/** Short status for the users table + the dialog header. */
export function useAddonStatusLabel() {
  const t = useTranslations("admin.adminUsersAddonDialog");
  const tag = intlTag(resolveLocale(useLocale()));
  return (status: AdminAddonStatus | null, tier: PremiumTier): string => {
    if (status?.active) {
      return status.endsAt
        ? t("statusAktywnyDo", { date: formatDate(status.endsAt, tag) })
        : t("statusAktywnyBezterminowo");
    }
    if (status?.startsAt) return t("statusOd", { date: formatDate(status.startsAt, tag) });
    if (status && status.endsAt) return t("statusWygasl", { date: formatDate(status.endsAt, tag) });
    return tier === "GOLD" ? t("wCeniGold") : t("statusBrak");
  };
}

export function AdminUsersAddonCell({
  status,
  premiumTier,
}: {
  status: AdminAddonStatus | null;
  premiumTier: PremiumTier;
}) {
  const label = useAddonStatusLabel();
  return <span>{label(status, premiumTier)}</span>;
}

export function AdminUsersAddonDialog({
  userId,
  displayName,
  premiumTier,
  status,
}: {
  userId: string;
  displayName: string | null;
  premiumTier: PremiumTier;
  status: AdminAddonStatus | null;
}) {
  const tl = useLibText();
  const t = useTranslations("admin.adminUsersAddonDialog");
  const locale = resolveLocale(useLocale());
  const statusLabel = useAddonStatusLabel();
  const titleId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirmRevoke, setConfirmRevoke] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [endsOn, setEndsOn] = useState(warsawYmd(status?.endsAt ?? null));
  const [note, setNote] = useState("");

  const hasOpenGrant = Boolean(status);
  const fit = addonPlanFit(premiumTier);
  const price = new Intl.NumberFormat(intlTag(locale), {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(PLAN_ADDON_PRICE_PLN.reference_mastering.monthlyPln);

  function reset() {
    setEndsOn(warsawYmd(status?.endsAt ?? null));
    setNote("");
    setError(null);
    setConfirmRevoke(false);
  }

  function run(grant: boolean) {
    setError(null);
    startTransition(async () => {
      const result = await setAdminPlanAddonAction({
        targetUserId: userId,
        addon: "reference_mastering",
        grant,
        endsOn: grant ? endsOn : "",
        note,
      });
      if (!result.success) {
        setError(result.error ?? t("nieUdaloSie"));
        return;
      }
      setOpen(false);
      reset();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="text-sm underline underline-offset-4"
        onClick={() => {
          reset();
          setOpen(true);
        }}
      >
        {t("dodatki")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={() => !pending && setOpen(false)}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[calc(100dvh-2rem)] w-full max-w-lg overflow-y-auto border border-[var(--brd-line)] bg-[var(--brd-paper)] p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="brd-display text-xl font-semibold">
              {t("tytul")}
            </h2>
            <p className="mt-1 text-sm text-[var(--brd-ink-soft)]">
              {tl(displayName?.trim() || "Użytkownik")}
            </p>

            <section className="mt-5 border border-[var(--brd-line)] p-4">
              <div className="flex flex-wrap items-baseline justify-between gap-2">
                <h3 className="font-medium">{t("referencja")}</h3>
                <span className="text-sm tabular-nums">{statusLabel(status, premiumTier)}</span>
              </div>
              <p className="mt-1 text-xs text-[var(--brd-mute)]">{t("cenaSilver", { price })}</p>
              <p
                className={`mt-3 text-sm ${fit === "applies" ? "text-[var(--brd-ink-soft)]" : "text-[var(--brd-mute)]"}`}
              >
                {fit === "included"
                  ? t("fitIncluded")
                  : fit === "applies"
                    ? t("fitApplies")
                    : t("fitNoEffect")}
              </p>
            </section>

            {confirmRevoke ? (
              <p className="mt-5 text-sm" role="alert">
                {t("potwierdzOdebranie")}
              </p>
            ) : (
              <form className="mt-5 space-y-4" onSubmit={(e) => e.preventDefault()}>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--brd-mute)]">{t("aktywnyDo")}</span>
                  <input
                    type="date"
                    value={endsOn}
                    onChange={(event) => setEndsOn(event.target.value)}
                    className="min-h-11 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2"
                  />
                  <span className="text-xs text-[var(--brd-mute)]">{t("pustePole")}</span>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--brd-mute)]">{t("notatka")}</span>
                  <input
                    type="text"
                    value={note}
                    maxLength={ADMIN_ADDON_NOTE_MAX}
                    placeholder={t("notatkaPlaceholder")}
                    onChange={(event) => setNote(event.target.value)}
                    className="min-h-11 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2"
                  />
                </label>
                <p className="text-xs text-[var(--brd-mute)]">{t("audyt")}</p>
              </form>
            )}

            {error ? (
              <p className="mt-4 text-sm text-[var(--brd-mute)]" role="alert">
                {tl(error)}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
              {hasOpenGrant && !confirmRevoke ? (
                <button
                  type="button"
                  className="mr-auto inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
                  onClick={() => setConfirmRevoke(true)}
                  disabled={pending}
                >
                  {t("odbierz")}
                </button>
              ) : null}
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
                onClick={() => (confirmRevoke ? setConfirmRevoke(false) : setOpen(false))}
                disabled={pending}
              >
                {t("zamknij")}
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center bg-[var(--brd-green)] px-4 text-sm text-[var(--brd-paper)]"
                onClick={() => run(!confirmRevoke)}
                disabled={pending}
              >
                {pending
                  ? t("zapisywanie")
                  : confirmRevoke
                    ? t("potwierdz")
                    : hasOpenGrant
                      ? t("zapiszDate")
                      : t("przyznaj")}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
