"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";

import { ConsentSwitches } from "@/components/community/consent-switches";
import type { ListingConsents } from "@/lib/community/consents";
import { filterListings, listingSummaryKeys } from "@/lib/community/listing-filter";
import type { MyListing } from "@/lib/community/listing-service";

/** Saves each change at once and shows what the server stored. */
export function MyListings({ items }: { items: MyListing[] }) {
  const t = useTranslations("community.consents");
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; ok: boolean } | null>(null);
  const [query, setQuery] = useState("");
  const shown = filterListings(rows, query);

  async function save(item: MyListing, next: ListingConsents) {
    if (item.kind === "work" && next.listed && !item.consents.listed && !window.confirm(t("relistConfirm"))) return;
    setBusy(item.id);
    setNote(null);
    const response = await fetch("/api/account/listings", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ kind: item.kind, id: item.id, consents: next }),
    }).catch(() => null);
    const payload = (await response?.json().catch(() => null)) as { result?: string; consents?: ListingConsents } | null;
    setBusy(null);
    const saved = payload?.result === "ok" ? payload.consents : undefined;
    if (saved) setRows((current) => current.map((row) => (row.id === item.id ? { ...row, consents: saved } : row)));
    setNote({ id: item.id, ok: Boolean(saved) });
  }

  return (
    <div className="flex flex-col gap-2">
      {rows.length > 5 ? (
        <input
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder={t("search")}
          aria-label={t("search")}
          data-testid="listing-search"
          className="min-h-11 w-full max-w-sm border border-[var(--brd-line)] bg-transparent px-3 text-sm text-[var(--brd-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)]"
        />
      ) : null}
      {shown.length === 0 ? (
        <p className="text-sm text-[var(--brd-mute)]" role="status">{t("noMatch")}</p>
      ) : null}
      <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
        {shown.map((item) => {
          const open = item.href && (item.kind === "beat" || item.consents.listed);
          return (
            <li key={item.id} data-testid={`listing-${item.kind}`}>
              <details className="group">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 py-3 outline-none focus-visible:ring-2 focus-visible:ring-[var(--brd-amber)] [&::-webkit-details-marker]:hidden">
                  <span className="min-w-0">
                    <span className="block break-words font-medium text-[var(--brd-ink)]">{item.title}</span>
                    <span className="block text-xs text-[var(--brd-mute)]">
                      {listingSummaryKeys(item.consents).map((key) => t(`state.${key}`)).join(" · ")}
                      {item.pending ? ` · ${t("pending")}` : ""}
                    </span>
                  </span>
                  <span aria-hidden="true" className="shrink-0 text-[var(--brd-green)] transition-transform group-open:rotate-90">›</span>
                </summary>
                <div className="space-y-2 pb-4">
                  {open && item.href ? (
                    <Link href={item.href} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t("openPage")}</Link>
                  ) : null}
                  {note?.id === item.id ? (
                    <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm text-[var(--brd-green)]" : "text-sm text-destructive"}>
                      {note.ok ? t("saved") : t("failed")}
                    </p>
                  ) : null}
                  <ConsentSwitches kind={item.kind} value={item.consents} disabled={busy === item.id} onChange={(next) => void save(item, next)} />
                </div>
              </details>
            </li>
          );
        })}
      </ul>
    </div>
  );
}
