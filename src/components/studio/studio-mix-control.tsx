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
}) {
  const [draft, setDraft] = useState<number | null>(null);
  const shown = draft ?? value;

  return (
    <label className="mt-2 block text-xs text-[var(--brd-mute)]">
      {label} ({display})
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={shown}
        disabled={disabled}
        className="mt-1 h-11 w-full"
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
