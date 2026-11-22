"use client";

import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { adminClosePaymentReviewAction, adminRevokePaymentReviewAction } from "@/app/admin/platnosci/actions";
import { Button } from "@/components/ui/button";

/** Two buttons for one review. Each asks once more before it runs. */
export function AdminPaymentReviewActions({ reviewId, canRevoke }: { reviewId: string; canRevoke: boolean }) {
  const t = useTranslations("admin.adminPaymentReviews");
  const router = useRouter();
  const [asking, setAsking] = useState<"revoke" | "close" | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function run(mode: "revoke" | "close") {
    setError(null);
    setMessage(null);
    startTransition(async () => {
      try {
        const outcome =
          mode === "revoke"
            ? await adminRevokePaymentReviewAction(reviewId)
            : await adminClosePaymentReviewAction(reviewId);
        if (!outcome.ok) {
          setError(t(`bledy.${outcome.code}`));
          return;
        }
        setAsking(null);
        if (outcome.newReview) setMessage(t("nowaSprawa"));
        router.refresh();
      } catch {
        setError(t("bledy.REFUND_FAILED"));
      }
    });
  }

  return (
    <div className="space-y-2">
      {asking ? (
        <div className="space-y-2">
          <p className="text-sm">{asking === "revoke" ? t("pytanieZdejmij") : t("pytanieZamknij")}</p>
          <div className="flex flex-wrap gap-2">
            <Button
              type="button"
              size="sm"
              variant={asking === "revoke" ? "destructive" : "default"}
              disabled={pending}
              onClick={() => run(asking)}
            >
              {pending ? t("czekaj") : t("tak")}
            </Button>
            <Button type="button" size="sm" variant="outline" disabled={pending} onClick={() => setAsking(null)}>
              {t("anuluj")}
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap gap-2">
          {canRevoke ? (
            <Button type="button" size="sm" variant="destructive" onClick={() => setAsking("revoke")}>
              {t("zdejmij")}
            </Button>
          ) : null}
          <Button type="button" size="sm" variant="outline" onClick={() => setAsking("close")}>
            {t("zamknij")}
          </Button>
        </div>
      )}
      {message ? <p className="text-xs text-[var(--brd-ink-soft)]">{message}</p> : null}
      {error ? (
        <p className="text-xs text-destructive" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
