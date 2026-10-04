"use client";

import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { Button } from "@/components/ui/button";
import { finalizePlatformBeatWithMasterAction } from "@/lib/beats/create-with-master";
import {
  BEAT_AUDIO_MAX_BYTES,
  resolveAudioContentType,
} from "@/lib/beats/audio-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toUserFacingUploadError } from "@/lib/ui/user-errors";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

type BpmUiState =
  | { mode: "idle" }
  | {
      mode: "auto";
      suggested: number;
      overridden: boolean;
    }
  | { mode: "manual_required"; message: string; overridden: boolean };

type AnalysisState =
  | { status: "idle" }
  | { status: "uploading" }
  | { status: "analyzing" }
  | {
      status: "ready";
      beatId: string;
      assetId: string;
      durationSeconds: number;
      byteSize: number;
      contentType: string;
      titleSuggestion: string;
      filename: string;
    }
  | { status: "error"; message: string };

function formatDuration(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KiB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MiB`;
}

export function AdminCreateBeatForm() {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [analyzing, startAnalyze] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [title, setTitle] = useState("");
  const [bpm, setBpm] = useState("");
  const [bpmUi, setBpmUi] = useState<BpmUiState>({ mode: "idle" });
  const [formError, setFormError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const analyzeGeneration = useRef(0);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    const generation = ++analyzeGeneration.current;
    setFile(next);
    setTitle("");
    setBpm("");
    setBpmUi({ mode: "idle" });
    setFormError(null);
    setSuccess(false);

    if (!next) {
      setAnalysis({ status: "idle" });
      return;
    }

    setAnalysis({ status: "uploading" });

    startAnalyze(async () => {
      try {
        if (next.size > BEAT_AUDIO_MAX_BYTES) {
          if (analyzeGeneration.current === generation) {
            setAnalysis({
              status: "error",
              message: "Plik przekracza limit 50 MiB.",
            });
          }
          return;
        }

        const contentType = resolveAudioContentType({
          fileType: next.type,
          filename: next.name,
        });
        if (!contentType) {
          if (analyzeGeneration.current === generation) {
            setAnalysis({
              status: "error",
              message: "Nieobsługiwany format audio.",
            });
          }
          return;
        }

        const sessionRes = await fetch("/api/admin/beats/audio/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            contentType,
            byteSize: next.size,
            originalFilename: next.name,
          }),
        });
        const sessionJson = (await sessionRes.json()) as {
          success?: boolean;
          error?: string;
          beatId?: string;
          assetId?: string;
          path?: string;
          token?: string;
          titleSuggestion?: string;
          contentType?: string;
        };
        if (
          !sessionRes.ok ||
          !sessionJson.success ||
          !sessionJson.beatId ||
          !sessionJson.assetId ||
          !sessionJson.path ||
          !sessionJson.token
        ) {
          if (analyzeGeneration.current === generation) {
            setAnalysis({
              status: "error",
              message: toUserFacingUploadError(
                sessionJson.error ?? "Upload session failed.",
              ),
            });
          }
          return;
        }

        if (analyzeGeneration.current === generation) {
          setAnalysis({ status: "uploading" });
        }

        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from("beat-audio")
          .uploadToSignedUrl(sessionJson.path, sessionJson.token, next, {
            contentType,
            upsert: false,
          });

        if (uploadError) {
          if (analyzeGeneration.current === generation) {
            setAnalysis({
              status: "error",
              message: toUserFacingUploadError(
                uploadError.message || "Upload failed.",
              ),
            });
          }
          return;
        }

        if (analyzeGeneration.current === generation) {
          setAnalysis({ status: "analyzing" });
        }

        const analyzeRes = await fetch("/api/admin/beats/audio/analyze", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beatId: sessionJson.beatId,
            assetId: sessionJson.assetId,
          }),
        });
        const analyzeJson = (await analyzeRes.json()) as {
          success?: boolean;
          error?: string;
          durationSeconds?: number;
          byteSize?: number;
          contentType?: string;
          titleSuggestion?: string;
          bpmDecision?: "AUTO_SUGGEST" | "MANUAL_REQUIRED";
          bpm?: number | null;
          bpmMessage?: string;
        };

        if (analyzeGeneration.current !== generation) return;

        if (
          !analyzeRes.ok ||
          !analyzeJson.success ||
          analyzeJson.durationSeconds == null
        ) {
          setAnalysis({
            status: "error",
            message: toUserFacingUploadError(
              analyzeJson.error ?? "Analiza audio nie powiodła się.",
            ),
          });
          return;
        }

        const suggestion =
          analyzeJson.titleSuggestion ||
          sessionJson.titleSuggestion ||
          next.name;
        setTitle(suggestion);
        setAnalysis({
          status: "ready",
          beatId: sessionJson.beatId,
          assetId: sessionJson.assetId,
          durationSeconds: analyzeJson.durationSeconds,
          byteSize: analyzeJson.byteSize ?? next.size,
          contentType: analyzeJson.contentType ?? contentType,
          titleSuggestion: suggestion,
          filename: next.name,
        });

        if (
          analyzeJson.bpmDecision === "AUTO_SUGGEST" &&
          typeof analyzeJson.bpm === "number" &&
          Number.isInteger(analyzeJson.bpm)
        ) {
          setBpm(String(analyzeJson.bpm));
          setBpmUi({
            mode: "auto",
            suggested: analyzeJson.bpm,
            overridden: false,
          });
        } else {
          setBpm("");
          setBpmUi({
            mode: "manual_required",
            message:
              analyzeJson.bpmMessage ??
              "BPM nie udało się wiarygodnie określić.",
            overridden: false,
          });
        }
      } catch {
        if (analyzeGeneration.current === generation) {
          setAnalysis({
            status: "error",
            message: "Błąd sieci / serwera podczas uploadu lub analizy.",
          });
        }
      }
    });
  }

  function onBpmChange(value: string) {
    setBpm(value);
    setBpmUi((prev) => {
      if (prev.mode === "auto") {
        const n = Number(value);
        const overridden =
          !value.trim() || !Number.isInteger(n) || n !== prev.suggested;
        return { ...prev, overridden };
      }
      if (prev.mode === "manual_required") {
        return { ...prev, overridden: Boolean(value.trim()) };
      }
      return prev;
    });
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setSuccess(false);

    if (!file || analysis.status !== "ready") {
      setFormError(
        analysis.status === "error"
          ? analysis.message
          : "Poczekaj na zakończenie uploadu i analizy.",
      );
      return;
    }

    const bpmValue = Number(bpm);
    if (!bpm.trim() || !Number.isInteger(bpmValue)) {
      setFormError("BPM — wpisz liczbę całkowitą (1–300).");
      return;
    }

    const bpmManualOverride =
      bpmUi.mode === "auto"
        ? bpmUi.overridden
        : bpmUi.mode === "manual_required"
          ? true
          : true;

    const form = event.currentTarget;
    const producer = String(
      (form.elements.namedItem("producer") as HTMLInputElement)?.value ?? "",
    ).trim();
    const description = String(
      (form.elements.namedItem("description") as HTMLTextAreaElement)?.value ??
        "",
    ).trim();
    const genre = String(
      (form.elements.namedItem("genre") as HTMLInputElement)?.value ?? "",
    ).trim();
    const style = String(
      (form.elements.namedItem("style") as HTMLInputElement)?.value ?? "",
    ).trim();
    const key = String(
      (form.elements.namedItem("key") as HTMLInputElement)?.value ?? "",
    ).trim();
    const scale = String(
      (form.elements.namedItem("scale") as HTMLInputElement)?.value ?? "",
    ).trim();
    const tagsRaw = String(
      (form.elements.namedItem("tags") as HTMLInputElement)?.value ?? "",
    );
    const coverRef = String(
      (form.elements.namedItem("coverRef") as HTMLInputElement)?.value ?? "",
    ).trim();

    const { beatId, assetId } = analysis;

    startTransition(async () => {
      try {
        const result = await finalizePlatformBeatWithMasterAction({
          beatId,
          assetId,
          title,
          producer: producer || null,
          description: description || null,
          genre: genre || null,
          style: style || null,
          bpm: bpmValue,
          bpmManualOverride,
          key: key || null,
          scale: scale || null,
          tags: tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
          coverRef: coverRef || null,
        });

        if (!result.success || !result.beatId) {
          setFormError(result.error ?? "Nie udało się utworzyć beatu.");
          return;
        }
        setSuccess(true);
        router.push(`/admin/beats/${result.beatId}`);
      } catch {
        setFormError("Błąd sieci / serwera podczas tworzenia.");
      }
    });
  }

  const analysisReady = analysis.status === "ready";
  const canSubmit =
    analysisReady &&
    !pending &&
    !analyzing &&
    Boolean(title.trim()) &&
    Boolean(bpm.trim());

  let bpmHint: string | null = null;
  if (bpmUi.mode === "auto") {
    bpmHint = bpmUi.overridden
      ? "BPM zmieniony ręcznie."
      : "Automatycznie wykryto";
  } else if (bpmUi.mode === "manual_required") {
    bpmHint = bpmUi.message;
  }

  let statusLine: string | null = null;
  if (analysis.status === "uploading" || analyzing) {
    statusLine =
      analysis.status === "analyzing"
        ? "Analizowanie…"
        : "Przesyłanie audio…";
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Audio
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          Wybierz plik audio *
          <input
            name="audio"
            type="file"
            accept="audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4,audio/aac,.mp3,.wav,.flac,.m4a,.aac"
            required
            disabled={pending}
            onChange={onFileChange}
            className="text-sm"
          />
        </label>

        {statusLine ? (
          <p className="text-sm text-muted-foreground" role="status">
            {statusLine}
          </p>
        ) : null}

        {analysis.status === "error" ? (
          <p className="text-sm text-destructive" role="alert">
            {analysis.message}
          </p>
        ) : null}

        {analysis.status === "ready" ? (
          <dl className="grid gap-2 text-sm">
            <div className="flex justify-between gap-4 border-b border-border py-1">
              <dt className="text-muted-foreground">Plik</dt>
              <dd className="text-right text-foreground">{analysis.filename}</dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-1">
              <dt className="text-muted-foreground">Format / MIME</dt>
              <dd className="text-right text-foreground">
                {analysis.contentType}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-1">
              <dt className="text-muted-foreground">Rozmiar</dt>
              <dd className="text-right text-foreground">
                {formatBytes(analysis.byteSize)}
              </dd>
            </div>
            <div className="flex justify-between gap-4 border-b border-border py-1">
              <dt className="text-muted-foreground">Czas trwania</dt>
              <dd className="text-right text-foreground">
                {formatDuration(analysis.durationSeconds)}
                <span className="ml-2 text-muted-foreground">
                  ({analysis.durationSeconds} s)
                </span>
              </dd>
            </div>
            <div className="flex justify-between gap-4 py-1">
              <dt className="text-muted-foreground">Status analizy</dt>
              <dd className="text-right text-foreground">Gotowe</dd>
            </div>
          </dl>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Dane beatu
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          Tytuł *
          <input
            name="title"
            required
            maxLength={200}
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={!analysisReady || pending}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Producent
          <input
            name="producer"
            maxLength={500}
            disabled={!analysisReady || pending}
            className={fieldClass}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Opis
          <textarea
            name="description"
            rows={3}
            maxLength={4000}
            disabled={!analysisReady || pending}
            className={fieldClass}
          />
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <label className="flex flex-col gap-1 text-sm">
            Gatunek
            <input
              name="genre"
              maxLength={500}
              disabled={!analysisReady || pending}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Styl
            <input
              name="style"
              maxLength={500}
              disabled={!analysisReady || pending}
              className={fieldClass}
            />
          </label>
        </div>
        <div className="grid gap-3 sm:grid-cols-3">
          <label className="flex flex-col gap-1 text-sm">
            BPM *
            <input
              name="bpm"
              type="number"
              required
              min={1}
              max={300}
              value={bpm}
              onChange={(e) => onBpmChange(e.target.value)}
              disabled={!analysisReady || pending}
              placeholder={
                bpmUi.mode === "manual_required" ? "wpisz BPM" : undefined
              }
              className={fieldClass}
            />
            {bpmHint ? (
              <span className="text-xs text-muted-foreground">{bpmHint}</span>
            ) : null}
            {bpmUi.mode === "auto" && !bpmUi.overridden ? (
              <button
                type="button"
                className="self-start text-xs text-muted-foreground underline-offset-2 hover:underline"
                onClick={() => {
                  setBpm("");
                  setBpmUi((prev) =>
                    prev.mode === "auto"
                      ? { ...prev, overridden: true }
                      : prev,
                  );
                }}
              >
                Zmień BPM
              </button>
            ) : null}
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Tonacja
            <input
              name="key"
              maxLength={500}
              disabled={!analysisReady || pending}
              className={fieldClass}
            />
          </label>
          <label className="flex flex-col gap-1 text-sm">
            Skala
            <input
              name="scale"
              maxLength={500}
              disabled={!analysisReady || pending}
              className={fieldClass}
            />
          </label>
        </div>
        <label className="flex flex-col gap-1 text-sm">
          Tagi (oddzielone przecinkami)
          <input
            name="tags"
            disabled={!analysisReady || pending}
            className={fieldClass}
            placeholder="trap, dark"
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Cover ref
          <input
            name="coverRef"
            maxLength={500}
            disabled={!analysisReady || pending}
            className={fieldClass}
          />
        </label>
      </section>

      <section className="flex flex-col gap-2">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          System
        </h2>
        <p className="text-sm text-muted-foreground">
          Bit platformowy · szkic · bez właściciela użytkownika
        </p>
        <p className="text-xs text-muted-foreground">
          Przesłanie pliku → prywatne Storage → analiza BPM → finalizacja.
        </p>
      </section>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-foreground" role="status">
          Utworzono szkic z audio MASTER — przekierowanie…
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {pending ? "Tworzenie…" : "Utwórz szkic + MASTER"}
      </Button>
    </form>
  );
}
