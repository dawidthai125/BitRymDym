"use client";

import { useCallback, useEffect, useRef, useState } from "react";

import { levelOf, meterPercent, micVerdict, type MicVerdict } from "@/lib/tools/mic-level";
import { toolInput, toolPanel, toolPrimary, toolSecondary } from "@/components/tools/tool-ui";

const RECORD_MS = 5000;
/** The verdict looks at the last seconds only, so one knock on the mic does not stay "too loud" forever. */
const PEAK_WINDOW_S = 5;
const VERDICT: Record<MicVerdict, string> = {
  silence: "Prawie cisza. Powiedz coś albo sprawdź, czy mikrofon nie jest wyciszony i czy wybrany jest właściwy.",
  quiet: "Cicho. Podejdź bliżej albo podnieś czułość mikrofonu w systemie lub na interfejsie.",
  good: "Dobry poziom. Tak możesz nagrywać.",
  hot: "Za głośno, dźwięk się przesterowuje. Zmniejsz czułość albo odsuń się od mikrofonu.",
};

function errorText(error: unknown): string {
  const name = error instanceof DOMException ? error.name : "";
  if (name === "NotAllowedError") return "Przeglądarka nie ma zgody na mikrofon. Kliknij ikonę przy adresie strony, zezwól na mikrofon i spróbuj ponownie.";
  if (name === "NotFoundError") return "Nie widzę żadnego mikrofonu. Podłącz go i spróbuj ponownie.";
  if (name === "NotReadableError") return "Mikrofon jest zajęty przez inny program. Zamknij go i spróbuj ponownie.";
  return "Nie udało się uruchomić mikrofonu. Sprawdź ustawienia przeglądarki.";
}

