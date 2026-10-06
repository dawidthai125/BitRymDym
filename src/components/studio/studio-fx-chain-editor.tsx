"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";

import { StudioMixControl } from "@/components/studio/studio-mix-control";
import { StudioToggleChip } from "@/components/studio/studio-toggle-chip";
import { Button } from "@/components/ui/button";
import {
  addStudioFxToChain,
  canMoveStudioFx,
  FX_CHAIN_CONFLICT_UI_PL,
  getStudioFxParamValue,
  moveStudioFx,
  removeStudioFxFromChain,
  setStudioFxEnabled,
  setStudioFxParamValue,
  setStudioFxParams,
  STUDIO_FX_CHAIN_MAX_EFFECTS,
  STUDIO_FX_TYPES,
  STUDIO_FX_UI_META,
  studioFxLabelPl,
  type StudioFxChainRole,
  type StudioFxChainV1,
  type StudioFxInstance,
  type StudioFxType,
} from "@/lib/studio/studio-fx-chain";

export type StudioFxSavingState =
  | "idle"
  | "saving"
  | "saved"
  | "error"
  | "conflict";

type StudioFxChainEditorProps = {
  role: StudioFxChainRole;
  projectId: string;
  trackId?: string;
  chain: StudioFxChainV1;
  documentVersion: number;
  onDocumentVersionChange: (version: number) => void;
  onChainChange: (chain: StudioFxChainV1) => void;
  onClose?: () => void;
  title?: string;
};

type PersistResult =
  | { ok: true; documentVersion: number; chain: StudioFxChainV1 }
  | { ok: false; kind: "conflict" | "error"; message: string };

async function persistFxChain(params: {
  role: StudioFxChainRole;
  projectId: string;
  trackId?: string;
  expectedDocumentVersion: number;
  chain: StudioFxChainV1;
}): Promise<PersistResult> {
  const path =
    params.role === "master"
      ? `/api/studio/projects/${params.projectId}/master-fx`
      : `/api/studio/projects/${params.projectId}/tracks/${params.trackId}/effects`;
  const res = await fetch(path, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      expectedDocumentVersion: params.expectedDocumentVersion,
      chain: params.chain,
    }),
  });
  const json = (await res.json()) as {
    documentVersion?: number;
    effectsChain?: StudioFxChainV1;
    masterFxChain?: StudioFxChainV1;
    error?: string;
    code?: string;
  };
  if (res.status === 409 || json.code === "FX_CHAIN_VERSION_CONFLICT") {
    return {
      ok: false,
      kind: "conflict",
      message: json.error ?? FX_CHAIN_CONFLICT_UI_PL,
    };
  }
  if (!res.ok) {
    return {
      ok: false,
      kind: "error",
      message: json.error ?? "Nie udało się zapisać efektów.",
    };
  }
  const nextChain =
    params.role === "master" ? json.masterFxChain : json.effectsChain;
  if (typeof json.documentVersion !== "number" || !nextChain) {
    return {
      ok: false,
      kind: "error",
      message: "Nie udało się zapisać efektów.",
    };
  }
  return {
    ok: true,
    documentVersion: json.documentVersion,
    chain: nextChain,
  };
}

function formatParam(value: number, unit: string): string {
  const text =
    Math.abs(value) >= 100 || Number.isInteger(value)
      ? String(Math.round(value * 1000) / 1000)
      : value.toFixed(2);
  return unit ? `${text} ${unit}` : text;
}

