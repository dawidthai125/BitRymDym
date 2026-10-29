"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useTranslations } from "next-intl";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  archiveBeatAction,
  publishBeatAction,
  restoreArchivedBeatAction,
} from "@/lib/beats/actions";
import { getAdminPublishGate } from "@/lib/beats/admin-publish";
import { labelBeatStatus } from "@/lib/ui/labels";
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
  const tl = useLibText();
  const t = useTranslations("admin.adminLifecycleControls");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [licenseAcknowledged, setLicenseAcknowledged] = useState(false);
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
          setError(result.error ?? t("operacjaNiePowiodlaSie"));
          return;
        }
        setSuccess(okMessage);
        router.refresh();
      } catch {
        setError(t("bladSieciSerwera"));
      }
    });
  }

  return (
    <div className="flex max-w-xl flex-col gap-3">
      <div className="space-y-1">
        <p className="text-sm">
          {t("status")}{" "}
          <span className="font-medium">{tl(labelBeatStatus(status))}</span>
        </p>
        {!gate.enabled && gate.blockedReason ? (
          <p className="text-sm text-muted-foreground" role="status">
            {tl(gate.blockedReason)}
          </p>
        ) : null}
      </div>

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

      {status === "DRAFT" ? (
        <label className="flex items-start gap-3 text-sm">
          <input
            type="checkbox"
            className="mt-1"
            checked={licenseAcknowledged}
            onChange={(event) => setLicenseAcknowledged(event.target.checked)}
          />
          <span>
            {t("potwierdzamZeTenMaster")}
          </span>
        </label>
      ) : null}

      <div className="flex flex-wrap gap-2">
        {status === "DRAFT" ? (
          <Button
            type="button"
            disabled={pending || !gate.enabled}
            title={tl(gate.blockedReason ?? undefined)}
            onClick={() => {
              // UI gate first; server hard gate in transitionBeatStatus is authoritative.
              const latest = getAdminPublishGate({ status, activeMasterReady });
              if (!latest.enabled) {
                setError(latest.blockedReason ?? t("publikacjaZablokowana"));
                return;
              }
              if (!licenseAcknowledged) {
                setError(
                  t("potwierdzLicencjeDlaAktualnego"),
                );
                return;
              }
              run(
                () => publishBeatAction(beatId, { licenseAcknowledged: true }),
                t("opublikowano"),
              );
            }}
          >
            {tl(pending ? t("publikowanie") : "Publikuj")}
          </Button>
        ) : null}

        {status === "PUBLISHED" ? (
          <Button
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() =>
              run(() => archiveBeatAction(beatId), t("zarchiwizowano"))
            }
          >
            {t("archiwizuj")}
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
                t("przywroconoDoWersjiRoboczej"),
              )
            }
          >
            {t("przywrocDoWersjiRoboczej")}
          </Button>
        ) : null}
      </div>
    </div>
  );
}
