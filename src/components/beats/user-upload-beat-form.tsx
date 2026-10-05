"use client";

import { useRouter } from "next/navigation";
import {
  useRef,
  useState,
  useTransition,
  type ChangeEvent,
  type FormEvent,
} from "react";

import { BpmUncertaintyField } from "@/components/beats/bpm-uncertainty-field";
import { Button } from "@/components/ui/button";
import {
  createUserDraftBeatAction,
  submitUserBeatAction,
} from "@/lib/beats/community-actions";
import { finalizeUserBeatWithMasterAction } from "@/lib/beats/user-create-with-master";
import {
  BEAT_AUDIO_MAX_BYTES,
  resolveAudioContentType,
} from "@/lib/beats/audio-validation";
import type { BpmUncertaintyEnvelope } from "@/lib/beats/bpm-uncertainty";
import {
  buildBpmUxModel,
  canProceedWithBpmSelection,
  mapFinalizeBpmError,
  resolveBpmSelectionMode,
} from "@/lib/beats/bpm-uncertainty-ui";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toUserFacingUploadError } from "@/lib/ui/user-errors";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

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

type UserUploadBeatFormProps = {
  /** Existing DRAFT/REJECTED beat for rework / replacement upload. */
  existingBeatId?: string;
  initialTitle?: string;
  initialProducer?: string | null;
  masterAlreadyReady?: boolean;
};

