"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition, type FormEvent } from "react";

import { Button } from "@/components/ui/button";
import { uploadPlatformBeatAudioAction } from "@/lib/beats/audio-actions";
import { BEAT_AUDIO_MAX_BYTES } from "@/lib/beats/audio-validation";

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

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);
    setSuccess(null);

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

    startTransition(async () => {
      try {
        const base64 = await fileToBase64(file);
        const result = await uploadPlatformBeatAudioAction({
          beatId,
          purpose: "MASTER",
          base64,
          contentType: file.type || "audio/mpeg",
          originalFilename: file.name,
        });
        if (!result.success) {
          setError(result.error ?? "Upload nie powiódł się.");
          return;
        }
        setSuccess("MASTER audio READY.");
        form.reset();
        router.refresh();
      } catch {
        setError("Błąd sieci / serwera podczas uploadu.");
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3">
      <p className="text-sm text-muted-foreground">
        Status MASTER:{" "}
        <span className="font-medium text-foreground">
          {activeMasterReady ? "READY" : "brak aktywnego READY"}
        </span>
      </p>
      <label className="flex flex-col gap-1 text-sm">
        Plik audio (MASTER)
        <input
          name="audio"
          type="file"
          accept="audio/mpeg,audio/wav,audio/x-wav,audio/flac,audio/mp4,audio/aac,.mp3,.wav,.flac,.m4a,.aac"
          required
          disabled={pending}
          className="text-sm"
        />
      </label>
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
        {pending
          ? "Wgrywanie…"
          : activeMasterReady
            ? "Zastąp MASTER"
            : "Wgraj MASTER"}
      </Button>
    </form>
  );
}
