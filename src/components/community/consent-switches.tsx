"use client";

import { useTranslations } from "next-intl";

import { applyConsentPatch, type ListingConsents } from "@/lib/community/consents";
import { cn } from "@/lib/utils";

/**
 * The same four choices for a beat, a sample and a finished track. Rules live in
 * applyConsentPatch (the server and the database apply them too).
 */
export function ConsentSwitches({
  kind,
  value,
  onChange,
  disabled = false,
  hideListed = false,
  compact = false,
}: {
  kind: "beat" | "sample" | "work";
  value: ListingConsents;
  onChange: (next: ListingConsents) => void;
  disabled?: boolean;
  /** The surrounding form already asks about the catalogue. */
  hideListed?: boolean;
  compact?: boolean;
}) {
  const t = useTranslations("community.consents");
  const rows = [
    ...(hideListed ? [] : [{ key: "listed" as const, label: t("listed"), note: t(`listedNote.${kind}`), locked: false }]),
    { key: "allowRatings" as const, label: t("ratings"), note: t("ratingsNote"), locked: !value.listed || value.inRankings },
    { key: "allowComments" as const, label: t("comments"), note: t("commentsNote"), locked: !value.listed || value.inRankings },
    { key: "inRankings" as const, label: t("ranking"), note: t("rankingNote"), locked: !value.listed },
  ];
  return (
    <fieldset className="flex min-w-0 flex-col gap-1" disabled={disabled} data-testid="consent-switches">
      <legend className="sr-only">{t("legend")}</legend>
      {rows.map((row) => (
        <label key={row.key} className={cn("flex min-h-11 items-start gap-3 py-1", compact ? "text-xs" : "text-sm", row.locked && "opacity-70")}>
          <input
            type="checkbox"
            className="mt-1 size-4 shrink-0"
            data-consent={row.key}
            checked={value[row.key]}
            disabled={disabled || row.locked}
            onChange={(event) => onChange(applyConsentPatch(value, { [row.key]: event.target.checked }))}
          />
          <span className="min-w-0">
            <span className="block font-medium text-[var(--brd-ink)]">{row.label}</span>
            <span className="block text-xs text-[var(--brd-mute)]">{row.note}</span>
          </span>
        </label>
      ))}
    </fieldset>
  );
}
