"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useTransition } from "react";

import { Button, buttonVariants } from "@/components/ui/button";
import {
  archiveOwnUserBeatAction,
  returnRejectedToDraftAction,
  submitUserBeatAction,
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
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  function run(
    action: (id: string) => Promise<{ success: boolean; error: string | null }>,
  ) {
    startTransition(async () => {
      const result = await action(beatId);
      if (!result.success) {
        window.alert(result.error ?? "Akcja nie powiodła się.");
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
          Edytuj
        </Button>
      )}
      {status === "DRAFT" && activeMasterReady ? (
        <Button
          type="button"
          size="sm"
          disabled={pending}
          onClick={() => run(submitUserBeatAction)}
        >
          Wyślij do moderacji
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
          Popraw i wyślij ponownie
        </Button>
      ) : null}
      {status === "PUBLISHED" ? (
        <Link
          href={`/beat/${beatId}`}
          className={cn(buttonVariants({ variant: "outline", size: "sm" }))}
        >
          Zobacz bit
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
          Archiwizuj
        </Button>
      )}
    </div>
  );
}
