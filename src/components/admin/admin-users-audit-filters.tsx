"use client";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { ADMIN_AUDIT_ACTIONS } from "@/lib/admin/users-audit-query";
import { labelAdminAuditAction } from "@/lib/ui/labels";

const selectClass =
  "min-h-11 border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-sm";

export function AdminUsersAuditFilters({
  action,
  auditUser,
  q,
  role,
  premium,
  rank,
  page,
}: {
  action: string;
  auditUser: string;
  q: string;
  role: string;
  premium: string;
  rank: string;
  page: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  return (
    <form
      className="flex flex-col gap-3 lg:flex-row lg:flex-wrap lg:items-end"
      action="/admin/users"
      method="get"
      onSubmit={(event) => {
        event.preventDefault();
        const form = event.currentTarget;
        const data = new FormData(form);
        const params = new URLSearchParams();
        for (const [key, value] of data.entries()) {
          const text = String(value).trim();
          if (text && text !== "all") params.set(key, text);
        }
        startTransition(() => {
          router.push(
            params.size ? `/admin/users?${params.toString()}` : "/admin/users",
          );
        });
      }}
    >
      {q ? <input type="hidden" name="q" value={q} /> : null}
      {role ? <input type="hidden" name="role" value={role} /> : null}
      {premium ? <input type="hidden" name="premium" value={premium} /> : null}
      {rank ? <input type="hidden" name="rank" value={rank} /> : null}
      {page && page !== "1" ? (
        <input type="hidden" name="page" value={page} />
      ) : null}
      <label className="space-y-1 text-sm">
        <span className="text-[var(--brd-mute)]">Operacja</span>
        <select
          name="auditAction"
          defaultValue={action || "all"}
          className={selectClass}
        >
          <option value="all">Wszystkie</option>
          {ADMIN_AUDIT_ACTIONS.map((value) => (
            <option key={value} value={value}>
              {labelAdminAuditAction(value)}
            </option>
          ))}
        </select>
      </label>
      <label className="min-w-[12rem] space-y-1 text-sm">
        <span className="text-[var(--brd-mute)]">ID użytkownika</span>
        <input
          name="auditUser"
          type="search"
          inputMode="numeric"
          defaultValue={auditUser}
          placeholder="Numer ID…"
          autoComplete="off"
          className="min-h-11 w-full border-b border-[var(--brd-line)] bg-transparent px-0 py-2 text-[15px] outline-none focus-visible:border-[var(--brd-green)]"
        />
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center bg-[var(--brd-green)] px-4 text-sm text-[var(--brd-paper)]"
        disabled={pending}
      >
        {pending ? "Szukanie…" : "Filtruj historię"}
      </button>
    </form>
  );
}
