"use client";

import { useCallback, useEffect, useId, useMemo, useState } from "react";
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
  fitPresetToPlan,
  vocalSetRoleForTrack,
  type FxPresetKind,
  type FxPresetPayload,
  type OwnFxPreset,
  type VocalPresetSet,
} from "@/lib/studio/presets/vocal-presets";
import { useLibText } from "@/i18n/use-lib-text";
import { studioFxLabelPl, type StudioFxChainV1 } from "@/lib/studio/studio-fx-chain";
import { clampTuneChainForTier, type TuneKey } from "@/lib/studio/tune/tune";
import type { PremiumTier } from "@/types/premium";

type PresetAccess = { tier: string; maxOwn: number; roleSets: boolean; tuneCustom?: boolean; tuneNotes?: boolean };

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
    return Boolean(res?.ok);
  }, []);

  const publish = useCallback(async (id: string, listed: boolean) => {
    const res = await fetch(`/api/studio/fx-presets/${id}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ listed }),
    }).catch(() => null);
    if (res?.ok) setState((s) => ({ ...s, presets: s.presets.map((p) => (p.id === id ? { ...p, listed } : p)) }));
    return Boolean(res?.ok);
  }, []);

  const market = useCallback(async () => {
    const res = await fetch("/api/studio/fx-presets/market").catch(() => null);
    const json = (await res?.json().catch(() => null)) as { presets?: OwnFxPreset[] } | null;
    return res?.ok && Array.isArray(json?.presets) ? json.presets : null;
  }, []);

  const copyListed = useCallback(async (id: string) => {
    const res = await fetch("/api/studio/fx-presets/market", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ id }),
    }).catch(() => null);
    const json = (await res?.json().catch(() => null)) as { preset?: OwnFxPreset } | null;
    if (!res?.ok || !json?.preset) return null;
    const preset = json.preset;
    setState((s) => ({ ...s, presets: [preset, ...s.presets] }));
    return preset;
  }, []);

  return { ...state, create, remove, publish, market, copyListed };
}

function PlanLock({ label, testId }: { label: string; testId: string }) {
  return (
    <p data-testid={testId} className="flex items-center gap-1.5 rounded border border-dashed border-[var(--brd-line)] px-2 py-1.5 text-xs text-[var(--brd-mute)]">
      <span aria-hidden>🔒</span>
      {label}
    </p>
  );
}

/** Two clicks for things that cannot be taken back with Ctrl+Z. */
function ConfirmButton({ label, confirmLabel, ariaLabel, disabled, onConfirm }: { label: string; confirmLabel: string; ariaLabel?: string; disabled?: boolean; onConfirm: () => Promise<void> }) {
  const t = useTranslations("studio.vocalPresets");
  const [asking, setAsking] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!asking) {
    return (
      <Button type="button" size="sm" variant="ghost" className="min-h-9" aria-label={ariaLabel} disabled={disabled} onClick={() => setAsking(true)}>
        {label}
      </Button>
    );
  }
  return (
    <span className="inline-flex items-center gap-1">
      <Button
        type="button"
        size="sm"
        className="min-h-9"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await onConfirm();
          setBusy(false);
          setAsking(false);
        }}
      >
        {confirmLabel}
      </Button>
      <Button type="button" size="sm" variant="ghost" className="min-h-9" disabled={busy} onClick={() => setAsking(false)}>
        {t("anuluj")}
      </Button>
    </span>
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
  maxEffects,
  allowSidechain,
  onApply,
}: {
  chain: StudioFxChainV1;
  bpm: number;
  /** Plan limits: a tile says before the click what the plan leaves out. */
  maxEffects?: number;
  allowSidechain?: boolean;
  /** Beat key for BRD Tune in the Trap preset. */
  tuneKey?: TuneKey | null;
  disabled?: boolean;
  onApply: (chain: StudioFxChainV1) => Promise<boolean>;
}) {
  const t = useTranslations("studio.vocalPresets");
  const store = useFxPresets();
  const [message, setMessage] = useState<string | null>(null);
  const tl = useLibText();
  const [market, setMarket] = useState<{ status: "idle" | "loading" | "error" | "ready"; list: { id: string; name: string }[] }>({ status: "idle", list: [] });
  const skippedText = (types: readonly Parameters<typeof studioFxLabelPl>[0][]) => [...new Set(types)].map((type) => tl(studioFxLabelPl(type))).join(", ");
  const skippedByPreset = useMemo(
    () =>
      Object.fromEntries(
        VOCAL_PRESET_IDS.map((id) => [id, fitPresetToPlan(buildVocalPresetChain(id, { bpm, tuneKey }), chain, { maxEffects, allowSidechain }).skipped]),
      ) as Record<(typeof VOCAL_PRESET_IDS)[number], ReturnType<typeof fitPresetToPlan>["skipped"]>,
    [bpm, tuneKey, chain, maxEffects, allowSidechain],
  );
  const own = store.presets.filter((p) => p.kind === "chain");
  const canSave = store.access.maxOwn > 0;
  const full = store.presets.length >= store.access.maxOwn;

  async function apply(next: StudioFxChainV1, name: string) {
    // Free/Bronze: BRD Tune hard style → natural (server enforces the same gate).
    const fit = fitPresetToPlan(clampTuneChainForTier(store.access.tier as PremiumTier, next), chain, { maxEffects, allowSidechain });
    if (!fit.chain) {
      setMessage(t("planZaMaly", { max: maxEffects ?? 0 }));
      return;
    }
    const ok = await onApply(fit.chain);
    setMessage(
      !ok
        ? t("bladUstawienia")
        : fit.skipped.length > 0
          ? t("ustawionoBez", { name, lista: skippedText(fit.skipped), max: maxEffects ?? 0 })
          : t("ustawiono", { name }),
    );
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
            disabled={disabled || !store.loaded}
            data-testid={`studio-vocal-preset-${id}`}
            aria-label={t("zastosujAria", { name: t(`nazwy.${id}`) })}
            onClick={() => void apply(buildVocalPresetChain(id, { bpm, tuneKey }), t(`nazwy.${id}`))}
            className="min-h-11 rounded border border-[var(--brd-line)] px-2 py-1.5 text-left hover:border-[var(--brd-ink)] disabled:opacity-50"
          >
            <span className="block text-sm font-semibold text-[var(--brd-ink)]">{t(`nazwy.${id}`)}</span>
            <span className="block text-[11px] leading-tight text-[var(--brd-mute)]">{t(`opisy.${id}`)}</span>
            {skippedByPreset[id].length > 0 ? (
              <span data-testid={`studio-vocal-preset-${id}-plan`} className="mt-0.5 block text-[11px] leading-tight text-[var(--brd-amber)]">
                {t("planBez", { lista: skippedText(skippedByPreset[id]) })}
              </span>
            ) : null}
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
                  <ConfirmButton
                    label={p.listed ? t("wycofaj") : t("wystaw")}
                    confirmLabel={p.listed ? t("wycofajPytanie") : t("wystawPytanie")}
                    onConfirm={async () => {
                      const ok = await store.publish(p.id, !p.listed);
                      setMessage(ok ? t(p.listed ? "wycofano" : "wystawiono") : t("bladGieldy"));
                    }}
                  />
                  <ConfirmButton
                    label={t("usun")}
                    confirmLabel={t("usunPytanie")}
                    ariaLabel={t("usunAria", { name: p.name })}
                    onConfirm={async () => {
                      const ok = await store.remove(p.id);
                      setMessage(ok ? t("usunieto", { name: p.name }) : t("bladUsuwania"));
                    }}
                  />
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
      <div className="space-y-1.5" data-testid="studio-preset-market">
        <div className="flex items-center justify-between gap-2">
          <h4 className="text-xs font-medium text-[var(--brd-ink)]">{t("gielda")}</h4>
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="min-h-9"
            disabled={market.status === "loading"}
            onClick={async () => {
              setMarket((m) => ({ ...m, status: "loading" }));
              const list = await store.market();
              setMarket(list ? { status: "ready", list } : { status: "error", list: [] });
            }}
          >
            {market.status === "loading" ? t("gieldaLaduje") : market.status === "idle" ? t("gieldaPokaz") : t("gieldaOdswiez")}
          </Button>
        </div>
        <p className="text-[11px] text-[var(--brd-mute)]">{t("gieldaOpis")}</p>
        {market.status === "ready" && market.list.length === 0 ? <p className="text-xs text-[var(--brd-mute)]">{t("gieldaPusto")}</p> : null}
        {market.status === "error" ? <p role="alert" className="text-xs text-[var(--brd-rec)]">{t("gieldaBlad")}</p> : null}
        {market.list.length > 0 && store.loaded && !canSave ? <p className="text-xs text-[var(--brd-mute)]">{t("kopiujOdSilver")}</p> : null}
        {market.list.length > 0 && canSave && full ? <p className="text-xs text-[var(--brd-mute)]">{t("limitPelny", { max: store.access.maxOwn })}</p> : null}
        <ul className="flex flex-col gap-1">
          {market.list.map((p) => (
            <li key={p.id} className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate text-sm">{p.name}</span>
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="min-h-9"
                disabled={!canSave || full}
                onClick={async () => {
                  const copied = await store.copyListed(p.id);
                  setMessage(copied ? t("skopiowano", { name: copied.name }) : t("bladGieldy"));
                }}
              >
                {t("kopiuj")}
              </Button>
            </li>
          ))}
        </ul>
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
  maxEffects,
  onApplyOps,
}: {
  tracks: readonly SetTrack[];
  bpm: number;
  maxEffects?: number;
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
    const ops = buildVocalSetOps(vocalTracks, set).flatMap<MixWorkingOp>((op) => {
      if (op.op !== "set_track_fx") return [op];
      const current = vocalTracks.find((tr) => tr.id === op.trackId)?.effectsChain ?? { schemaVersion: 1 as const, effects: [] };
      const fit = fitPresetToPlan(clampTuneChainForTier(tier, op.effectsChain), current, { maxEffects });
      return fit.chain ? [{ ...op, effectsChain: fit.chain }] : [];
    });
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
                  <ConfirmButton
                    label="×"
                    confirmLabel={t("usunPytanie")}
                    ariaLabel={t("usunAria", { name: p.name })}
                    onConfirm={async () => {
                      const ok = await store.remove(p.id);
                      setMessage(ok ? t("usunieto", { name: p.name }) : t("bladUsuwania"));
                    }}
                  />
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
