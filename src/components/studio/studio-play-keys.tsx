"use client";

import { useEffect, useRef, useState } from "react";
import { useTranslations } from "next-intl";

import { Button } from "@/components/ui/button";
import { BITEK_MOOD_SRC, type BitekMood } from "@/components/studio/studio-bitek-dock";
import {
  appendPlayedNote,
  renderMidiNotes,
  reviewPlayedNotes,
  scratchPatternAt,
  type PlayKeyInstrument,
  type StudioMidiV1,
} from "@/lib/studio/studio-midi";

const CHOICES: PlayKeyInstrument[] = ["piano", "guitar", "bass", "drums"];

const PIANO_WHITES = [0, 2, 4, 5, 7, 9, 11, 12, 14, 16, 17, 19, 21, 23, 24] as const;
const PIANO_BLACKS = [1, 3, 6, 8, 10, 13, 15, 18, 20, 22] as const;

const GUITAR_STRINGS = [
  { name: "e", open: 64 },
  { name: "B", open: 59 },
  { name: "G", open: 55 },
  { name: "D", open: 50 },
  { name: "A", open: 45 },
  { name: "E", open: 40 },
] as const;

const BASS_STRINGS = [
  { name: "G", open: 43 },
  { name: "D", open: 38 },
  { name: "A", open: 33 },
  { name: "E", open: 28 },
] as const;

const FRETS = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12] as const;
const INLAYS = new Set([3, 5, 7, 9, 12]);

const PADS = [
  { id: "hat", pitch: 42, label: "klawiszeHat", className: "right-4 top-3 h-16 w-16" },
  { id: "snare", pitch: 38, label: "klawiszeWerbel", className: "left-1/2 top-16 h-[4.5rem] w-[4.5rem] -translate-x-1/2" },
  { id: "kick", pitch: 36, label: "klawiszeStopa", className: "bottom-3 left-1/2 h-24 w-32 -translate-x-1/2 rounded-[50%]" },
] as const;

const NOTE_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"] as const;

let previewCtx: AudioContext | undefined;

function noteName(semi: number): string {
  return NOTE_NAMES[((semi % 12) + 12) % 12] ?? "C";
}

function isPlayKey(instrument: string): instrument is PlayKeyInstrument {
  return instrument === "piano" || instrument === "guitar" || instrument === "bass" || instrument === "drums";
}

function previewNote(instrument: PlayKeyInstrument, pitch: number): void {
  const pcm = renderMidiNotes({
    notes: [{ t: 0, dur: 900, pitch, vel: 0.9 }],
    instrument,
    sampleRate: 44100,
    durationMs: 900,
  });
  if (!previewCtx || previewCtx.state === "closed") previewCtx = new AudioContext();
  const ctx = previewCtx;
  void ctx.resume();
  const buffer = ctx.createBuffer(1, pcm.length, 44100);
  buffer.copyToChannel(new Float32Array(pcm), 0);
  const source = ctx.createBufferSource();
  source.buffer = buffer;
  source.connect(ctx.destination);
  source.start();
}