export function UserUploadBeatForm({
  existingBeatId,
  initialTitle = "",
  initialProducer = "",
  masterAlreadyReady = false,
}: UserUploadBeatFormProps) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [analyzing, startAnalyze] = useTransition();
  const [file, setFile] = useState<File | null>(null);
  const [analysis, setAnalysis] = useState<AnalysisState>({ status: "idle" });
  const [title, setTitle] = useState(initialTitle);
  const [bpmEnvelope, setBpmEnvelope] = useState<BpmUncertaintyEnvelope | null>(
    null,
  );
  const [selectedBpm, setSelectedBpm] = useState<number | null>(null);
  const [bpmStatusMessage, setBpmStatusMessage] = useState<string | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [savedDraft, setSavedDraft] = useState(masterAlreadyReady);
  const [savedBeatId, setSavedBeatId] = useState<string | null>(
    existingBeatId ?? null,
  );
  const [submitted, setSubmitted] = useState(false);
  const analyzeGeneration = useRef(0);

  function onFileChange(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    const generation = ++analyzeGeneration.current;
    setFile(next);
    if (!initialTitle) setTitle("");
    setBpmEnvelope(null);
    setSelectedBpm(null);
    setBpmStatusMessage(null);
    setFormError(null);
    setSavedDraft(false);
    setSubmitted(false);

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

        let beatId = existingBeatId ?? savedBeatId;
        if (!beatId) {
          const created = await createUserDraftBeatAction({
            title: next.name.replace(/\.[^.]+$/, "") || "Nowy bit",
          });
          if (!created.success || !created.beatId) {
            if (analyzeGeneration.current === generation) {
              setAnalysis({
                status: "error",
                message: toUserFacingUploadError(
                  created.error ?? "Nie udało się utworzyć szkicu.",
                ),
              });
            }
            return;
          }
          beatId = created.beatId;
          setSavedBeatId(beatId);
        }

        const sessionRes = await fetch("/api/beats/audio/session", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            beatId,
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

        const analyzeRes = await fetch("/api/beats/audio/analyze", {
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
          bpmEnvelope?: BpmUncertaintyEnvelope;
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
        if (!title.trim()) setTitle(suggestion);
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

        const envelope = analyzeJson.bpmEnvelope ?? null;
        setBpmEnvelope(envelope);
        setBpmStatusMessage(null);
        if (envelope) {
          const model = buildBpmUxModel(envelope);
          if (model.phase === "AUTO_DETECTED" && model.recommendedBpm != null) {
            setSelectedBpm(model.recommendedBpm);
          } else if (
            model.phase === "NEEDS_SELECTION" &&
            model.recommendedBpm != null &&
            model.confidenceClass === "MEDIUM"
          ) {
            setSelectedBpm(model.recommendedBpm);
          } else {
            setSelectedBpm(null);
          }
        } else {
          setSelectedBpm(null);
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

  function onSaveDraft(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setFormError(null);
    setBpmStatusMessage(null);

    if (analysis.status !== "ready") {
      setFormError(
        analysis.status === "error"
          ? analysis.message
          : "Wybierz audio i poczekaj na analizę przed zapisem szkicu.",
      );
      return;
    }

    if (
      !bpmEnvelope ||
      !canProceedWithBpmSelection({
        envelope: bpmEnvelope,
        selectedBpm,
      }) ||
      selectedBpm == null
    ) {
      const model = bpmEnvelope ? buildBpmUxModel(bpmEnvelope) : null;
      setFormError(
        model?.phase === "UNAVAILABLE"
          ? model.headline
          : "Wybierz BPM spośród wartości zaproponowanych przez system.",
      );
      return;
    }

    const bpmValue = selectedBpm;
    const selectionMode = resolveBpmSelectionMode({
      envelope: bpmEnvelope,
      selectedBpm: bpmValue,
    });
    const bpmManualOverride = selectionMode !== "AUTO";

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

    const { beatId, assetId } = analysis;

    startTransition(async () => {
      try {
        const result = await finalizeUserBeatWithMasterAction({
          beatId,
          assetId,
          title,
          producer: producer || null,
          description: description || null,
          genre: genre || null,
          style: style || null,
          bpm: bpmValue,
          bpmManualOverride,
          bpmSelectionMode: selectionMode,
          key: key || null,
          scale: scale || null,
          tags: tagsRaw
            .split(",")
            .map((t) => t.trim())
            .filter(Boolean),
        });

        if (!result.success || !result.beatId) {
          const mapped = mapFinalizeBpmError(result.error);
          setBpmStatusMessage(mapped.message);
          setFormError(mapped.message);
          if (
            mapped.phase === "STALE_ANALYSIS" ||
            mapped.phase === "INVALID_BPM_SELECTION"
          ) {
            setSelectedBpm(null);
          }
          return;
        }
        setSavedDraft(true);
        setSavedBeatId(result.beatId);
      } catch {
        setFormError("Błąd sieci / serwera podczas zapisu.");
      }
    });
  }

  function onSubmitToModeration() {
    setFormError(null);
    const beatId =
      (analysis.status === "ready" ? analysis.beatId : null) ?? savedBeatId;
    if (!beatId || !savedDraft) {
      setFormError("Najpierw zapisz szkic z gotowym audio.");
      return;
    }

    startTransition(async () => {
      const result = await submitUserBeatAction(beatId);
      if (!result.success) {
        setFormError(result.error ?? "Nie udało się wysłać do moderacji.");
        return;
      }
      setSubmitted(true);
      router.push("/account/beats");
      router.refresh();
    });
  }

  const analysisReady = analysis.status === "ready";
  const canSaveDraft =
    analysisReady &&
    !pending &&
    !analyzing &&
    Boolean(title.trim()) &&
    canProceedWithBpmSelection({
      envelope: bpmEnvelope,
      selectedBpm,
    });
  const canSubmitModeration =
    savedDraft && !pending && !analyzing && !submitted;

  let statusLine: string | null = null;
  if (analysis.status === "uploading" || analyzing) {
    statusLine =
      analysis.status === "analyzing" ? "Analizowanie…" : "Przesyłanie audio…";
  }

  return (
    <form onSubmit={onSaveDraft} className="flex max-w-xl flex-col gap-8">
      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Audio
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          Wybierz plik audio *
          <input
            name="audio"
            type="file"
            accept="audio/*,.mp3,.wav,.flac,.aac,.ogg,.m4a"
            onChange={onFileChange}
            className={fieldClass}
          />
        </label>
        {statusLine ? (
          <p className="text-sm text-muted-foreground">{statusLine}</p>
        ) : null}
        {analysis.status === "ready" ? (
          <dl className="grid grid-cols-2 gap-2 text-sm">
            <div>
              <dt className="text-muted-foreground">Czas</dt>
              <dd>{formatDuration(analysis.durationSeconds)}</dd>
            </div>
            <div>
              <dt className="text-muted-foreground">Rozmiar</dt>
              <dd>{formatBytes(analysis.byteSize)}</dd>
            </div>
            <div className="col-span-2">
              <dt className="text-muted-foreground">Plik</dt>
              <dd className="truncate">{analysis.filename}</dd>
            </div>
          </dl>
        ) : null}
        {analysis.status === "error" ? (
          <p className="text-sm text-destructive">{analysis.message}</p>
        ) : null}
        {masterAlreadyReady && analysis.status === "idle" ? (
          <p className="text-sm text-muted-foreground">
            Audio jest już gotowe. Możesz wgrać nowy plik, żeby je zastąpić,
            albo uzupełnić metadane i wysłać do moderacji.
          </p>
        ) : null}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="text-sm font-semibold tracking-wide text-foreground">
          Metadane
        </h2>
        <label className="flex flex-col gap-1 text-sm">
          Tytuł *
          <input
            name="title"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className={fieldClass}
            required
            maxLength={200}
          />
        </label>
        <BpmUncertaintyField
          envelope={bpmEnvelope}
          selectedBpm={selectedBpm}
          onSelect={(bpm) => {
            setSelectedBpm(bpm);
            setBpmStatusMessage(null);
            setFormError(null);
          }}
          disabled={!analysisReady || pending}
          statusMessage={analyzing ? "Analizowanie BPM…" : bpmStatusMessage}
          idPrefix="user-upload-bpm"
        />
        <label className="flex flex-col gap-1 text-sm">
          Producent
          <input
            name="producer"
            defaultValue={initialProducer ?? ""}
            className={fieldClass}
            maxLength={500}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Opis
          <textarea
            name="description"
            rows={3}
            className={fieldClass}
            maxLength={4000}
          />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Gatunek
          <input name="genre" className={fieldClass} maxLength={500} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Styl
          <input name="style" className={fieldClass} maxLength={500} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tonacja
          <input name="key" className={fieldClass} maxLength={500} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Skala
          <input name="scale" className={fieldClass} maxLength={500} />
        </label>
        <label className="flex flex-col gap-1 text-sm">
          Tagi (przecinkami)
          <input name="tags" className={fieldClass} />
        </label>
      </section>

      {formError ? (
        <p className="text-sm text-destructive" role="alert">
          {formError}
        </p>
      ) : null}

      {savedDraft ? (
        <p className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm">
          Szkic zapisany · audio gotowe. Po wysłaniu do moderacji edycja będzie
          zablokowana do czasu decyzji moderatora.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-3">
        <Button type="submit" disabled={!canSaveDraft}>
          {pending ? "Zapisywanie…" : "Zapisz szkic"}
        </Button>
        <Button
          type="button"
          variant="secondary"
          disabled={!canSubmitModeration}
          onClick={onSubmitToModeration}
        >
          Wyślij do moderacji
        </Button>
      </div>

      {!file && !masterAlreadyReady ? (
        <p className="text-xs text-muted-foreground">
          Wybierz audio, żeby utworzyć szkic i uruchomić analizę BPM / czasu.
        </p>
      ) : null}
    </form>
  );
}
