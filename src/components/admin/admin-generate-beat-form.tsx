"use client";

import { useTranslations } from "next-intl";
import Link from "next/link";
import { useState, type FormEvent } from "react";

import { AdminBeatBitek } from "@/components/admin/admin-beat-bitek";
import { AdminBeatPlayButton } from "@/components/admin/admin-beat-play-button";
import { BrdButton } from "@/components/brand/brd-button";
import { beatGenerationPercent } from "@/lib/beats/ai-beat/generation-progress";
import { measureReferenceFile } from "@/lib/beats/ai-beat/reference-measure-browser";
import type { ReferenceMeasure } from "@/lib/beats/ai-beat/reference-tempo";
import {
  BEAT_DURATION_CHOICES,
  DEFAULT_BEAT_DURATION,
  descriptionFromYoutubeStyle,
  type BeatDuration,
} from "@/lib/beats/ai-beat/prompt";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

function formatLength(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

type Phase = "idle" | "measuring" | "describing" | "starting" | "waiting" | "saving" | "ready";

export function AdminGenerateBeatForm() {
  const t = useTranslations("admin.adminBeatsGeneratePage");
  const [youtubeUrl, setYoutubeUrl] = useState("");
  const [description, setDescription] = useState("");
  const [duration, setDuration] = useState<BeatDuration>(DEFAULT_BEAT_DURATION);
  const [bpm, setBpm] = useState("");
  const [phase, setPhase] = useState<Phase>("idle");
  const [pendingPolls, setPendingPolls] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [beatId, setBeatId] = useState<string | null>(null);
  const [readyTitle, setReadyTitle] = useState("Bit BitRymDym");
  const [revised, setRevised] = useState(false);
  const [styleLabel, setStyleLabel] = useState<string | null>(null);
  const [bpmHint, setBpmHint] = useState<number | null>(null);
  const [measure, setMeasure] = useState<ReferenceMeasure | null>(null);
  const [measureFile, setMeasureFile] = useState<string | null>(null);
  const [bpmFromFile, setBpmFromFile] = useState(false);

  const generating = phase === "starting" || phase === "waiting" || phase === "saving";
  const busy = generating || phase === "describing" || phase === "measuring";

  async function onReferenceFile(file: File | null) {
    if (!file || busy) return;
    setError(null);
    setMeasure(null);
    setMeasureFile(file.name);
    setBpmFromFile(false);
    setPhase("measuring");
    try {
      // Let the "measuring" line paint before the decode blocks the main thread.
      await new Promise((resolve) => setTimeout(resolve, 30));
      const parsed = await measureReferenceFile(file);
      setPhase("idle");
      if (!parsed) {
        setError(t("plikNieCzytelny"));
        return;
      }
      setMeasure(parsed);
      // Unsure only means half/double time is open; the film description may still switch it.
      if (parsed.bpm != null) {
        setBpm(String(parsed.bpm));
        setBpmFromFile(true);
      }
    } catch {
      setPhase("idle");
      setError(t("plikNieCzytelny"));
    }
  }

  async function onDescribe() {
    if (busy) return;
    setError(null);
    setBeatId(null);
    setStyleLabel(null);
    setBpmHint(null);
    const url = youtubeUrl.trim();
    if (!url) {
      setError(t("linkWymagany"));
      return;
    }
    setPhase("describing");
    try {
      const res = await fetch("/api/admin/beats/generate/style", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ url, measured: measure }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        opis?: string;
        style?: string;
        prompt?: string;
        bpmHint?: number | null;
        measured?: boolean;
      };
      if (!res.ok || !json.success || typeof json.opis !== "string") {
        setPhase("idle");
        setError(json.error || t("blad"));
        return;
      }
      const style = typeof json.style === "string" ? json.style.trim() : "";
      const english =
        typeof json.prompt === "string" ? json.prompt.trim() : "";
      setDescription(
        descriptionFromYoutubeStyle({
          style: style || "hip-hop instrumentalny",
          opis: json.opis,
          prompt: english || null,
        }),
      );
      const hinted =
        typeof json.bpmHint === "number" && Number.isFinite(json.bpmHint)
          ? Math.round(json.bpmHint)
          : null;
      const tempo =
        hinted != null && hinted >= 60 && hinted <= 180 ? hinted : null;
      setBpmHint(tempo);
      if (tempo != null) setBpm(String(tempo));
      setBpmFromFile(json.measured === true && tempo != null);
      setStyleLabel(style || null);
      setPhase("idle");
    } catch {
      setPhase("idle");
      setError(t("blad"));
    }
  }

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setError(null);
    setBeatId(null);
    setRevised(false);
    setPendingPolls(0);
    setPhase("starting");

    const payload = {
      description,
      durationSeconds: duration,
      bpm: bpm.trim() === "" ? null : Number(bpm),
    };

    try {
      const startRes = await fetch("/api/admin/beats/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const startJson = (await startRes.json()) as {
        success?: boolean;
        error?: string;
        generationId?: string;
        title?: string;
        style?: string | null;
        opis?: string | null;
      };
      if (!startRes.ok || !startJson.success || !startJson.generationId) {
        setPhase("idle");
        setError(startJson.error || t("blad"));
        return;
      }

      const title = typeof startJson.title === "string" ? startJson.title.trim() : "";
      setReadyTitle(title || "Bit BitRymDym");
      setPhase("waiting");
      const deadline = Date.now() + 4 * 60 * 1000;
      while (Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 4000));
        const resultRes = await fetch("/api/admin/beats/generate/result", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            generationId: startJson.generationId,
            title: startJson.title,
            description,
            bpm: payload.bpm,
            style: startJson.style ?? null,
            opis: startJson.opis ?? null,
          }),
        });
        const resultJson = (await resultRes.json()) as {
          success?: boolean;
          status?: string;
          error?: string;
          beatId?: string;
        };
        if (!resultRes.ok || !resultJson.success) {
          setPhase("idle");
          setError(resultJson.error || t("blad"));
          return;
        }
        if (resultJson.status === "pending") {
          setPendingPolls((count) => count + 1);
          setPhase("waiting");
          continue;
        }
        if (resultJson.status === "ready" && resultJson.beatId) {
          setBeatId(resultJson.beatId);
          setPhase("ready");
          return;
        }
      }
      setPhase("idle");
      setError(t("czasMinal"));
    } catch {
      setPhase("idle");
      setError(t("blad"));
    }
  }

  const status =
    phase === "measuring"
      ? t("mierze")
      : phase === "describing"
      ? t("opisujeStyl")
      : phase === "starting"
        ? t("przygotowuje")
        : phase === "waiting"
          ? t("czekam")
          : phase === "saving"
            ? t("wgrywam")
            : null;
  const percent = generating
    ? beatGenerationPercent(
        phase === "saving" ? "saving" : phase === "waiting" ? "waiting" : "starting",
        pendingPolls,
      )
    : null;

  return (
    <form onSubmit={onSubmit} className="flex flex-col gap-5">
      <div className="flex flex-col gap-2 text-sm">
        <label className="flex flex-col gap-2">
          <span className="font-medium">{t("linkPola")}</span>
          <input
            className={fieldClass}
            type="text"
            inputMode="url"
            autoComplete="off"
            value={youtubeUrl}
            onChange={(event) => setYoutubeUrl(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                void onDescribe();
              }
            }}
            placeholder={t("linkPlaceholder")}
            disabled={busy}
          />
        </label>
        <p className="text-muted-foreground">{t("linkPomoc")}</p>
        <label className="mt-2 flex flex-col gap-2">
          <span className="font-medium">{t("plikPola")}</span>
          <input
            className={`${fieldClass} file:mr-3 file:rounded-md file:border-0 file:bg-muted file:px-3 file:py-1 file:text-sm`}
            type="file"
            accept="audio/mpeg,audio/mp3,audio/wav,audio/x-wav,.mp3,.wav"
            disabled={busy}
            onChange={(event) => {
              void onReferenceFile(event.target.files?.[0] ?? null);
              event.target.value = "";
            }}
          />
        </label>
        <p className="text-muted-foreground">{t("plikPomoc")}</p>
        {measure ? (
          <p className="rounded-lg border border-border bg-muted/40 px-3 py-2">
            {measureFile ? <span className="font-medium">{measureFile}: </span> : null}
            {measure.sure && measure.bpm != null
              ? t("zmierzoneTempo", { bpm: measure.bpm })
              : t("zmierzoneTempoNiepewne", { list: measure.candidates.join(" / ") })}
            {measure.key ? ` ${t("zmierzonaTonacja", { key: measure.key })}` : ` ${t("tonacjaNieznana")}`}
          </p>
        ) : null}
        <div>
          <BrdButton type="button" variant="secondary" disabled={busy} onClick={() => void onDescribe()}>
            {t("opiszStyl")}
          </BrdButton>
        </div>
      </div>

      <label className="flex flex-col gap-2 text-sm">
        <span className="font-medium">{t("opisPola")}</span>
        <textarea
          className={`${fieldClass} min-h-32`}
          value={description}
          onChange={(event) => setDescription(event.target.value)}
          placeholder={t("opisPlaceholder")}
          maxLength={800}
          required
          disabled={busy}
        />
      </label>

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{t("czas")}</span>
          <select
            className={fieldClass}
            value={duration}
            onChange={(event) => setDuration(Number(event.target.value) as BeatDuration)}
            disabled={busy}
          >
            {BEAT_DURATION_CHOICES.map((seconds) => (
              <option key={seconds} value={seconds}>
                {formatLength(seconds)}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-2 text-sm">
          <span className="font-medium">{t("bpm")}</span>
          <input
            className={fieldClass}
            inputMode="numeric"
            value={bpm}
            onChange={(event) => {
              setBpm(event.target.value.replace(/[^\d]/g, "").slice(0, 3));
              setBpmFromFile(false);
            }}
            placeholder={t("bpmPuste")}
            disabled={busy}
          />
        </label>
      </div>

      <p className="text-sm text-muted-foreground">{t("bezArtystow")}</p>

      <div>
        <BrdButton type="submit" disabled={busy}>
          {generating ? t("generuje") : t("generuj")}
        </BrdButton>
      </div>

      {percent !== null ? (
        <GenerationMeter
          percent={percent}
          label={t("postep")}
          text={
            percent === 92
              ? `${t("procent", { percent })} ${t("czekamNaPlik")}`
              : t("procent", { percent })
          }
        />
      ) : null}

      <p className="min-h-6 text-sm" aria-live="polite">
        {error ? <span className="text-destructive">{error}</span> : null}
        {!error && status ? <span className="text-muted-foreground">{status}</span> : null}
        {!error && !status && phase !== "ready" && styleLabel ? (
          <span className="text-muted-foreground">
            {t("stylZLinku", { style: styleLabel })}
            {bpmHint != null
              ? ` ${bpmFromFile ? t("tempoZPliku", { bpm: bpmHint }) : t("tempoPodpowiedz", { bpm: bpmHint })}`
              : null}
          </span>
        ) : null}
      </p>
      {!error && phase === "ready" && beatId ? (
        <div className="flex items-center gap-3">
          <AdminBeatPlayButton
            beatId={beatId}
            title={readyTitle}
            producer="BitRymDym"
            durationSeconds={duration}
          />
          <Link className="underline underline-offset-4" href="/admin/beats/waiting">
            {t("gotowe")}
          </Link>
        </div>
      ) : null}
      {revised ? <p className="text-sm text-muted-foreground">{t("bitekNowa")}</p> : null}
      {!error && phase === "ready" && beatId ? (
        <AdminBeatBitek
          key={beatId}
          beatId={beatId}
          autoReview
          youtubeUrl={youtubeUrl.trim()}
          brief={description}
          measured={measure}
          onRevised={(nextId, title, nextDescription, nextBpm) => {
            setBeatId(nextId);
            if (typeof nextBpm === "number") setBpm(String(nextBpm));
            if (nextDescription) setDescription(nextDescription);
            if (title) setReadyTitle(title);
            setRevised(true);
          }}
        />
      ) : null}
    </form>
  );
}

function GenerationMeter({
  percent,
  label,
  text,
}: {
  percent: number;
  label: string;
  text: string;
}) {
  return (
    <div className="flex flex-col gap-1">
      <div
        className="h-2 overflow-hidden rounded-full border border-border bg-muted"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={percent}
        aria-label={label}
      >
        <div className="h-full bg-foreground" style={{ width: `${percent}%` }} />
      </div>
      <p className="text-sm text-muted-foreground tabular-nums">{text}</p>
    </div>
  );
}
