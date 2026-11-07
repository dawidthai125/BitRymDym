"use client";

import { useState } from "react";
import { useTranslations } from "next-intl";

import {
  ROLL_STEPS,
  rollPitches,
  rollWindow,
  toggleGridNote,
  type PlayKeyInstrument,
  type StudioMidiV1,
} from "@/lib/studio/studio-midi";

const NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

function pitchLabel(instrument: PlayKeyInstrument, pitch: number, tr: (key: string) => string): string {
  if (instrument === "drums") {
    if (pitch === 36) return tr("klawiszeStopa");
    if (pitch === 38) return tr("klawiszeWerbel");
    return tr("klawiszeHat");
  }
  const name = NAMES[((pitch % 12) + 12) % 12] ?? "C";
  const octave = Math.floor(pitch / 12) - 1;
  return `${name}${octave}`;
}

export function StudioMidiRoll({
  disabled,
  instrument,
  midi,
  bpm,
  getPlayheadMs,
  onCommit,
  onRejected,
}: {
  disabled: boolean;
  instrument: PlayKeyInstrument;
  midi: StudioMidiV1 | null;
  bpm: number;
  getPlayheadMs: () => number;
  onCommit: (midi: StudioMidiV1) => void;
  onRejected: (reason: "other" | "full" | "range") => void;
}) {
  const tr = useTranslations("studio.studioRecordingPanel");
  const [anchor, setAnchor] = useState(0);
  const pitches = rollPitches(instrument);
  const { origin, stepMs } = rollWindow(anchor, bpm);
  const notes = midi && midi.instrument === instrument ? midi.notes : [];

  function on(pitch: number, step: number): boolean {
    const t = origin + step * stepMs;
    return notes.some((note) => note.pitch === pitch && note.t >= t && note.t < t + stepMs);
  }

  function toggle(pitch: number, step: number) {
    const next = toggleGridNote({
      midi,
      instrument,
      pitch,
      step,
      playheadMs: anchor,
      bpm,
    });
    if (!next.ok) {
      onRejected(next.reason);
      return;
    }
    onCommit(next.midi);
  }

  return (
    <div className="space-y-2" data-testid="studio-midi-roll">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div>
          <p className="text-sm font-medium text-[var(--brd-ink)]">{tr("klawiszeRolka")}</p>
          <p className="text-xs text-[var(--brd-mute)]">{tr("klawiszeRolkaOpis")}</p>
        </div>
        <button
          type="button"
          className="inline-flex min-h-11 items-center px-2 text-xs underline underline-offset-4"
          disabled={disabled}
          onClick={() => setAnchor(getPlayheadMs())}
        >
          {tr("klawiszePrzyGlowicy")}
        </button>
      </div>
      <div className="overflow-x-auto">
        <div className="min-w-[36rem] space-y-1" role="group" aria-label={tr("klawiszeRolka")}>
          {pitches.map((pitch) => (
            <div key={pitch} className="grid grid-cols-[4.5rem_repeat(16,minmax(0,1fr))] gap-1">
              <span className="flex min-h-11 items-center text-xs text-[var(--brd-mute)]">{pitchLabel(instrument, pitch, tr)}</span>
              {Array.from({ length: ROLL_STEPS }, (_, step) => {
                const active = on(pitch, step);
                return (
                  <button
                    key={step}
                    type="button"
                    disabled={disabled}
                    aria-pressed={active}
                    aria-label={tr("klawiszeNuta", { name: pitchLabel(instrument, pitch, tr), n: step + 1 })}
                    className={`min-h-11 rounded-sm border ${active ? "border-[var(--brd-ink)] bg-[var(--brd-ink)]" : "border-[var(--brd-line)] bg-transparent"}`}
                    onClick={() => toggle(pitch, step)}
                  />
                );
              })}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
