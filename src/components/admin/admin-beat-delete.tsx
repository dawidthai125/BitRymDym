"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import { deleteBeatAction } from "@/lib/beats/actions";

/** Permanent delete. A beat that already has recordings stays; archive it instead. */
export function AdminBeatDelete({
  beatId,
  redirectTo,
}: {
  beatId: string;
  redirectTo?: string;
}) {
  const t = useTranslations("admin.adminLifecycleControls");
  const router = useRouter();
  const [confirmed, setConfirmed] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  return (
    <div className="mt-4 space-y-3 border-t border-[var(--brd-line)] pt-4">
      <label className="flex items-start gap-3 text-sm">
        <input
          type="checkbox"
          className="mt-1"
          checked={confirmed}
          onChange={(event) => setConfirmed(event.target.checked)}
        />
        <span>{t("potwierdzamUsuniecie")}</span>
      </label>
      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {error}
        </p>
      ) : null}
      <Button
        type="button"
        variant="destructive"
        disabled={pending || !confirmed}
        onClick={() => {
          setError(null);
          startTransition(async () => {
            try {
              const result = await deleteBeatAction(beatId);
              if (!result.success) {
                setError(result.error ?? t("operacjaNiePowiodlaSie"));
                return;
              }
              if (redirectTo) router.push(redirectTo);
              else router.refresh();
            } catch {
              setError(t("bladSieciSerwera"));
            }
          });
        }}
      >
        {pending ? t("usuwanie") : t("usunBit")}
      </Button>
    </div>
  );
}
