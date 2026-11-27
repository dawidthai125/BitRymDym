"use client";

/** Keyboard shortcuts of the Studio editor: opened with "?" or from "More". */

import { useId, useRef } from "react";
import { useTranslations } from "next-intl";

import { useStudioDialog } from "@/components/studio/use-studio-dialog";
import { CloseButton } from "@/components/ui/close-button";
import { studioShortcutRows } from "@/lib/studio/studio-shortcut-list";
import type { StudioTransportKeyboardMode } from "@/lib/studio/transport-keyboard-mode";

export function StudioShortcutsDialog({
  keyboardMode,
  onClose,
}: {
  keyboardMode: StudioTransportKeyboardMode;
  onClose: () => void;
}) {
  const t = useTranslations("studio.shortcuts");
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement | null>(null);
  useStudioDialog({ open: true, onClose, panelRef });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3" data-testid="studio-shortcuts">
      <button type="button" tabIndex={-1} className="absolute inset-0 bg-black/60" aria-label={t("zamknij")} onClick={onClose} />
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="relative flex max-h-[85dvh] w-full max-w-md flex-col rounded-lg border border-[var(--brd-line)] bg-[var(--brd-bg)] shadow-lg outline-none"
      >
        <div className="flex items-center justify-between gap-2 border-b border-[var(--brd-line)] px-3 py-2">
          <p id={titleId} className="text-sm font-medium text-[var(--brd-ink)]">{t("tytul")}</p>
          <CloseButton label={t("zamknij")} onClick={onClose} />
        </div>
        <dl className="min-h-0 overflow-y-auto px-3 py-2 text-sm">
          {studioShortcutRows(keyboardMode).map((row) => (
            <div key={row.id} className="flex items-baseline justify-between gap-3 border-b border-[var(--brd-line)]/60 py-1.5 last:border-b-0">
              <dt className="text-[var(--brd-ink)]">{t(row.id)}</dt>
              <dd className="flex shrink-0 flex-wrap justify-end gap-1">
                {row.keys.map((key) => (
                  <kbd key={key} className="rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-1.5 font-mono text-xs">
                    {key === "space" ? t("spacjaKlawisz") : key === "ctrl-wheel" ? `Ctrl + ${t("lubKlik")}` : key}
                  </kbd>
                ))}
              </dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
