"use client";

/** "Znajdź funkcję": one search window that opens the right place in the Studio. */

import { useId, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import { Search } from "lucide-react";

import { CloseButton } from "@/components/ui/close-button";
import { useStudioDialog } from "@/components/studio/use-studio-dialog";
import { findStudioFeatures, type StudioFeatureEntry } from "@/lib/studio/studio-feature-finder";

export function StudioFeatureFinder({
  fullViewAllowed,
  disabled,
  onPick,
  className = "",
}: {
  /** The plan may use the full view (Silver, Gold). */
  fullViewAllowed: boolean;
  disabled: boolean;
  onPick: (id: string) => void;
  className?: string;
}) {
  const t = useTranslations("studio.featureFinder");
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useStudioDialog({ open, onClose: () => setOpen(false), panelRef, initialFocusRef: inputRef });

  const textOf = (id: string) => ({
    label: t(`items.${id}.label`),
    keywords: t(`items.${id}.keywords`),
  });
  const found = open ? findStudioFeatures(query, textOf) : [];
  const locked = (item: StudioFeatureEntry) => item.fullOnly && !fullViewAllowed;

  function pick(item: StudioFeatureEntry) {
    if (locked(item)) return;
    setOpen(false);
    setQuery("");
    onPick(item.id);
  }

  return (
    <>
      <button
        type="button"
        data-testid="studio-feature-finder"
        className={`flex min-h-11 items-center gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-left text-sm text-[var(--brd-mute)] hover:text-[var(--brd-ink)] disabled:opacity-50 ${className}`}
        disabled={disabled}
        onClick={() => setOpen(true)}
      >
        <Search aria-hidden className="size-4 shrink-0" />
        {/* Phones and tablets: only the icon, so the header stays one row. */}
        <span className="truncate max-lg:sr-only">{t("przycisk")}</span>
      </button>
      {open && typeof document !== "undefined"
        ? createPortal(
            <div className="fixed inset-0 z-[60] flex items-start justify-center p-2 sm:p-6" data-testid="studio-feature-finder-layer">
              <button type="button" className="absolute inset-0 bg-black/60" aria-label={t("zamknij")} tabIndex={-1} onClick={() => setOpen(false)} />
              <div
                ref={panelRef}
                role="dialog"
                aria-modal="true"
                aria-labelledby={titleId}
                tabIndex={-1}
                className="studio-desk relative flex max-h-[85dvh] w-full max-w-lg flex-col gap-2 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 shadow-xl"
              >
                <div className="flex items-center justify-between gap-2">
                  <p id={titleId} className="text-sm font-semibold text-[var(--brd-ink)]">{t("tytul")}</p>
                  <CloseButton label={t("zamknij")} onClick={() => setOpen(false)} />
                </div>
                <input
                  ref={inputRef}
                  type="search"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key !== "Enter") return;
                    const first = found.find((item) => !locked(item));
                    if (first) pick(first);
                  }}
                  placeholder={t("podpowiedz")}
                  aria-label={t("przycisk")}
                  data-testid="studio-feature-finder-input"
                  className="min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-3 text-base text-[var(--brd-ink)]"
                />
                {found.length === 0 ? (
                  <p className="py-4 text-sm text-[var(--brd-mute)]" role="status">{t("brak")}</p>
                ) : (
                  <ul className="min-h-0 flex-1 overflow-y-auto" data-testid="studio-feature-finder-results">
                    {found.map((item) => (
                      <li key={item.id}>
                        <button
                          type="button"
                          data-testid={`studio-feature-${item.id}`}
                          className="flex min-h-12 w-full items-center justify-between gap-3 border-b border-[var(--brd-line)] px-1 py-1.5 text-left text-sm text-[var(--brd-ink)] hover:bg-[var(--brd-bg)] disabled:opacity-60"
                          disabled={locked(item)}
                          onClick={() => pick(item)}
                        >
                          <span className="min-w-0">{textOf(item.id).label}</span>
                          <span className="shrink-0 text-xs text-[var(--brd-green)]">
                            {locked(item)
                              ? t("pelnyWidokOdSilver")
                              : `→ ${t(`miejsca.${item.mixWithoutFullView && !fullViewAllowed ? "mix" : item.place}`)}`}
                          </span>
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