/** Live level of the microphone, device choice and a 5 s test recording. Nothing is uploaded. */
export function MicTest() {
  const [on, setOn] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [devices, setDevices] = useState<{ id: string; label: string }[]>([]);
  const [deviceId, setDeviceId] = useState("");
  const [level, setLevel] = useState(-100);
  const [peak, setPeak] = useState(-100);
  const [info, setInfo] = useState("");
  const [recording, setRecording] = useState(false);
  const [clip, setClip] = useState<string | null>(null);
  const stream = useRef<MediaStream | null>(null);
  const ctx = useRef<AudioContext | null>(null);
  const frame = useRef(0);
  const recorder = useRef<MediaRecorder | null>(null);
  const clipUrl = useRef<string | null>(null);
  const session = useRef(0);

  const stop = useCallback(() => {
    session.current += 1;
    cancelAnimationFrame(frame.current);
    if (recorder.current?.state === "recording") recorder.current.stop();
    stream.current?.getTracks().forEach((t) => t.stop());
    stream.current = null;
    void ctx.current?.close().catch(() => undefined);
    ctx.current = null;
    setOn(false);
    setRecording(false);
    setLevel(-100);
  }, []);

  useEffect(() => () => {
    session.current += 1;
    cancelAnimationFrame(frame.current);
    stream.current?.getTracks().forEach((t) => t.stop());
    void ctx.current?.close().catch(() => undefined);
    if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
  }, []);

  const start = async (id: string) => {
    stop();
    const mine = session.current;
    setError(null);
    setPeak(-100);
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("unsupported");
      // Raw signal: the browser's own cleaning would hide a bad level.
      const media = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: false, noiseSuppression: false, autoGainControl: false, ...(id ? { deviceId: { exact: id } } : {}) },
      });
      if (mine !== session.current) {
        media.getTracks().forEach((t) => t.stop());
        return;
      }
      stream.current = media;
      const audio = new AudioContext();
      ctx.current = audio;
      const analyser = audio.createAnalyser();
      analyser.fftSize = 2048;
      audio.createMediaStreamSource(media).connect(analyser);
      const buffer = new Float32Array(analyser.fftSize);
      const peaks = new Map<number, number>();
      const tick = () => {
        analyser.getFloatTimeDomainData(buffer);
        const l = levelOf(buffer);
        setLevel(l.rmsDb);
        const slot = Math.floor(performance.now() / 1000);
        peaks.set(slot, Math.max(peaks.get(slot) ?? -100, l.peakDb));
        for (const key of peaks.keys()) if (key <= slot - PEAK_WINDOW_S) peaks.delete(key);
        setPeak(Math.max(...peaks.values()));
        frame.current = requestAnimationFrame(tick);
      };
      tick();
      const track = media.getAudioTracks()[0];
      const settings = track?.getSettings() ?? {};
      setInfo([track?.label, settings.sampleRate ? `${settings.sampleRate / 1000} kHz` : null, settings.channelCount ? (settings.channelCount > 1 ? "stereo" : "mono") : null].filter(Boolean).join(" · "));
      setDeviceId(settings.deviceId ?? id);
      const list = await navigator.mediaDevices.enumerateDevices();
      if (mine !== session.current) return;
      setDevices(list.filter((d) => d.kind === "audioinput").map((d, i) => ({ id: d.deviceId, label: d.label || `Mikrofon ${i + 1}` })));
      setOn(true);
    } catch (e) {
      if (mine !== session.current) return;
      stop();
      setError(errorText(e));
    }
  };

  const record = () => {
    const media = stream.current;
    if (!media || typeof MediaRecorder === "undefined") {
      setError("Ta przeglądarka nie nagrywa dźwięku. Miernik poziomu dalej działa.");
      return;
    }
    const chunks: Blob[] = [];
    const rec = new MediaRecorder(media);
    recorder.current = rec;
    rec.ondataavailable = (e) => chunks.push(e.data);
    rec.onstop = () => {
      setRecording(false);
      if (chunks.length === 0) return;
      if (clipUrl.current) URL.revokeObjectURL(clipUrl.current);
      clipUrl.current = URL.createObjectURL(new Blob(chunks, { type: rec.mimeType }));
      setClip(clipUrl.current);
    };
    rec.start();
    setRecording(true);
    window.setTimeout(() => rec.state === "recording" && rec.stop(), RECORD_MS);
  };

  const verdict = micVerdict(peak);
  return (
    <section className={toolPanel} aria-label="Test mikrofonu" data-testid="tool-mic">
      <div className="flex flex-wrap items-center gap-2">
        <button type="button" className={toolPrimary} onClick={() => (on ? stop() : void start(deviceId))} data-testid="mic-toggle">
          {on ? "Wyłącz mikrofon" : "Włącz mikrofon"}
        </button>
        {on && devices.length > 1 ? (
          <label className="flex min-w-0 items-center gap-2 text-sm text-[var(--brd-ink-soft)]">
            <span className="sr-only">Wybierz mikrofon</span>
            <select className={`${toolInput} max-w-full`} value={deviceId} onChange={(e) => void start(e.target.value)}>
              {devices.map((d) => (
                <option key={d.id} value={d.id}>{d.label}</option>
              ))}
            </select>
          </label>
        ) : null}
      </div>
      {error ? <p className="mt-3 text-sm" role="alert">{error}</p> : null}
      <div className="mt-5">
        <div
          role="meter"
          aria-label="Poziom mikrofonu"
          aria-valuemin={-60}
          aria-valuemax={0}
          aria-valuenow={Math.round(Math.max(-60, level))}
          className="h-6 overflow-hidden rounded-[var(--brd-r-cta)] border-2 border-[var(--brd-ink)]"
        >
          <div className="h-full bg-[var(--brd-green)]" style={{ width: `${on ? meterPercent(level) : 0}%` }} />
        </div>
        <p className="brd-meta mt-2 text-sm text-[var(--brd-mute)]">
          {on ? `Teraz ${Math.round(level)} dB · najgłośniej z 5 s: ${Math.round(peak)} dB` : "Miernik ruszy po włączeniu mikrofonu."}
        </p>
        {on ? <p className="mt-2 font-semibold text-[var(--brd-ink)]" data-testid="mic-verdict">{VERDICT[verdict]}</p> : null}
        {on && info ? <p className="mt-1 break-words text-xs text-[var(--brd-mute)]">{info}</p> : null}
      </div>
      <div className="mt-4 flex flex-wrap items-center gap-3">
        <button type="button" className={toolSecondary} disabled={!on || recording} onClick={record}>
          {recording ? "Nagrywam 5 s…" : "Nagraj próbę (5 s)"}
        </button>
        {clip ? <audio controls src={clip} className="max-w-full" aria-label="Twoja próba" /> : null}
      </div>
      <p className="mt-3 text-xs text-[var(--brd-mute)]">Dźwięk zostaje w Twojej przeglądarce i nigdzie nie jest wysyłany. Próbę odsłuchaj na słuchawkach.</p>
    </section>
  );
}