export function StudioFxChainEditor({
  role,
  projectId,
  trackId,
  chain,
  documentVersion,
  onDocumentVersionChange,
  onChainChange,
  onClose,
  title,
}: StudioFxChainEditorProps) {
  const titleId = useId();
  const panelRef = useRef<HTMLDivElement>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState<StudioFxSavingState>("idle");
  const [message, setMessage] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [localParams, setLocalParams] = useState<Record<string, number>>({});

  useEffect(() => {
    panelRef.current?.focus();
  }, []);

  async function commit(nextChain: StudioFxChainV1): Promise<boolean> {
    setSaving("saving");
    setMessage("Zapisywanie…");
    const result = await persistFxChain({
      role,
      projectId,
      trackId,
      expectedDocumentVersion: documentVersion,
      chain: nextChain,
    });
    if (!result.ok) {
      setSaving(result.kind === "conflict" ? "conflict" : "error");
      setMessage(result.message);
      return false;
    }
    onDocumentVersionChange(result.documentVersion);
    onChainChange(result.chain);
    setSaving("saved");
    setMessage("Zapisano");
    return true;
  }

  async function onAdd(type: StudioFxType) {
    setAddOpen(false);
    try {
      const next = addStudioFxToChain(chain, type, role);
      const ok = await commit(next);
      if (ok) {
        const added = next.effects[next.effects.length - 1];
        // When inserting before master limiter, last may not be the new effect
        const created =
          next.effects.find(
            (e) => !chain.effects.some((c) => c.id === e.id),
          ) ?? added;
        if (created) setExpandedId(created.id);
      }
    } catch (e) {
      setSaving("error");
      setMessage(
        e instanceof Error ? e.message : "Nie udało się dodać efektu.",
      );
    }
  }

  async function onRemove(effectId: string) {
    const next = removeStudioFxFromChain(chain, effectId);
    const ok = await commit(next);
    if (ok && expandedId === effectId) setExpandedId(null);
  }

  async function onToggle(effect: StudioFxInstance) {
    try {
      const next = setStudioFxEnabled(
        chain,
        effect.id,
        !effect.enabled,
        role,
      );
      await commit(next);
    } catch (e) {
      setSaving("error");
      setMessage(
        e instanceof Error
          ? e.message
          : "Nie udało się zmienić stanu efektu.",
      );
    }
  }

  async function onReorder(index: number, direction: "up" | "down") {
    if (!canMoveStudioFx(chain, index, direction, role)) return;
    const next = moveStudioFx(chain, index, direction, role);
    await commit(next);
  }

  async function onParamCommit(
    effect: StudioFxInstance,
    path: string,
    value: number,
  ) {
    const key = `${effect.id}:${path}`;
    const params = setStudioFxParamValue(effect.params, path, value);
    const next = setStudioFxParams(chain, effect.id, params);
    setLocalParams((prev) => {
      const copy = { ...prev };
      delete copy[key];
      return copy;
    });
    await commit(next);
  }

  const atMax = chain.effects.length >= STUDIO_FX_CHAIN_MAX_EFFECTS;
  const heading =
    title ??
    (role === "master" ? "Master · Efekty" : "Ścieżka · Efekty");

  return (
    <div
      ref={panelRef}
      tabIndex={-1}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="flex max-h-[min(85dvh,40rem)] flex-col overflow-hidden rounded-t-2xl border border-[var(--brd-line)] bg-[var(--brd-paper)] shadow-lg outline-none"
    >
      <div className="flex items-center justify-between gap-2 border-b border-[var(--brd-line)] px-3 py-3">
        <h2
          id={titleId}
          className="text-sm font-semibold text-[var(--brd-ink)]"
        >
          {heading}
        </h2>
        {onClose ? (
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="min-h-11 min-w-11"
            aria-label="Zamknij efekty"
            onClick={onClose}
          >
            Zamknij
          </Button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 space-y-3 overflow-y-auto px-3 py-3 pb-[max(1.25rem,env(safe-area-inset-bottom))]">
        {message ? (
          <p
            role="status"
            className={
              saving === "conflict" || saving === "error"
                ? "text-sm text-red-700"
                : "text-sm text-[var(--brd-mute)]"
            }
          >
            {message}
            {saving === "conflict" ? (
              <>
                {" "}
                <button
                  type="button"
                  className="underline"
                  onClick={() => window.location.reload()}
                >
                  Odśwież
                </button>
              </>
            ) : null}
          </p>
        ) : null}

        {chain.effects.length === 0 ? (
          <p className="text-sm text-[var(--brd-mute)]">
            Brak efektów. Dodaj efekt.
          </p>
        ) : (
          <ul className="space-y-2" aria-label="Łańcuch efektów">
            {chain.effects.map((effect, index) => {
              const meta = STUDIO_FX_UI_META[effect.type];
              const expanded = expandedId === effect.id;
              const canUp = canMoveStudioFx(chain, index, "up", role);
              const canDown = canMoveStudioFx(chain, index, "down", role);
              return (
                <li
                  key={effect.id}
                  className="rounded-lg border border-[var(--brd-line)] p-3"
                >
                  <div className="flex flex-wrap items-center gap-2">
                    <button
                      type="button"
                      className="min-h-11 flex-1 text-left text-sm font-medium text-[var(--brd-ink)]"
                      aria-expanded={expanded}
                      onClick={() =>
                        setExpandedId(expanded ? null : effect.id)
                      }
                    >
                      {meta.labelPl}
                    </button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="min-h-11 min-w-11"
                      disabled={!canUp || saving === "saving"}
                      aria-label={`Przenieś ${meta.labelPl} w górę`}
                      onClick={() => void onReorder(index, "up")}
                    >
                      ↑
                    </Button>
                    <Button
                      type="button"
                      size="xs"
                      variant="ghost"
                      className="min-h-11 min-w-11"
                      disabled={!canDown || saving === "saving"}
                      aria-label={`Przenieś ${meta.labelPl} w dół`}
                      onClick={() => void onReorder(index, "down")}
                    >
                      ↓
                    </Button>
                    <StudioToggleChip
                      active={effect.enabled}
                      label={effect.enabled ? "Włączony" : "Wyłączony"}
                      title={
                        effect.enabled
                          ? "Wyłącz efekt (bez usuwania)"
                          : "Włącz efekt"
                      }
                      disabled={saving === "saving"}
                      onClick={() => void onToggle(effect)}
                    />
                  </div>

                  {expanded ? (
                    <div className="mt-3 space-y-2 border-t border-[var(--brd-line)] pt-3">
                      {meta.params.map((param) => {
                        const key = `${effect.id}:${param.path}`;
                        const committed = getStudioFxParamValue(
                          effect.params,
                          param.path,
                        );
                        const value = localParams[key] ?? committed;
                        return (
                          <StudioMixControl
                            key={param.path}
                            label={param.labelPl}
                            ariaLabel={`${meta.labelPl}: ${param.labelPl}`}
                            value={value}
                            display={formatParam(value, param.unit)}
                            min={param.min}
                            max={param.max}
                            step={param.step}
                            disabled={saving === "saving"}
                            onLocalChange={(next) =>
                              setLocalParams((prev) => ({
                                ...prev,
                                [key]: next,
                              }))
                            }
                            onCommit={(next) =>
                              void onParamCommit(effect, param.path, next)
                            }
                          />
                        );
                      })}
                      <Button
                        type="button"
                        size="sm"
                        variant="outline"
                        className="min-h-11"
                        aria-label={`Usuń efekt ${meta.labelPl}`}
                        disabled={saving === "saving"}
                        onClick={() => void onRemove(effect.id)}
                      >
                        Usuń
                      </Button>
                    </div>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}

        <div className="space-y-2">
          <Button
            type="button"
            size="sm"
            className="min-h-11 w-full"
            disabled={atMax || saving === "saving"}
            aria-expanded={addOpen}
            onClick={() => setAddOpen((v) => !v)}
          >
            Dodaj efekt
          </Button>
          {addOpen ? (
            <ul className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              {STUDIO_FX_TYPES.map((type) => (
                <li key={type}>
                  <Button
                    type="button"
                    size="sm"
                    variant="outline"
                    className="min-h-11 w-full"
                    disabled={saving === "saving"}
                    onClick={() => void onAdd(type)}
                  >
                    {studioFxLabelPl(type)}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {atMax ? (
            <p className="text-xs text-[var(--brd-mute)]">
              Limit {STUDIO_FX_CHAIN_MAX_EFFECTS} efektów.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

/**
 * Bottom sheet host for FX editor.
 * z-50 sits above mobile bottom-nav (z-40) so controls are not intercepted.
 */
export function StudioFxSheet({
  open,
  onClose,
  children,
}: {
  open: boolean;
  onClose: () => void;
  children: ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center">
      <button
        type="button"
        className="absolute inset-0 bg-black/40"
        aria-label="Zamknij panel efektów"
        onClick={onClose}
      />
      <div className="relative z-10 w-full max-w-lg pb-[env(safe-area-inset-bottom)] sm:px-4">
        {children}
      </div>
    </div>
  );
}
