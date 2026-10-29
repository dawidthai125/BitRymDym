"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useEffect, useId, useState } from "react";

import { AdminMetadataForm } from "@/components/admin/admin-metadata-form";
import type { Beat } from "@/types/domain";

/** Quick-edit modal for one catalogue row (same server action as the detail page). */
export function AdminBeatQuickEdit({
  beat,
  defaultOpen = false,
}: {
  beat: Beat;
  defaultOpen?: boolean;
}) {
  const t = useTranslations("admin.adminBeatsCatalogue");
  const router = useRouter();
  const titleId = useId();
  const [open, setOpen] = useState(defaultOpen);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex min-h-9 items-center rounded-md border border-[var(--brd-line)] px-2.5 text-xs font-medium hover:bg-[var(--brd-paper-deep)]/50"
      >
        {t("edytuj")}
      </button>
      {open ? (
        <div
          className="fixed inset-0 z-50 flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4"
          onClick={(e) => {
            if (e.target === e.currentTarget) setOpen(false);
          }}
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-labelledby={titleId}
            className="max-h-[92dvh] w-full max-w-xl overflow-y-auto rounded-t-2xl border border-[var(--brd-line)] bg-[var(--brd-paper)] p-5 shadow-xl sm:rounded-2xl"
          >
            <div className="mb-4 flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="brd-meta text-[11px] uppercase tracking-[0.2em] text-[var(--brd-mute)]">
                  {t("edycjaBitu")}
                </p>
                <h2 id={titleId} className="truncate text-lg font-semibold tracking-tight">
                  {beat.title}
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex min-h-9 items-center px-2 text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)]"
                aria-label={t("zamknij")}
              >
                ✕
              </button>
            </div>
            <AdminMetadataForm
              beat={beat}
              onSaved={() => {
                router.refresh();
                setOpen(false);
              }}
            />
          </div>
        </div>
      ) : null}
    </>
  );
}
