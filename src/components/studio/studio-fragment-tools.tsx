"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";

type StudioFragmentToolsProps = {
  enabled: boolean;
  pending: boolean;
  confirmDelete: boolean;
  onSplit: () => void;
  onTrimStart: () => void;
  onTrimEnd: () => void;
  onNudgeLeft: () => void;
  onNudgeRight: () => void;
  onDuplicate: () => void;
  onFadeIn: () => void;
  onFadeOut: () => void;
  reverseOn: boolean;
  onReverse: () => void;
  onAskDelete: () => void;
  onDelete: () => void;
  onCancelDelete: () => void;
};

/**
 * Cut, move and delete the selected timeline fragment.
 * Presentational. The editor owns the clip and the undo.
 */
export function StudioFragmentTools({
  enabled,
  pending,
  confirmDelete,
  onSplit,
  onTrimStart,
  onTrimEnd,
  onNudgeLeft,
  onNudgeRight,
  onDuplicate,
  onFadeIn,
  onFadeOut,
  reverseOn,
  onReverse,
  onAskDelete,
  onDelete,
  onCancelDelete,
}: StudioFragmentToolsProps) {
  const t = useTranslations("studio.studioEditor");
  const locked = !enabled || pending;

  return (
    <div
      className="mt-1 flex flex-wrap items-center gap-1 border-t border-[var(--brd-line)] pt-1"
      role="group"
      aria-label={t("fragmentyAria")}
      data-testid="studio-fragment-tools"
      data-fragment-enabled={enabled ? "true" : "false"}
    >
      {confirmDelete ? (
        <>
          <p className="px-1 text-sm text-[var(--brd-ink)]">{t("usunFragmentPytanie")}</p>
          <Button type="button" size="sm" variant="outline" className="min-h-11 px-3" disabled={pending} onClick={onCancelDelete}>
            {t("anuluj")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="destructive"
            className="min-h-11 px-3"
            data-testid="studio-fragment-delete"
            disabled={locked}
            onClick={onDelete}
          >
            {t("usunFragment")}
          </Button>
        </>
      ) : (
        <>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-split"
            disabled={locked}
            title={t("podzielWPlayhead")}
            onClick={onSplit}
          >
            {t("podzielFragment")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-trim-start"
            disabled={locked}
            title={t("przytnijPoczatekDoPlayhead")}
            onClick={onTrimStart}
          >
            {t("przytnijPoczatek")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-trim-end"
            disabled={locked}
            title={t("przytnijKoniecDoPlayhead")}
            onClick={onTrimEnd}
          >
            {t("przytnijKoniec")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 px-3"
            data-testid="studio-fragment-nudge-left"
            disabled={locked}
            title={t("przesunFragmentLewo")}
            aria-label={t("przesunFragmentLewo")}
            onClick={onNudgeLeft}
          >
            {t("przesunFragmentLewoKrotko")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 min-w-11 px-3"
            data-testid="studio-fragment-nudge-right"
            disabled={locked}
            title={t("przesunFragmentPrawo")}
            aria-label={t("przesunFragmentPrawo")}
            onClick={onNudgeRight}
          >
            {t("przesunFragmentPrawoKrotko")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-duplicate"
            disabled={locked}
            title={t("powielKlip")}
            onClick={onDuplicate}
          >
            {t("powiel")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-fade-in"
            disabled={locked}
            title={t("wejscieOpis")}
            onClick={onFadeIn}
          >
            {t("wejscie")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-fade-out"
            disabled={locked}
            title={t("zejscieOpis")}
            onClick={onFadeOut}
          >
            {t("zejscie")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className={`min-h-11 px-3 ${reverseOn ? "border-[var(--brd-ink)] bg-[var(--brd-ink)] text-[var(--brd-paper)]" : ""}`}
            data-testid="studio-fragment-reverse"
            disabled={locked}
            aria-pressed={reverseOn}
            title={t("odwrocFragmentOpis")}
            aria-label={reverseOn ? t("odwrocFragmentWlaczone") : t("odwrocFragment")}
            onClick={onReverse}
          >
            {t("odwrocFragment")}
          </Button>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-11 px-3"
            data-testid="studio-fragment-delete"
            disabled={locked}
            title={t("usunFragmentOpis")}
            onClick={onAskDelete}
          >
            {t("usunFragment")}
          </Button>
          <p className="px-1 text-xs text-[var(--brd-mute)]" data-testid="studio-fragment-hint">
            {enabled ? t("fragmentEdycja") : t("zaznaczFragment")}
          </p>
        </>
      )}
    </div>
  );
}
