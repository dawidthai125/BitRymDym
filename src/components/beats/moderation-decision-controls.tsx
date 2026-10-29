"use client";

import { useLibText } from "@/i18n/use-lib-text";


import { useTranslations } from "next-intl";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";

import { Button } from "@/components/ui/button";
import {
  approveUserBeatAction,
  closeOpenRightsReviewAction,
  publishApprovedUserBeatAction,
  rejectUserBeatAction,
} from "@/lib/beats/community-actions";

const fieldClass =
  "rounded-lg border border-border bg-background px-3 py-2 text-sm";

export function ModerationDecisionControls({
  beatId,
  status,
  activeMasterReady,
  openReviews = [],
}: {
  beatId: string;
  status: string;
  activeMasterReady: boolean;
  openReviews?: Array<{ id: string; kind: string; checksumSha256: string }>;
}) {
  const tl = useLibText();
  const t = useTranslations("beats.moderationDecisionControls");
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [reason, setReason] = useState("");
  const [showReject, setShowReject] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function onApprove() {
    setError(null);
    startTransition(async () => {
      const result = await approveUserBeatAction(beatId);
      if (!result.success) {
        setError(result.error ?? t("zatwierdzenieNiePowiodloSie"));
        return;
      }
      router.push("/admin/moderation");
      router.refresh();
    });
  }

  function onReject() {
    setError(null);
    const trimmed = reason.trim();
    if (!trimmed) {
      setError(t("powodOdrzuceniaJestWymagany"));
      return;
    }
    startTransition(async () => {
      const result = await rejectUserBeatAction(beatId, trimmed);
      if (!result.success) {
        setError(result.error ?? t("odrzucenieNiePowiodloSie"));
        return;
      }
      router.push("/admin/moderation");
      router.refresh();
    });
  }

  function onClose(reviewId: string) {
    setError(null);
    startTransition(async () => {
      const result = await closeOpenRightsReviewAction(
        reviewId,
        "dismissed_no_publish",
        t("zamkniecieSprawyNieJest"),
      );
      if (!result.success) {
        setError(result.error ?? t("nieUdaloSieZamknac"));
        return;
      }
      setError(null);
      router.refresh();
    });
  }

  const reviewList =
    openReviews.length > 0 ? (
      <div className="flex flex-col gap-2">
        <p className="text-sm text-muted-foreground">
          {t("otwarteSprawyDotyczaKonkretnego")}
        </p>
        {openReviews.map((review) => (
          <Button
            key={review.id}
            type="button"
            variant="outline"
            disabled={pending}
            onClick={() => onClose(review.id)}
          >
            {t("zamknijSprawe")}{" "}{tl(review.kind)} {t("bezPublikacji")}
          </Button>
        ))}
      </div>
    ) : null;

  function onPublish() {
    setError(null);
    if (!activeMasterReady) {
      setError(t("publikacjaWymagaGotowegoAudio"));
      return;
    }
    startTransition(async () => {
      const result = await publishApprovedUserBeatAction(beatId);
      if (!result.success) {
        setError(result.error ?? t("publikacjaNiePowiodlaSie"));
        return;
      }
      router.push("/admin/moderation");
      router.refresh();
    });
  }

  if (status === "APPROVED") {
    return (
      <div className="flex flex-col gap-4">
        <p className="text-sm text-muted-foreground">
          {t("publikacjaUstawiaStatusOpublikowany")}
        </p>
        <Button
          type="button"
          disabled={pending || !activeMasterReady}
          onClick={onPublish}
        >
          {t("opublikuj")}
        </Button>
        {reviewList}
        {!activeMasterReady ? (
          <p className="text-sm text-destructive">
            {t("brakGotowegoAudioMaster")}
          </p>
        ) : null}
        {error ? (
          <p className="text-sm text-destructive" role="alert">
            {tl(error)}
          </p>
        ) : null}
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {reviewList}
      <div className="flex flex-wrap gap-3">
        <Button type="button" disabled={pending} onClick={onApprove}>
          {t("zatwierdz")}
        </Button>
        <Button
          type="button"
          variant="outline"
          disabled={pending}
          onClick={() => setShowReject((v) => !v)}
        >
          {t("odrzuc")}
        </Button>
      </div>

      {showReject ? (
        <div className="flex flex-col gap-2">
          <label className="flex flex-col gap-1 text-sm">
            {t("powodOdrzucenia")}
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              rows={3}
              maxLength={2000}
              className={fieldClass}
              placeholder={t("opiszCoUzytkownikPowinien")}
            />
          </label>
          <Button
            type="button"
            variant="destructive"
            disabled={pending}
            onClick={onReject}
          >
            {t("potwierdzOdrzucenie")}
          </Button>
        </div>
      ) : null}

      {error ? (
        <p className="text-sm text-destructive" role="alert">
          {tl(error)}
        </p>
      ) : null}
    </div>
  );
}
