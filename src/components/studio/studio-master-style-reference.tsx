"use client";

import { useTranslations } from "next-intl";
import { useEffect, useId, useRef, useState } from "react";

import { Button } from "@/components/ui/button";
import { PLAN_ADDON_PRICE_PLN, type ReferenceMasteringGate } from "@/config/plan-policy";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { validateReferenceUpload, type ReferenceUploadError } from "@/lib/studio/master/reference";
import { MASTER_STYLE_IDS, PART_BYTES_FOR_REFERENCE, REFERENCE_MAX_SECONDS, type MasterStyleId } from "@/lib/studio/master/targets";

export type MasterReferenceView = { id: string; fileName: string; format: "mp3" | "wav"; durationMs: number; byteSize: number; status: "pending" | "ready"; expiresAt: string };
export type MasterReferenceState = { loaded: boolean; available: boolean; gate: ReferenceMasteringGate | null; reference: MasterReferenceView | null };

const CONTACT = "team@bitrymdym.pl";
const BUCKET = "audio-artifacts";

/** Duration from the file's metadata (no full decode — a 10-minute WAV stays cheap on phones). */
function mediaDurationMs(file: File): Promise<number | null> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(file);
    const a = new Audio();
    const done = (v: number | null) => {
      URL.revokeObjectURL(url);
      resolve(v);
    };
    a.preload = "metadata";
    a.onloadedmetadata = () => done(Number.isFinite(a.duration) ? Math.round(a.duration * 1000) : null);
    a.onerror = () => done(null);
    a.src = url;
  });
}

const fmtDur = (ms: number) => `${Math.floor(ms / 60000)}:${String(Math.round((ms % 60000) / 1000)).padStart(2, "0")}`;

/**
 * Mastering style chips + intensity (every plan with mastering) and the reference
 * mastering card (Gold included, Silver add-on, Free/Bronze locked with an upsell).
 * The server decides access; this only mirrors it.
 */
