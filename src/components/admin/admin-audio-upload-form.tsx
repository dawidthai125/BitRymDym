"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useTranslations } from "next-intl";

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
  const tl = useLibText();
  const t = useTranslations("admin.adminAudioUploadForm");
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
      setError(t("wybierzPlikAudio"));
      return;
    }
    if (file.size > BEAT_AUDIO_MAX_BYTES) {
      setError(t("plikPrzekraczaLimit50"));
      return;
    }

    const contentType =
      resolveAudioContentType({
        fileType: file.type,
        filename: file.name,
      }) ?? file.type;
    if (!contentType) {
      setError(t("nieobslugiwanyFormatAudio"));
      return;
    }

    startTransition(async () => {
      try {
        setProgress(t("przygotowaniePrzesylania"));
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
              sessionJson.error ?? t("uploadSessionFailed"),
            ),
          );
          setProgress(null);
          return;
        }

        setProgress(t("przesylanieAudio"));
        const supabase = createSupabaseBrowserClient();
        const { error: uploadError } = await supabase.storage
          .from("beat-audio")
          .uploadToSignedUrl(sessionJson.path, sessionJson.token, file, {
            contentType,
            upsert: false,
          });
        if (uploadError) {
          setError(
            toUserFacingUploadError(uploadError.message || t("uploadFailed")),
          );
          setProgress(null);
          return;
        }

        setProgress(t("finalizacja"));
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
              completeJson.error ?? t("uploadNiePowiodlSie"),
            ),
          );
          setProgress(null);
          return;
        }

        setSuccess(t("audioMasterJestGotowe"));
        setProgress(null);
        form.reset();
        router.refresh();
      } catch {
        setError(t("bladSieciSerweraPodczas"));
        setProgress(null);
      }
    });
  }

  return (
    <form onSubmit={onSubmit} className="flex max-w-xl flex-col gap-3">
      <h2 className="text-sm font-semibold tracking-wide">{t("audioMaster")}</h2>
      <p className="text-sm text-muted-foreground">
        {tl(activeMasterReady
          ? t("aktywneAudioMasterJest")
          : t("brakGotowegoAudioMaster"))}
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
          {tl(progress)}
        </p>
      ) : null}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(error)}
        </p>
      ) : null}
      {success ? (
        <p className="text-sm text-foreground" role="status">
          {tl(success)}
        </p>
      ) : null}
      <Button type="submit" disabled={pending}>
        {tl(pending ? t("przesylanie") : t("przeslijMaster"))}
      </Button>
    </form>
  );
}
