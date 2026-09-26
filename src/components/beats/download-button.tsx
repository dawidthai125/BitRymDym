"use client";

import { useState, useTransition } from "react";
import Link from "next/link";

import { Button } from "@/components/ui/button";
import { requestBeatAudioAccessAction } from "@/lib/beats/audio-actions";
import {
  PUBLIC_DOWNLOAD_PURPOSE,
  toSafeDownloadErrorMessage,
} from "@/lib/beats/public";

type DownloadButtonProps = {
  beatId: string;
  title: string;
  isAuthenticated?: boolean;
};

type DownloadUiState =
  | { phase: "idle" }
  | { phase: "loading" }
  | { phase: "limit"; message: string }
  | { phase: "error"; message: string };

export function DownloadButton({
  beatId,
  title,
  isAuthenticated = false,
}: DownloadButtonProps) {
  const [ui, setUi] = useState<DownloadUiState>({ phase: "idle" });
  const [isPending, startTransition] = useTransition();

  function onDownload() {
    setUi({ phase: "loading" });
    startTransition(async () => {
      const result = await requestBeatAudioAccessAction({
        beatId,
        purpose: PUBLIC_DOWNLOAD_PURPOSE,
      });

      if (!result.success || !result.url) {
        const message = toSafeDownloadErrorMessage(result.error);
        if (
          result.error?.toLowerCase().includes("limit") ||
          message.includes("limit")
        ) {
          setUi({ phase: "limit", message });
          return;
        }
        setUi({ phase: "error", message });
        return;
      }

      // Trigger browser download without exposing a permanent public URL.
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = `${title || "beat"}.bin`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      setUi({ phase: "idle" });
    });
  }

  const busy = isPending || ui.phase === "loading";

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={busy || ui.phase === "limit"}
        onClick={onDownload}
        aria-busy={busy}
      >
        {busy ? "Pobieranie…" : "Pobierz"}
      </Button>

      {ui.phase === "limit" ? (
        <p className="text-sm text-muted-foreground" role="status">
          {ui.message}
          {!isAuthenticated ? (
            <>
              {" "}
              <Link
                href="/sign-in"
                className="underline underline-offset-4 hover:text-foreground"
              >
                Zaloguj się
              </Link>{" "}
              aby korzystać z limitu konta.
            </>
          ) : null}
        </p>
      ) : null}

      {ui.phase === "error" ? (
        <p className="text-sm text-destructive" role="alert">
          {ui.message}
        </p>
      ) : null}
    </div>
  );
}
