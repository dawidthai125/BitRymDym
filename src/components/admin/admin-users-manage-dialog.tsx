"use client";

import { useRouter } from "next/navigation";
import { useId, useMemo, useState, useTransition } from "react";

import { applyAdminUserManagementAction } from "@/app/admin/users/actions";
import { isHighRiskRoleChange } from "@/lib/admin/users-mutate";
import {
  labelPremiumTier,
  labelSystemRole,
} from "@/lib/ui/labels";
import { SYSTEM_ROLES, type SystemRole } from "@/types/domain";
import { PREMIUM_TIERS, type PremiumTier } from "@/types/premium";

function expiresOnInputValue(iso: string | null): string {
  if (!iso) return "";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Europe/Warsaw",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(date);
  return parts;
}

function formatExpiresLabel(tier: PremiumTier, expiresOn: string): string {
  if (tier === "FREE") return "—";
  if (!expiresOn) return "bezterminowo";
  return expiresOn;
}

export function AdminUsersManageDialog({
  userId,
  displayName,
  email,
  userNumber,
  role,
  premiumTier,
  premiumExpiresAt,
  isSelf,
}: {
  userId: string;
  displayName: string | null;
  email: string | null;
  userNumber: number | null;
  role: SystemRole;
  premiumTier: PremiumTier;
  premiumExpiresAt: string | null;
  isSelf: boolean;
}) {
  const titleId = useId();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [nextRole, setNextRole] = useState<SystemRole>(role);
  const [nextTier, setNextTier] = useState<PremiumTier>(premiumTier);
  const [expiresOn, setExpiresOn] = useState(expiresOnInputValue(premiumExpiresAt));

  const highRisk = useMemo(
    () => isHighRiskRoleChange(role, nextRole),
    [role, nextRole],
  );

  function resetForm() {
    setNextRole(role);
    setNextTier(premiumTier);
    setExpiresOn(expiresOnInputValue(premiumExpiresAt));
    setConfirming(false);
    setError(null);
  }

  function close() {
    setOpen(false);
    resetForm();
  }

  function submit() {
    setError(null);
    if (highRisk && !confirming) {
      setConfirming(true);
      return;
    }
    startTransition(async () => {
      const result = await applyAdminUserManagementAction({
        targetUserId: userId,
        role: isSelf ? role : nextRole,
        premiumTier: nextTier,
        expiresOn: nextTier === "FREE" ? "" : expiresOn,
      });
      if (!result.success) {
        setError(result.error ?? "Nie udało się zapisać zmian.");
        return;
      }
      close();
      router.refresh();
    });
  }

  return (
    <>
      <button
        type="button"
        className="text-sm underline underline-offset-4"
        onClick={() => {
          resetForm();
          setOpen(true);
        }}
      >
        Zarządzaj
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-4 sm:items-center"
          role="presentation"
          onClick={close}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="w-full max-w-lg border border-[var(--brd-line)] bg-[var(--brd-paper)] p-5 shadow-lg"
            onClick={(event) => event.stopPropagation()}
          >
            <h2 id={titleId} className="brd-display text-xl font-semibold">
              {confirming ? "Zmiana uprawnień" : "Zarządzaj użytkownikiem"}
            </h2>
            <dl className="mt-4 space-y-1 text-sm">
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--brd-mute)]">Ksywka</dt>
                <dd>{displayName?.trim() || "Użytkownik"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--brd-mute)]">E-mail</dt>
                <dd className="truncate">{email ?? "—"}</dd>
              </div>
              <div className="flex justify-between gap-4">
                <dt className="text-[var(--brd-mute)]">ID</dt>
                <dd className="tabular-nums">{userNumber ?? "—"}</dd>
              </div>
            </dl>

            {confirming ? (
              <div className="mt-6 space-y-2 text-sm">
                <p>
                  Premium: {labelPremiumTier(premiumTier)} →{" "}
                  {labelPremiumTier(nextTier)}
                </p>
                <p>
                  Wygasa: {formatExpiresLabel(nextTier, expiresOn)}
                </p>
                <p>
                  Rola: {labelSystemRole(role)} → {labelSystemRole(nextRole)}
                </p>
              </div>
            ) : (
              <form className="mt-6 space-y-4" onSubmit={(e) => e.preventDefault()}>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--brd-mute)]">Premium</span>
                  <select
                    className="min-h-11 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2"
                    value={nextTier}
                    onChange={(event) => {
                      const value = event.target.value as PremiumTier;
                      setNextTier(value);
                      if (value === "FREE") setExpiresOn("");
                    }}
                  >
                    {PREMIUM_TIERS.map((tier) => (
                      <option key={tier} value={tier}>
                        {labelPremiumTier(tier)}
                      </option>
                    ))}
                  </select>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--brd-mute)]">Wygasa</span>
                  <input
                    type="date"
                    disabled={nextTier === "FREE"}
                    value={expiresOn}
                    onChange={(event) => setExpiresOn(event.target.value)}
                    className="min-h-11 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 disabled:opacity-50"
                  />
                  <span className="text-xs text-[var(--brd-mute)]">
                    Puste pole = bezterminowo. Data = koniec dnia (Europa/Warszawa).
                  </span>
                </label>
                <label className="block space-y-1 text-sm">
                  <span className="text-[var(--brd-mute)]">Rola</span>
                  <select
                    className="min-h-11 w-full border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 disabled:opacity-50"
                    value={isSelf ? role : nextRole}
                    disabled={isSelf}
                    onChange={(event) =>
                      setNextRole(event.target.value as SystemRole)
                    }
                  >
                    {SYSTEM_ROLES.map((value) => (
                      <option key={value} value={value}>
                        {labelSystemRole(value)}
                      </option>
                    ))}
                  </select>
                  {isSelf ? (
                    <span className="text-xs text-[var(--brd-mute)]">
                      Nie możesz zmienić własnej roli.
                    </span>
                  ) : null}
                </label>
              </form>
            )}

            {error ? (
              <p className="mt-4 text-sm text-[var(--brd-mute)]" role="alert">
                {error}
              </p>
            ) : null}

            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                className="inline-flex min-h-11 items-center px-3 text-sm underline underline-offset-4"
                onClick={() => {
                  if (confirming) {
                    setConfirming(false);
                    return;
                  }
                  close();
                }}
                disabled={pending}
              >
                Anuluj
              </button>
              <button
                type="button"
                className="inline-flex min-h-11 items-center bg-[var(--brd-green)] px-4 text-sm text-[var(--brd-paper)]"
                onClick={submit}
                disabled={pending}
              >
                {pending
                  ? "Zapisywanie…"
                  : confirming
                    ? "Potwierdź zmianę"
                    : "Zapisz zmiany"}
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
