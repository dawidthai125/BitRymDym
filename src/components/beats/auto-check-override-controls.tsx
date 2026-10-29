"use client";

import { useLibText } from "@/i18n/use-lib-text";

import { useTranslations } from "next-intl";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { overrideAutoCheckAction, retryAutoCheckAction } from "@/lib/beats/community-actions";

export function AutoCheckOverrideControls({ beatId, mode }: { beatId: string; mode: "override" | "retry" }) {
  const tl = useLibText();
  const t = useTranslations("beats.autoCheckOverrideControls");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [error, setError] = useState<string | null>(null);

  function run() {
    setError(null);
    if (mode === "override" && reason.trim().length < 5) {
      setError(t("podajUzasadnienieMin5"));
      return;
    }
    startTransition(async () => {
      const result = mode === "override" ? await overrideAutoCheckAction(beatId, reason) : await retryAutoCheckAction(beatId);
      if (!result.success) {
        setError(result.error ?? t("operacjaNiePowiodlaSie"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="space-y-3">
      {mode === "override" ? (
        <>
          <label className="flex flex-col gap-1 text-sm">
            {t("uzasadnienieUchyleniaZapisywaneW")}
            <textarea
              className="min-h-20 rounded-lg border border-border bg-background px-3 py-2 text-sm"
              value={reason}
              maxLength={1000}
              onChange={(e) => setReason(e.target.value)}
            />
          </label>
          <p className="text-xs text-muted-foreground">
            {t("uchyleniePrzywracaBitDo")}
          </p>
        </>
      ) : null}
      <Button type="button" variant="outline" disabled={pending} onClick={run}>
        {tl(mode === "override" ? t("uchylAutomatyczneOdrzucenie") : t("ponowAutomatyczneSprawdzenie"))}
      </Button>
      {error ? <p className="text-sm text-destructive" role="alert">{tl(error)}</p> : null}
    </div>
  );
}
