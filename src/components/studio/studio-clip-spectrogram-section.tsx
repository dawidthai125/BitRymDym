"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import { StudioClipSpectrogram } from "@/components/studio/studio-lazy-panels";
import { Button } from "@/components/ui/button";

/**
 * Spectrum / denoise of the selected clip, folded until asked for. It used to open above the timeline
 * on every click on a clip: the lanes jumped ~280 px and the whole file was decoded each time.
 */
export function StudioClipSpectrogramSection({
  clipId,
  projectId,
  takeId,
  resolveUrl,
}: {
  clipId: string;
  projectId: string;
  takeId: string | null;
  resolveUrl: () => Promise<string | null>;
}) {
  const tr = useTranslations("studio.studioEditor");
  const [open, setOpen] = useState(false);
  return (
    <div className="space-y-2" data-testid="studio-clip-spectrogram-section">
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full"
        aria-expanded={open}
        data-testid="studio-clip-spectrogram-toggle"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? tr("widmoUkryj") : tr("widmoPokaz")}
      </Button>
      {open ? (
        <StudioClipSpectrogram clipId={clipId} projectId={projectId} takeId={takeId} resolveUrl={resolveUrl} />
      ) : null}
    </div>
  );
}
