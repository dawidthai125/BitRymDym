"use client";

import { useEffect, useId, useState } from "react";
import { useLocale, useTranslations } from "next-intl";

import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { useFxPresets } from "@/components/studio/studio-vocal-presets";
import { Button } from "@/components/ui/button";
import type { StudioFxTuneParams } from "@/lib/studio/studio-fx-chain";
import { detectBeatKeyFromSession, fetchProjectBeatKey, type ProjectBeatKeyDto } from "@/lib/studio/tune/beat-key-client";
import { formatTuneKey, TUNE_KEY_NAMES, TUNE_STYLES, tuneStyleOf, type TuneKey, type TuneStyle } from "@/lib/studio/tune/tune";

/** Beat key of the project (null while loading / unavailable). */
export function useProjectBeatKey(projectId: string | null | undefined): ProjectBeatKeyDto | null {
  const [state, setState] = useState<{ id: string; value: ProjectBeatKeyDto | null } | null>(null);
  useEffect(() => {
    if (!projectId) return;
    let cancelled = false;
    void fetchProjectBeatKey(projectId).then((value) => {
      if (!cancelled) setState({ id: projectId, value });
    });
    return () => {
      cancelled = true;
    };
  }, [projectId]);
  return state && state.id === projectId ? state.value : null;
}

const SCALE_KEYS = ["dur", "moll", "chromatyczna"] as const;

