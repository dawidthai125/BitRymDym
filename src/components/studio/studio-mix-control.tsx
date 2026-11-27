"use client";

import type * as React from "react";

import { useLibText } from "@/i18n/use-lib-text";

import { useLayoutEffect, useRef, useState } from "react";

/** Shared Gain/Pan slider — local drag, commit on pointer up / keyboard commit. */
export function StudioMixControl({
  label,
  ariaLabel,
  value,
  display,
  min,
  max,
  step,
  disabled,
  onLocalChange,
  onCommit,
  orientation = "horizontal",
  compact = false,
  stacked = false,
  presets,
  snap,
}: {
  label: string;
  ariaLabel: string;
  value: number;
  display: string;
  min: number;
  max: number;
  step: number;
  disabled?: boolean;
  onLocalChange: (next: number) => void;
  onCommit: (next: number) => void;
  /** Visual only — same range input, no new audio nodes. */
  orientation?: "horizontal" | "vertical";
  /** Denser chrome (Transport / track headers). */
  compact?: boolean;
  /**
   * Track header: short label + mono value on one row above a full-width
   * slider, so two controls side by side never overlap (PL/EN alike).
   */
  stacked?: boolean;
  /** Quick buttons under a stacked slider, e.g. pan L / C / P. One tap saves. */
  presets?: readonly { label: string; value: number; ariaLabel: string }[];
  /** A drag that ends this close to `snap.value` lands on it (pan: centre). */
  snap?: { value: number; within: number };
}) {
  const tl = useLibText();
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const startRef = useRef<number | null>(null);
  const keyTimer = useRef<number | null>(null);
  /** Saves only a real change: a click without a move adds no save and no undo step. */
  const commit = (raw: number) => {
    const next = snap && raw !== snap.value && Math.abs(raw - snap.value) <= snap.within ? snap.value : raw;
    if (next !== raw) onLocalChange(next);
    if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
    keyTimer.current = null;
    // The parent may already show the dragged value, so compare with where the drag began.
    const moved = startRef.current !== null && next !== startRef.current;
    startRef.current = null;
    setDraft(null);
    if (moved) onCommit(next);
  };
  const commitRef = useRef(commit);
  useLayoutEffect(() => {
    commitRef.current = commit;
  });
  const slider = {
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => {
      const next = Number(e.target.value);
      startRef.current ??= value;
      setDraft(next);
      onLocalChange(next);
    },
    onPointerUp: (e: React.PointerEvent<HTMLInputElement>) => commit(Number(e.currentTarget.value)),
    // A finger that starts scrolling the page cancels the pointer: keep what was set.
    onPointerCancel: (e: React.PointerEvent<HTMLInputElement>) => commit(Number(e.currentTarget.value)),
    // Arrows: one save after the last key, not one per press and not only on blur.
    onKeyUp: (e: React.KeyboardEvent<HTMLInputElement>) => {
      const input = e.currentTarget;
      if (e.key === "Enter" || e.key === " ") {
        commit(Number(input.value));
        return;
      }
      if (draft === null) return;
      if (keyTimer.current !== null) window.clearTimeout(keyTimer.current);
      keyTimer.current = window.setTimeout(() => commitRef.current(Number(input.value)), 500);
    },
    onBlur: (e: React.FocusEvent<HTMLInputElement>) => {
      if (draft !== null) commit(Number(e.currentTarget.value));
    },
  };
  const vertical = orientation === "vertical";

  if (stacked && !vertical) {
    return (
      <label
        className="studio-mix-stacked flex min-w-0 flex-col text-[10px] leading-none text-[var(--brd-mute)]"
        title={tl(ariaLabel)}
      >
        <span className="flex min-w-0 items-baseline justify-between gap-1">
          {presets?.length ? (
            // The track header has a fixed height: L / C / P sit in the label line, not in a row of their own.
            <span className="flex gap-0.5" data-testid="studio-mix-presets">
              {presets.map((preset) => {
                const on = Math.abs(shown - preset.value) < 0.005;
                return (
                  <button
                    key={preset.label}
                    type="button"
                    disabled={disabled}
                    aria-label={tl(preset.ariaLabel)}
                    aria-pressed={on}
                    className={`min-w-5 rounded-sm border px-1 py-px text-[10px] font-semibold leading-none disabled:opacity-50 pointer-coarse:min-w-7 pointer-coarse:py-0.5 ${on ? "border-[var(--brd-green)] bg-[var(--brd-green)] text-black" : "border-[var(--brd-line)] text-[var(--brd-ink)]"}`}
                    onClick={(e) => {
                      e.preventDefault();
                      if (preset.value === value) return;
                      onLocalChange(preset.value);
                      onCommit(preset.value);
                    }}
                  >
                    {tl(preset.label)}
                  </button>
                );
              })}
            </span>
          ) : (
            <span className="truncate" aria-hidden="true">
              {tl(label)}
            </span>
          )}
          <span
            className="shrink-0 font-mono tabular-nums text-[var(--brd-ink)]"
            aria-hidden="true"
          >
            {tl(display)}
          </span>
        </span>
        <input
          type="range"
          min={min}
          max={max}
          step={step}
          value={shown}
          disabled={disabled}
          className="mt-0.5 h-7 w-full min-w-0 accent-[var(--brd-green)]"
          aria-label={tl(ariaLabel)}
          aria-valuetext={tl(display)}
          {...slider}
        />
      </label>
    );
  }

  return (
    <label
      className={
        vertical
          ? "mt-1 flex flex-col items-center gap-1 text-[10px] text-[var(--brd-mute)]"
          : compact
            ? "mt-0.5 block text-[10px] leading-tight text-[var(--brd-mute)]"
            : "mt-2 block text-xs text-[var(--brd-mute)]"
      }
    >
      <span className={vertical ? "order-2 text-center" : undefined}>
        {tl(label)}
        {tl(!compact || vertical ? ` (${display})` : null)}
        {compact && !vertical ? (
          <span className="ml-1 font-mono tabular-nums text-[var(--brd-ink)]">
            {tl(display)}
          </span>
        ) : null}
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        className={
          vertical
            ? "order-1 h-28 w-11 min-h-11 cursor-pointer accent-[var(--brd-green)]"
            : compact
              ? "mt-0.5 h-11 w-full accent-[var(--brd-green)]"
              : "mt-1 h-11 w-full accent-[var(--brd-green)]"
        }
        style={
          vertical
            ? { writingMode: "vertical-lr", direction: "rtl" }
            : undefined
        }
        aria-label={tl(ariaLabel)}
        {...slider}
      />
    </label>
  );
}
