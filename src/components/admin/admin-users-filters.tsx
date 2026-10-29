"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { CREATOR_RANKS } from "@/types/creator-progress";
import { SYSTEM_ROLES } from "@/types/domain";
import { PREMIUM_TIERS } from "@/types/premium";
import {
  labelCreatorRank,
  labelPremiumTier,
  labelSystemRole,
} from "@/lib/ui/labels";

const selectClass =
  "min-h-11 border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-sm";

export function AdminUsersFilters({
  q,
  role,
  premium,
  rank,
  auditAction,
  auditUser,
}: {
  q: string;
  role: string;
  premium: string;
  rank: string;
  auditAction?: string;
  auditUser?: string;
}) {
  const tl = useLibText();
  const t = useTranslations("admin.adminUsersFilters");
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
      {auditAction ? (
        <input type="hidden" name="auditAction" value={auditAction} />
      ) : null}
      {auditUser ? (
        <input type="hidden" name="auditUser" value={auditUser} />
      ) : null}
      <label className="min-w-[16rem] flex-1 space-y-1 text-sm">
        <span className="text-[var(--brd-mute)]">{t("szukaj")}</span>
        <input
          name="q"
          type="search"
          defaultValue={q}
          maxLength={80}
          placeholder={t("szukajUzytkownika")}
          autoComplete="off"
          className="min-h-11 w-full border-b border-[var(--brd-line)] bg-transparent px-0 py-2 text-[15px] outline-none focus-visible:border-[var(--brd-green)]"
        />
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-[var(--brd-mute)]">{t("premium")}</span>
        <select name="premium" defaultValue={premium || "all"} className={selectClass}>
          <option value="all">{t("wszystkie")}</option>
          {PREMIUM_TIERS.map((tier) => (
            <option key={tier} value={tier}>
              {tl(labelPremiumTier(tier))}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-[var(--brd-mute)]">{t("rola")}</span>
        <select name="role" defaultValue={role || "all"} className={selectClass}>
          <option value="all">{t("wszystkie")}</option>
          {SYSTEM_ROLES.map((value) => (
            <option key={value} value={value}>
              {tl(labelSystemRole(value))}
            </option>
          ))}
        </select>
      </label>
      <label className="space-y-1 text-sm">
        <span className="text-[var(--brd-mute)]">{t("ranga")}</span>
        <select name="rank" defaultValue={rank || "all"} className={selectClass}>
          <option value="all">{t("wszystkie")}</option>
          {CREATOR_RANKS.map((value) => (
            <option key={value} value={value}>
              {tl(labelCreatorRank(value))}
            </option>
          ))}
        </select>
      </label>
      <button
        type="submit"
        className="inline-flex min-h-11 items-center bg-[var(--brd-green)] px-4 text-sm text-[var(--brd-paper)]"
        disabled={pending}
      >
        {tl(pending ? t("szukanie") : "Filtruj")}
      </button>
    </form>
  );
}