function Fretboard({
  strings,
  thick,
  bed,
  played,
  down,
  onPlay,
  onClick,
  fretLabel,
}: {
  strings: readonly { name: string; open: number }[];
  thick: boolean;
  bed: string;
  played: ReadonlySet<number>;
  down: number | null;
  onPlay: (pitch: number, now: number) => void;
  onClick: (pitch: number, now: number) => void;
  fretLabel: (name: string, fret: number) => string;
}) {
  return (
    <div className={`overflow-x-auto rounded-xl p-2 ${bed}`} data-testid="studio-play-fretboard">
      <div className="min-w-[26rem]">
        {strings.map((string) => (
          <div key={string.name + string.open} className="relative flex">
            <span className="z-10 flex w-6 shrink-0 items-center text-[10px] font-medium text-[var(--brd-paper)]">{string.name}</span>
            <span
              className={`pointer-events-none absolute right-0 left-6 top-1/2 -translate-y-1/2 bg-[var(--brd-line)] ${thick ? "h-[3px]" : "h-px"}`}
            />
            {FRETS.map((fret) => {
              const pitch = string.open + fret;
              const hot = down === pitch || played.has(pitch);
              return (
                <button
                  key={fret}
                  type="button"
                  className={`relative z-10 h-9 min-w-7 flex-1 touch-manipulation border-r border-[color-mix(in_srgb,var(--brd-paper)_28%,transparent)] ${fret === 0 ? "border-r-[3px] border-r-[var(--brd-paper)]" : ""}`}
                  aria-label={fretLabel(string.name, fret)}
                  data-testid={`studio-play-fret-${string.open}-${fret}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    onPlay(pitch, performance.now());
                  }}
                  onClick={() => onClick(pitch, performance.now())}
                >
                  {hot ? (
                    <span className="absolute top-1/2 left-1/2 h-3.5 w-3.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[var(--brd-paper)] shadow" />
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
        <div className="mt-1 flex pl-6">
          {FRETS.map((fret) => (
            <span key={fret} className="flex h-3 min-w-7 flex-1 items-center justify-center">
              {INLAYS.has(fret) ? <span className={`rounded-full bg-[var(--brd-paper)] ${fret === 12 ? "h-1.5 w-3" : "h-1.5 w-1.5"}`} /> : null}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
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
  const lastWall = useRef<number | null>(null);
  const skipClick = useRef(false);
  useEffect(() => {
    midiRef.current = midi;
  }, [midi]);
  useEffect(() => {
    if (!armed || !midi || midi.notes.length === 0) lastWall.current = null;
  }, [armed, midi]);

  const locked = midi && midi.notes.length > 0 && isPlayKey(midi.instrument) ? midi.instrument : null;

  function hit(pitch: number, now: number) {
    setDown(pitch);
    window.setTimeout(() => setDown((current) => (current === pitch ? null : current)), 160);
    previewNote(instrument, pitch);
    if (!armed || disabled) return;
    const since = lastWall.current == null ? undefined : now - lastWall.current;
    const next = appendPlayedNote({
      midi: midiRef.current,
      instrument,
      pitch,
      playheadMs: getPlayheadMs(),
      bpm,
      sinceMs: since,
      gridBeats: instrument === "drums" ? 0.5 : 1,
    });
    if (!next.ok) {
      setNotice(next.reason === "other" ? tr("klawiszeInny") : tr("klawiszePelne"));
      return;
    }
    lastWall.current = now;
    midiRef.current = next.midi;
    setNotice(null);
    onCommit(next.midi);
  }

  function press(pitch: number, now: number) {
    skipClick.current = true;
    hit(pitch, now);
  }

  function pressClick(pitch: number, now: number) {
    if (skipClick.current) {
      skipClick.current = false;
      return;
    }
    hit(pitch, now);
  }

  const scratchOn = midi?.instrument === "scratch" && midi.notes.length > 0;
  const review = reviewPlayedNotes(midi);
  const reviewKey = scratchOn
    ? "keysScratch"
    : !review
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
  const mood: BitekMood = review?.code === "line-ok" || review?.code === "drums-ok" || scratchOn ? "done" : review ? "thinking" : "happy";
  const played = new Set(locked === instrument ? (midi?.notes.map((note) => note.pitch) ?? []) : []);
  const pianoBase = 60;

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
          <p className="mt-1 text-xs leading-snug text-[var(--brd-mute)]">{tr("klawiszeOpis")}</p>
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
              setNotice(locked && id !== locked ? tr("klawiszeInny") : null);
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
      <Button
        type="button"
        size="sm"
        variant="outline"
        className="min-h-11 w-full"
        disabled={disabled || locked !== null}
        title={tr("klawiszeOpis")}
        data-testid="studio-play-keys-scratch"
        onClick={() => {
          if (locked) {
            setNotice(tr("klawiszeInny"));
            return;
          }
          setNotice(null);
          onCommit(scratchPatternAt(getPlayheadMs(), bpm, midiRef.current));
        }}
      >
        {tr("klawiszeSkrecz")}
      </Button>
      {instrument === "drums" ? (
        <div className="relative mx-auto h-56 max-w-sm rounded-xl bg-[var(--brd-ink)]" data-testid="studio-play-drums">
          {PADS.map((pad) => {
            const hot = down === pad.pitch;
            return (
              <button
                key={pad.id}
                type="button"
                className={`absolute flex touch-manipulation items-center justify-center border-2 text-xs font-medium shadow-md ${pad.className} ${pad.id === "kick" ? "" : "rounded-full"} ${hot ? "translate-y-0.5 border-[var(--brd-paper)] bg-[var(--brd-paper)] text-[var(--brd-ink)]" : "border-[color-mix(in_srgb,var(--brd-paper)_55%,var(--brd-ink))] bg-[color-mix(in_srgb,var(--brd-ink)_72%,var(--brd-paper)_28%)] text-[var(--brd-paper)]"} ${played.has(pad.pitch) && !hot ? "ring-2 ring-[var(--brd-paper)]" : ""}`}
                data-testid={`studio-play-pad-${pad.id}`}
                onPointerDown={(event) => {
                  event.preventDefault();
                  press(pad.pitch, performance.now());
                }}
                onClick={() => pressClick(pad.pitch, performance.now())}
              >
                {tr(pad.label)}
              </button>
            );
          })}
        </div>
      ) : null}
      {instrument === "guitar" ? (
        <Fretboard
          strings={GUITAR_STRINGS}
          thick={false}
          bed="bg-[var(--brd-green-deep)]"
          played={played}
          down={down}
          onPlay={press}
          onClick={pressClick}
          fretLabel={(name, fret) => tr("klawiszeFret", { name, n: fret })}
        />
      ) : null}
      {instrument === "bass" ? (
        <Fretboard
          strings={BASS_STRINGS}
          thick
          bed="bg-[var(--brd-graphite)]"
          played={played}
          down={down}
          onPlay={press}
          onClick={pressClick}
          fretLabel={(name, fret) => tr("klawiszeFret", { name, n: fret })}
        />
      ) : null}
      {instrument === "piano" ? (
        <div className="overflow-x-auto rounded-xl bg-[var(--brd-ink)] px-3 pt-3 pb-3" data-testid="studio-play-keyboard">
          <div className="relative min-w-[28rem]">
            <div className="flex gap-px">
              {PIANO_WHITES.map((semi) => {
                const pitch = pianoBase + semi;
                const hot = down === pitch;
                return (
                  <button
                    key={semi}
                    type="button"
                    className={`flex h-36 min-w-8 flex-1 touch-manipulation items-end justify-center rounded-b-md border border-[var(--brd-line)] pb-1.5 text-[10px] font-medium text-[var(--brd-mute)] shadow-[inset_0_-8px_0_rgba(0,0,0,0.06)] ${hot ? "translate-y-0.5 bg-[color-mix(in_srgb,var(--brd-paper)_72%,var(--brd-ink)_28%)]" : "bg-[var(--brd-paper)]"}`}
                    aria-label={noteName(semi)}
                    data-testid={`studio-play-key-${semi}`}
                    onPointerDown={(event) => {
                      event.preventDefault();
                      press(pitch, performance.now());
                    }}
                    onClick={() => pressClick(pitch, performance.now())}
                  >
                    <span className="flex flex-col items-center gap-1">
                      {played.has(pitch) ? <span className="h-1.5 w-1.5 rounded-full bg-[var(--brd-ink)]" /> : null}
                      {semi % 12 === 0 ? noteName(semi) : ""}
                    </span>
                  </button>
                );
              })}
            </div>
            {PIANO_BLACKS.map((semi) => {
              const pitch = pianoBase + semi;
              const hot = down === pitch;
              const left = (PIANO_WHITES.filter((white) => white < semi).length / PIANO_WHITES.length) * 100;
              return (
                <button
                  key={semi}
                  type="button"
                  className={`absolute top-0 z-10 h-[58%] w-[4.2%] -translate-x-1/2 touch-manipulation rounded-b-md text-[9px] text-[var(--brd-paper)] shadow-md ${hot ? "bg-[color-mix(in_srgb,var(--brd-ink)_50%,var(--brd-paper)_50%)]" : "bg-[var(--brd-ink)]"}`}
                  style={{ left: `${left}%` }}
                  aria-label={noteName(semi)}
                  data-testid={`studio-play-key-${semi}`}
                  onPointerDown={(event) => {
                    event.preventDefault();
                    press(pitch, performance.now());
                  }}
                  onClick={() => pressClick(pitch, performance.now())}
                />
              );
            })}
          </div>
        </div>
      ) : null}
      {notice ? (
        <p className="text-xs text-[var(--brd-warn)]" role="status">
          {notice}
        </p>
      ) : null}
    </div>
  );
}
