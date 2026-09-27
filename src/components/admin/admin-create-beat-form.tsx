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
import {
  analyzeAdminBeatAudioAction,
  createPlatformBeatWithMasterAction,
} from "@/lib/beats/create-with-master";
import {
  BEAT_AUDIO_MAX_BYTES,
  resolveAudioContentType,
} from "@/lib/beats/audio-validation";
import { suggestTitleFromFilename } from "@/lib/beats/filename-title";

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
  | { status: "analyzing" }
  | {
      status: "ready";
      durationSeconds: number;
      byteSize: number;
      contentType: string;
      titleSuggestion: string;
      filename: string;
    }
  | { status: "error"; message: string };

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Nie udało się odczytać pliku."));
    reader.onload = () => {
      const result = reader.result;
      if (typeof result !== "string") {
        reject(new Error("Nie udało się odczytać pliku."));
        return;
      }
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.readAsDataURL(file);
  });
}

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

    setAnalysis({ status: "analyzing" });

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

        const base64 = await fileToBase64(next);
        const result = await analyzeAdminBeatAudioAction({
          base64,
          contentType,
          originalFilename: next.name,
        });

        if (analyzeGeneration.current !== generation) return;

        if (!result.success || result.durationSeconds == null) {
          setAnalysis({
            status: "error",
            message: result.error ?? "Analiza audio nie powiodła się.",
          });
          return;
        }

        const suggestion =
          result.titleSuggestion || suggestTitleFromFilename(next.name);
        setTitle(suggestion);
        setAnalysis({
          status: "ready",
          durationSeconds: result.durationSeconds,
          byteSize: result.byteSize ?? next.size,
          contentType: result.contentType ?? contentType,
          titleSuggestion: suggestion,
          filename: next.name,
        });

        if (
          result.bpmDecision === "AUTO_SUGGEST" &&
          typeof result.bpm === "number" &&
          Number.isInteger(result.bpm)
        ) {
          setBpm(String(result.bpm));
          setBpmUi({
            mode: "auto",
            suggested: result.bpm,
            overridden: false,
          });
        } else {
          setBpm("");
          setBpmUi({
            mode: "manual_required",
            message:
              result.bpmMessage ??
              "BPM nie udało się wiarygodnie określić.",
            overridden: false,
          });
        }
      } catch {
        if (analyzeGeneration.current === generation) {
          setAnalysis({
            status: "error",
            message: "Błąd sieci / serwera podczas analizy.",
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
          !value.trim() ||
          !Number.isInteger(n) ||
          n !== prev.suggested;
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

    if (!file) {
      setFormError("Wybierz plik audio.");
      return;
    }
    if (analysis.status !== "ready") {
      setFormError(
        analysis.status === "error"
          ? analysis.message
          : "Poczekaj na zakończenie analizy audio.",
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

    startTransition(async () => {
      try {
        const contentType =
          resolveAudioContentType({
            fileType: file.type,
            filename: file.name,
          }) ?? analysis.contentType;
        const base64 = await fileToBase64(file);
        const result = await createPlatformBeatWithMasterAction({
          base64,
          contentType,
          originalFilename: file.name,
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
    if (bpmUi.overridden) {
      bpmHint = "BPM zmieniony ręcznie.";
    } else {
      bpmHint = "Automatycznie wykryto";
    }
  } else if (bpmUi.mode === "manual_required") {
    bpmHint = bpmUi.message;
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

        {analysis.status === "analyzing" || analyzing ? (
          <p className="text-sm text-muted-foreground" role="status">
            Analizowanie…
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
          PLATFORM · owner_id = NULL · status = DRAFT
        </p>
        <p className="text-xs text-muted-foreground">
          Po utworzeniu DRAFT system wgrywa MASTER przez istniejący pipeline
          audio (bez drugiego modelu uploadu).
        </p>
      </section>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-foreground" role="status">
          Utworzono DRAFT + MASTER — przekierowanie…
        </p>
      ) : null}

      <Button type="submit" disabled={!canSubmit}>
        {pending ? "Tworzenie…" : "Utwórz DRAFT + MASTER"}
      </Button>
    </form>
  );
}
