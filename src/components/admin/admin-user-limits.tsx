"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { resetAdminUserUsageAction } from "@/app/admin/users/actions";
import type { AdminDeskLimit } from "@/lib/admin/user-desk";
import { cn } from "@/lib/utils";

/** Quota lines of one user with per-metric and "all" resets (each asks once before acting). */
export function AdminUserLimits({ userId, limits }: { userId: string; limits: AdminDeskLimit[] }) {
  const t = useTranslations("admin.userDesk");
  const router = useRouter();
  const [pending, start] = useTransition();
  const [asking, setAsking] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ ok: boolean; text: string } | null>(null);

  function reset(metric: string) {
    setAsking(null);
    start(async () => {
      const res = await resetAdminUserUsageAction({ targetUserId: userId, metric });
      setNotice(res.success ? { ok: true, text: t("wyzerowano") } : { ok: false, text: res.error ?? t("bladZerowania") });
      if (res.success) router.refresh();
    });
  }

  const fmt = (iso: string) =>
    new Intl.DateTimeFormat("pl-PL", { dateStyle: "medium", timeStyle: "short", timeZone: "Europe/Warsaw" }).format(new Date(iso));

  return (
    <section aria-labelledby="desk-limits" className="rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/40">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[var(--brd-line)] px-4 py-3">
        <div>
          <h2 id="desk-limits" className="text-base font-semibold">{t("limity")}</h2>
          <p className="text-sm text-[var(--brd-ink-soft)]">{t("limityOpis")}</p>
        </div>
        <ConfirmButton
          label={t("wyzerujWszystkie")}
          confirm={t("potwierdzWszystkie")}
          yes={t("tak")}
          no={t("nie")}
          asking={asking === "all"}
          disabled={pending}
          onAsk={() => setAsking("all")}
          onCancel={() => setAsking(null)}
          onConfirm={() => reset("all")}
          strong
        />
      </div>
      {notice ? (
        <p role="status" className={cn("px-4 pt-3 text-sm", notice.ok ? "text-[var(--brd-green)]" : "text-[var(--brd-rec)]")}>
          {notice.text}
        </p>
      ) : null}
      <ul className="divide-y divide-[var(--brd-line)]">
        {limits.map((l) => {
          const full = l.limit != null && l.limit > 0 && l.used >= l.limit;
          const off = l.limit === 0;
          const pct = l.limit && l.limit > 0 ? Math.min(100, (l.used / l.limit) * 100) : 0;
          return (
            <li key={l.id} className="grid gap-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_10rem_auto] sm:items-center sm:gap-4">
              <div className="min-w-0">
                <p className="text-sm font-medium">{t(`limit.${l.id}`)}</p>
                <p className="text-xs text-[var(--brd-ink-soft)]">
                  {t(`okres.${l.period}`)}
                  {l.resetAt ? ` · ${t("ostatnioZerowane", { kiedy: fmt(l.resetAt) })}` : ""}
                </p>
              </div>
              <div>
                <p className={cn("font-mono text-sm tabular-nums", full ? "text-[var(--brd-rec)]" : "text-[var(--brd-ink)]")}>
                  {off ? t("brakWPlanie") : l.limit == null ? t("bezLimitu", { used: l.used }) : `${l.used} / ${l.limit}`}
                </p>
                {!off && l.limit != null ? (
                  <div className="mt-1 h-1.5 overflow-hidden rounded-full bg-[var(--brd-line)]">
                    <div className={cn("h-full", full ? "bg-[var(--brd-rec)]" : "bg-[var(--brd-amber)]")} style={{ width: `${pct}%` }} />
                  </div>
                ) : null}
              </div>
              <ConfirmButton
                label={t("wyzeruj")}
                confirm={t("potwierdz")}
                yes={t("tak")}
                no={t("nie")}
                asking={asking === l.id}
                disabled={pending || off || l.used === 0}
                onAsk={() => setAsking(l.id)}
                onCancel={() => setAsking(null)}
                onConfirm={() => reset(l.metric)}
              />
            </li>
          );
        })}
      </ul>
    </section>
  );
}

function ConfirmButton(p: {
  label: string;
  confirm: string;
  yes: string;
  no: string;
  asking: boolean;
  disabled: boolean;
  strong?: boolean;
  onAsk: () => void;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  if (p.asking) {
    return (
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <span className="text-[var(--brd-ink-soft)]">{p.confirm}</span>
        <button type="button" onClick={p.onConfirm} className="min-h-9 rounded-md bg-[var(--brd-amber)] px-3 font-semibold text-[var(--brd-on-media)]">
          {p.yes}
        </button>
        <button type="button" onClick={p.onCancel} className="min-h-9 rounded-md border border-[var(--brd-line)] px-3">
          {p.no}
        </button>
      </div>
    );
  }
  return (
    <button
      type="button"
      onClick={p.onAsk}
      disabled={p.disabled}
      className={cn(
        "min-h-9 rounded-md px-3 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
        p.strong
          ? "bg-[var(--brd-amber)] text-[var(--brd-on-media)] hover:brightness-110"
          : "border border-[var(--brd-line)] hover:border-[var(--brd-amber)] hover:text-[var(--brd-amber)]",
      )}
    >
      {p.label}
    </button>
  );
}
