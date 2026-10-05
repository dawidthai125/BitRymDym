"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  BEAT_AUDIO_MAX_BYTES,
  resolveAudioContentType,
} from "@/lib/beats/audio-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { toUserFacingUploadError } from "@/lib/ui/user-errors";

export function AdminAudioUploadForm({
  beatId,
  activeMasterReady,
}: {
  beatId: string;
  activeMasterReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);
  const [progress, setProgress] = useState<string | null>(null);

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);
    setProgress(null);

    const form = event.currentTarget;
    const input = form.elements.namedItem("audio") as HTMLInputElement | null;
    const file = input?.files?.[0];
    if (!file) {
      setError("Wybierz plik audio.");
      return;
    }
    if (file.size > BEAT_AUDIO_MAX_BYTES) {
      setError("Plik przekracza limit 50 MiB.");
      return;
    }

    const contentType =
      resolveAudioContentType({
        fileType: file.type,
        filename: file.name,
      }) ?? file.type;
    if (!contentType) {
      setError("Nieobsługiwany format audio.");
      return;
    }

    startTransition(async () => {
      try {
        setProgress("Przygotowanie przesyłania…");
        const sessionRes = await fetch(`/api/admin/beats/${beatId}/master`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "session",
            contentType,
            byteSize: file.size,
            originalFilename: file.name,
          }),
        });
        const sessionJson = (await sessionRes.json()) as {
          success?: boolean;
          error?: string;
          path?: string;
          token?: string;
          assetId?: string;
        };
        if (
          !sessionRes.ok ||
          !sessionJson.success ||
          !sessionJson.path ||
          !sessionJson.token ||
          !sessionJson.assetId
        ) {
          setError(
            toUserFacingUploadError(
              sessionJson.error ?? "Upload session failed.",
            ),
          );
          setProgress(null);
          return;
        }

        setProgress("Przesyłanie audio…");
        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from("beat-audio")
          .uploadToSignedUrl(sessionJson.path, sessionJson.token, file, {
            contentType,
            upsert: false,
          });
        if (uploadError) {
          setError(
            toUserFacingUploadError(uploadError.message || "Upload failed."),
          );
          setProgress(null);
          return;
        }

        setProgress("Finalizacja…");
        const completeRes = await fetch(`/api/admin/beats/${beatId}/master`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            action: "complete",
            assetId: sessionJson.assetId,
          }),
        });
        const completeJson = (await completeRes.json()) as {
          success?: boolean;
          error?: string;
        };
        if (!completeRes.ok || !completeJson.success) {
          setError(
            toUserFacingUploadError(
              completeJson.error ?? "Upload nie powiódł się.",
            ),
          );
          setProgress(null);
          return;
        }

        setSuccess("Audio Master jest gotowe.");
        setProgress(null);
        form.reset();
        router.refresh();
      } catch {
        setError("Błąd sieci / serwera podczas przesyłania.");
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide">Audio Master</h2>
      <p className="text-sm text-muted-foreground">
        {activeMasterReady
          ? "Aktywne audio Master jest gotowe — nowe przesłanie zastąpi poprzedni plik."
          : "Brak gotowego audio Master — wgraj plik, aby odblokować publikację."}
      </p>
      <input
        name="audio"
        type="file"
        accept="audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4,audio/aac,.mp3,.wav,.flac,.m4a,.aac"
        required
        disabled={pending}
        className="text-sm"
      />
      {progress ? (
        <p className="text-sm text-muted-foreground" role="status">
          {progress}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-foreground" role="status">
          {success}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Przesyłanie…" : "Prześlij Master"}
      </Button>
    </form>
  );
}
