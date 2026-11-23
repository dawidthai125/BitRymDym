"use client";

import { StoreAppHidden } from "@/components/site/store-app-context";
import { useTranslations } from "next-intl";
import Link from "@/components/ui/app-link";
import { useCallback, useEffect, useRef, useState } from "react";

import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  listLabInputs,
  openLabEngine,
  playChannels,
  scheduleClicks,
  type LabEngine,
  type LabInput,
} from "@/lib/studio/samples/sample-lab-audio";
import {
  detectPitchHz,
  encodeWav16,
  hzToNote,
  maxBarsFor,
  peakDb,
  processTake,
  rmsDb,
  type LabSampleType,
} from "@/lib/studio/samples/sample-lab-dsp";
import { LIVE_SAMPLE_INSTRUMENTS, SAMPLE_BARS, SAMPLE_MAX_MS, instrumentKind } from "@/lib/studio/samples/sample-policy";
import { cn } from "@/lib/utils";

import { MySamples } from "./my-samples";
import { PlayStudio } from "../play/play-studio";

export type LabBeat = { id: string; title: string; bpm: number; key: string | null };

type Take = {
  id: string;
  channels: Float32Array[];
  sampleRate: number;
  note: string | null;
  key: string | null;
  clipped: boolean;
  seconds: number;
  source: "live" | "import";
};

type Status = "off" | "starting" | "ready" | "countin" | "recording";

const panel = "rounded-lg border border-[var(--brd-line)] bg-[var(--brd-paper)] p-4 sm:p-5";
const label = "mb-1.5 block text-xs font-medium uppercase tracking-[0.06em] text-[var(--brd-ink-soft)]";
const control =
  "min-h-11 w-full rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper)] px-3 text-sm text-[var(--brd-ink)] outline-none focus-visible:border-[var(--brd-amber)]";

