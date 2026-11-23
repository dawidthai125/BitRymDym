"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";

import { ConsentSwitches } from "@/components/community/consent-switches";
import type { ListingConsents } from "@/lib/community/consents";
import type { MyListing } from "@/lib/community/listing-service";

/** Saves each change at once and shows what the server stored. */
export function MyListings({ items }: { items: MyListing[] }) {
  const t = useTranslations("community.consents");
  const [rows, setRows] = useState(items);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<{ id: string; ok: boolean } | null>(null);

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
    <ul className="divide-y divide-[var(--brd-line)] border-y border-[var(--brd-line)]">
      {rows.map((item) => {
        const open = item.href && (item.kind === "beat" || item.consents.listed);
        return (
          <li key={item.id} className="grid gap-3 py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]" data-testid={`listing-${item.kind}`}>
            <div className="min-w-0 space-y-1">
              <p className="break-words font-medium text-[var(--brd-ink)]">{item.title}</p>
              {item.pending ? <p className="text-xs text-[var(--brd-mute)]">{t("pending")}</p> : null}
              {open && item.href ? (
                <Link href={item.href} className="inline-flex min-h-11 items-center text-sm underline underline-offset-4">{t("openPage")}</Link>
              ) : null}
              {note?.id === item.id ? (
                <p role={note.ok ? "status" : "alert"} className={note.ok ? "text-sm text-[var(--brd-green)]" : "text-sm text-destructive"}>
                  {note.ok ? t("saved") : t("failed")}
                </p>
              ) : null}
            </div>
            <ConsentSwitches kind={item.kind} value={item.consents} disabled={busy === item.id} onChange={(next) => void save(item, next)} />
          </li>
        );
      })}
    </ul>
  );
}
