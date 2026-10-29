"use client";


import { useTranslations } from "next-intl";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  archiveOwnUserBeatAction,
  returnRejectedToDraftAction,
} from "@/lib/beats/community-actions";
import { cn } from "@/lib/utils";

export function UserBeatActions({
  beatId,
  status,
  activeMasterReady,
}: {
  beatId: string;
  status: string;
  activeMasterReady: boolean;
}) {
  const t = useTranslations("beats.userBeatActions");
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: (id: string) => Promise<{ success: boolean; error: string | null }>,
  ) {
    startTransition(async () => {
      const result = await action(beatId);
      if (!result.success) {
        window.alert(result.error ?? t("akcjaNiePowiodlaSie"));
        return;
      }
      router.refresh();
    });
  }

  return (
    <div className="flex flex-wrap gap-2">
      {(status === "DRAFT" || status === "REJECTED") && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={pending}
          onClick={() => router.push(`/beats/upload?beatId=${beatId}`)}
        >
          {t("edytuj")}
        </Button>
      )}
      {status === "DRAFT" && activeMasterReady ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => router.push(`/beats/upload?beatId=${beatId}`)}
        >
          {t("oswiadczenieIWysylka")}
        </Button>
      ) : null}
      {status === "REJECTED" ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() =>
            run(async (id) => {
              const returned = await returnRejectedToDraftAction(id);
              if (!returned.success) return returned;
              router.push(`/beats/upload?beatId=${id}`);
              return returned;
            })
          }
        >
          {t("poprawIWyslijPonownie")}
        </Button>
      ) : null}
      {status === "PUBLISHED" ? (
        <Link
          href={`/beat/${beatId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          {t("zobaczBit")}
        </Link>
      ) : null}
      {(status === "DRAFT" ||
        status === "REJECTED" ||
        status === "PUBLISHED") && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() => run(archiveOwnUserBeatAction)}
        >
          {t("archiwizuj")}
        </Button>
      )}
    </div>
  );
}
