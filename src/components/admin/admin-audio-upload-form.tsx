"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import {
  BEAT_AUDIO_MAX_BYTES,
  resolveAudioContentType,
} from "@/lib/beats/audio-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

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
        setProgress("Przygotowanie uploadu…");
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
          setError(sessionJson.error ?? "Upload session failed.");
          setProgress(null);
          return;
        }

        setProgress("Upload audio…");
        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from("beat-audio")
          .uploadToSignedUrl(sessionJson.path, sessionJson.token, file, {
            contentType,
            upsert: false,
          });
        if (uploadError) {
          setError(uploadError.message || "Upload failed.");
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
          setError(completeJson.error ?? "Upload nie powiódł się.");
          setProgress(null);
          return;
        }

        setSuccess("MASTER audio READY.");
        setProgress(null);
        form.reset();
        router.refresh();
      } catch {
        setError("Błąd sieci / serwera podczas uploadu.");
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide">MASTER audio</h2>
      <p className="text-sm text-muted-foreground">
        {activeMasterReady
          ? "Aktywny MASTER READY — upload zastąpi poprzedni plik."
          : "Brak aktywnego MASTER READY — wgraj plik, aby odblokować publikację."}
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
        {pending ? "Upload…" : "Upload MASTER"}
      </Button>
    </form>
  );
}
