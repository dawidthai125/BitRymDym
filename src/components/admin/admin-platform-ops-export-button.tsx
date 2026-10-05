"use client";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { requestPlatformBeatOpsExportAction } from "@/lib/beats/audio-actions";
import { toSafeDownloadErrorMessage } from "@/lib/beats/public";

type AdminPlatformOpsExportButtonProps = {
  beatId: string;
  title: string;
  activeMasterReady: boolean;
};

/**
 * P0 ADMIN/OPS privileged PLATFORM master export.
 * Not user-facing DownloadButton — admin console only.
 */
export function AdminPlatformOpsExportButton({
  beatId,
  title,
  activeMasterReady,
}: AdminPlatformOpsExportButtonProps) {
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onExport() {
    setError(null);
    startTransition(async () => {
      const result = await requestPlatformBeatOpsExportAction({ beatId });
      if (!result.success || !result.url) {
        setError(toSafeDownloadErrorMessage(result.error));
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = `${title || "platform-beat"}.bin`;
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  }

  return (
    <div className="space-y-2">
      <Button
        type="button"
        variant="outline"
        disabled={!activeMasterReady || isPending}
        onClick={onExport}
        aria-busy={isPending}
        className="min-h-11"
      >
        {isPending ? "Eksport OPS…" : "OPS — eksport MASTER"}
      </Button>
      <p className="text-xs text-muted-foreground">
        Privilegowany eksport PLATFORM (nie user-facing download).
      </p>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
