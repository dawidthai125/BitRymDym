"use client";

import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { useLibText } from "@/i18n/use-lib-text";
import { formatStudioTimeMs } from "@/lib/studio/studio-time";

type FileClip = { id: string; trackId: string; timelineStartMs: number; durationMs: number; sourceKind: string };
type FileTrack = { id: string; name: string };

/** Inspector tab "Plik" with no clip selected: what is in the project and where files come from. */
export function StudioInspectorFilePanel({
  clips,
  tracks,
  beatTitle,
  disabled,
  onSelectClip,
  onImport,
  onChangeBeat,
}: {
  clips: readonly FileClip[];
  tracks: readonly FileTrack[];
  beatTitle: string | null;
  disabled: boolean;
  onSelectClip: (clipId: string, trackId: string) => void;
  onImport: () => void;
  onChangeBeat: () => void;
}) {
  const t = useTranslations("studio.inspectorFile");
  const tl = useLibText();
  const own = clips.filter((clip) => clip.sourceKind !== "BEAT_REF");
  const trackName = (id: string) => tracks.find((track) => track.id === id)?.name ?? t("sciezka");
  return (
    <div className="space-y-3" data-testid="studio-inspector-file">
      <section className="space-y-2 rounded border border-[var(--brd-line)] p-3">
        <h3 className="text-sm font-medium text-[var(--brd-ink)]">{t("bit")}</h3>
        <p className="break-words text-sm text-[var(--brd-mute)]">{beatTitle ? tl(beatTitle) : t("brakBitu")}</p>
        <Button type="button" size="sm" variant="outline" className="min-h-11 w-full" disabled={disabled} onClick={onChangeBeat}>
          {beatTitle ? t("zmienBit") : t("wybierzBit")}
        </Button>
      </section>
      <section className="space-y-2 rounded border border-[var(--brd-line)] p-3">
        <h3 className="text-sm font-medium text-[var(--brd-ink)]">{t("nagrania")}</h3>
        {own.length === 0 ? (
          <p className="text-sm text-[var(--brd-mute)]">{t("brakNagran")}</p>
        ) : (
          <ul className="space-y-1">
            {own.map((clip) => (
              <li key={clip.id}>
                <button
                  type="button"
                  className="flex min-h-11 w-full items-center justify-between gap-2 rounded border border-[var(--brd-line)] px-2 text-left text-sm hover:border-[var(--brd-amber)]"
                  onClick={() => onSelectClip(clip.id, clip.trackId)}
                >
                  <span className="min-w-0 truncate">{tl(trackName(clip.trackId))}</span>
                  <span className="shrink-0 font-mono text-xs tabular-nums text-[var(--brd-mute)]">
                    {tl(formatStudioTimeMs(clip.timelineStartMs))} · {(clip.durationMs / 1000).toFixed(1)} s
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
        <Button type="button" size="sm" variant="outline" className="min-h-11 w-full" disabled={disabled} onClick={onImport}>
          {t("importuj")}
        </Button>
      </section>
    </div>
  );
}
