"use client";

import { useState } from "react";

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
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;
  const vertical = orientation === "vertical";

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
        {label}
        {!compact || vertical ? ` (${display})` : null}
        {compact && !vertical ? (
          <span className="ml-1 font-mono tabular-nums text-[var(--brd-ink)]">
            {display}
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
        aria-label={ariaLabel}
        onChange={(e) => {
          const next = Number(e.target.value);
          setDraft(next);
          onLocalChange(next);
        }}
        onPointerUp={(e) => {
          const next = Number((e.target as HTMLInputElement).value);
          setDraft(null);
          onCommit(next);
        }}
        onKeyUp={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            const next = Number((e.target as HTMLInputElement).value);
            setDraft(null);
            onCommit(next);
          }
        }}
        onBlur={(e) => {
          if (draft === null) return;
          const next = Number(e.target.value);
          setDraft(null);
          onCommit(next);
        }}
      />
    </label>
  );
}
