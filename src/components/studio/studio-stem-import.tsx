"use client";

import { useId, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { uploadStemBlob } from "@/lib/takes/client-upload";
import { guessStemRole, planStemImport, STEM_IMPORT_ACCEPT, stemTrackName } from "@/lib/takes/stem-import-client";

type StepResult = { ok: true; trackId?: string } | { ok: false; message: string };

type Row = { id: number; name: string; state: "queued" | "uploading" | "track" | "placing" | "done" | "failed"; message?: string };

type Props = {
  projectId: string;
  /** Free track slots in the project (plan track cap minus tracks already there). */
  freeSlots: number;
  /** Plan stems per project, for the hint. */
  stemLimit: number;
  /** Add a track named after the file; the panel runs it through the shared persist queue. */
  createStemTrack: (input: { name: string; role: string }) => Promise<StepResult>;
  /** Put the READY take on that track at the start of the timeline. */
  placeStemTake: (input: { trackId: string; takeId: string }) => Promise<StepResult>;
  disabled?: boolean;
};

/** Silver/Gold: import several audio files at once; each becomes a track on the timeline. */
export function StudioStemImport({ projectId, freeSlots, stemLimit, createStemTrack, placeStemTake, disabled = false }: Props) {
  const t = useTranslations("studio.stemImport");
  const id = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [rows, setRows] = useState<Row[]>([]);
  const [skipped, setSkipped] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);

  const patch = (rowId: number, next: Partial<Row>) => setRows((cur) => cur.map((r) => (r.id === rowId ? { ...r, ...next } : r)));

  async function importFiles(list: FileList) {
    const files = Array.from(list);
    const plan = planStemImport(files, freeSlots);
    setSkipped(plan.rejected);
    const chosen = plan.accepted.map((i, n) => ({ file: files[i], rowId: n }));
    setRows(chosen.map((c) => ({ id: c.rowId, name: c.file.name, state: "queued" as const })));
    if (chosen.length === 0) return;
    setBusy(true);
    try {
      // One at a time: every step is a CAS write on the same document.
      for (const { file, rowId } of chosen) {
        try {
          patch(rowId, { state: "uploading" });
          const uploaded = await uploadStemBlob({ projectId, blob: file, contentType: file.type || "audio/wav" });
          patch(rowId, { state: "track" });
          const track = await createStemTrack({ name: stemTrackName(file.name), role: guessStemRole(file.name) });
          if (!track.ok || !track.trackId) {
            patch(rowId, { state: "failed", message: track.ok ? t("brakSciezki") : track.message });
            continue;
          }
          patch(rowId, { state: "placing" });
          const placed = await placeStemTake({ trackId: track.trackId, takeId: uploaded.takeId });
          patch(rowId, placed.ok ? { state: "done" } : { state: "failed", message: placed.message });
        } catch (e) {
          patch(rowId, { state: "failed", message: e instanceof Error && e.message ? e.message : t("blad") });
        }
      }
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = "";
    }
  }

  const done = rows.filter((r) => r.state === "done").length;
  return (
    <section data-testid="studio-stem-import" aria-labelledby={`${id}-t`} className="space-y-2 rounded border border-[var(--brd-line)] p-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 id={`${id}-t`} className="text-xs font-medium">
          {t("tytul")}
        </h3>
        <span className="text-[11px] text-[var(--brd-mute)]">{t("limit", { n: stemLimit })}</span>
      </div>
      <p className="text-xs text-[var(--brd-mute)]">{t("opis")}</p>
      <input
        ref={inputRef}
        type="file"
        multiple
        accept={STEM_IMPORT_ACCEPT}
        className="sr-only"
        aria-hidden
        tabIndex={-1}
        data-testid="studio-stem-input"
        onChange={(e) => {
          if (e.target.files && e.target.files.length) void importFiles(e.target.files);
        }}
      />
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-9"
        data-testid="studio-stem-pick"
        disabled={disabled || busy || freeSlots < 1}
        onClick={() => inputRef.current?.click()}
      >
        {busy ? t("importuje") : t("wybierz")}
      </Button>
      {freeSlots < 1 ? <p className="text-xs text-[var(--brd-mute)]">{t("brakMiejsca")}</p> : <p className="text-[11px] text-[var(--brd-mute)]">{t("wolne", { n: freeSlots })}</p>}
      {rows.length ? (
        <ul data-testid="studio-stem-rows" className="space-y-1 text-xs" aria-live="polite">
          {rows.map((r) => (
            <li key={r.id} data-state={r.state} className="flex flex-wrap gap-x-2">
              <span className="font-medium">{r.name}</span>
              <span className={r.state === "failed" ? "text-red-600" : "text-[var(--brd-mute)]"}>{r.state === "failed" ? r.message : t(`stan.${r.state}`)}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {!busy && rows.length ? <p className="text-xs">{t("podsumowanie", { done, total: rows.length })}</p> : null}
      {skipped.length ? (
        <ul className="space-y-0.5 text-xs text-red-600" role="alert">
          {skipped.map((m) => (
            <li key={m}>{m}</li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
