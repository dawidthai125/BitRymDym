"use client";

import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { clearUnplacedTakeMemo, readUnplacedTakeMemo, type UnplacedTakeMemo } from "@/lib/studio/unplaced-take-memo";

/**
 * 2026-11-22 (Owner): a recording left READY without „Zachowaj” (page reloaded or closed)
 * is offered again above the editor. The recording panel stores the memo; this banner places
 * the take via the normal place endpoint and reloads the project so the editor shows the clip.
 */
export function StudioUnplacedTakeBanner({
  projectId,
  documentVersion,
  trackIds,
  placedTakeIds,
}: {
  projectId: string;
  documentVersion: number;
  trackIds: string[];
  placedTakeIds: string[];
}) {
  const tr = useTranslations("studio.studioRecordingPanel");
  const [memo, setMemo] = useState<UnplacedTakeMemo | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  useEffect(() => {
    const m = readUnplacedTakeMemo(projectId);
    if (!m) return;
    if (placedTakeIds.includes(m.takeId)) {
      clearUnplacedTakeMemo(projectId, m.takeId);
      return;
    }
    // localStorage is read after hydration (server renders nothing), then shown.
    const id = window.setTimeout(() => setMemo(m), 0);
    return () => window.clearTimeout(id);
    // Read once per open; the editor owns the document after that.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);

  if (note) return <p className="text-sm text-[var(--brd-mute)]" role="status">{note}</p>;
  if (!memo) return null;

  async function place() {
    if (!memo || busy) return;
    setBusy(true);
    setError(null);
    try {
      const trackId = trackIds.includes(memo.trackId) ? memo.trackId : trackIds[0];
      if (!trackId) throw new Error("no_track");
      const res = await fetch(`/api/studio/projects/${projectId}/record/place`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ trackId, takeId: memo.takeId, timelineStartMs: memo.startMs, expectedDocumentVersion: documentVersion }),
      });
      if (res.ok) {
        clearUnplacedTakeMemo(projectId, memo.takeId);
        window.location.reload();
        return;
      }
      if (res.status === 409) {
        // The project changed since this page loaded: reload and offer again.
        window.location.reload();
        return;
      }
      if (res.status === 403 || res.status === 404) {
        clearUnplacedTakeMemo(projectId, memo.takeId);
        setMemo(null);
        setNote(tr("nagranieNieJestJuz"));
        return;
      }
      setError(tr("nieUdaloSieUmiescic"));
    } catch {
      setError(tr("nieUdaloSieUmiescic"));
    } finally {
      setBusy(false);
    }
  }

  function dismiss() {
    if (memo) clearUnplacedTakeMemo(projectId, memo.takeId);
    setMemo(null);
    setNote(tr("niewstawioneZostajeWArchiwum"));
  }

  return (
    <div className="space-y-2 rounded-[2px] border border-[var(--brd-amber)] px-3 py-2 text-sm" role="status" data-testid="studio-unplaced-take">
      <p className="text-[var(--brd-ink)]">{tr("niewstawioneNagranie", { s: Math.round(memo.durationSeconds ?? 0) })}</p>
      <div className="flex flex-wrap gap-2">
        <Button type="button" size="sm" className="min-h-10" disabled={busy} onClick={() => void place()}>
          {busy ? tr("zapisywanie") : tr("niewstawioneWstaw")}
        </Button>
        <Button type="button" size="sm" variant="outline" className="min-h-10" disabled={busy} onClick={dismiss}>
          {tr("niewstawioneNieTeraz")}
        </Button>
      </div>
      {error ? <p className="text-[var(--brd-rec)]" role="alert">{error}</p> : null}
    </div>
  );
}