/** Tune slot body inside the FX chain editor (key/scale/style; Silver+ sliders). */
export function StudioTunePanel({
  projectId,
  params,
  disabled,
  onCommit,
}: {
  projectId: string;
  params: StudioFxTuneParams;
  disabled?: boolean;
  onCommit: (next: StudioFxTuneParams) => Promise<boolean>;
}) {
  const t = useTranslations("studio.tune");
  const lang = useLocale() === "en" ? "en" : "pl";
  const keyId = useId();
  const scaleId = useId();
  const beat = useProjectBeatKey(projectId);
  const presets = useFxPresets();
  const custom = presets.access.tuneCustom === true;
  const [local, setLocal] = useState<Partial<StudioFxTuneParams>>({});
  const [detectMsg, setDetectMsg] = useState<string | null>(null);
  const [detecting, setDetecting] = useState(false);
  const style = tuneStyleOf(params);
  const current: TuneKey = { keyRoot: params.keyRoot, scale: params.scale as TuneKey["scale"] };
  const beatKey = beat?.key ?? null;
  const differsFromBeat = beatKey && (beatKey.keyRoot !== current.keyRoot || beatKey.scale !== current.scale);

  const commit = (patch: Partial<StudioFxTuneParams>) => onCommit({ ...params, ...patch });

  async function detect() {
    if (!beat?.beatId) return;
    setDetecting(true);
    setDetectMsg(t("wykrywanie"));
    const r = await detectBeatKeyFromSession(beat.beatId);
    setDetecting(false);
    if (!r.ok) {
      setDetectMsg(r.reason === "no-audio" ? t("brakAudio") : t("niewykryto"));
      return;
    }
    const pct = Math.round(Math.max(0, Math.min(1, r.key.score)) * 100);
    setDetectMsg(t("wykryto", { key: formatTuneKey(r.key, lang), pct }));
    await commit({ keyRoot: r.key.keyRoot, scale: r.key.scale });
  }

  const slider = (path: "retuneMs" | "amount", label: string, max: number, step: number, unit: string) => {
    const value = local[path] ?? params[path];
    return (
      <StudioMixControl
        label={label}
        ariaLabel={`${t("tytul")}: ${label}`}
        value={value}
        display={path === "amount" ? `${Math.round(value * 100)}%` : `${Math.round(value)} ${unit}`}
        min={0}
        max={max}
        step={step}
        disabled={disabled || !custom}
        onLocalChange={(next) => setLocal((p) => ({ ...p, [path]: next }))}
        onCommit={(next) => {
          setLocal((p) => ({ ...p, [path]: undefined }));
          void commit({ [path]: next });
        }}
      />
    );
  };

  return (
    <div data-testid="studio-tune-panel" className="space-y-3">
      <p className="text-[11px] text-[var(--brd-mute)]">{t("opis")}</p>

      <div className="grid grid-cols-2 gap-2">
        <label htmlFor={keyId} className="space-y-1 text-xs text-[var(--brd-ink)]">
          <span className="block font-medium">{t("tonacja")}</span>
          <select
            id={keyId}
            data-testid="studio-tune-key"
            className="min-h-11 w-full rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-sm disabled:opacity-50"
            value={params.keyRoot}
            disabled={disabled || params.scale === 2}
            onChange={(e) => void commit({ keyRoot: Number(e.target.value) })}
          >
            {TUNE_KEY_NAMES.map((name, i) => (
              <option key={name} value={i}>
                {name}
              </option>
            ))}
          </select>
        </label>
        <label htmlFor={scaleId} className="space-y-1 text-xs text-[var(--brd-ink)]">
          <span className="block font-medium">{t("skala")}</span>
          <select
            id={scaleId}
            data-testid="studio-tune-scale"
            className="min-h-11 w-full rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-sm"
            value={params.scale}
            disabled={disabled}
            onChange={(e) => void commit({ scale: Number(e.target.value) })}
          >
            {SCALE_KEYS.map((k, i) => (
              <option key={k} value={i}>
                {t(`skale.${k}`)}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="space-y-1.5 rounded border border-[var(--brd-line)] px-2 py-2 text-xs" data-testid="studio-tune-beat-key">
        <p className="text-[var(--brd-ink)]">
          {beatKey ? t("zBitu", { key: formatTuneKey(beatKey, lang) }) : t("zBituNieznana")}
        </p>
        <div className="flex flex-wrap gap-1.5">
          {beatKey && differsFromBeat ? (
            <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={disabled} onClick={() => void commit(beatKey)}>
              {t("ustawZBitu")}
            </Button>
          ) : null}
          {beat?.beatId ? (
            <Button type="button" size="sm" variant="outline" className="min-h-9" disabled={disabled || detecting} data-testid="studio-tune-detect" onClick={() => void detect()}>
              {t("wykryj")}
            </Button>
          ) : null}
        </div>
        {detectMsg ? (
          <p role="status" className="text-[var(--brd-mute)]">
            {detectMsg}
          </p>
        ) : null}
      </div>

      <div className="space-y-1.5">
        <p className="text-xs font-medium text-[var(--brd-ink)]">{t("styl")}</p>
        <div className="grid grid-cols-2 gap-1.5" role="group" aria-label={t("styl")}>
          {(["natural", "hard"] as const satisfies readonly TuneStyle[]).map((s) => {
            const locked = s === "hard" && !custom;
            return (
              <button
                key={s}
                type="button"
                aria-pressed={style === s}
                disabled={disabled || locked}
                data-testid={`studio-tune-style-${s}`}
                onClick={() => void commit(TUNE_STYLES[s])}
                className={`min-h-11 rounded border px-2 py-1.5 text-left disabled:opacity-60 ${
                  style === s ? "border-[var(--brd-ink)] bg-[var(--brd-bg)]" : "border-[var(--brd-line)] hover:border-[var(--brd-ink)]"
                }`}
              >
                <span className="block text-sm font-semibold text-[var(--brd-ink)]">
                  {locked ? "🔒 " : ""}
                  {t(`style.${s}`)}
                </span>
                <span className="block text-[11px] leading-tight text-[var(--brd-mute)]">{t(`styleOpis.${s}`)}</span>
              </button>
            );
          })}
        </div>
        {style === "custom" ? <p className="text-[11px] text-[var(--brd-mute)]">{t("styleOpis.custom")}</p> : null}
      </div>

      {presets.loaded && !custom ? (
        <p data-testid="studio-tune-lock" className="flex items-center gap-1.5 rounded border border-dashed border-[var(--brd-line)] px-2 py-1.5 text-xs text-[var(--brd-mute)]">
          <span aria-hidden>🔒</span>
          {t("lockSilver")}
        </p>
      ) : null}
      {slider("retuneMs", t("szybkosc"), 400, 1, "ms")}
      {slider("amount", t("sila"), 1, 0.01, "")}
      <p className="text-[11px] text-[var(--brd-mute)]">{t("latencja")}</p>
      <p className="text-[11px] text-[var(--brd-mute)]">🔒 {t("recznie")}</p>
    </div>
  );
}