export function SampleLab({ beats, allowed }: { beats: LabBeat[]; allowed: boolean }) {
  const t = useTranslations("studio.sampleLab");

  // Settings
  const [mode, setMode] = useState<"beat" | "free">(beats.length ? "beat" : "free");
  const [beatId, setBeatId] = useState(beats[0]?.id ?? "");
  const [freeBpm, setFreeBpm] = useState(90);
  const [metronome, setMetronome] = useState(true);
  const [type, setType] = useState<LabSampleType>("oneshot");
  const [bars, setBars] = useState(4);
  const [instrument, setInstrument] = useState<string>("acoustic_guitar");
  const [inputs, setInputs] = useState<LabInput[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [stereo, setStereo] = useState(false);
  const [monitor, setMonitor] = useState(false);
  const [beatInEars, setBeatInEars] = useState(true);

  // Engine
  const engine = useRef<LabEngine | null>(null);
  const [status, setStatus] = useState<Status>("off");
  const [error, setError] = useState<string | null>(null);
  const [level, setLevel] = useState(-90);
  const [tuner, setTuner] = useState<{ label: string; cents: number } | null>(null);
  const [countBeat, setCountBeat] = useState(0);
  const stopClicks = useRef<(() => void) | null>(null);
  const stopTimer = useRef<number | null>(null);
  const countTimers = useRef<number[]>([]);
  const mounted = useRef(true);
  const beatAudio = useRef<HTMLAudioElement | null>(null);
  const plan = useRef<{ loopStartSec: number; firstFrameSec: number } | null>(null);

  // Takes + save
  const [takes, setTakes] = useState<Take[]>([]);
  const [chosen, setChosen] = useState<string | null>(null);
  const [playing, setPlaying] = useState<string | null>(null);
  const stopPlay = useRef<(() => void) | null>(null);
  const playCtx = useRef<AudioContext | null>(null);
  const [title, setTitle] = useState("");
  const [rights, setRights] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);
  const [refreshKey, setRefreshKey] = useState(0);

  const beat = beats.find((b) => b.id === beatId) ?? null;
  const bpm = mode === "beat" ? (beat?.bpm ?? 90) : freeBpm;
  const barsMax = maxBarsFor(bpm, SAMPLE_MAX_MS / 1000);
  const effectiveBars = Math.min(bars, barsMax);
  const usesClock = type === "loop" || (type === "phrase" && metronome);

  // Meter + tuner loop while the input is open.
  useEffect(() => {
    if (status === "off" || status === "starting") return;
    const e = engine.current;
    if (!e) return;
    const buf = new Float32Array(e.analyser.fftSize);
    let raf = 0;
    let last = 0;
    const tick = (now: number) => {
      e.analyser.getFloatTimeDomainData(buf);
      setLevel(Math.max(-90, rmsDb(buf)));
      if (now - last > 90) {
        last = now;
        const hz = detectPitchHz(buf, e.ctx.sampleRate);
        setTuner(hz ? (({ label: l, cents }) => ({ label: l, cents }))(hzToNote(hz)) : null);
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [status]);

  useEffect(() => {
    mounted.current = true;
    const countIns = countTimers.current;
    return () => {
      mounted.current = false;
      if (stopTimer.current) window.clearTimeout(stopTimer.current);
      stopTimer.current = null;
      countIns.forEach((id) => window.clearTimeout(id));
      countIns.length = 0;
      stopClicks.current?.();
      stopClicks.current = null;
      const audio = beatAudio.current;
      if (audio) {
        audio.pause();
        audio.removeAttribute("src");
        audio.load();
      }
      beatAudio.current = null;
      void engine.current?.close();
      engine.current = null;
      void playCtx.current?.close();
    };
  }, []);

  useEffect(() => {
    engine.current?.setMonitor(monitor);
  }, [monitor]);

  const openInput = useCallback(async () => {
    setError(null);
    setStatus("starting");
    try {
      await engine.current?.close();
      const opened = await openLabEngine({ deviceId: deviceId || undefined, stereo });
      if (!mounted.current) {
        // Unmounted while the mic was opening: release it instead of leaking a live input.
        void opened.close();
        return;
      }
      engine.current = opened;
      engine.current.setMonitor(monitor);
      setInputs(await listLabInputs());
      setStatus("ready");
    } catch {
      engine.current = null;
      if (!mounted.current) return;
      setStatus("off");
      setError(t("bladMikrofonu"));
    }
  }, [deviceId, stereo, monitor, t]);

  async function prepareBeat(): Promise<HTMLAudioElement | null> {
    if (mode !== "beat" || !beatInEars || !beat || type === "oneshot") return null;
    if (beatAudio.current?.dataset.beat === beat.id) return beatAudio.current;
    const res = await requestBeatAudioAccessAction({ beatId: beat.id, purpose: "PLAYBACK" });
    if (!res.success || !res.url) return null;
    const audio = new Audio(res.url);
    audio.dataset.beat = beat.id;
    audio.preload = "auto";
    beatAudio.current = audio;
    return audio;
  }

  async function record() {
    const e = engine.current;
    if (!e || status !== "ready") return;
    setSaved(null);
    if (e.ctx.state === "suspended") await e.ctx.resume();
    const audio = await prepareBeat().catch(() => null);
    if (!mounted.current) return;
    const firstFrameSec = await e.startCapture();
    if (!mounted.current) return;
    if (!usesClock) {
      plan.current = { loopStartSec: firstFrameSec, firstFrameSec };
      setStatus("recording");
      stopTimer.current = window.setTimeout(() => void stop(), SAMPLE_MAX_MS + 500);
      return;
    }
    const spb = 60 / bpm;
    const t0 = e.ctx.currentTime + 0.15;
    const countIn = 4;
    const recordBeats = type === "loop" ? effectiveBars * 4 : Math.floor((SAMPLE_MAX_MS / 1000) / spb);
    const barOne = t0 + countIn * spb;
    stopClicks.current = metronome || type === "loop" ? scheduleClicks(e.ctx, t0, bpm, countIn + recordBeats) : null;
    // What the player hears arrives late at the mic: shift the cut by the output latency.
    plan.current = { loopStartSec: barOne + e.latency(), firstFrameSec };
    setStatus("countin");
    countTimers.current.forEach((id) => window.clearTimeout(id));
    countTimers.current.length = 0;
    for (let i = 0; i < countIn; i++) {
      countTimers.current.push(window.setTimeout(() => setCountBeat(countIn - i), Math.max(0, (t0 + i * spb - e.ctx.currentTime) * 1000)));
    }
    countTimers.current.push(window.setTimeout(() => {
      setCountBeat(0);
      setStatus("recording");
      if (audio) {
        audio.currentTime = 0;
        void audio.play().catch(() => undefined);
      }
    }, Math.max(0, (barOne - e.ctx.currentTime) * 1000)));
    const endSec = type === "loop" ? barOne + recordBeats * spb + e.latency() + 0.2 : barOne + SAMPLE_MAX_MS / 1000;
    stopTimer.current = window.setTimeout(() => void stop(), Math.max(0, (endSec - e.ctx.currentTime) * 1000));
  }

  async function stop() {
    const e = engine.current;
    if (!e) return;
    if (stopTimer.current) window.clearTimeout(stopTimer.current);
    stopTimer.current = null;
    countTimers.current.forEach((id) => window.clearTimeout(id));
    countTimers.current.length = 0;
    stopClicks.current?.();
    stopClicks.current = null;
    beatAudio.current?.pause();
    setCountBeat(0);
    const raw = e.stopCapture();
    const p = plan.current;
    setStatus("ready");
    if (!p || !raw[0]?.length) return;
    const loopStart = Math.max(0, Math.round((p.loopStartSec - p.firstFrameSec) * e.ctx.sampleRate));
    // Loops and clocked phrases start at bar 1 (the count-in is dropped); free takes keep everything.
    addTake(raw, e.ctx.sampleRate, "live", usesClock ? loopStart : 0);
  }

  function addTake(raw: Float32Array[], sampleRate: number, source: Take["source"], loopStart: number) {
    const clipped = peakDb(raw) >= -0.3;
    const usable = type === "loop" ? raw : raw.map((ch) => ch.subarray(loopStart));
    const res = processTake({ channels: usable, sampleRate, type, bpm: type === "loop" ? bpm : null, bars: type === "loop" ? effectiveBars : null, loopStart: type === "loop" ? loopStart : 0 });
    const seconds = (res.channels[0]?.length ?? 0) / sampleRate;
    if (seconds < 1) {
      setError(t("zaKrotkie"));
      return;
    }
    const take: Take = { id: crypto.randomUUID(), channels: res.channels, sampleRate, note: res.note, key: res.key, clipped, seconds: Math.min(seconds, SAMPLE_MAX_MS / 1000), source };
    if (seconds > SAMPLE_MAX_MS / 1000) take.channels = take.channels.map((ch) => ch.slice(0, Math.floor((SAMPLE_MAX_MS / 1000) * sampleRate)));
    setError(null);
    setTakes((list) => [take, ...list].slice(0, 8));
    setChosen(take.id);
  }

  async function importFile(file: File) {
    setError(null);
    try {
      const ctx = playCtx.current ?? new AudioContext();
      playCtx.current = ctx;
      const decoded = await ctx.decodeAudioData(await file.arrayBuffer());
      const channels = Array.from({ length: Math.min(2, decoded.numberOfChannels) }, (_, i) => decoded.getChannelData(i).slice(0));
      addTake(channels, decoded.sampleRate, "import", 0);
    } catch {
      setError(t("bladImportu"));
    }
  }

  function togglePlay(take: Take) {
    stopPlay.current?.();
    stopPlay.current = null;
    if (playing === take.id) {
      setPlaying(null);
      return;
    }
    const ctx = playCtx.current ?? new AudioContext();
    playCtx.current = ctx;
    void ctx.resume();
    setPlaying(take.id);
    stopPlay.current = playChannels(ctx, take.channels, take.sampleRate, type === "loop", () => setPlaying((p) => (p === take.id ? null : p)));
  }

  async function save() {
    const take = takes.find((x) => x.id === chosen);
    if (!take) return;
    setSaving(true);
    setError(null);
    const wav = encodeWav16(take.channels, take.sampleRate);
    const form = new FormData();
    form.set("file", new File([wav.buffer as ArrayBuffer], "sample.wav", { type: "audio/wav" }));
    const autoTitle = [t(`instrument.${instrument}`), take.note ?? take.key ?? "", type === "loop" ? `${Math.round(bpm)} BPM` : ""].filter(Boolean).join(" ");
    form.set("title", (title.trim() || autoTitle).slice(0, 80));
    form.set("kind", instrumentKind(instrument as never));
    form.set("instrument", instrument);
    form.set("rightsAccepted", rights ? "1" : "0");
    form.set("lab", "1");
    form.set("sampleType", type);
    form.set("source", take.source);
    if (type === "loop" || (usesClock && type === "phrase")) form.set("bpm", String(Math.round(bpm * 10) / 10));
    if (type === "loop") form.set("bars", String(effectiveBars));
    const musicalKey = take.note ?? take.key ?? (mode === "beat" ? beat?.key ?? "" : "");
    if (musicalKey && /^[A-G]#?(m|-?[0-9])?$/.test(musicalKey)) form.set("musicalKey", musicalKey);
    if (mode === "beat" && beat) form.set("beatId", beat.id);
    try {
      const res = await fetch("/api/studio/samples", { method: "POST", body: form });
      const body = (await res.json().catch(() => ({}))) as { message?: string };
      if (!res.ok) {
        setError(body.message ?? t("bladZapisu"));
      } else {
        setSaved(t("zapisano"));
        setTitle("");
        setTakes((list) => list.filter((x) => x.id !== take.id));
        setChosen(null);
        setRefreshKey((k) => k + 1);
      }
    } catch {
      setError(t("bladZapisu"));
    } finally {
      setSaving(false);
    }
  }

  if (!allowed) {
    return (
      <div className="space-y-6">
        <div className={cn(panel, "text-center")}>
          <p className="text-lg font-semibold">{t("zablokowaneTytul")}</p>
          <p className="mx-auto mt-2 max-w-prose text-sm text-[var(--brd-ink-soft)]">{t("zablokowaneOpis")}</p>
          <StoreAppHidden>
            <Link href="/premium" className="mt-4 inline-flex min-h-11 items-center rounded-md bg-[var(--brd-amber)] px-5 font-semibold text-[var(--brd-on-media)]">
              {t("zobaczPlany")}
            </Link>
          </StoreAppHidden>
        </div>
        <MySamples refreshKey={refreshKey} />
      </div>
    );
  }

  const meterPct = Math.max(0, Math.min(100, ((level + 60) / 60) * 100));
  const hot = level > -6;
  const take = takes.find((x) => x.id === chosen) ?? null;

  return (
    <div className="space-y-6">
      <PlayStudio bpm={bpm} beatId={beat?.id ?? null} canUseAi={allowed} />
      {/* 1. What */}
      <section className={panel} aria-labelledby="lab-what">
        <h2 id="lab-what" className="mb-4 text-base font-semibold">{t("krok1")}</h2>
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
          <div>
            <span className={label}>{t("tryb")}</span>
            <Segmented
              value={mode}
              onChange={(v) => setMode(v as "beat" | "free")}
              options={[
                { value: "beat", label: t("podBit"), disabled: beats.length === 0 },
                { value: "free", label: t("swobodnie") },
              ]}
            />
          </div>
          {mode === "beat" ? (
            <label>
              <span className={label}>{t("bit")}</span>
              <select className={control} value={beatId} onChange={(e) => setBeatId(e.target.value)}>
                {beats.map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.title} · {Math.round(b.bpm)} BPM{b.key ? ` · ${b.key}` : ""}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label>
              <span className={label}>{t("tempo")}</span>
              <input
                type="number"
                min={40}
                max={240}
                value={freeBpm}
                onChange={(e) => setFreeBpm(Math.max(40, Math.min(240, Number(e.target.value) || 90)))}
                className={control}
              />
            </label>
          )}
          <div>
            <span className={label}>{t("rodzaj")}</span>
            <Segmented
              value={type}
              onChange={(v) => setType(v as LabSampleType)}
              options={[
                { value: "oneshot", label: t("rodzajOneshot") },
                { value: "loop", label: t("rodzajLoop") },
                { value: "phrase", label: t("rodzajPhrase") },
              ]}
            />
          </div>
          <label>
            <span className={label}>{t("instrumentLabel")}</span>
            <select className={control} value={instrument} onChange={(e) => setInstrument(e.target.value)}>
              {LIVE_SAMPLE_INSTRUMENTS.map((i) => (
                <option key={i.id} value={i.id}>
                  {t(`instrument.${i.id}`)}
                </option>
              ))}
            </select>
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-end gap-4 text-sm">
          {type === "loop" ? (
            <div>
              <span className={label}>{t("takty")}</span>
              <Segmented
                value={String(effectiveBars)}
                onChange={(v) => setBars(Number(v))}
                options={SAMPLE_BARS.map((b) => ({ value: String(b), label: String(b), disabled: b > barsMax }))}
              />
            </div>
          ) : null}
          {type === "phrase" ? (
            <Toggle checked={metronome} onChange={setMetronome} label={t("metronom")} />
          ) : null}
          {mode === "beat" && type !== "oneshot" ? (
            <Toggle checked={beatInEars} onChange={setBeatInEars} label={t("bitWSluchawkach")} />
          ) : null}
          <p className="text-[var(--brd-ink-soft)]">
            {t("podsumowanie", { bpm: Math.round(bpm), klucz: mode === "beat" && beat?.key ? beat.key : "—" })}
            {type === "loop" ? ` · ${t("dlugoscPetli", { s: ((effectiveBars * 4 * 60) / bpm).toFixed(1) })}` : ""}
          </p>
        </div>
      </section>

      {/* 2. Input */}
      <section className={panel} aria-labelledby="lab-input">
        <h2 id="lab-input" className="mb-4 text-base font-semibold">{t("krok2")}</h2>
        <div className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
          <div className="space-y-3">
            <label className="block">
              <span className={label}>{t("wejscie")}</span>
              <select className={control} value={deviceId} onChange={(e) => setDeviceId(e.target.value)} disabled={status === "recording" || status === "countin"}>
                <option value="">{t("wejscieDomyslne")}</option>
                {inputs.map((i) => (
                  <option key={i.deviceId} value={i.deviceId}>
                    {i.label}
                  </option>
                ))}
              </select>
            </label>
            <div className="flex flex-wrap gap-4">
              <Toggle checked={stereo} onChange={setStereo} label={t("stereo")} />
              <Toggle checked={monitor} onChange={setMonitor} label={t("odsluchWejscia")} />
            </div>
            <p className="text-xs text-[var(--brd-ink-soft)]">{t("wejscieOpis")}</p>
            <button
              type="button"
              onClick={() => void openInput()}
              disabled={status === "starting" || status === "recording" || status === "countin"}
              className="inline-flex min-h-11 items-center rounded-md border border-[var(--brd-amber)] px-4 text-sm font-semibold text-[var(--brd-amber)] disabled:opacity-50"
            >
              {status === "off" ? t("wlaczWejscie") : t("zastosujWejscie")}
            </button>
          </div>

          {/* Meter + tuner */}
          <div className="rounded-md border border-[var(--brd-line)] bg-[var(--brd-paper-deep)]/40 p-4">
            <div className="flex items-center justify-between text-xs uppercase tracking-[0.06em] text-[var(--brd-ink-soft)]">
              <span>{t("poziom")}</span>
              <span className={cn("font-mono", hot ? "text-[var(--brd-rec)]" : "")}>{status === "off" ? "—" : `${level.toFixed(0)} dB`}</span>
            </div>
            <div className="mt-2 h-3 overflow-hidden rounded-full bg-[var(--brd-line)]">
              <div
                className={cn("h-full transition-[width] duration-75", hot ? "bg-[var(--brd-rec)]" : level > -18 ? "bg-[var(--brd-amber)]" : "bg-[var(--brd-green)]")}
                style={{ width: `${meterPct}%` }}
              />
            </div>
            <p className="mt-1 text-xs text-[var(--brd-ink-soft)]">{hot ? t("zaGlosno") : t("poziomOpis")}</p>
            <div className="mt-4 flex items-end justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.06em] text-[var(--brd-ink-soft)]">{t("stroik")}</p>
                <p className="font-poster text-4xl font-black leading-none text-[var(--brd-ink)]">{tuner?.label ?? "—"}</p>
              </div>
              <div className="flex-1">
                <div className="relative h-8 rounded border border-[var(--brd-line)]">
                  <span className="absolute inset-y-0 left-1/2 w-px bg-[var(--brd-green)]" />
                  {tuner ? (
                    <span
                      className={cn("absolute top-1 bottom-1 w-1.5 -translate-x-1/2 rounded", Math.abs(tuner.cents) <= 5 ? "bg-[var(--brd-green)]" : "bg-[var(--brd-amber)]")}
                      style={{ left: `${50 + tuner.cents}%` }}
                    />
                  ) : null}
                </div>
                <p className="mt-1 text-center font-mono text-xs text-[var(--brd-ink-soft)]">
                  {tuner ? `${tuner.cents > 0 ? "+" : ""}${tuner.cents} ct` : t("zagrajDzwiek")}
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 3. Record */}
      <section className={panel} aria-labelledby="lab-rec">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 id="lab-rec" className="text-base font-semibold">{t("krok3")}</h2>
          <label className="cursor-pointer text-sm text-[var(--brd-amber)] underline-offset-4 hover:underline">
            {t("importuj")}
            <input type="file" accept="audio/*" className="sr-only" onChange={(e) => e.target.files?.[0] && void importFile(e.target.files[0])} />
          </label>
        </div>
        <div className="mt-4 flex flex-wrap items-center gap-4">
          {status === "recording" || status === "countin" ? (
            <button type="button" onClick={() => void stop()} className="inline-flex min-h-14 items-center gap-2 rounded-full bg-[var(--brd-rec)] px-6 text-base font-bold text-white">
              <span className="size-3 rounded-sm bg-white" /> {t("stop")}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => void record()}
              disabled={status !== "ready"}
              className="inline-flex min-h-14 items-center gap-2 rounded-full bg-[var(--brd-amber)] px-6 text-base font-bold text-[var(--brd-on-media)] disabled:opacity-40"
            >
              <span className="size-3 rounded-full bg-[var(--brd-rec)]" /> {t("nagraj")}
            </button>
          )}
          <p className="text-sm text-[var(--brd-ink-soft)]" role="status">
            {status === "off"
              ? t("najpierwWejscie")
              : status === "countin"
                ? t("odliczanie", { n: countBeat })
                : status === "recording"
                  ? type === "loop"
                    ? t("nagrywaPetle", { n: effectiveBars })
                    : t("nagrywa")
                  : usesClock
                    ? t("gotowyZOdliczaniem")
                    : t("gotowy")}
          </p>
          {usesClock ? <p className="w-full text-xs text-[var(--brd-ink-soft)]">{t("sluchawki")}</p> : null}
        </div>
        {error ? <p role="alert" className="mt-3 text-sm text-[var(--brd-rec)]">{error}</p> : null}
      </section>

      {/* 4. Takes */}
      {takes.length ? (
        <section className={panel} aria-labelledby="lab-takes">
          <h2 id="lab-takes" className="mb-3 text-base font-semibold">{t("krok4")}</h2>
          <ul className="space-y-2">
            {takes.map((x, i) => (
              <li key={x.id}>
                <div className={cn("flex flex-wrap items-center gap-3 rounded-md border p-2", x.id === chosen ? "border-[var(--brd-amber)]" : "border-[var(--brd-line)]")}>
                  <input type="radio" name="take" checked={x.id === chosen} onChange={() => setChosen(x.id)} aria-label={t("wybierzPodejscie", { n: takes.length - i })} className="size-4 accent-[var(--brd-amber)]" />
                  <button type="button" onClick={() => togglePlay(x)} className="inline-flex size-10 items-center justify-center rounded-full border border-[var(--brd-line)]" aria-label={playing === x.id ? t("zatrzymaj") : t("odsluchaj")}>
                    {playing === x.id ? "■" : "▶"}
                  </button>
                  <Wave channels={x.channels} />
                  <span className="font-mono text-xs text-[var(--brd-ink-soft)]">
                    #{takes.length - i} · {x.seconds.toFixed(1)} s{x.note ? ` · ${x.note}` : ""}{x.key ? ` · ${t("tonacja")} ${x.key}` : ""}
                  </span>
                  {x.clipped ? <span className="text-xs font-semibold text-[var(--brd-rec)]">{t("przester")}</span> : null}
                  <button type="button" onClick={() => setTakes((l) => l.filter((y) => y.id !== x.id))} className="ml-auto text-xs text-[var(--brd-ink-soft)] hover:text-[var(--brd-rec)]">
                    {t("usun")}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          {take ? (
            <div className="mt-4 grid gap-3 border-t border-[var(--brd-line)] pt-4 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
              <div className="space-y-3">
                <label className="block">
                  <span className={label}>{t("nazwa")}</span>
                  <input value={title} onChange={(e) => setTitle(e.target.value)} maxLength={80} placeholder={t("nazwaPodpowiedz")} className={control} />
                </label>
                <label className="flex items-start gap-2 text-sm">
                  <input type="checkbox" checked={rights} onChange={(e) => setRights(e.target.checked)} className="mt-1 size-4 accent-[var(--brd-amber)]" />
                  <span>{t("prawa")}</span>
                </label>
              </div>
              <button
                type="button"
                onClick={() => void save()}
                disabled={!rights || saving}
                className="inline-flex min-h-12 items-center justify-center rounded-md bg-[var(--brd-amber)] px-6 font-semibold text-[var(--brd-on-media)] disabled:opacity-40"
              >
                {saving ? t("zapisuje") : t("zapisz")}
              </button>
            </div>
          ) : null}
        </section>
      ) : null}
      {saved ? <p role="status" className="text-sm text-[var(--brd-green)]">{saved}</p> : null}

      <MySamples refreshKey={refreshKey} />
    </div>
  );
}

function Segmented({
  value,
  onChange,
  options,
}: {
  value: string;
  onChange: (v: string) => void;
  options: { value: string; label: string; disabled?: boolean }[];
}) {
  return (
    <div role="radiogroup" className="inline-flex flex-wrap overflow-hidden rounded-md border border-[var(--brd-line)]">
      {options.map((o) => (
        <button
          key={o.value}
          type="button"
          role="radio"
          aria-checked={value === o.value}
          disabled={o.disabled}
          onClick={() => onChange(o.value)}
          className={cn(
            "min-h-11 px-3 text-sm transition-colors disabled:opacity-35",
            value === o.value ? "bg-[var(--brd-amber)] font-semibold text-[var(--brd-on-media)]" : "text-[var(--brd-ink-soft)] hover:text-[var(--brd-ink)]",
          )}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}

function Toggle({ checked, onChange, label: text }: { checked: boolean; onChange: (v: boolean) => void; label: string }) {
  return (
    <label className="inline-flex min-h-11 cursor-pointer items-center gap-2 text-sm">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="size-4 accent-[var(--brd-amber)]" />
      {text}
    </label>
  );
}

function Wave({ channels }: { channels: Float32Array[] }) {
  const ref = useRef<HTMLCanvasElement>(null);
  useEffect(() => {
    const c = ref.current;
    const ctx = c?.getContext("2d");
    const ch = channels[0];
    if (!c || !ctx || !ch) return;
    const w = c.width;
    const h = c.height;
    ctx.clearRect(0, 0, w, h);
    ctx.fillStyle = "#f2a93b";
    const step = Math.max(1, Math.floor(ch.length / w));
    for (let x = 0; x < w; x++) {
      let peak = 0;
      for (let i = x * step; i < (x + 1) * step && i < ch.length; i++) peak = Math.max(peak, Math.abs(ch[i]));
      const bar = Math.max(1, peak * h);
      ctx.fillRect(x, (h - bar) / 2, 1, bar);
    }
  }, [channels]);
  return <canvas ref={ref} width={220} height={36} className="h-9 w-[220px] max-w-full rounded bg-[var(--brd-paper-deep)]" aria-hidden="true" />;
}
