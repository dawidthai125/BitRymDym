"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { BITEK_MOOD_SRC, type BitekMood } from "@/components/studio/studio-bitek-dock";
import {
  appendPlayedNote,
  renderMidiNotes,
  reviewPlayedNotes,
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
  const tBitek = useTranslations("studio.bitek");
  const [instrument, setInstrument] = useState<PlayKeyInstrument>("piano");
  const [armed, setArmed] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [down, setDown] = useState<number | null>(null);
  const midiRef = useRef(midi);
  useEffect(() => {
    midiRef.current = midi;
  }, [midi]);

  function hit(pitch: number) {
    setNotice(null);
    setDown(pitch);
    window.setTimeout(() => setDown((current) => (current === pitch ? null : current)), 140);
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
  const review = reviewPlayedNotes(midi);
  const reviewKey = !review
    ? "keysIdle"
    : review.code === "short"
      ? "keysShort"
      : review.code === "same"
        ? "keysSame"
        : review.code === "leap"
          ? "keysLeap"
          : review.code === "drums-one"
            ? "keysDrumsOne"
            : review.code === "drums-ok"
              ? "keysDrumsOk"
              : "keysLineOk";
  const mood: BitekMood = review?.code === "line-ok" || review?.code === "drums-ok" ? "done" : review ? "thinking" : "happy";

  return (
    <div className="space-y-3 rounded-2xl border border-[var(--brd-line)] bg-[var(--brd-paper)] p-3 shadow-sm" data-testid="studio-play-keys">
      <div className="flex items-start gap-2">
        {/* eslint-disable-next-line @next/next/no-img-element -- same static BITEK asset as the dock */}
        <img src={BITEK_MOOD_SRC[mood]} alt="" width={48} height={48} className="h-12 w-12 shrink-0 rounded-full" />
        <div className="min-w-0">
          <p className="text-sm font-medium text-[var(--brd-ink)]">{tr("klawisze")}</p>
          <p className="text-sm leading-snug text-[var(--brd-ink)]" data-testid="studio-play-keys-bitek">
            {tBitek(`msg.${reviewKey}`, { count: review?.count ?? 0 })}
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-1" role="group" aria-label={tr("klawisze")}>
        {CHOICES.map((id) => (
          <Button
            key={id}
            type="button"
            size="sm"
            variant={instrument === id ? "default" : "outline"}
            className="min-h-11 px-1"
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
        className="min-h-11 w-full"
        aria-pressed={armed}
        disabled={disabled}
        data-testid="studio-play-keys-arm"
        onClick={() => setArmed((value) => !value)}
      >
        {armed ? tr("klawiszeStop") : tr("klawiszeNagrywaj")}
      </Button>
      {instrument === "drums" ? (
        <div className="grid grid-cols-3 gap-2 rounded-xl bg-[var(--brd-ink)] p-2">
          {PADS.map((pad) => (
            <button
              key={pad.id}
              type="button"
              className={`min-h-20 rounded-2xl border border-[var(--brd-paper)] text-sm font-medium text-[var(--brd-paper)] shadow-md ${down === pad.pitch ? "translate-y-0.5 bg-[var(--brd-paper)] text-[var(--brd-ink)]" : "bg-[color-mix(in_srgb,var(--brd-ink)_78%,var(--brd-paper)_22%)]"}`}
              data-testid={`studio-play-pad-${pad.id}`}
              onClick={() => hit(pad.pitch)}
            >
              {tr(pad.label)}
            </button>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl bg-[var(--brd-ink)] px-2 pb-2 pt-3" data-testid="studio-play-keyboard">
          <div className="flex min-w-[22rem] gap-px">
            {WHITE.map((key) => {
              const black = key.black;
              const whiteDown = down === base + key.semi;
              return (
                <div key={`${key.name}-${key.semi}`} className="relative min-w-0 flex-1">
                  <button
                    type="button"
                    className={`flex h-36 w-full items-end justify-center rounded-b-md border border-[var(--brd-line)] pb-2 text-[11px] font-medium text-[var(--brd-mute)] ${whiteDown ? "translate-y-0.5 bg-[color-mix(in_srgb,var(--brd-paper)_75%,var(--brd-ink)_25%)]" : "bg-[var(--brd-paper)]"}`}
                    aria-label={key.name}
                    data-testid={`studio-play-key-${key.semi}`}
                    onClick={() => hit(base + key.semi)}
                  >
                    {key.name}
                  </button>
                  {black ? (
                    <button
                      type="button"
                      className={`absolute -right-[22%] top-0 z-10 h-[58%] w-[62%] rounded-b-md text-[10px] text-[var(--brd-paper)] shadow-md ${down === base + black.semi ? "bg-[color-mix(in_srgb,var(--brd-ink)_55%,var(--brd-paper)_45%)]" : "bg-[var(--brd-ink)]"}`}
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
