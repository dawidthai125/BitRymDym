"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import type { StudioTrackRole } from "@/config/studio";
import type { MixWorkingOp } from "@/lib/studio/mix-working/mix-working-types";
import {
  FX_PRESET_NAME_MAX,
  VOCAL_PRESET_IDS,
  buildVocalPresetChain,
  buildVocalPresetSet,
  buildVocalSetOps,
  captureVocalSet,
  cloneChainWithNewIds,
  vocalSetRoleForTrack,
  type FxPresetKind,
  type FxPresetPayload,
  type OwnFxPreset,
  type VocalPresetSet,
} from "@/lib/studio/presets/vocal-presets";
import type { StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import { clampTuneChainForTier, type TuneKey } from "@/lib/studio/tune/tune";
import type { PremiumTier } from "@/types/premium";

type PresetAccess = { tier: string; maxOwn: number; roleSets: boolean; tuneCustom?: boolean };

type FxPresetsState = { loaded: boolean; available: boolean; access: PresetAccess; presets: OwnFxPreset[] };
const NO_ACCESS: PresetAccess = { tier: "FREE", maxOwn: 0, roleSets: false };

async function fetchFxPresets(): Promise<FxPresetsState> {
  try {
    const res = await fetch("/api/studio/fx-presets", { cache: "no-store" });
    const json = (await res.json()) as { available?: boolean; access?: PresetAccess; presets?: OwnFxPreset[] };
    if (!res.ok) throw new Error("list");
    return {
      loaded: true,
      available: json.available !== false,
      access: json.access ?? NO_ACCESS,
      presets: Array.isArray(json.presets) ? json.presets : [],
    };
  } catch {
    return { loaded: true, available: false, access: NO_ACCESS, presets: [] };
  }
}

/** Own presets + plan access (server decides via plan-policy; UI only mirrors it). */
export function useFxPresets() {
  const [state, setState] = useState<FxPresetsState>({ loaded: false, available: true, access: NO_ACCESS, presets: [] });

  useEffect(() => {
    let cancelled = false;
    void fetchFxPresets().then((next) => {
      if (!cancelled) setState(next);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const create = useCallback(
    async (name: string, kind: FxPresetKind, payload: FxPresetPayload): Promise<{ ok: true } | { ok: false; error: string }> => {
      try {
        const res = await fetch("/api/studio/fx-presets", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name, kind, payload }),
        });
        const json = (await res.json().catch(() => ({}))) as { preset?: OwnFxPreset; error?: string };
        if (!res.ok || !json.preset) return { ok: false, error: json.error ?? "" };
        const preset = json.preset;
        setState((s) => ({ ...s, presets: [preset, ...s.presets] }));
        return { ok: true };
      } catch {
        return { ok: false, error: "" };
      }
    },
    [],
  );

  const remove = useCallback(async (id: string) => {
    const res = await fetch(`/api/studio/fx-presets/${id}`, { method: "DELETE" }).catch(() => null);
    if (res?.ok) setState((s) => ({ ...s, presets: s.presets.filter((p) => p.id !== id) }));
  }, []);

  return { ...state, create, remove };
}

function PlanLock({ label, testId }: { label: string; testId: string }) {
  return (
    <p data-testid={testId} className="flex items-center gap-1.5 rounded border border-dashed border-[var(--brd-line)] px-2 py-1.5 text-xs text-[var(--brd-mute)]">
      <span aria-hidden>🔒</span>
      {label}
    </p>
  );
}

function SaveForm({
  label,
  disabled,
  onSave,
}: {
  label: string;
  disabled?: boolean;
  onSave: (name: string) => Promise<boolean>;
}) {
  const t = useTranslations("studio.vocalPresets");
  const id = useId();
  const [open, setOpen] = useState(false);
  const [name, setName] = useState("");
  const [busy, setBusy] = useState(false);
  if (!open) {
    return (
      <Button type="button" size="sm" variant="outline" className="min-h-9 self-start" disabled={disabled} onClick={() => setOpen(true)} data-testid="studio-preset-save-open">
        + {label}
      </Button>
    );
  }
  return (
    <form
      className="flex flex-wrap items-center gap-2"
      onSubmit={async (e) => {
        e.preventDefault();
        if (!name.trim() || busy) return;
        setBusy(true);
        const ok = await onSave(name.trim());
        setBusy(false);
        if (ok) {
          setName("");
          setOpen(false);
        }
      }}
    >
      <label htmlFor={id} className="sr-only">
        {t("nazwa")}
      </label>
      <input
        id={id}
        value={name}
        maxLength={FX_PRESET_NAME_MAX}
        onChange={(e) => setName(e.target.value)}
        placeholder={t("nazwa")}
        className="min-h-9 flex-1 rounded border border-[var(--brd-line)] bg-[var(--brd-paper)] px-2 text-sm"
        autoFocus
      />
      <Button type="submit" size="sm" className="min-h-9" disabled={busy || !name.trim()}>
        {t("zapisz")}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-9" onClick={() => setOpen(false)}>
        {t("anuluj")}
      </Button>
    </form>
  );
}

/** Free: 6 built-in vocal presets on one track. Silver+: save/apply own presets. */
export function StudioVocalPresetPicker({
  chain,
  bpm,
  tuneKey = null,
  disabled,
  onApply,
}: {
  chain: StudioFxChainV1;
  bpm: number;
  /** Beat key for BRD Tune in the Trap preset. */
  tuneKey?: TuneKey | null;
  disabled?: boolean;
  onApply: (chain: StudioFxChainV1) => Promise<boolean>;
}) {
  const t = useTranslations("studio.vocalPresets");
  const store = useFxPresets();
  const [message, setMessage] = useState<string | null>(null);
  const own = store.presets.filter((p) => p.kind === "chain");
  const canSave = store.access.maxOwn > 0;
  const full = store.presets.length >= store.access.maxOwn;

  async function apply(next: StudioFxChainV1, name: string) {
    // Free/Bronze: BRD Tune hard style → natural (server enforces the same gate).
    const ok = await onApply(clampTuneChainForTier(store.access.tier as PremiumTier, next));
    if (ok) setMessage(t("ustawiono", { name }));
  }

  return (
    <section data-testid="studio-vocal-presets" className="space-y-2 border-b border-[var(--brd-line)] pb-3">
      <div>
        <h3 className="text-xs font-semibold text-[var(--brd-ink)]">{t("tytul")}</h3>
        <p className="text-[11px] text-[var(--brd-mute)]">{t("opis")} {t("zastap")}</p>
      </div>
      <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
        {VOCAL_PRESET_IDS.map((id) => (
          <button
            key={id}
            type="button"
            disabled={disabled}
            data-testid={`studio-vocal-preset-${id}`}
            aria-label={t("zastosujAria", { name: t(`nazwy.${id}`) })}
            onClick={() => void apply(buildVocalPresetChain(id, { bpm, tuneKey }), t(`nazwy.${id}`))}
            className="min-h-11 rounded border border-[var(--brd-line)] px-2 py-1.5 text-left hover:border-[var(--brd-ink)] disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-[var(--brd-ink)]">{t(`nazwy.${id}`)}</span>
            <span className="block text-[11px] leading-tight text-[var(--brd-mute)]">{t(`opisy.${id}`)}</span>
          </button>
        ))}
      </div>

      <div className="space-y-1.5">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-[var(--brd-ink)]">{t("wlasne")}</h4>
          {canSave ? (
            <span className="text-[11px] text-[var(--brd-mute)]">{t("limit", { n: store.presets.length, max: store.access.maxOwn })}</span>
          ) : null}
        </div>
        {!store.loaded ? null : !canSave ? (
          <PlanLock label={t("lockSilver")} testId="studio-presets-lock-silver" />
        ) : !store.available ? (
          <p className="text-xs text-[var(--brd-mute)]">{t("niedostepne")}</p>
        ) : (
          <>
            {own.length === 0 ? <p className="text-xs text-[var(--brd-mute)]">{t("brakWlasnych")}</p> : null}
            <ul className="flex flex-col gap-1">
              {own.map((p) => (
                <li key={p.id} className="flex items-center gap-2">
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-9 flex-1 justify-start"
                    disabled={disabled || !("chain" in p.payload)}
                    aria-label={t("zastosujAria", { name: p.name })}
                    onClick={() => "chain" in p.payload && void apply(cloneChainWithNewIds(p.payload.chain), p.name)}
                  >
                    {p.name}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="min-h-9" aria-label={t("usunAria", { name: p.name })} onClick={() => void store.remove(p.id)}>
                    {t("usun")}
                  </Button>
                </li>
              ))}
            </ul>
            {full ? (
              <p className="text-xs text-[var(--brd-mute)]">{t("limitPelny", { max: store.access.maxOwn })}</p>
            ) : chain.effects.length === 0 ? (
              <p className="text-xs text-[var(--brd-mute)]">{t("pustyLancuch")}</p>
            ) : (
              <SaveForm
                label={t("zapiszObecny")}
                disabled={disabled}
                onSave={async (name) => {
                  const r = await store.create(name, "chain", { chain });
                  setMessage(r.ok ? t("zapisano", { name }) : r.error || t("bladZapisu"));
                  return r.ok;
                }}
              />
            )}
          </>
        )}
      </div>
      {message ? (
        <p role="status" className="text-[11px] text-[var(--brd-mute)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}

type SetTrack = { id: string; trackRole: StudioTrackRole; effectsChain: StudioFxChainV1 };

/** Gold: one click sets lead / doubles / adlibs chains across all vocal tracks. */
export function StudioVocalSetsCard({
  tracks,
  bpm,
  tuneKey = null,
  disabled,
  onApplyOps,
}: {
  tracks: readonly SetTrack[];
  bpm: number;
  tuneKey?: TuneKey | null;
  disabled?: boolean;
  onApplyOps: (ops: MixWorkingOp[], description: string) => Promise<boolean>;
}) {
  const t = useTranslations("studio.vocalPresets");
  const store = useFxPresets();
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const vocalTracks = tracks.filter((tr) => vocalSetRoleForTrack(tr.trackRole) !== null);
  const sets = store.presets.filter((p) => p.kind === "set");

  async function applySet(set: VocalPresetSet, name: string) {
    const tier = store.access.tier as PremiumTier;
    const ops = buildVocalSetOps(vocalTracks, set).map((op) =>
      op.op === "set_track_fx" ? { ...op, effectsChain: clampTuneChainForTier(tier, op.effectsChain) } : op,
    );
    if (!ops.length) return;
    setBusy(true);
    const ok = await onApplyOps(ops, t("zestawNazwa", { name }));
    setBusy(false);
    setMessage(ok ? t("zestawUstawiony", { name, n: ops.length }) : t("zestawBlad"));
  }

  return (
    <section data-testid="studio-vocal-sets" className="space-y-2 rounded border border-[var(--brd-line)] p-3">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold text-[var(--brd-ink)]">{t("zestawy")}</h3>
        <span className="rounded bg-amber-300 px-1.5 py-0.5 text-[10px] font-bold uppercase text-black">Gold</span>
      </div>
      <p className="text-xs text-[var(--brd-mute)]">{t("zestawyOpis")}</p>
      {!store.loaded ? null : !store.access.roleSets ? (
        <PlanLock label={t("lockGold")} testId="studio-presets-lock-gold" />
      ) : vocalTracks.length === 0 ? (
        <p className="text-xs text-[var(--brd-mute)]">{t("brakRol")}</p>
      ) : (
        <>
          <div className="flex flex-wrap gap-1.5">
            {VOCAL_PRESET_IDS.map((id) => (
              <Button
                key={id}
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9"
                disabled={disabled || busy}
                data-testid={`studio-vocal-set-${id}`}
                onClick={() => void applySet(buildVocalPresetSet(id, { bpm, tuneKey }), t(`nazwy.${id}`))}
              >
                {t("zastosujZestaw", { name: t(`nazwy.${id}`) })}
              </Button>
            ))}
            {sets.map((p) =>
              "set" in p.payload ? (
                <span key={p.id} className="inline-flex items-center gap-0.5">
                  <Button
                    type="button"
                    size="sm"
                    className="min-h-9"
                    disabled={disabled || busy}
                    onClick={() => "set" in p.payload && void applySet(p.payload.set, p.name)}
                  >
                    {p.name}
                  </Button>
                  <Button type="button" size="sm" variant="ghost" className="min-h-9 px-2" aria-label={t("usunAria", { name: p.name })} onClick={() => void store.remove(p.id)}>
                    ×
                  </Button>
                </span>
              ) : null,
            )}
          </div>
          <p className="text-[11px] text-[var(--brd-mute)]">
            {(["lead", "doubles", "adlibs"] as const)
              .map((r) => `${t(`role.${r}`)}: ${vocalTracks.filter((tr) => vocalSetRoleForTrack(tr.trackRole) === r).length}`)
              .join(" · ")}
          </p>
          {store.presets.length < store.access.maxOwn && store.available ? (
            <SaveForm
              label={t("zapiszZestaw")}
              disabled={disabled || busy}
              onSave={async (name) => {
                const set = captureVocalSet(vocalTracks);
                if (!Object.keys(set).length) {
                  setMessage(t("pustyLancuch"));
                  return false;
                }
                const r = await store.create(name, "set", { set });
                setMessage(r.ok ? t("zapisano", { name }) : r.error || t("bladZapisu"));
                return r.ok;
              }}
            />
          ) : null}
        </>
      )}
      {message ? (
        <p role="status" className="text-[11px] text-[var(--brd-mute)]">
          {message}
        </p>
      ) : null}
    </section>
  );
}