export function StudioMasterStyleReference({
  projectId,
  style,
  styleIntensity,
  onStyle,
  onStyleIntensity,
  refState,
  onRefState,
  refIntensity,
  onRefIntensity,
  disabled,
}: {
  projectId: string;
  style: MasterStyleId | null;
  styleIntensity: number;
  onStyle: (s: MasterStyleId | null) => void;
  onStyleIntensity: (v: number) => void;
  refState: MasterReferenceState;
  onRefState: (s: MasterReferenceState) => void;
  refIntensity: number;
  onRefIntensity: (v: number) => void;
  disabled?: boolean;
}) {
  const t = useTranslations("studio.masterStep");
  const ids = useId();
  const fileRef = useRef<HTMLInputElement>(null);
  const [upload, setUpload] = useState<{ pct: number } | null>(null);
  const [error, setError] = useState<ReferenceUploadError | "upload" | "locked" | "odczyt" | null>(null);

  // Access + current reference (after reload the uploaded file is still there until used / 24 h).
  useEffect(() => {
    let live = true;
    void fetch(`/api/studio/projects/${projectId}/master/reference`)
      .then((r) => (r.ok ? r.json() : null))
      .then((j) => {
        if (!live) return;
        onRefState({ loaded: true, available: j?.available !== false && !!j, gate: j?.gate ?? null, reference: j?.reference ?? null });
      })
      .catch(() => live && onRefState({ loaded: true, available: false, gate: null, reference: null }));
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps -- once per project
  }, [projectId]);

  async function pick(file: File) {
    setError(null);
    const durationMs = await mediaDurationMs(file);
    if (durationMs === null) return setError("odczyt");
    const v = validateReferenceUpload({ fileName: file.name, mime: file.type, byteSize: file.size, durationMs });
    if (!v.ok) return setError(v.error);
    setUpload({ pct: 0 });
    try {
      const prep = await fetch(`/api/studio/projects/${projectId}/master/reference`, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "prepare", fileName: file.name, mime: file.type, byteSize: file.size, durationMs }),
      }).then((r) => r.json());
      if (!prep.ok) {
        setUpload(null);
        return setError(prep.error === "reference_locked" || prep.error === "addon_missing" ? "locked" : (["bad_format", "too_big", "too_long", "too_short"].includes(prep.error) ? prep.error : "upload"));
      }
      const supabase = createSupabaseBrowserClient();
      const uploads = prep.uploads as { path: string; token: string; contentType: string }[];
      const partBytes = Number(prep.partBytes) || PART_BYTES_FOR_REFERENCE;
      for (let i = 0; i < uploads.length; i++) {
        const u = uploads[i];
        const blob = uploads.length === 1 ? file : file.slice(i * partBytes, Math.min(file.size, (i + 1) * partBytes), u.contentType);
        const { error: ue } = await supabase.storage.from(BUCKET).uploadToSignedUrl(u.path, u.token, blob, { contentType: u.contentType, upsert: false });
        if (ue) throw new Error("upload");
        setUpload({ pct: Math.round(((i + 1) / uploads.length) * 100) });
      }
      const fin = await fetch(`/api/studio/projects/${projectId}/master/reference`, {
        method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "finalize", referenceId: prep.referenceId }),
      }).then((r) => r.json());
      if (!fin.ok) throw new Error("upload");
      onRefState({ ...refState, reference: fin.reference });
    } catch {
      setError("upload");
    } finally {
      setUpload(null);
      if (fileRef.current) fileRef.current.value = "";
    }
  }

  async function remove() {
    const id = refState.reference?.id;
    if (!id) return;
    onRefState({ ...refState, reference: null });
    await fetch(`/api/studio/projects/${projectId}/master/reference?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => {});
  }

  const gate = refState.gate;
  const price = PLAN_ADDON_PRICE_PLN.reference_mastering.monthlyPln.toLocaleString("pl-PL", { minimumFractionDigits: 2 });

  return (
    <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
      <fieldset data-testid="studio-master-styles" className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3" disabled={disabled}>
        <legend className="brd-display px-1 text-base">{t("styl.tytul")}</legend>
        <p className="text-xs text-[var(--brd-mute)]">{t("styl.opis")}</p>
        <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-5">
          {([null, ...MASTER_STYLE_IDS] as (MasterStyleId | null)[]).map((id) => {
            const on = style === id;
            return (
              <button key={id ?? "none"} type="button" aria-pressed={on} data-testid={`studio-master-style-${id ?? "none"}`} onClick={() => onStyle(id)}
                className={`flex min-h-11 flex-col items-start justify-center rounded-[2px] border px-2 py-1 text-left text-sm ${on ? "border-[var(--brd-ink)] bg-[var(--brd-recess)] font-semibold" : "border-[var(--brd-line)] bg-[var(--brd-paper)]"}`}>
                <span>{id ? t(`styl.${id}`) : t("styl.brak")}</span>
                {id ? <span className="text-[11px] font-normal leading-tight text-[var(--brd-mute)]">{t(`styl.${id}Opis`)}</span> : null}
              </button>
            );
          })}
        </div>
        {style ? (
          <label className="flex items-center gap-2 text-sm" htmlFor={`${ids}-si`}>
            <span className="shrink-0">{t("styl.intensywnosc")}</span>
            <input id={`${ids}-si`} type="range" min={0} max={100} step={5} value={styleIntensity} onChange={(e) => onStyleIntensity(Number(e.target.value))} className="min-h-9 flex-1 accent-[var(--brd-amber)]" data-testid="studio-master-style-intensity" aria-valuetext={`${styleIntensity}%`} />
            <output className="w-11 text-right font-mono">{styleIntensity}%</output>
          </label>
        ) : null}
      </fieldset>

      <section data-testid="studio-master-reference" data-gate={gate ? (gate.allowed ? gate.via : gate.reason) : "loading"} aria-labelledby={`${ids}-rt`} className="flex flex-col gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3">
        <div className="flex flex-wrap items-baseline justify-between gap-1">
          <h3 id={`${ids}-rt`} className="brd-display text-base">{!gate || gate.allowed ? "" : "🔒 "}{t("referencja.tytul")}</h3>
          {gate?.allowed ? <span className="text-[11px] uppercase tracking-[0.12em] text-[var(--brd-mute)]">{gate.via === "plan" ? t("referencja.wPlanie") : t("referencja.dodatekAktywny")}</span> : null}
        </div>
        <p className="text-sm">{t("referencja.opis")}</p>
        {!refState.loaded ? null : !refState.available ? (
          <p className="text-sm text-[var(--brd-mute)]">{t("referencja.niedostepna")}</p>
        ) : gate && !gate.allowed ? (
          gate.reason === "addon_missing" ? (
            <div data-testid="studio-master-reference-addon" className="flex flex-col gap-1 border-l-4 border-l-[var(--brd-amber)] pl-2 text-sm">
              <p>{t("referencja.dodatek", { price })}</p>
              <p>
                {t("referencja.dodatekKontakt")}{" "}
                <a className="font-semibold underline underline-offset-4" href={`mailto:${CONTACT}?subject=${encodeURIComponent(t("referencja.mailTemat"))}`}>{CONTACT}</a>
              </p>
            </div>
          ) : (
            <div data-testid="studio-master-reference-locked" className="flex flex-col gap-1 border-l-4 border-l-[var(--brd-amber)] pl-2 text-sm sm:flex-row sm:items-center sm:justify-between">
              <span>{t("referencja.zablokowana")}</span>
              <a href="/premium" className="font-semibold underline underline-offset-4">{t("zobaczPlany")}</a>
            </div>
          )
        ) : refState.reference ? (
          <>
            <div data-testid="studio-master-reference-file" className="flex flex-wrap items-center justify-between gap-2 rounded-[2px] border border-[var(--brd-line)] bg-[var(--brd-recess)] px-2 py-1.5 text-sm">
              <span className="flex min-w-0 flex-1 items-baseline gap-1"><span className="min-w-0 truncate">🎧 <span className="font-semibold">{refState.reference.fileName}</span></span><span className="shrink-0 font-mono">· {fmtDur(refState.reference.durationMs)}</span></span>
              <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => void remove()} data-testid="studio-master-reference-delete">{t("referencja.usun")}</Button>
            </div>
            <label className="flex items-center gap-2 text-sm" htmlFor={`${ids}-ri`}>
              <span className="shrink-0">{t("referencja.intensywnosc")}</span>
              <input id={`${ids}-ri`} type="range" min={0} max={100} step={5} value={refIntensity} onChange={(e) => onRefIntensity(Number(e.target.value))} className="min-h-9 flex-1 accent-[var(--brd-amber)]" data-testid="studio-master-reference-intensity" aria-valuetext={`${refIntensity}%`} />
              <output className="w-11 text-right font-mono">{refIntensity}%</output>
            </label>
            <p className="text-xs text-[var(--brd-mute)]">{t("referencja.podglad")}</p>
          </>
        ) : (
          <div className="flex flex-col gap-1">
            <input ref={fileRef} type="file" accept=".mp3,.wav,audio/mpeg,audio/wav,audio/x-wav" className="sr-only" id={`${ids}-rf`} onChange={(e) => { const f = e.target.files?.[0]; if (f) void pick(f); }} data-testid="studio-master-reference-input" disabled={!!upload || disabled} />
            <Button type="button" size="sm" variant="outline" className="min-h-11 self-start" disabled={!!upload || disabled} onClick={() => fileRef.current?.click()} data-testid="studio-master-reference-upload">
              {upload ? t("referencja.wgrywa", { pct: upload.pct }) : t("referencja.wgraj", { min: Math.round(REFERENCE_MAX_SECONDS / 60) })}
            </Button>
          </div>
        )}
        {error ? <p role="alert" className="text-sm text-[var(--brd-rec)]">{t(`referencja.bledy.${error}`)}</p> : null}
        {gate?.allowed ? <p className="text-xs text-[var(--brd-mute)]">🔒 {t("referencja.prywatnosc")}</p> : null}
      </section>
    </div>
  );
}
