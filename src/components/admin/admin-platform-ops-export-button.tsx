"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { requestPlatformBeatOpsExportAction } from "@/lib/beats/audio-actions";
import { opsExportFileName } from "@/lib/beats/audio-types";
import { toSafeDownloadErrorMessage } from "@/lib/beats/public";

type AdminPlatformOpsExportButtonProps = {
  beatId: string;
  title: string;
  activeMasterReady: boolean;
  /** Waiting catalogue: short WAV label, no ops footnote. */
  compactWav?: boolean;
};

/**
 * P0 ADMIN/OPS privileged PLATFORM master export.
 * Not user-facing DownloadButton — admin console only.
 */
export function AdminPlatformOpsExportButton({
  beatId,
  title,
  activeMasterReady,
  compactWav = false,
}: AdminPlatformOpsExportButtonProps) {
  const tl = useLibText();
  const t = useTranslations("admin.adminPlatformOpsExportButton");
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  function onExport() {
    setError(null);
    startTransition(async () => {
      const result = await requestPlatformBeatOpsExportAction({ beatId }).catch(() => null);
      if (!result?.success || !result.url) {
        setError(toSafeDownloadErrorMessage(result?.error));
        return;
      }
      const anchor = document.createElement("a");
      anchor.href = result.url;
      anchor.download = opsExportFileName(title, result.contentType ?? null);
      anchor.rel = "noopener";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
    });
  }

  return (
    <div className={compactWav ? "space-y-1" : "space-y-2"}>
      <Button
        type="button"
        variant="outline"
        disabled={!activeMasterReady || isPending}
        onClick={onExport}
        aria-busy={isPending}
        className="min-h-11"
      >
        {tl(
          isPending
            ? compactWav
              ? t("pobieranieWav")
              : t("eksportOperacyjny")
            : compactWav
              ? t("pobierzWav")
              : t("eksportOperacyjnyMaster"),
        )}
      </Button>
      {compactWav ? null : (
        <p className="text-xs text-muted-foreground">
          {t("privilegowanyEksportBituPlatformy")}
        </p>
      )}
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(error)}
        </p>
      ) : null}
    </div>
  );
}
