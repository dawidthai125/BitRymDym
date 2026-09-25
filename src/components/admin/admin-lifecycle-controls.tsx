"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  archiveBeatAction,
  publishBeatAction,
  restoreArchivedBeatAction,
} from "@/lib/beats/actions";
import { getAdminPublishGate } from "@/lib/beats/admin-publish";
import type { BeatStatus } from "@/types/domain";

export function AdminLifecycleControls({
  beatId,
  status,
  activeMasterReady,
}: {
  beatId: string;
  status: BeatStatus;
  activeMasterReady: boolean;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const gate = getAdminPublishGate({ status, activeMasterReady });

  function run(
    action: () => Promise<{ error: string | null; success: boolean }>,
    okMessage: string,
  ) {
    setError(null);
    setSuccess(null);
    startTransition(async () => {
      try {
        const result = await action();
        if (!result.success) {
          setError(result.error ?? "Operacja nie powiodła się.");
          return;
        }
        setSuccess(okMessage);
        router.refresh();
      } catch {
        setError("Błąd sieci / serwera.");
      }
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="space-y-1">
        <p className="text-sm">
          Status: <span className="font-medium">{status}</span>
        </p>
        {!gate.enabled && gate.blockedReason ? (
          <p className="text-sm text-muted-foreground" role="status">
            {gate.blockedReason}
          </p>
        ) : null}
      </div>

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

      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" ? (
          <Button
            type="button"
            disabled={pending || !gate.enabled}
            title={gate.blockedReason ?? undefined}
            onClick={() => {
              // Re-check UI gate before invoking Server Action (stale/disabled bypass guard).
              // Server READY hard rule remains GAP-PUBLISH-READY (intentionally not enforced).
              const latest = getAdminPublishGate({ status, activeMasterReady });
              if (!latest.enabled) {
                setError(latest.blockedReason ?? "Publikacja zablokowana.");
                return;
              }
              run(() => publishBeatAction(beatId), "Opublikowano.");
            }}
          >
            {pending ? "Publikowanie…" : "Publikuj"}
          </Button>
        ) : null}

        {status === "PUBLISHED" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => archiveBeatAction(beatId), "Zarchiwizowano.")
            }
          >
            Archiwizuj
          </Button>
        ) : null}

        {status === "ARCHIVED" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(
                () => restoreArchivedBeatAction(beatId),
                "Przywrócono do DRAFT.",
              )
            }
          >
            Przywróć do DRAFT
          </Button>
        ) : null}
      </div>
    </div>
  );
}
