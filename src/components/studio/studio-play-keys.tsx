"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import {
  appendPlayedNote,
  renderMidiNotes,
  type PlayKeyInstrument,
  type StudioMidiV1,
} from "@/lib/studio/studio-midi";

const WHITE = [
  { name: "C", semi: 0, black: { name: "C#", semi: 1 } },
  { name: "D", semi: 2, black: { name: "D#", semi: 3 } },
  { name: "E", semi: 4, black: null },
  { name: "F", semi: 5, black: { name: "F#", semi: 6 } },
  { name: "G", semi: 7, black: { name: "G#", semi: 8 } },
  { name: "A", semi: 9, black: { name: "A#", semi: 10 } },
  { name: "B", semi: 11, black: null },
  { name: "C", semi: 12, black: null },
] as const;

const PADS = [
  { id: "kick", pitch: 36, label: "klawiszeStopa" },
  { id: "snare", pitch: 38, label: "klawiszeWerbel" },
  { id: "hat", pitch: 42, label: "klawiszeHat" },
] as const;

const CHOICES: PlayKeyInstrument[] = ["piano", "guitar", "bass", "drums"];

function rootMidi(instrument: PlayKeyInstrument): number {
  if (instrument === "bass") return 36;
  if (instrument === "guitar") return 52;
  return 60;
}

function previewNote(instrument: PlayKeyInstrument, pitch: number): void {
  const pcm = renderMidiNotes({
    notes: [{ t: 0, dur: 700, pitch, vel: 0.9 }],
    instrument,
    sampleRate: 22050,
    durationMs: 700,
  });
  const ctx = new AudioContext();
  const buffer = ctx.createBuffer(1, pcm.length, 22050);
  buffer.copyToChannel(new Float32Array(pcm), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.onended = () => void ctx.close();
  source.start();
}

export function StudioPlayKeys({
  disabled,
  midi,
  bpm,
  getPlayheadMs,
  onCommit,
}: {
  disabled: boolean;
  midi: StudioMidiV1 | null;
  bpm: number;
  getPlayheadMs: () => number;
  onCommit: (midi: StudioMidiV1) => void;
}) {
  const tr = useTranslations("studio.studioRecordingPanel");
  const [instrument, setInstrument] = useState<PlayKeyInstrument>("piano");
  const [armed, setArmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const midiRef = useRef(midi);
  useEffect(() => {
    midiRef.current = midi;
  }, [midi]);

  function hit(pitch: number) {
    setNotice(null);
    previewNote(instrument, pitch);
    if (!armed || disabled) return;
    const next = appendPlayedNote({
      midi: midiRef.current,
      instrument,
      pitch,
      playheadMs: getPlayheadMs(),
      bpm,
    });
    if (!next.ok) {
      setNotice(next.reason === "other" ? tr("klawiszeInny") : tr("klawiszePelne"));
      return;
    }
    midiRef.current = next.midi;
    onCommit(next.midi);
  }

  const base = rootMidi(instrument);

  return (
    <div className="space-y-2 rounded border border-[var(--brd-line)] p-2" data-testid="studio-play-keys">
      <p className="text-xs font-medium text-[var(--brd-ink)]">{tr("klawisze")}</p>
      <p className="text-xs text-[var(--brd-mute)]">{tr("klawiszeOpis")}</p>
      <div className="flex flex-wrap gap-1" role="group" aria-label={tr("klawisze")}>
        {CHOICES.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={instrument === id ? "default" : "outline"}
            className="min-h-11"
            aria-pressed={instrument === id}
            onClick={() => {
              setInstrument(id);
              setNotice(null);
            }}
          >
            {tr(id === "piano" ? "klawiszeFortepian" : id === "guitar" ? "klawiszeGitara" : id === "bass" ? "klawiszeBas" : "klawiszeBeben")}
          </Button>
        ))}
      </div>
      <Button
        type="button"
        size="sm"
        variant={armed ? "default" : "outline"}
        className="min-h-11"
        aria-pressed={armed}
        disabled={disabled}
        data-testid="studio-play-keys-arm"
        onClick={() => setArmed((value) => !value)}
      >
        {armed ? tr("klawiszeStop") : tr("klawiszeNagrywaj")}
      </Button>
      {instrument === "drums" ? (
        <div className="grid grid-cols-3 gap-1">
          {PADS.map((pad) => (
            <Button
              key={pad.id}
              type="button"
              variant="outline"
              className="min-h-16 bg-[var(--brd-ink)] text-[var(--brd-paper)]"
              data-testid={`studio-play-pad-${pad.id}`}
              onClick={() => hit(pad.pitch)}
            >
              {tr(pad.label)}
            </Button>
          ))}
        </div>
      ) : (
        <div className="flex gap-0.5" data-testid="studio-play-keyboard">
          {WHITE.map((key) => {
            const black = key.black;
            return (
            <div key={`${key.name}-${key.semi}`} className="relative min-w-0 flex-1">
              <button
                type="button"
                className="h-24 w-full rounded-b border border-[var(--brd-line)] bg-[var(--brd-paper)] text-xs text-[var(--brd-ink)]"
                aria-label={key.name}
                data-testid={`studio-play-key-${key.semi}`}
                onClick={() => hit(base + key.semi)}
              >
                {key.name}
              </button>
              {black ? (
                <button
                  type="button"
                  className="absolute left-[68%] top-0 z-10 h-14 w-[64%] rounded-b border border-[var(--brd-ink)] bg-[var(--brd-ink)] text-[10px] text-[var(--brd-paper)]"
                  aria-label={black.name}
                  data-testid={`studio-play-key-${black.semi}`}
                  onClick={() => hit(base + black.semi)}
                >
                  {black.name}
                </button>
              ) : null}
            </div>
            );
          })}
        </div>
      )}
      {notice ? (
        <p className="text-xs text-[var(--brd-warn)]" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
