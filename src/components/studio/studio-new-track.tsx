"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  cleanTrackName,
  nextKindTrackName,
  STUDIO_NEW_TRACK_KINDS,
  STUDIO_NEW_TRACK_ROLE,
  STUDIO_TRACK_NAME_MAX,
  type StudioNewTrackKind,
} from "@/lib/studio/track-kind";
import type { StudioTrackRole } from "@/config/studio";

/** "Ścieżka wokalna": first what it is (Wokal, Podbicie, Adlib) and its name, then the track is made. */
export function StudioNewTrack({
  existingNames,
  disabled,
  onCreate,
  onCancel,
}: {
  existingNames: readonly string[];
  disabled: boolean;
  onCreate: (input: { name: string; trackRole: StudioTrackRole }) => void;
  onCancel: () => void;
}) {
  const t = useTranslations("studio.newTrack");
  const [kind, setKind] = useState<StudioNewTrackKind>("vocal");
  const [typed, setTyped] = useState<string | null>(null);
  const suggested = nextKindTrackName(t(`rodzaj.${kind}`), existingNames);
  const name = typed ?? suggested;
  const create = () => onCreate({ name: cleanTrackName(name, suggested), trackRole: STUDIO_NEW_TRACK_ROLE[kind] });

  return (
    <form
      className="space-y-2 rounded border border-[var(--brd-amber)] p-2"
      data-testid="studio-new-track"
      onSubmit={(event) => {
        event.preventDefault();
        if (!disabled) create();
      }}
    >
      <p className="text-sm font-medium text-[var(--brd-ink)]">{t("tytul")}</p>
      <div className="grid grid-cols-3 gap-1" role="radiogroup" aria-label={t("coToZaSciezka")}>
        {STUDIO_NEW_TRACK_KINDS.map((option) => (
          <button
            key={option}
            type="button"
            role="radio"
            aria-checked={kind === option}
            data-testid={`studio-new-track-${option}`}
            className={`min-h-11 rounded border px-2 text-sm ${kind === option ? "border-[var(--brd-amber)] bg-[var(--brd-amber)] font-semibold text-black" : "border-[var(--brd-line)] text-[var(--brd-ink)]"}`}
            onClick={() => setKind(option)}
          >
            {t(`rodzaj.${option}`)}
          </button>
        ))}
      </div>
      <label className="block text-xs text-[var(--brd-mute)]">
        {t("nazwa")}
        <input
          className="mt-1 min-h-11 w-full rounded border border-[var(--brd-line)] bg-transparent px-2 text-sm text-[var(--brd-ink)]"
          value={name}
          maxLength={STUDIO_TRACK_NAME_MAX}
          data-testid="studio-new-track-name"
          onChange={(event) => setTyped(event.target.value)}
          onFocus={(event) => event.currentTarget.select()}
        />
      </label>
      <div className="flex gap-2">
        <Button type="submit" size="sm" className="min-h-11 flex-1" disabled={disabled} data-testid="studio-new-track-create">
          {t("dodaj")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-11" onClick={onCancel}>
          {t("anuluj")}
        </Button>
      </div>
    </form>
  );
}
